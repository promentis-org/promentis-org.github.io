import { json } from '../../lib/reviews.js';
export function onRequestGet({ env }) {
  return json({ client_id: env.GOOGLE_CLIENT_ID || null });
}
