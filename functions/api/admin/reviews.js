import { RECIPIENTS, json, database, sameOrigin, boundedBody, requireAdmin } from '../../lib/reviews.js';

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (admin.response) return admin.response;
  if (!database(env)) return json({ error: 'Feedback storage is unavailable.' }, 503);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';
  const page = Number(url.searchParams.get('page') || 1);
  if (!['pending', 'approved', 'rejected'].includes(status) || !Number.isInteger(page) || page < 1 || page > 10000) return json({ error: 'Invalid filter.' }, 400);
  try {
    const rows = await database(env).prepare('SELECT * FROM individual_feedback WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT 26 OFFSET ?').bind(status, (page - 1) * 25).all();
    const counts = await database(env).prepare('SELECT status, count(*) AS count FROM individual_feedback GROUP BY status').all();
    return json({ recipients: RECIPIENTS, reviews: rows.results.slice(0, 25), has_more: rows.results.length > 25, counts: counts.results, admin: admin.email });
  } catch { return json({ error: 'Feedback could not be loaded.' }, 503); }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'Please use the admin page on this website.' }, 403);
  const admin = await requireAdmin(request, env);
  if (admin.response) return admin.response;
  if (!database(env)) return json({ error: 'Feedback storage is unavailable.' }, 503);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Expected JSON.' }, 415);
  let body;
  try { body = JSON.parse(await boundedBody(request, 2000)); } catch { return json({ error: 'Invalid request.' }, 400); }
  if (!body || typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/.test(body.id) || !['pending', 'approved', 'rejected'].includes(body.status) || !['pending', 'approved', 'rejected'].includes(body.expected_status) || body.status === body.expected_status) return json({ error: 'Invalid moderation action.' }, 400);
  try {
    const result = await database(env).prepare("UPDATE individual_feedback SET status = ?, approved = ?, moderated_by = ?, moderated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status = ?").bind(body.status, body.status === 'approved' ? 1 : 0, admin.email, body.id, body.expected_status).run();
    if (!result.meta.changes) return json({ error: 'This review has changed. Refresh the queue and try again.' }, 409);
    return json({ ok: true, status: body.status });
  } catch { return json({ error: 'The moderation action could not be saved.' }, 503); }
}
