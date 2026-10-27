# Client Portal roles and permissions

Status: implemented on `feature/client-portal-roles-and-permissions`, pending migration,
authenticated staging checks, review, and deployment. This document describes
the first client-user release, not a change to AOC Admin or the Internal Portal.

## Boundaries

One Better Auth login can have memberships in multiple clients. Each row in
`portal_memberships` grants a role for **one** client only. The selected client
cookie picks from active memberships; it never grants membership. Server routes
resolve the active client and verify a permission before returning data or
changing records. AOC Admin (`portal_admins`) remains separate and continues to
add clients and manage AI configuration. AOC Admin has no implicit private
client-workspace access. Legacy `aoc_admin` membership values retain ordinary
Member-level client access but do not grant client-user management.

| Client action | Viewer | Member | Client Administrator |
| --- | :---: | :---: | :---: |
| Read this client's dashboard, Hubstaff project and time summaries | Yes | Yes | Yes |
| Read this client's library documents | Yes | Yes | Yes |
| Use AOC AI and manage own conversations/files | No | Yes | Yes |
| Add library links and remove own library items | No | Yes | Yes |
| Remove any library item in this client | No | No | Yes |
| Create Viewer/Member logins for this client | No | No | Yes |
| Change Viewer/Member role, deactivate or reactivate | No | No | Yes |
| Read this client's access history | No | No | Yes |
| Grant/revoke Client Administrator | No | No | AOC-owned terminal process |
| Add client workspaces, change AI provider/settings or allowances | No | No | AOC Admin only |
| Change own password with current password | Yes | Yes | Yes |

The first Client Administrator is created by the existing **AOC Admin → Create
client** flow. Client Administrators can create additional *new* Better Auth
logins with a username and temporary password under **Members & Access**. They
must give that password to the person through a secure channel; the person can
change it in **Account security**. No email delivery or invitation link is in
this release. Linking an already existing portal login to another client needs
a separate acceptance/provisioning flow and is **not** exposed here. Client
Administrators cannot grant their own role, edit themselves, or change another
administrator. Deactivating membership blocks that client's workspace but does
not delete a person's login or access to any other clients.

An AOC operator can grant/revoke Client Administrator for an **existing client
member** with `npm run client:admin -- grant|revoke CLIENT_SLUG USERNAME` after
review. The command records the change and will not revoke the last active
administrator. It does not create or link an account. Use AOC Admin to create
the first administrator with a new client. Keep terminal access owner-controlled.

## Rollout and verification

1. Review the selected client and staging `DATABASE_URL`; do not share it.
2. Run `npm run client-access:migrate -- --dry-run`, then
   `npm run client-access:migrate` against that same database. The migration uses
   standard PostgreSQL and does not replace Better Auth or file storage.
3. Deploy application and backend changes together. A version that queries
   `portal_memberships.is_active` requires the migration first.
4. Sign in as Viewer, Member, Client Administrator, and AOC Admin. Verify
   sidebar visibility **and** direct API denial for Viewer AI, Member user
   administration, cross-client IDs, inactive membership, and protected
   administrator changes. Test one account with two client memberships and
   different roles. Confirm access events are client-scoped.

No migration or deployment is performed by implementing this branch.
