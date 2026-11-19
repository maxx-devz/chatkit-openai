# Stage 16: useful portal without Hubstaff

Implementation baseline: Stage15 72081fd, feat/agency-platform, primary checkout
C:\Users\MY PC\Desktop\AI\portal. Only Stage16 is implemented. The attached
playbook Stage16 was reference material; the user's scoped preservation and stop
instructions control. Stage16A and Stage17 requests/approvals are not included.

## Behavior and ownership

A client can be created using the existing agency administration flow with no
Hubstaff mapping/token. Assign its intended user the existing Client Administrator
membership through authorized administration/invitation; creating a business does
not create an identity or grant access by name. Basic profile fields are optional:
website reference, description, audience, services and goals. The business name
reuses portal_clients.display_name. Draft and completion state persist in a new
client-owned table; returning to Business profile resumes the saved revision.
Client Administrators with an effective manage grant can edit. Members/Viewers
can read only. Agency roles and platform privileges are not inferred from this.

013_client_business.sql is additive and portable PostgreSQL. It adds the scoped
profile with composite ownership FK, FORCE RLS, owner-only policy, bounded plain
text, revision control and narrowly granted SECURITY DEFINER entry points. Each
entry point checks the live session, active agency/client/membership and effective
grant. Runtime connectors/role guards are unchanged. No pooled tenant state is set.
Legacy tables retain the documented trusted service/application authorization
model, not universal per-tenant RLS. Profile audit records omit the private body.

The website reference is business context only. Saving it never changes the
approved AI browsing domain, Google authorization, Hubstaff project or a credential.
A separate Website Insights website retains its existing validation and grants.

Without a mapping the dashboard shows business setup, performance evidence,
attention, next actions and delivered artifacts. Missing time/tasks/budgets/sales
are unavailable, not zero. Saved website findings are dated observations, not live
analytics or claims of completed delivery. No requests/approvals controls were
added. Monthly Time/Project Status navigation and provider polling are omitted
when unmapped. Existing mapped dashboard, task/budget computation and per-client
project checks are reused without rewriting them. Credits remain independent.

Stage15's authorized agency identity/logo/palette is reused locally, without
changing client assistant appearance settings. Workspace keys and full-document
switching isolate profile/report state. Non-AOC client entry and external agency
routes remain gated. New fictional agencies cannot use this stage as a gate bypass.

Work/General modes remain. The Next proxy skips Hubstaff index/live calls when no
project is mapped and signs an explicit unavailable marker. General skips them too.
Python freshly authorizes the Work request and loads that client's profile plus up
to three completed, non-archived website report observations. It supplies them as
untrusted request data, never saved history or system instructions. A profile URL
cannot add a browsing tool/domain. Existing approved knowledge/revision/source
revocation and client response privacy checks remain; private admin guidance stays
private. General receives no business/report payload. Old databases with no 013
function continue existing chat without business evidence.

## Local setup and review

Review login: http://127.0.0.1:3005/login

Dashboard: http://127.0.0.1:3005/

Profile: http://127.0.0.1:3005/?view=business

Website Insights/reports: http://127.0.0.1:3005/?view=website-insights

Private accounts: .tmp/business-review/accounts.json in the primary checkout.
Use accounts.businessA.username/password for the first unmapped Client
Administrator, businessB for a separate client, viewer for read-only access, and
multi to inspect explicit workspace switching. aocOwner is a synthetic AOC agency
administrator with MFA, not a newly appointed real platform owner. Do not paste any
password, token, TOTP seed or recovery code into chat. Use an incognito/separate
browser profile: ports on 127.0.0.1 share cookie scope.

The ignored .env.business-review is generated for synthetic loopback PostgreSQL:
DATABASE_URL (ordinary runtime), AGENCY_MIGRATION_DATABASE_URL (operator only),
BETTER_AUTH_URL=http://127.0.0.1:3005, BETTER_AUTH_SECRET,
PORTAL_ACCOUNT_SECURITY_ENABLED=true, AUTH_MAIL_MODE=capture, AUTH_TEST_MAIL_DIR.
No .env.local values are copied. Prepare a fresh approved Stage03-15 synthetic
schema first, following the earlier runbooks; do not restore customer data or run
these tests against Neon. Then, in the private test shell:

```powershell
node --env-file=.env.business-review scripts/migrate-client-business.mjs --confirm-database <disposable_database_name> --app-role <ordinary_runtime_login>
node --env-file=.env.business-review scripts/seed-business-review.mjs --confirm-database <disposable_database_name>
node --env-file=.env.business-review scripts/dev-platform-review.mjs --business
node --env-file=.env.business-review scripts/check-business-review.mjs
```

The seed refuses existing private accounts and non-loopback/non-fixture targets.
The launcher strips operator/provider credentials before starting Next and does
not start AI/provider workers. Review reports are clearly labeled synthetic,
created without crawling websites or calling analytics. Migration/seed/health
scripts are committed; generated profiles/accounts and scratch WSL supervisors are
not. The retained server depends on its disposable WSL PostgreSQL supervisor.

## Verification and remaining setup

PROGRESS.md records actual commands/results and preservation checks. Database/API
checks use BUSINESS_FIXTURE, AGENCY_WORKSPACE_TEST_DATABASE_URL (operator),
DATABASE_URL (ordinary runtime), BETTER_AUTH_URL/SECRET and prior synthetic auth/
branding fixture files. Browser config validates fixture/target/origin agreement.
Runtime-role Python checks use STAGE16_BUSINESS_BOUNDARY supplied only by the
synthetic parent test. No external credentials are required for authorization.

No new provider variable is introduced and .env.example is unchanged. Basic
profile/onboarding needs only the existing local auth/database setup and 013.
Live chat additionally requires the existing CHATKIT_BACKEND_URL and
CHATKIT_BACKEND_SECRET in the Next server, matching backend secret and DATABASE_URL
in Python, and an approved deployment AI provider configuration (OPENAI_API_KEY or
OPENROUTER_API_KEY/model as applicable, or existing encrypted provider settings).
Configure privately in the respective runtime environment; never copy remote
Neon into the review profile. The retained review intentionally does not run live
AI. Proxy/source responses and model behavior in relevant tests are fixtures, not
paid-model verification.

Website HTML audits/saved reports do not require Hubstaff or Search Console.
PAGESPEED_INSIGHTS_API_KEY is optional for performance measurements. Search Console
live consent uses WEBSITE_INSIGHTS_GOOGLE_CLIENT_ID,
WEBSITE_INSIGHTS_GOOGLE_CLIENT_SECRET and WEBSITE_INSIGHTS_ENCRYPTION_KEY
with the existing documented Drive-key fallback; use only an approved named test
account/redirect and user-completed consent for later live checks. No Google
consent/provider token was requested or used here.

Carry forward hosted AI privacy and deployed private CDN/cache critical checks;
external agency activation stays HOLD. Live provider/resource/revocation,
schedulers, deployed ordinary roles/pooler, rotation/restore, DNS/TLS/custom hosts,
real email/legacy enrollment/all-factors-lost policy and supported-browser/BFCache
checks retain their recorded status. Google revocation is detected on next check
with the existing 15-minute freshness bound, not instant provider revocation.
Stage20B publication approval remains later. Stop before Stage16A; no push.
