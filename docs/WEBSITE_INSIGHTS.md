# Client Website Insights

Open the client portal → **Website Insights** (`/?view=website-insights`). This is
a client-only feature; it adds no AOC Admin or internal-portal views or controls.
The client sidebar now uses actual permission-checked views rather than scroll
anchors; existing documents, membership, audit, account and Hubstaff features remain.

## Database and local setup

1. Use the existing portal's `DATABASE_URL`, not an empty Neon Auth-only database.
   The existing `portal_clients` and `portal_users` tables must already exist.
2. Install dependencies with `npm install`.
3. Run `npm run website-insights:migrate`. It creates only the four new tables
   from `database/website-insights.sql`; it does not migrate or change core tables.
4. Restart the portal. Add a website name and a public **HTTPS domain root**.
5. Select **Analyze Website**. Completed batches are saved automatically. Keep
   this view open, or return and resume an unfinished run. No unattended scheduler
   or AI generation service is needed.

Members can add/rename websites and run/resume reports. Viewers can read and
download. Existing document-management permission is required to connect/disconnect
Google, select a property or archive a website. No role grants are changed.

## Google Search Console (optional, separate from Drive)

The HTML audit works without Google. Search queries, clicks, impressions and
average positions require the website's real Search Console data:

1. In Google Cloud, select the project containing your web OAuth client. Enable
   **Google Search Console API**.
2. Add the scope `https://www.googleapis.com/auth/webmasters.readonly` to the
   consent configuration. In Testing mode, add the authorizing Google account as
   a test user. Public production use may require Google's app verification.
3. Add the exact authorized redirect URI to the existing OAuth web client:
   `<BETTER_AUTH_URL>/api/client/website-insights/google/callback` (origin only,
   with no extra slash). For ordinary local use:
   `http://127.0.0.1:3000/api/client/website-insights/google/callback`.
   A separate preview on localhost:3100 needs that exact localhost redirect too.
4. Optionally set `WEBSITE_INSIGHTS_GOOGLE_CLIENT_ID`,
   `WEBSITE_INSIGHTS_GOOGLE_CLIENT_SECRET`, and a stable 32+ character
   `WEBSITE_INSIGHTS_ENCRYPTION_KEY` on the portal server. If omitted, the existing
   `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` and
   `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` are used. No credential is sent to a browser.
5. In the client Website Insights view, choose **Connect Google · read only**.
   Authorize an account with access to that site's Search Console property.
6. The portal verifies Search Console access and loads only matching properties.
   Select one and click **Use this property**. Run a new analysis to capture data.
   Use **Check access again** after correcting Google API or property permissions.

A saved refresh token is only a saved authorization, not proof of a working
connection. **Connected** requires a successful Search Console property read and
a selected, currently accessible property matching this website. Missing API
enablement, expired authorization, incomplete sign-in and missing properties
have separate statuses. Google Analytics access alone does not grant Search
Console access.

Starting a new sign-in marks that browser login's attempt incomplete until its
bound OAuth callback completes. Failed or cancelled attempts do not replace or
delete an earlier saved authorization. The UI labels that older authorization
explicitly and offers **Remove saved authorization**, rather than misleadingly
showing **Disconnect**. Returning with browser Back rechecks status, including
pages restored from the back-forward cache. Google-hosted errors that never
return to the callback remain incomplete until retried or the 10-minute state
expires. An expired attempt may reveal a still-valid earlier authorization; it
does not mean the attempted new Google account succeeded.

This does not reuse Drive tokens, request Drive/write scopes, or change the
existing Drive integration. Consent is client/session/site bound with PKCE and
single-use expiring state. Refresh tokens are encrypted with site/client/client-ID
associated data. Domain-property search queries are filtered to the monitored
website's HTTPS host (and www equivalent), not sibling stores/subdomains. Access
to the property is rechecked before each search snapshot.

Reports are shared within the selected client workspace, not across accounts or
clients. Disconnect removes only that site's locally stored Google grant, not
all grants for a shared OAuth client. Users can separately revoke this app through
Google Account permissions; that may also affect other uses of the same OAuth
client. Existing report snapshots remain stored after disconnect/archive.

## Google PageSpeed (optional key)

Mobile and desktop PageSpeed Insights calls test the homepage. Without a key,
Google may reject requests because of anonymous quota. To use your own quota,
enable PageSpeed Insights API and set server-only `PAGESPEED_INSIGHTS_API_KEY`.
No score is fabricated when Google fails, times out or returns insufficient data.
The website URL is sent to Google for these tests; no login cookies or portal
credentials are sent. No AI provider is called by Website Insights.

Each device runs in its own saved batch with a 90-second Google request budget.
The Website Insights route allows 120 seconds, and its 130-second database lease
prevents another tab from duplicating a still-running batch. Response fields omit
full-page screenshots and unrelated top-level diagnostics; JSON reads remain
bounded to 5 MB. Timeout, network, oversized/unreadable response, quota, disabled
API and key-access errors are reported separately. No uncontrolled automatic
retries or fabricated scores are used. After correcting configuration or updating
this code, run a new analysis; existing saved reports are historical snapshots.

On Vercel, use Fluid Compute for the 120-second route budget. Legacy Hobby
functions without Fluid Compute are limited to 60 seconds; changing the local
code does not change that account setting. See
[Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).

