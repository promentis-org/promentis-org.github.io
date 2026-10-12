let credential = null;
let filter = 'pending';
let page = 1;
let busy = false;
const queue = document.querySelector('#queue');
const signIn = document.querySelector('#sign-in');
const status = document.querySelector('#queue-status');
function element(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
function signOut(message = 'Sign in to continue.') { credential = null; queue.hidden = true; signIn.hidden = false; document.querySelector('#queue-list').replaceChildren(); document.querySelector('#login-status').textContent = message; if (window.google) google.accounts.id.disableAutoSelect(); }
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, cache: 'no-store', headers: { 'Authorization': `Bearer ${credential}`, ...options.headers } });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401 || response.status === 403) signOut(data.error); throw new Error(data.error || 'Request failed.'); }
  return data;
}
async function loadQueue() {
  if (busy || !credential) return;
  busy = true; status.textContent = 'Loading feedback…';
  const controls = queue.querySelectorAll('button'); controls.forEach(b => b.disabled = true);
  try {
    const data = await api(`/api/admin/reviews?status=${filter}&page=${page}`);
    signIn.hidden = true; queue.hidden = false;
    document.querySelector('#admin-name').textContent = `Signed in as ${data.admin}`;
    document.querySelectorAll('[data-status]').forEach(button => { button.textContent = `${button.dataset.status[0].toUpperCase() + button.dataset.status.slice(1)} (${data.counts.find(c => c.status === button.dataset.status)?.count || 0})`; button.setAttribute('aria-pressed', String(button.dataset.status === filter)); });
    const list = document.querySelector('#queue-list'); list.replaceChildren();
    for (const review of data.reviews) {
      const article = element('article', '', 'review admin-review');
      const meta = element('div', '', 'review-meta');
      meta.append(element('strong', review.display_name), element('span', review.status, 'badge'));
      article.append(meta, element('h3', data.recipients.find(r => r.id === review.recipient_id)?.name || review.recipient_id), element('div', `${review.rating} out of 5 stars`, 'stars'), element('p', review.message), element('p', `Private email: ${review.email}`, 'note'), element('p', `Submitted ${new Date(review.created_at).toLocaleString()}`, 'note'));
      if (review.moderated_at) article.append(element('p', `Last moderated by ${review.moderated_by} on ${new Date(review.moderated_at).toLocaleString()}`, 'note'));
      const actions = element('div', '', 'actions');
      for (const [action, label] of [['approved', 'Approve & publish'], ['rejected', 'Reject'], ['pending', 'Return to pending']]) {
        if (action === review.status) continue;
        const button = element('button', label, action === 'approved' ? '' : 'outline');
        button.addEventListener('click', async () => {
          if (busy) return;
          busy = true; queue.querySelectorAll('button').forEach(b => b.disabled = true); status.textContent = 'Saving decision…';
          try { await api('/api/admin/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: review.id, status: action, expected_status: review.status }) }); busy = false; await loadQueue(); status.textContent = action === 'approved' ? 'Feedback approved. It is now visible on the public reviews page.' : 'Decision saved. This feedback is not publicly visible.'; }
          catch (error) { status.textContent = error.message; }
          finally { busy = false; queue.querySelectorAll('button').forEach(b => b.disabled = false); }
        }); actions.append(button);
      }
      article.append(actions); list.append(article);
    }
    status.textContent = data.reviews.length ? `${data.reviews.length} ${filter} submission${data.reviews.length === 1 ? '' : 's'} on this page.` : `No ${filter} submissions on this page.`;
    document.querySelector('#previous').hidden = page === 1; document.querySelector('#next').hidden = !data.has_more; document.querySelector('#page-label').textContent = `Page ${page}`;
  } catch (error) { status.textContent = error.message; document.querySelector('#login-status').textContent = error.message; }
  finally { busy = false; queue.querySelectorAll('button').forEach(b => b.disabled = false); }
}
document.querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', () => { if (!busy) { filter = button.dataset.status; page = 1; loadQueue(); } }));
document.querySelector('#refresh').addEventListener('click', loadQueue);
document.querySelector('#sign-out').addEventListener('click', () => signOut());
document.querySelector('#next').addEventListener('click', () => { if (!busy) { page++; loadQueue(); } });
document.querySelector('#previous').addEventListener('click', () => { if (!busy) { page--; loadQueue(); } });
async function initialize() {
  try {
    const response = await fetch('/api/admin/config', { cache: 'no-store' }); const config = await response.json();
    if (!response.ok || !config.client_id) throw new Error('Google admin sign-in is being configured. Please check back later.');
    for (let i = 0; i < 50 && !window.google?.accounts?.id; i++) await new Promise(resolve => setTimeout(resolve, 100));
    if (!window.google?.accounts?.id) throw new Error('Google sign-in could not load. Check your connection and reload this page.');
    google.accounts.id.initialize({ client_id: config.client_id, callback: async result => { credential = result.credential; filter = 'pending'; page = 1; await loadQueue(); } });
    google.accounts.id.renderButton(document.querySelector('#google-button'), { theme: 'outline', size: 'large', text: 'signin_with' });
    document.querySelector('#login-status').textContent = 'Use your authorized Google account.';
  } catch (error) { document.querySelector('#login-status').textContent = error.message; }
}
initialize();
