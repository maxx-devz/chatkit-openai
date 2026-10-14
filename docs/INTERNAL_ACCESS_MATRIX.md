# Internal Portal Role and Permission Matrix

| Field | Value |
| --- | --- |
| Status | Phase 0 role assignment implemented; future data grants remain draft |
| Last updated | 2026-10-13 |
| Scope | Internal Portal accounts and data access |
| Planning source | [AOC Portal Integration Scope - Master Matrix](https://docs.google.com/spreadsheets/d/15sky-E2X0anax-GdUg9q-NBXWU3W6w44HTr0i5q_4Ro/edit) |

The Internal Portal uses four layers: account type, position, functional role, and permission. The UI calls the business-role area **My Workspace**; the underlying role and permission model is unchanged. Phase 0 permits assigning every listed functional role except Internal Admin in Internal Settings. The live baseline includes personal self-service and a basic Team directory, subject to each panel's toggle. Internal Admin and Internal Access Manager add account-management actions; business-specific grants remain inactive pending source and scope decisions.

## Four authorization layers

| Layer | Example | Decision |
| --- | --- | --- |
| Account type | `internal_user` | Allows an active account into the Internal Portal. Client and portal-administrator accounts remain separate. |
| Position | Team Member, Project Manager | Describes the job and supplies default navigation panels. It does not authorize business data. |
| Functional role | Project Management, HR, Internal Access Manager | Groups permissions for an approved responsibility. An internal user may hold several roles. |
| Permission | `work.tasks.read` for `assigned_projects` | Authorizes an action on records within a verified scope, with an explicit field policy. |

Every active internal user receives the self-service baseline. Other roles add grants to it; there is no hierarchy in which Leadership, HR, or a portal administrator inherits every permission. A panel may hide an authorized feature, but enabling a panel cannot create a data permission. Team is a toggleable panel enabled by default for both positions; baseline `people.directory.read` alone does not make a disabled Team panel visible. The server must enforce permissions before returning data, including for downloads, exports, and AOC-GPT tools.

## Record scopes and field policies

| Scope | Meaning |
| --- | --- |
| `self` | Records bound to the authenticated portal user and their verified provider identity. |
| `assigned_projects` | Projects linked to the user by an approved assignment source. |
| `managed_team` | Users linked to the manager by an approved team or reporting source. |
| `assigned_clients` | Clients linked to the user by an approved assignment source. |
| `assigned_properties` | Sites, analytics properties, or brands explicitly assigned to the user. |
| `organization_summary` | Approved aggregate figures without unrestricted individual records. |
| `organization` | Organization-wide records for an explicitly approved administrative or HR purpose. |

The authorization service must verify the underlying relationship for every scoped query. A missing assignment source does not turn a scoped grant into organization-wide access. Field policies are `basic` (for example, name and position), `operational` (approved tasks, status, and activity), or a separately approved `restricted` policy. Credentials, ciphertext, and raw provider tokens are never response fields.

## Internal role matrix

| Functional role | Proposed permissions | Scope and field limit | Status |
| --- | --- | --- | --- |
| Internal-user baseline | `work.overview.read`, `work.tasks.read`, `work.activity.read`, `hubstaff.connection.read`, `hubstaff.connection.manage`, `people.directory.read` | Personal work and connection: `self`. Team directory: `organization` with basic name and position only; never saved tokens or colleague connection status | Implemented |
| Project Management | `work.team_tasks.read`, `work.time.read`, `people.availability.read`, `clients.profile.read`, `crm.deals.read`, `support.conversations.read`, `billing.readiness.read` | Future reads limited to `assigned_projects`, `managed_team`, or `assigned_clients`. Billing exposes readiness only, not amounts. | Planned; no role-specific live data grant yet |
| Leadership | `reporting.executive.read`, `work.capacity.read`, `crm.summary.read`, `support.summary.read`, `analytics.summary.read`, `finance.summary.read` | `organization_summary`; individual HR and finance records require a separate role | Planned |
| HR | `people.availability.read`, `people.leave.read`, `work.capacity.read` | `organization`; leave reasons and balances require an approved restricted field policy | Planned; leave source and fields require approval |
| Sales | `crm.records.read`, `clients.profile.read` | `assigned_clients`; approved sales and profile fields | Planned |
| Support | `support.conversations.read`, `clients.profile.read` | Assigned inboxes and `assigned_clients`; approved conversation fields | Planned |
| Marketing | `content.pipeline.read`, `analytics.ga4.read` | `assigned_properties`; approved content and analytics fields | Planned |
| SEO/GEO | `search.gsc.read`, `seo.registry.read`, `seo.research.read` | `assigned_properties`; approved search and research fields | Planned |
| CRO | `analytics.ga4.read`, `analytics.behavior_summary.read` | `assigned_properties`; summary behavior data, not raw recordings | Planned |
| Development | `work.tasks.read`, `sites.inventory.read`, `tech.stack.read` | `assigned_projects` and `assigned_properties`; no site credentials | Planned |
| Billing | `billing.status.read`, `finance.spend_summary.read` | Approved billing portfolio and financial summaries; no banking or payment credentials | Planned; exact finance fields require approval |
| Internal Admin | Every Internal Access Manager permission, plus the self-service baseline | All current Internal Portal panels, account management, and audited non-Internal-Admin role changes. Personal tasks, activity, and Hubstaff connection remain `self`; no cross-user personal work data. | Implemented |
| Internal Access Manager | `internal_users.read`, `internal_users.create`, `internal_users.profile.update`, `internal_users.panel_access.update`, `internal_users.hubstaff_mapping.update`, `internal_users.status.update`, `internal_users.roles.manage` | Internal accounts and non-Internal-Admin roles; administrative fields and connection status, never saved tokens | Implemented |

Project Management is a functional role distinct from the Project Manager position. A position change may present a suggested role assignment for review, but it must not silently grant or revoke business permissions. The same rule applies to every other position.

## Internal Settings management rules

The **Internal Settings** page at `/internal/internal-settings` is visible to an internal user with either the Internal Admin or Internal Access Manager role. Both roles may create and edit internal-user accounts and assign or revoke all non-Internal-Admin functional roles there. Planned roles may be assigned during Phase 0, but their proposed permissions are displayed as inactive and grant no live business data until separately implemented. Effective live permissions are shown for each account and derive from assigned roles plus the self-service baseline; permissions are not individually editable. `/internal/settings` remains personal Hubstaff settings. The management API checks permissions on every read and mutation; hiding a link is not an access control.

Internal Admin exposes the current panel allow-list regardless of position or stored panel preferences, but it does not add a data permission for future integrations. Team is toggleable for ordinary internal users and enabled in both position presets; Team tasks is reserved in the Project Management placeholder and has no organization-wide task data. Adding a new live panel requires an explicit review and allow-list update.

An Internal Access Manager or Internal Admin may create internal-user accounts and edit ordinary identity, position, panel, Hubstaff mapping, and active-status settings. An Internal Access Manager cannot change their own account; an Internal Admin may update their own identity, position, panels, and Hubstaff mapping. Neither can deactivate an account holding an active Internal Access Manager or Internal Admin role, including their own. Both management roles may assign and revoke another account's non-Internal-Admin roles through a dedicated audited action, including Internal Access Manager, except the last active manager cannot be revoked. No one may change their own roles in Internal Settings. No portal role can grant or revoke Internal Admin. That role remains owner-controlled through the terminal command, and the ordinary account API rejects role fields. Account creation, access changes, mapping changes, status changes, and role changes write audit events.

The old administrator controls and `/api/admin/internal-users` have been removed. Run `npm run internal-user:migrate` and grant the first manager with `npm run internal-user:role -- grant USERNAME internal_access_manager` before deploying this cutover. Internal Settings can then manage non-Internal-Admin role assignments.

## Restricted data and deferred actions

| Data or action | Initial policy |
| --- | --- |
| Performance reviews and evaluations | No grant until HR and Leadership approve the source, fields, manager scope, retention, and audit policy. |
| Absence reasons and leave balances | No grant until the authoritative source and exact HR and self-service fields are approved. A manager's availability view contains dates or status, not reasons. |
| Individual compensation, banking, and payment details | No general portal grant. Any future use needs a separate decision. |
| Raw Hotjar recordings | No grant; use approved summaries and deep links initially. |
| Hubstaff Tasks, HubSpot, Help Scout, and Drive write-back | No grant in the read-only integration phases. Define each action, owner, audit, and recovery policy before enabling it. |
| Internal Admin grants/revocations and permission policy changes | Owner-controlled operation outside ordinary Internal Settings. All other listed roles may be managed in Internal Settings. |

## Navigation and enforcement

The [Navigation Page and Panel Matrix](PORTAL_NAVIGATION_PAGE_PANEL_MATRIX.md) maps live navigation, panels, and actions alongside the planned role workspaces. The [Phase 0 panel access checklist](INTERNAL_PANEL_ACCESS_CHECKLIST.md) records each live page/API allowance, denied case, data boundary, and remaining non-production verification.

| Route | Required access |
| --- | --- |
| `/internal` | Active internal-user account and an enabled personal panel; data filtered by each authorized panel |
| `/internal/team` | Active internal-user account with assigned `team_directory` panel and baseline `people.directory.read`; basic names and positions only |
| `/internal/settings` | `hubstaff.connection.read` or `hubstaff.connection.manage` for `self` |
| `/internal/internal-settings` | `internal_users.read` through Internal Admin or Internal Access Manager; both manage accounts and non-Internal-Admin roles |
| `/internal/roles/{role}` | Assigned business functional role opens its static Phase 0 panel directly from the sidebar; Internal Admin may view all; no new data permission or API grant. `/internal/roles` redirects to the first available role. |

When enabled, the Team directory returns basic name and position fields to active internal users. The [proposed Team availability policy](PORTAL_NAVIGATION_PAGE_PANEL_MATRIX.md#proposed-team-availability-policy) would add a neutral indicator only after its source, audience, and field permission are approved. Connection status remains confined to Internal Settings for account managers. Managed-team tasks and time remain disabled until authoritative team relationships and provider access are available.

For local UI checks, `?debug_panel=<panel_id>` can preview an allow-listed panel with sample data while signed in as an active internal user. This works only in development, does not call the live dashboard API, and does not change any server permission or record scope. It is not an access-control override.

## Rollout and remaining approvals

1. Apply the version-controlled migration to the intended database. It creates role assignments and audit records and backfills existing Project Manager accounts once.
2. Grant an approved first Internal Access Manager through the owner-controlled role command. After that, access managers may assign non-Internal-Admin roles in Internal Settings. Position changes do not grant roles.
3. Verify the deployed manager page and API, denied requests, role assignment and revocation, the Internal Admin self-edit exception, manager deactivation protection, and audit events against a non-production database before production release.
4. Activate each new business-domain grant only after its source, assignment relationship, and allowed fields are approved and tested.

The following decisions are still required for full matrix approval: the source of team and project assignments, restricted HR fields, and financial fields. Until each is recorded, its corresponding permission remains unavailable.
