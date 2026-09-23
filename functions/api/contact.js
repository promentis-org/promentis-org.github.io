const MAX_BODY_BYTES = 16000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function reply(request, status, message) {
  if (request.headers.get('Accept')?.includes('application/json')) {
    return Response.json(status === 200 ? { ok: true } : { error: message }, {
      status,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  if (status === 200) {
    return Response.redirect(new URL('/contact-success.html', request.url), 303);
  }

  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Message not sent | Promentis</title><main style="font:1.1rem/1.6 Arial,sans-serif;max-width:40rem;margin:10vh auto;padding:1rem"><h1>Message not sent</h1><p>${message}</p><p><a href="/contact">Return to the contact form</a></p></main>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.CONTACT_DB || !env.TURNSTILE_SECRET) {
    return reply(request, 503, 'The contact form is temporarily unavailable. Please try again later.');
  }

  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return reply(request, 403, 'Please submit the form from this website.');
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.startsWith('application/x-www-form-urlencoded') && !contentType.startsWith('multipart/form-data')) {
    return reply(request, 415, 'Please submit the contact form from this website.');
  }
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) {
    return reply(request, 413, 'Your message is too long.');
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(request, 400, 'Please check the form and try again.');
  }

  const field = (key) => {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };
  const name = field('name');
  const email = field('email');
  const message = field('message');
  const token = field('cf-turnstile-response');

  if (field('website')) return reply(request, 200, '');
  if (!name || name.length > 120 || !EMAIL_PATTERN.test(email) || email.length > 254 || !message || message.length > 5000) {
    return reply(request, 400, 'Please enter a valid name, email, and message.');
  }
  if (!token) {
    return reply(request, 400, 'Please complete the security check and try again.');
  }

  try {
    const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token })
    });
    if (!verification.ok) throw new Error('Turnstile verification unavailable');
    const verdict = await verification.json();
    if (!verdict.success || verdict.hostname !== new URL(request.url).hostname) {
      return reply(request, 400, 'Please complete the security check and try again.');
    }

    await env.CONTACT_DB.prepare('INSERT INTO contact_messages (id, name, email, message) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), name, email, message).run();
    return reply(request, 200, '');
  } catch {
    return reply(request, 503, 'The contact form is temporarily unavailable. Please try again later.');
  }
}