PageSpeed correction verified locally on October 30, 2026: key-backed mobile and
desktop requests for `https://gogrit.us/` returned HTTP 200 and real lab scores
in approximately 62 and 36 seconds respectively. A 40-second cutoff was too
short for the observed mobile run. These diagnostic reads did not alter saved
client reports. All 319 Node tests passed, including 53 Website Insights tests;
the real PostgreSQL TEMP-fixture repository/lease checks and production build
also passed. Browser
verification was blocked by browser-control timeouts. No AI generation request,
schema migration, admin/internal change or deployment was performed.

## What a report means

- Up to 12 public HTML URLs are checked, two per resumable crawl batch. Root
  sitemap discovery and same-site links select the sample. Sitemap indexes are
  not expanded, external links and query URLs are excluded, and robots rules are
  respected. Failure to verify robots.txt skips the HTML crawl conservatively.
- Missing metadata/headings, indexing directives, HTTP errors, duplicate sampled
  titles/descriptions/text, missing alt attributes and invalid JSON-LD are observed
  checks. Content clarity, metadata lengths and relevant schema are suggestions.
- JavaScript is not executed; authenticated pages, rendered-only content and
  unsampled URLs are not audited. Network errors are not claimed as broken links.
- Public requests validate all resolved IPs, pin DNS for the actual TLS request,
  reject private/metadata/reserved addresses, bound redirects/body size/time, and
  enforce same-site/robots policy on redirects. No page scripts are run or rendered
  as HTML in the portal.
- Search previews and template title/description suggestions are not actual Google
  results. No website content is changed. Indexing, rich-result eligibility and
  visibility in ChatGPT/Gemini/Google AI are not guaranteed.
- Search Console uses adjacent 28-day **Pacific reporting-day** windows ending
  three days before today, requests finalized web-search data, and shows the top
  200 query/page pairs/pages. Anonymized or omitted rows may be absent. Position is
  an average, not an exact live rank. Aggregate totals are requested separately;
  they are not calculated by summing truncated query rows.
- Lighthouse lab scores and metrics are distinct from actual CrUX field data.
  Total Blocking Time is not INP. Field data is shown only when returned by Google.
- History comparisons call issues **no longer detected** only on successful pages
  sampled in both reports; this is not proof they were fixed. Coverage and test
  conditions can vary. JSON/CSV downloads and browser Print/PDF are available.
  The history view lists the latest 60 analyses; older report records are retained.
- Website archive retains reports in storage; a portal operator can restore the
  archived record. New analyses are limited to one start per client per minute,
  with one active report per website and database leases preventing duplicate work.

## Verification

- `npm run test:website-insights`: mocked/pure audit, routing and security tests.
- `npm run test:website-insights:database`: actual repository SQL against session-
  local TEMP tables only; no real portal data or provider API requests are changed.
- `npm test` and `npm run build`: general regressions/build.

### Local verification on October 30, 2026

- Production build passed in client-portal; all 296 Node tests passed, including 30 focused
  Website Insights tests. The separate real-PostgreSQL repository test passed
  using prefixed temporary tables inside a rolled-back outer transaction.
- Signed in as Golfbrands and saved two real analyses of
  `https://www.golfbrands.com/`. Each sampled 12 HTML pages, with 0 critical
  findings, 28 warnings and 22 improvement suggestions. These are sampled HTML
  observations, not a full-site certification.
- Browser checks covered adding a website, automatic batches, pause/resume,
  saved history after reload, report comparison, priority filtering, search
  previews, CSV download and desktop/mobile layouts. Comparing the two reports
  found no changed findings on the 12 common pages. No browser errors were seen.
- Anonymous Google PageSpeed requests returned quota errors for both devices;
  the UI correctly showed unavailable results, not invented scores.
- Search Console consent and live statistics have not been exercised. Complete
  the optional Google setup above and authorize the appropriate account to test
  connected search data. No AI generation requests were made. No deployment was
  performed; the temporary preview server was stopped after verification.

The feature was transferred into `C:/Users/AOC-DEV 2/chatkit/client-portal` and
verified there as Golfbrands at `http://127.0.0.1:3000/?view=website-insights`.
The existing saved reports loaded from the shared portal database. The original
feature files were then removed from chatkit-nextjs, its seven tracked feature
changes were restored, and that checkout returned to a clean Git working tree.
Existing client-portal OpenRouter/indexing edits and local secrets were preserved.
All future portal work targets client-portal only.

### Connection-status correction on October 30, 2026

- Removed the saved-token-equals-connected assumption. Status now verifies an
  accessible matching property, distinguishes pending sign-in and API/access
  errors, and preserves older authorization when a replacement attempt fails.
- All 309 Node tests passed, including 43 Website Insights tests. Regression
  coverage includes disabled APIs, expired grants, absent/mismatching properties,
  session-bound pending attempts, cancelled/failed token exchange and callbacks
  that never falsely declare a verified connection. Production build passed.
- Live visual verification of this correction was blocked by repeated Chrome
  control timeouts. Successful Google consent and real Search Console statistics
  remain unverified; these tests use mocks, not newly granted Google access.
- No paid AI request, schema migration, admin/internal feature edit, deployment
  or Google account permission change was performed for this correction.

Google documentation:
[Search Analytics](https://developers.google.com/webmaster-tools/v1/searchanalytics/query),
[Search Console properties](https://developers.google.com/webmaster-tools/v1/sites/list),
[PageSpeed](https://developers.google.com/speed/docs/insights/v5/get-started/),
[OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server).
