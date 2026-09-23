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
