import { RECIPIENTS, json, database, sameOrigin, boundedBody } from '../lib/reviews.js';

export async function onRequestGet({ request, env }) {
  if (!database(env)) return json({ error: 'Reviews are temporarily unavailable.' }, 503);
  const url = new URL(request.url);
  const recipient = url.searchParams.get('recipient') || RECIPIENTS[0].id;
  if (!RECIPIENTS.some(r => r.id === recipient)) return json({ error: 'Unknown feedback recipient.' }, 400);
  const page = Number(url.searchParams.get('page') || 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000) return json({ error: 'Invalid page.' }, 400);
  try {
    const reviews = await database(env).prepare('SELECT id, recipient_id, display_name, rating, message, created_at FROM individual_feedback WHERE recipient_id = ? AND approved = 1 AND status = ? ORDER BY created_at DESC, id DESC LIMIT 13 OFFSET ?').bind(recipient, 'approved', (page - 1) * 12).all();
    const summary = await database(env).prepare('SELECT count(*) AS count, avg(rating) AS average FROM individual_feedback WHERE recipient_id = ? AND approved = 1 AND status = ?').bind(recipient, 'approved').first();
    return json({ recipients: RECIPIENTS, reviews: reviews.results.slice(0, 12), has_more: reviews.results.length > 12, summary });
  } catch { return json({ error: 'Reviews are temporarily unavailable. Please try again later.' }, 503); }
}

export async function onRequestPost({ request, env }) {
  if (!database(env) || !env.TURNSTILE_SECRET) return json({ error: 'Feedback submission is temporarily unavailable.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Please submit feedback from this website.' }, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return json({ error: 'Please use the feedback form.' }, 415);
  let form;
  try { form = new URLSearchParams(await boundedBody(request, 80000)); }
  catch { return json({ error: 'The submission is too large or could not be read.' }, 413); }
  const field = key => (form.get(key) || '').trim();
  if (field('website')) return json({ ok: true, status: 'pending' }, 201);
  const recipient = field('recipient_id');
  const name = field('display_name') || 'Anonymous';
  const email = field('email');
  const message = field('message');
  const rating = Number(field('rating'));
  if (!RECIPIENTS.some(r => r.id === recipient) || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || message.length < 1 || message.length > 5000 || !Number.isInteger(rating) || rating < 1 || rating > 5 || field('consent') !== 'yes') return json({ error: 'Please complete the required fields and agree to publication after approval.' }, 400);
  const token = field('cf-turnstile-response');
  if (!token || token.length > 2048) return json({ error: 'Please complete the security check.' }, 400);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token }) });
    if (!response.ok) throw new Error('verification unavailable');
    const result = await response.json();
    if (!result.success || result.hostname !== new URL(request.url).hostname) return json({ error: 'Please complete the security check again.' }, 400);
    await database(env).prepare("INSERT INTO individual_feedback (id, recipient_id, display_name, email, rating, message, status, approved) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0)").bind(crypto.randomUUID(), recipient, name, email, rating, message).run();
    return json({ ok: true, status: 'pending' }, 201);
  } catch { return json({ error: 'Feedback could not be saved. Please try again later.' }, 503); }
}
