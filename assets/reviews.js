const form = document.querySelector('#feedback-form');
const list = document.querySelector('#review-list');
const summary = document.querySelector('#summary');
let page = 1;
let loading = false;
function element(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
async function loadReviews() {
  if (loading) return;
  loading = true;
  document.querySelector('#previous').disabled = document.querySelector('#next').disabled = true;
  try {
    const response = await fetch(`/api/reviews?recipient=${encodeURIComponent(form.elements.recipient_id.value)}&page=${page}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const selected = form.elements.recipient_id.value;
    form.elements.recipient_id.replaceChildren(...data.recipients.map(recipient => {
      const option = element('option', recipient.name); option.value = recipient.id; return option;
    }));
    form.elements.recipient_id.value = selected;
    document.querySelector('.profile h2').textContent = data.recipients.find(r => r.id === selected)?.name || 'Feedback recipient';
    summary.textContent = data.summary.count ? `${data.summary.count} approved review${data.summary.count === 1 ? '' : 's'} · ${Number(data.summary.average).toFixed(1)} out of 5` : 'No approved reviews yet.';
    list.replaceChildren();
    if (!data.reviews.length) list.append(element('p', 'Be the first to share your experience. Your submission will be reviewed before publication.', 'empty'));
    for (const review of data.reviews) {
      const article = element('article', '', 'review');
      const meta = element('div', '', 'review-meta');
      meta.append(element('strong', review.display_name), element('span', new Date(review.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })));
      const stars = element('div', '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating), 'stars');
      stars.setAttribute('aria-label', `${review.rating} out of 5 stars`);
      article.append(meta, stars, element('p', review.message)); list.append(article);
    }
    document.querySelector('#previous').hidden = page === 1;
    document.querySelector('#next').hidden = !data.has_more;
    document.querySelector('#page-label').textContent = data.summary.count ? `Page ${page}` : '';
  } catch (error) {
    summary.textContent = error.message || 'Reviews could not be loaded.';
    list.replaceChildren(); const retry = element('button', 'Try again', 'outline'); retry.addEventListener('click', loadReviews); list.append(retry);
  } finally { loading = false; document.querySelector('#previous').disabled = document.querySelector('#next').disabled = false; }
}
document.querySelector('#next').addEventListener('click', () => { page++; loadReviews(); });
document.querySelector('#previous').addEventListener('click', () => { page--; loadReviews(); });
form.elements.recipient_id.addEventListener('change', () => { page = 1; loadReviews(); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type=submit]');
  const status = document.querySelector('#form-status');
  button.disabled = true; status.hidden = false; status.removeAttribute('data-state'); status.textContent = 'Saving your feedback…';
  try {
    const response = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(form)) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const selected = form.elements.recipient_id.value; form.reset(); form.elements.recipient_id.value = selected; status.dataset.state = 'success'; status.textContent = 'Thank you. Your feedback has been saved and is awaiting approval.';
  } catch (error) { status.dataset.state = 'error'; status.textContent = error.message || 'Feedback could not be saved. Please try again.'; }
  finally { button.disabled = false; if (window.turnstile) window.turnstile.reset(); }
});
loadReviews();
