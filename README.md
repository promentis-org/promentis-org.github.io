# Promentis website

Landing page for Promentis Inc. The home page is `index.html`, the dedicated contact page is `contact.html`, and the contact endpoint is a Cloudflare Pages Function in `functions/api/contact.js`. There is no build step or package dependency.

## Cloudflare Pages

The `promentis` Pages project deploys the `main` branch. Leave the build command blank and use the repository root (`.`) as the output directory. `promentis.org` and `www.promentis.org` are connected as custom domains.

Cloudflare Pages serves `contact.html` at the extensionless URL `/contact`. The `_redirects` file sends `/contact-us` and `/contact-us/` to `/contact`; other HTML subpages do not need individual rules.

## Contact form

The form stores business inquiries in the Cloudflare D1 database `promentis-contact`. Create its `contact_messages` table with `schema.sql` if setting up a fresh environment. In Pages **Settings → Bindings**, bind that database as `CONTACT_DB`. In **Settings → Variables and secrets**, add the Turnstile widget's secret key as an encrypted secret named `TURNSTILE_SECRET`. Configure both for production and for any preview environment used to test submissions. Redeploy after changing bindings or secrets.

The public Turnstile site key is in `contact.html`; the private key belongs only in Cloudflare's encrypted secret. Allowed Turnstile hostnames must include the site's hostname and any preview hostname used for tests.

Review messages in Cloudflare **Storage & databases → D1 → promentis-contact → Console** with:

```sql
SELECT created_at, name, email, message, status
FROM contact_messages
ORDER BY created_at DESC
LIMIT 50;
```

The form does not email or notify the team. Check D1 regularly for new inquiries. Visitors are asked to avoid including personal health information.

## Individual reviews and moderation

`/reviews` accepts feedback for Dr. Avinash Puchalapalli. `functions/lib/reviews.js` defines the allowed recipients. Each submission saves to `individual_feedback` in the existing `CONTACT_DB` binding with `status = 'pending'` and `approved = 0`. Run the additive `reviews-schema.sql` against `promentis-contact` before deploying. It creates only the new feedback table and indexes; the contact table remains unchanged.

The form uses the existing Turnstile site key and `TURNSTILE_SECRET`. A reviewer can choose a public display name or remain Anonymous. Email stays private. Only reviews with both `status = 'approved'` and `approved = 1` appear in public queries or rating summaries. Feedback is rendered as text, including any submitted HTML. Approvals take effect on the next public-page load without rebuilding the website.

### Google admin sign-in

`/admin/reviews` provides the admin sign-in screen. The queue and all moderation operations require a Google ID token whose signature, issuer, audience, expiry, verified email and exact administrator email are checked on the server. A signed-in Google account alone does not grant access. The token stays in browser memory and is discarded on sign-out or reload; no credential is stored in localStorage. Configure these production runtime variables in Cloudflare Pages:

- `GOOGLE_CLIENT_ID`: the public OAuth client ID for a Google **Web application**.
- `REVIEW_ADMIN_EMAIL`: the one Google email address authorized to administer reviews.

Create or reuse a Google Cloud project and a basic Google Auth Platform consent configuration. The admin login needs only identity (openid, email, profile), without Gmail or other account-data access. Configure the Web application client's **Authorized JavaScript origins** as `https://promentis.org` and `https://www.promentis.org`; add `https://promentis.pages.dev` only if sign-in on that hostname is desired. This uses the Google Identity Services JavaScript callback, so no application redirect URI or OAuth client secret is needed. Restrict test mode to the intended administrator until the Google project is ready for production. Deploy again after setting the Cloudflare variables. Neither variable is hard-coded in browser source, and no shared admin password is used.

If either variable is missing, admin access is denied. Anonymous users and other Google accounts cannot read submissions, see private emails, or approve feedback. Preview deployments require separate configuration; leave them unconfigured unless intentionally testing against a separate test database.

The queue supports Pending, Approved and Rejected filters, pagination, approval/publication, rejection and returning a review to pending. Moving a published review to rejected or pending removes it from public results. Each decision records its timestamp and administrator email; stale decisions from another open tab are rejected. No submission is permanently deleted by the admin interface.
