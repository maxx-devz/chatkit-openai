# Stage 16A — role profiles and guided delivery onboarding

Baseline: feat/agency-platform, Stage16 checkpoint 9bb7d49. The user authorized
switching to the latest branch and continuing the next stage in order. Only16A
is in scope; Stage17 requests/deliverable approvals and20A workflow templates
are not implemented here. The playbook was read as reference, not as authority
to change production or move into later stages.

## Agency flow

Open /admin/agency/onboarding?agency=<authorized-slug>. Agency Owners/Administrators
can edit fictional development, SEO, design or reporting starters; save a draft;
approve its exact revision; and assign approved guidance to existing permitted
staff or a scoped specialist. Profiles capture specialty, adjacent work, tools,
client context, AI guidance, exclusions, deliverables, review responsibilities,
success criteria, business knowledge, standards, access blockers and a small first
task. Examples certify no qualification and promise no deadline.

A profile is guidance, never a role, client/file grant, source publication,
credential or AI tool permission. A new agency inherits no private AOC profile.
Editing a draft preserves the previous immutable approval and every existing
checklist's pinned revision. A new approval can be chosen for future onboarding;
it does not silently replace assigned guidance. Retiring a profile stops
subsequent access to its checklists. Reassignment is an explicit new checklist
and separate revocation; neither action grants or revokes unrelated memberships.

Assignments require a permitted agency/client/person, active reviewer and expiry
within90 days. Own staff must already have client access. Specialists must have
an active approved Stage13A assignment covering the same agency/client/person,
with expiry covering the onboarding period. A staffing engagement alone fails.
Internal user positions and grants remain independent and cannot be inferred from
a profile or employer. Agency administration navigation links this screen;
permitted staff and specialist delivery have a link to /onboarding.

## Participant flow

/onboarding lists only currently authorized checklists. Select an explicit scope
to review its approved guidance and four steps: business knowledge, standards,
required access and a first task. Save not-started/in-progress/blocked/completed
state with an optional bounded business note, and resume after reload/interruption.
Completion is self-reported; it does not approve client work or a deliverable.
Access-request notes are checklist context only. Use the existing work tool or
review owner to request access; no Stage17 request service is implied.

No Hubstaff mapping/token is required. An optional HTTPS work-tool link is only
a link: it causes no crawl, account connection, duplicate task or automatic sync.
Existing Hubstaff mappings, budgets, tasks, project ownership, AOC Admin clients,
credits, indexing, files and approved knowledge are unchanged. Profiles and
progress are not ingested into AI retrieval. No HR/payroll/coaching/recruitment
table is joined or exposed. Free-text fields are delivery-only and explicitly
exclude private personnel information; this is not an automatic semantic DLP
scanner for text voluntarily entered by an authorized participant.

Read-only assignments show read-only controls. Specialist progress writes require
the already approved delivery.notes.write action; ordinary staff need contribute/
manage client permission. Every request rechecks live session/MFA, membership,
client, agency, reviewer, expiry and assignment. Poll/focus/pageshow checks remove
stale page content after a denied recheck (up to15 seconds while visible); already
displayed text cannot be remotely erased instantly. Mutations reauthorize in SQL.
There are no new download grants; prior file/link revocation limits remain.

## Database and server entry points

Additive portable014_delivery_onboarding.sql adds delivery_profiles,
delivery_profile_revisions, delivery_onboarding and delivery_onboarding_operations.
All four have ENABLE/FORCE RLS, owner-only policies and no direct runtime DML.
Composite agency/client/profile/member keys reject mismatches. Narrow SECURITY
DEFINER functions pin search_path and check live authority. Optimistic revisions,
scoped locks, operation fingerprints and transactional metadata audit prevent
stale writes/replay duplication. Audit contains actor/scope/action/reason and
resource/step/state; it does not copy private profile bodies or progress notes.
No tenant session GUC is left on pooled connections. Existing legacy shared
service-role limits remain explicit; no universal legacy-row RLS claim is made.

Next uses lib/database.js. Migration is an explicit short-lived standard pg
operator connection, validates the ordinary role and prior013, applies checksum
versioning and grants only four entry functions. No provider SDK or extension.
New guarded routes: /api/admin/agency/onboarding and /api/onboarding. Admin body
limit is24KB for the bounded multi-field profile; ordinary progress retains the
existing8KB protected mutation limit. Same-origin/Host, closed local agency gate,
fresh session, private no-store responses and known error handling are reused.

