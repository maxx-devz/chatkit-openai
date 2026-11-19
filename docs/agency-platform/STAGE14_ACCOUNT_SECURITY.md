# Stage 14 — invitations, recovery and account security

Baseline: `4bbc4e0`, `feat/agency-platform`, primary checkout
`C:\Users\MY PC\Desktop\AI\portal`. Stage 15 is not started. External agency
access stays gated. This run uses synthetic identities and disposable WSL
PostgreSQL only. Neon, existing customer accounts and real email are untouched.

## Reused implementation and installed provider

Installed **Better Auth 1.7.2**, as locked in package-lock.json; no auth dependency
upgrade or replacement. The installed two-factor implementation supports TOTP,
encrypted factor secrets, encrypted single-use recovery codes, signed login
challenges, verification lockout and factor enrollment verification. The installed
PostgreSQL adapter selects transactions for pg.Pool. Password recovery uses the
provider's atomic verification-value consumption, credential update and session
revocation APIs; application code never hashes or replaces passwords itself.

Inspected installed provider source under `node_modules/better-auth/dist` and
`node_modules/@better-auth/kysely-adapter/dist`; framework guides under
`node_modules/next/dist/docs/01-app`, including route handlers and data security.
Reference: [Better Auth MFA](https://better-auth.com/docs/plugins/2fa),
[email](https://better-auth.com/docs/concepts/email),
[provider options](https://better-auth.com/docs/reference/options).
Installed source/version takes precedence over a later documentation revision.

Stage 13's agency invitation record and membership-acceptance function remain the
authority for roles and client relationships. Stage 13A engagement, specialist
approval, action whitelist, expiry, file broker and independent Internal Portal
rules remain intact. No staffing relationship or email verification grants data.

## Invitation and membership contract

* Existing provisioned identities receive invitations; public sign-up stays off.
  Acceptance adds a membership to the existing identity, never a duplicate user.
* Each invitation binds its agency, optional client, intended portal user and
  offered role. The original 24-hour expiry is retained. A 32-byte random bearer
  is stored as SHA-256 only in the protected invitation-link ledger.
* Intended-account/session validation, current inviter authority, ownership,
  expiry and unused state are checked inside the acceptance transaction. Wrong
  accounts, substituted hashes, foreign request fields, revoked inviters and
  concurrent replay cannot consume a valid invitation or leave partial grants.
* The old UUID-only acceptance entry rejects once 011 is installed; the original
  implementation is owner-internal, with runtime EXECUTE explicitly revoked.
* Resending rotates the bearer and invalidates the previous link. Revocation of
  the underlying invitation also prevents acceptance. Link opening is read-only;
  acceptance requires an authenticated, same-origin explicit POST.
* In security mode, Members & Access requests Viewer/Member invitations for an
  existing email instead of generating a shared temporary password. Unknown or
  ineligible addresses get the same pending response. No identity, email or access
  is created by a request. An authorized Agency Administrator explicitly approves
  it using **Approve invitation** or **Resend invitation**. The approver becomes the inviter;
  Stage 13's live authority checks still apply at acceptance. Client Admin cannot
  approve it or request Agency Admin, platform or Client Administrator authority.
* New client invitations currently require no active membership in that agency,
  as in Stage 13. Existing same-agency members use the existing authorized client
  assignment action. Real invitations remain disabled until separately approved.
* Existing role changes, last-owner protection and scoped deactivation/audit are
  reused. Removing access in Agency A preserves valid Agency B membership. MFA
  does not override any role, client, assignment or source permission.

## Recovery, verification and MFA contract

`PORTAL_ACCOUNT_SECURITY_ENABLED=true` enables supported provider verification,
password recovery and the TOTP plugin. Apply its provider schema and migration
011 first. On an installed 011 database, disabling the runtime flag does not
remove the SQL privileged-session checks; an incomplete setup fails closed.
Older unmigrated deployments and earlier review servers retain their prior mode.

Email verification is required for new sign-ins and trusted portal sessions.
Verification does not automatically sign a person in. Reset links expire after
30 minutes; email verification tokens after one hour. Password reset invalidates
account sessions across workspaces, preserves MFA enrollment and memberships,
and does not elevate access. Public recovery/verification responses are generic,
with a minimum response floor; this is not a claim of formal timing equivalence.

All active platform roles, agency administrators/owners and legacy AOC Admins
require verified email, enrolled MFA and a session-bound successful TOTP or
recovery-code check within 12 hours. Roles/status are checked fresh. Promotion
requires MFA immediately, even for an existing session. TOTP verification remains
available for refreshing an old session's assurance. Sessions are never assured
from request headers, query parameters, a password-only login or prompt text.

The provider withholds a normal session until the signed MFA challenge succeeds.
Existing enabled factors/recovery codes cannot be replaced with only a password.
Privileged MFA cannot be disabled; trusted-device bypass and email OTP are not
enabled. Recovery codes support a lost device and are consumed once. All factors
lost is **not** an automatic reset or tenant-authorization bypass: privileged
production use requires a separately approved identity reproof/operator process.

The private service runtime attests successful provider verification to the
protected session-factor ledger. This is application-server attestation, not a
claim that a stolen service database login is an untrusted tenant role. Protected
agency/security ledgers use FORCE RLS and narrow functions; legacy/auth tables
retain the documented private trusted-service model. Next.js, Python, legacy
Admin, Internal session resolution, platform/agency/delivery checks and user-run
jobs recheck the account policy. Both runtime role guards also reject ownership
of the provider's new twoFactor table.

Operator-only account_controls can deny portal authorization globally. This does
not add a public ban/impersonation API or claim that Better Auth credential login
has itself been disabled. Account-wide session logout uses the supported provider
API; per-workspace membership changes do not revoke unrelated memberships.

## Private local email adapter and browser privacy

Only `AUTH_MAIL_MODE=capture` is implemented. Capture refuses non-loopback portals,
non-disposable/non-loopback databases, non-.invalid recipients, paths outside the
ignored project .tmp directory, and symlink escapes. It writes private local JSON
messages; there is no public inbox endpoint or live transport.

Produced links place their bearer in a fragment, not a logged path/query. Account
pages remove the fragment immediately, keep it only in memory and submit it in a
POST body. Same-tab reopening is handled. No bearer is put in browser storage,
analytics or audit details. External token-bearing provider GET callbacks are
disabled in this profile; the wrapper calls supported APIs privately. Pages and
responses use private/no-store and no-referrer. Debugger body capture excludes
account and invitation paths. Displayed MFA setup is concealed on blur and
revalidated on focus; a changed account discards the old setup/recovery codes.
Actual hosted BFCache/CDN behavior remains a separate carried release check.

## Local setup and repeatable checks

No current local credential is missing. Existing WSL PG18 and installed Node/Python
were reused. The private `.env.auth-review` was generated for a new disposable
database, not copied from .env.local. Supply the following privately for a repeat:

| Name | Runtime / private location |
| --- | --- |
| DATABASE_URL | ordinary guarded Next.js/Node/Python runtime, .env.auth-review |
| AGENCY_MIGRATION_DATABASE_URL | separate operator connection, migration/seed shell only |
| BETTER_AUTH_URL | exact review origin http://127.0.0.1:3003 |
| BETTER_AUTH_SECRET | generated server-only provider signing/encryption secret |
| PORTAL_ACCOUNT_SECURITY_ENABLED | true for this migrated review profile |
| AUTH_MAIL_MODE | capture, synthetic local review only |
| AUTH_TEST_MAIL_DIR | absolute ignored project .tmp/auth-review/mail directory |

Only the last three new names were added as blank .env.example placeholders.
The review launcher scrubs operator/provider credentials before starting Next.js.
It enables only the existing guarded local agency-administration review gate.
No production setting, agency rollout gate or provider access is activated.

Prepare Stage 03–13A prerequisites on an approved disposable database, following
their runbooks. Preview the official Better Auth migration with account security
enabled and run scripts/migrate-auth.mjs in the **operator-only environment**
(DATABASE_URL temporarily the verified operator DSN). The live server must use
the ordinary runtime DSN. Then run, in the private matching shell:

```powershell
node scripts/migrate-account-security.mjs --confirm-database <disposable-name> --app-role <ordinary-runtime-role>
npm run seed:auth:review -- --confirm-database <disposable-name>
npm run dev:auth:review
npm run check:auth:review
```

Migration 011 is versioned, checksummed, transactional and repeatable; it refuses
an unexpected role/target and grants only required provider-table permissions.
The seed refuses an existing accounts file or pre-existing synthetic agencies.
Preserve earlier review profiles. Do not use .env.local/Neon for these commands.

Acceptance tests require matching private AGENCY_WORKSPACE_TEST_DATABASE_URL
(operator), DATABASE_URL (different ordinary login), auth/capture settings and
synthetic SPECIALIST_FIXTURE / ACCOUNT_SECURITY_FIXTURE paths. Fixture creation
reuses Stage 13/13A scripts. Tests refuse a non-loopback or non-synthetic database. Use a fresh pre-enrollment
Stage 13A fixture for acceptance, not the already-enrolled retained review DB;
acceptance mutates synthetic memberships/passwords and is discarded afterward.

```powershell
npm run test:account-security:database
npm run test:account-security:browser
npm run lint
npm run build
```

The actual isolated execution shadows every .env assignment before build/tests,
uses OS-only child environments and unreachable synthetic build DSNs. Do not run
these build/test commands against a private remote profile without that isolation.
See PROGRESS.md for actual commands/results and the retained review target.

Review links: `/login`, `/account/security`, `/account/recovery`, `/platform`,
`/admin/agency/staff?agency=s13-harbor` on port 3003. Private accounts are in
`.tmp/auth-review/accounts.json`: accounts.ownerA for agency approval,
accounts.platformOnly for Platform Owner, accounts.ownerB for the other agency.
Use username/password, then import that account's private totpURI into an
authenticator, or choose **Use a recovery code** and use an unused backupCodes
entry. Do not paste passwords, URIs, OTPs or recovery codes into chat. Captured
messages are private files under .tmp/auth-review/mail; open their link locally
while signed in as its intended recipient. Earlier ports 3000–3002 stay separate.

## Deployment prerequisites and remaining limitations

* Live email delivery is **not implemented or verified**. Leadership/operator
  must select the service and verified sender domain, approve recipients and test
  callback origin, and configure its transport privately in a later approved
  integration. No unused provider-secret placeholders were invented. Do not turn
  on privileged production use expecting capture to deliver real mail.
* Legacy @portal-users.invalid identities need an approved real-email enrollment
  plan. Do not mark them verified or duplicate/recreate identities to bypass this.
* Back up auth/agency tables plus the encryption secret before deployment. Rehearse
  restore, key rotation (factor secrets depend on it) and coordinated auth schema /
  011 / runtime rollout. No production rollback or live migration was performed.
  Restoring only tables while leaving functions referencing 011 is not a rollback.
* Local HTTP cookies were exercised as HttpOnly/SameSite=Lax; HTTPS Secure-cookie,
  deployed callback/CSRF/proxy-header trust, email deliverability, rotation and a
  fully approved lost-all-factors recovery process remain production prerequisites.
* Stage 06/11 deployment/browser coverage is not expanded into a live claim.
  Hosted AI/privacy and deployed private CDN/cache remain critical external
  isolation checks. Provider OAuth/resource/revocation, scheduler, deployed
  runtime/pooler mapping and supported-browser checks remain pending. Google
  revocation remains the prior next-check / 15-minute freshness boundary.
* No live AI, real invitations, specialist/customer access, personnel import,
  payment or remote database test occurred. Stage 20B publication approval remains
  a later dependency. Stop before Stage 15; no push.
