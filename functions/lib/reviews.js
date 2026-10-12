export const RECIPIENTS = [{ id: 'dr-avinash-puchalapalli', name: 'Dr. Avinash Puchalapalli' }];
export const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export const database = env => env.CONTACT_DB;
export function sameOrigin(request) {
  return request.headers.get('Origin') === new URL(request.url).origin;
}
export async function boundedBody(request, max = 16000) {
  if (Number(request.headers.get('Content-Length')) > max) throw new Error('body_too_large');
  const reader = request.body?.getReader();
  if (!reader) return '';
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new Error('body_too_large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
let googleKeys;
let keysExpire = 0;
export async function requireAdmin(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.REVIEW_ADMIN_EMAIL) return { response: json({ error: 'Admin sign-in is not configured yet.' }, 503) };
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token || token.length > 10000) return { response: json({ error: 'Please sign in with Google.' }, 401) };
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('invalid token');
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
        !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) ||
        claims.aud !== env.GOOGLE_CLIENT_ID || typeof claims.exp !== 'number' || claims.exp <= now ||
        typeof claims.iat !== 'number' || claims.iat > now + 60 ||
        (claims.nbf !== undefined && claims.nbf > now + 60) || !claims.sub || claims.email_verified !== true) throw new Error('invalid claims');
    if (!googleKeys || keysExpire <= Date.now() || !googleKeys.some(k => k.kid === header.kid)) {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
      if (!res.ok) throw new Error('keys unavailable');
      googleKeys = (await res.json()).keys;
      keysExpire = Date.now() + 3600000;
    }
    const jwk = googleKeys.find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) throw new Error('unknown key');
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(parts.slice(0, 2).join('.')))) throw new Error('bad signature');
    if (typeof claims.email !== 'string' || claims.email.toLowerCase() !== env.REVIEW_ADMIN_EMAIL.trim().toLowerCase()) return { response: json({ error: 'This Google account does not have admin access.' }, 403) };
    return { email: claims.email.toLowerCase() };
  } catch {
    return { response: json({ error: 'Your sign-in expired or could not be verified. Please sign in again.' }, 401) };
  }
}
