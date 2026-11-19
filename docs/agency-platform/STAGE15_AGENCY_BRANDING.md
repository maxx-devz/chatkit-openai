# Stage 15: agency branding and domain-verification boundary

Baseline d3999df, feat/agency-platform, primary checkout
C:\Users\MY PC\Desktop\AI\portal. Preserve Stage14 security and Stage13A
specialist controls. This stage uses synthetic identities and disposable WSL
PostgreSQL only. No live DNS, hosting provisioning, real email or Neon writes.

## Implemented scope

Agency-owned portal name, report identity, optional approved legal company name,
support name/email, primary/on-primary/background/text colors, validated public
logo and optional powered-by attribution. Branding is separate from client AI
greetings, accents, instructions, models, knowledge and pricing. AOC software
ownership and platform controls do not change. Authenticator issuer remains AOC
for the shared account; changing a displayed brand never creates an auth identity.

012 adds agency_branding and agency_domains, each with ENABLE/FORCE RLS and
owner-only policies. Runtime access uses guarded lib/database.js and narrow
functions. The public projection exposes presentation only, not members, private
settings, sources, credentials, domain challenges or customer content. No global
brand inheritance is added. The ordinary service runtime remains the documented
trusted application model; this is not universal tenant RLS for legacy tables.

The existing Agency Owner can preview and save their brand. Staff may read its
public identity but cannot change it. Server checks enforce owner/MFA, scope,
revision and audit, independent of buttons. Invalid or stale saves leave no
partial changes. Support fields reuse the scoped agency-governance fields.

BrandFrame and the existing admin shell/navigation, login form, account controls
and sign-out component serve both fictional agencies without copied applications.
Neutral fictional Harbor Studio and Summit Collective use different raster marks
and accessible teal/purple palettes. Both normal-text pairs require 4.5:1 contrast
in JavaScript and SQL. Mobile and focus behavior use the existing responsive
components plus a small shared branding stylesheet. Logo failure has text fallback.

Logos accept at most 512000 bytes, PNG/JPEG/WebP only, one static page, at most
1000x1000 input pixels. Installed sharp0.35.4 is pinned as a direct dependency and
decodes/re-encodes to a metadata-free PNG up to256000 bytes and256px. SVG, HTML,
animated images, malformed images and URL-based logo fetching are excluded. Only
that prepared public raster is served by the brand-logo route, with nosniff,
private/no-store and sandbox headers. Existing private library/files stay private.
The native Node sharp entry avoids an observed Turbopack external-import failure.
Only the image upload handler loads it; its native package/assets are explicitly
included in the Next output trace. Deployment still needs a target-platform build.

## Local route and account contract

Explicit local /portal/<agency-slug>/<screen> routes select presentation only.
Supported views reuse the existing agency client/staff/settings/usage/audit/source
administration, with a branding editor and existing specialist-approval link.
Protected screens and APIs still resolve current membership and MFA separately.
This does not enable /agency, /api/agency or the held non-AOC client data portal.
Client users may use branded login/account pages; they do not become agency staff.
Full external client rollout remains a later approved gate decision.

Login, MFA, account navigation and logout preserve the explicit brand. Recovery/
verification wrappers construct only fixed same-origin account destinations.
Captured email uses a text identity fallback and token fragment; the original
single-use/reset/verification flows remain provider-supported. The fragment is
removed before POST and never persisted in storage or request URLs. A branded
invitation page must agree with the immutable invitation agency or acceptance
rejects without consuming the token. Underlying account/role authorization is
unchanged. Real responsive email delivery/templates are not claimed; Stage14's
local capture transport remains the only enabled adapter.

Workspace switching loads a new server-authorized context/brand; cached data is
not an authority. Existing focus/current-session checks and no-store headers are
retained. Branding drafts conceal on blur and recheck owner status on focus.
Do not treat a public brand header or a URL slug as membership.

Host remains an exact match to BETTER_AUTH_URL. Unknown hosts and disagreeing
X-Forwarded-Host reject; client-supplied brand headers are stripped. There is no
default-AOC/customer host fallback. Better Auth explicitly uses host-only cookies,
with no parent-domain sharing. Local path-based brands intentionally share a
same-origin login, with every protected workspace rechecked. Port numbers do not
isolate browser cookies; use separate browser profiles for different review DBs.
This stage does not implement cross-domain SSO or loosen trusted origins.

## Exports

Authorized agency JSON/CSV summaries include the selected agency identity and
only clients/usage allowed by existing agency_admin_view. Staff exports retain
assigned-client restrictions and no owner billing expansion. Downloads recheck
access, use private/no-store and safe fixed filenames; CSV cells guard formula
prefixes. Website Insights CSV/JSON downloads derive identity from the already
authorized report context, never a browser-supplied agency. Legacy reports without
a configured public brand keep the existing neutral report shape.

These are supported data exports, not a new PDF/document renderer. Client report
branding has a controlled route adapter test; real customer analytics/provider
data and external client-mode delivery are not exercised or enabled here.

## Custom domains: supported provider, live routing pending

The agency owner can reserve a normalized hostname. Global uniqueness prevents
case/cross-agency collisions, including revoked reservations; reassignment needs
a separately reviewed platform release process. Requests cannot select a provider
project, credential, target URL or redirect. Domains begin pending. A platform
owner with fresh MFA may invoke the read-only hosting inspection endpoint after
explicit private setup. An agency owner cannot attest their own domain.