## Private setup and review

Review uses a fresh disposable loopback PostgreSQL18.3 target and synthetic
identities. Never substitute .env.local or a remote Neon/Supabase URL. Required
existing server names, set privately in ignored .env.delivery-onboarding-review:

- DATABASE_URL: ordinary guarded runtime login.
- AGENCY_MIGRATION_DATABASE_URL: operator for explicit migration only; never pass
  it to the Next review server. Tests may use the existing alias
  AGENCY_WORKSPACE_TEST_DATABASE_URL for that separate operator.
- BETTER_AUTH_URL=http://127.0.0.1:3006 and a generated BETTER_AUTH_SECRET.
- LOCAL_AGENCY_ADMIN_REVIEW=true, PORTAL_ACCOUNT_SECURITY_ENABLED=true,
  AUTH_MAIL_MODE=capture and AUTH_TEST_MAIL_DIR under the private review .tmp.
- DELIVERY_ONBOARDING_FIXTURE: ignored synthetic account/state JSON for tests only.

No new production/provider setting is needed and .env.example is unchanged.
No live AI, Google sign-in, paid provider, SMTP or real customer data is required.
Use earlier Stage03–16 runbooks to prepare synthetic prerequisite schema/roles.
Then run in a private test shell, using the verified operator/runtime targets:

    node scripts/migrate-delivery-onboarding.mjs --confirm-database <disposable-name> --app-role <ordinary-login>
    node scripts/seed-delivery-onboarding-review.mjs --confirm-database <disposable-name>

The seed refuses remote/mismatched targets and existing accounts. It uses the
existing Better Auth APIs and local capture adapter; never real invitations.
The account-security flow, MFA and verification are preserved. For review use
accounts.staffA.username/password to open /onboarding, or accounts.ownerA for the
agency approval screen. If the synthetic owner needs MFA, enter its private test
factor yourself using the same account's private totpURI/backupCodes. Never paste
passwords, cookies, factors or recovery codes into chat. Use a separate browser
profile because cookies on127.0.0.1 are not isolated by port.

Current private account location: .tmp/delivery-onboarding-review/accounts.json.
The retained local review uses the verified production snapshot under
.tmp/stage16a-build and port3006. It is not a deployment artifact or a second
implementation source; final application/migration/tests live at repository paths.
Private session metadata identifies its database/server/stop file. It depends on
the task-owned WSL supervisor and is disposable; do not assume old review URLs
remain valid after that supervisor is stopped. Logs, email, accounts, environment
files and snapshots stay ignored and must not be copied into Git.

## Evidence and release boundary

Actual final results are recorded in PROGRESS.md and ISOLATION-EVIDENCE.md.
Browser tests use real Better Auth sessions, server routes and PostgreSQL; synthetic
session cookies are injected for the Stage16A UI scenarios, while Stage14's
separate browser suite covers interactive login/MFA/recovery. No live AI/provider
behavior is inferred. Ordinary role denials and synthetic HR canary checks are
database evidence, not a certification of an external deployment.

External agency activation remains HOLD: hosted-AI privacy and deployed private
CDN/cache checks are critical release boundaries. Carry forward provider consent/
resource/revocation, hosted runtime/pooler roles, scheduler delivery, secret
rotation/restore, real email/enrollment/lost-factor policy, DNS/TLS/custom hosts
and supported-browser/BFCache checks. Google revocation retains its documented
next-check/15-minute freshness window. Source publication approval remains20B.
Stop after16A. Stage17 is next and requires its own explicit authorization.


Exact retained review links (synthetic identifiers, no credentials):

- Login: http://127.0.0.1:3006/login
- My checklists: http://127.0.0.1:3006/onboarding
- Fictional Harbor Delivery: http://127.0.0.1:3006/admin/agency/onboarding?agency=onboarding-harbor-0f4db9a7
- Fictional Summit Delivery: http://127.0.0.1:3006/admin/agency/onboarding?agency=onboarding-summit-40605c6d

Final local results:10 database/API TAP checks including parent,8 Chrome onboarding scenarios,381 general/115 Internal/40 source-index tests; Python188 reported with10 skips; lint/build pass. See PROGRESS for earlier-stage repetitions and remaining external gates.