The server adapter uses fixed https://api.vercel.com endpoints. It binds exact
domain and project, requires verified ownership and configured DNS, disallows
redirect/branch/environment assignments and returns only bounded TXT challenges.
Ticket generation and agency status are rechecked after provider inspection so a
revocation/reassignment race cannot attach a stale result. It never calls DNS
management, registrar/purchase, certificate purchase or arbitrary tenant URLs.

Reference primary API documentation:

* [Add a project domain](https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project)
* [Get a project domain](https://vercel.com/docs/rest-api/projects/get-a-project-domain)
* [Verify a project domain](https://vercel.com/docs/rest-api/projects/verify-project-domain)
* [Domain configuration](https://vercel.com/docs/rest-api/domains/get-a-domain-s-configuration)

Adapter register/verify operations are prepared for a separately approved hosting
operation; no application route invokes those writes in this stage. The status
endpoint only inspects a previously registered provider domain. Automated tests
use a fake transport at this adapter boundary, including pending/wrong-project/
redirect/freshness-race cases. No live provider registration/check occurred.

Even a fixture-verified domain returns routingEnabled:false. Custom hosts remain
rejected while the external gate is closed. Verification is a recorded provider
snapshot, not a permanent DNS guarantee or an instant revocation claim. Hosting
registration, ownership challenge completion, DNS/TLS propagation, deployed proxy
trust, per-host callback/CSRF/cookie verification and recheck scheduling must be
rehearsed before a separate domain-routing release. Do not simply add requested
hosts to Better Auth trusted origins or a wildcard cookie domain.

## Private configuration and repeat commands

No local prerequisite is missing. Installed Node22, Python3.13, Next16.3.3,
Better Auth1.7.2, Chrome157, sharp0.35.4 and WSL PG18.3 were reused. The new review
uses a separate .env.branding-review and .tmp/branding-review/accounts.json with
synthetic accounts. Old review profiles and .env.local are preserved.

Private local profile: DATABASE_URL (ordinary guarded runtime),
AGENCY_MIGRATION_DATABASE_URL (separate operator, provisioning only),
BETTER_AUTH_URL=http://127.0.0.1:3004, generated BETTER_AUTH_SECRET,
PORTAL_ACCOUNT_SECURITY_ENABLED=true, AUTH_MAIL_MODE=capture,
AUTH_TEST_MAIL_DIR=<absolute ignored .tmp/branding-review/mail>.
The launcher strips operator/provider settings before starting Next.

Fresh disposable prerequisites: follow Stage03–14 migration/fixture runbooks,
then run in the private matching test shell (never .env.local):

```powershell
node scripts/migrate-agency-branding.mjs --confirm-database <disposable-name> --app-role <ordinary-runtime-role>
npm run seed:branding:review -- --confirm-database <disposable-name>
npm run dev:branding:review
node --env-file=.env.branding-review scripts/check-branding-review.mjs
```

Migration012 is checksummed/transactional/repeatable and refuses an unexpected
runtime/operator/target or missing011. Seed refuses existing output/agencies.
Do not run acceptance mutations against the retained review DB. Automated checks
use a fresh synthetic cluster and matching AGENCY_WORKSPACE_TEST_DATABASE_URL,
ACCOUNT_SECURITY_FIXTURE and AGENCY_BRANDING_FIXTURE, then discard it.

```powershell
npm run test:agency:branding:database
npm run test:agency:branding:browser
npm run lint
npm run build
```

Actual execution uses a private isolated harness shadowing every .env assignment
for build and OS-only test environments, excluding remote/provider credentials.
See PROGRESS for real results and limitations. No deployment happened.

Future live **read-only** Vercel check requires the following privately in the
approved server environment, not browsers/chat. They are blank in .env.example:

| Name | Purpose |
| --- | --- |
| AGENCY_DOMAIN_CHECKS_ENABLED | explicit true only for an approved named live inspection |
| VERCEL_DOMAIN_TOKEN | server-only token scoped to the authorized project/team |
| VERCEL_DOMAIN_PROJECT_ID | exact intended project, never chosen by agency input |
| VERCEL_DOMAIN_TEAM_ID | intended team when applicable |

These are currently missing/unset intentionally; live inspection depends on them.
Real assets, legal/attribution terms, actual domains and operator consent are also
pending. No sign-in/consent was needed for synthetic tests. Request an approved
provider account/domain and user-completed consent only for a named later live
check. Do not buy domains or edit DNS on the basis of this runbook.

## Review

* Harbor: http://127.0.0.1:3004/portal/s13-harbor/login
* Summit: http://127.0.0.1:3004/portal/s13-summit/login
* Branding: same prefix ending /branding; protected home ends /clients.

Private accounts file: .tmp/branding-review/accounts.json. accounts.ownerA reviews
Harbor, accounts.ownerB reviews Summit; use username/password, then that account's
private totpURI in an authenticator or an unused backupCodes entry. Never paste
credentials, OTPs or seeds in chat. The shared account issuer remains AOC.
The fixture marks/names/addresses are fictional, not actual customer brand approval.

## Remaining release checks

Keep external agency access and custom-host activation HOLD. Hosted-AI/privacy,
deployed private CDN/cache, deployed runtime/pooler mapping, provider consent/
resource/revocation, scheduler, secret rotation/restore and supported browser/real
BFCache checks remain as before. Google revocation remains next-check/15-minute
source freshness. Stage14 live email, legacy real-email enrollment and approved
lost-all-factors procedure remain pending. Stage20B publication approval is later.
No real customer/personnel data, email, provider upload, payment, production write
or push. Stop before Stage16.
