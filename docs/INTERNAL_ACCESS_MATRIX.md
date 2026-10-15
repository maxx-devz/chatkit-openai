# Internal Portal Role and Permission Matrix

| Field | Value |
| --- | --- |
| Status | Phase 0 role assignment implemented; HR has a read-only AOC-team grant, while other business data grants remain draft |
| Last updated | 2026-10-15 |
| Scope | Internal Portal accounts and data access |
| Planning source | [AOC Portal Integration Scope - Master Matrix](https://docs.google.com/spreadsheets/d/15sky-E2X0anax-GdUg9q-NBXWU3W6w44HTr0i5q_4Ro/edit) |

The Internal Portal uses four layers: account type, position, functional role, and permission. The UI calls the business-role area **My Workspace**; the underlying role and permission model is unchanged. Phase 0 permits assigning every listed functional role except Internal Admin in Internal Settings. The live baseline includes personal self-service and a basic Team directory, subject to each panel's toggle. Internal Admin and Internal Access Manager add account-management actions. HR is the first business role with a read-only, AOC-team-scoped data grant; other business-specific grants remain inactive.

## Four authorization layers

| Layer | Example | Decision |
| --- | --- | --- |
| Account type | `internal_user` | Allows an active account into the Internal Portal. Client and portal-administrator accounts remain separate. |
| Position | Team Member, Project Manager, Account Manager, HR Admin | Describes the job and supplies default navigation panels. It does not authorize business data. |
| Functional role | Project Management, HR, Internal Access Manager | Groups permissions for an approved responsibility. An internal user may hold several roles. |
| Permission | `work.tasks.read` for `assigned_projects` | Authorizes an action on records within a verified scope, with an explicit field policy. |

Every active internal user receives the self-service baseline. Other roles add grants to it; Leadership, HR, and portal-administrator account types do not inherit every permission. Internal Admin is the exception within the Internal Portal: it receives every currently implemented internal-role read permission, including HR, while each future integration must explicitly add its grant. A panel may hide an authorized feature, but enabling a panel cannot create a data permission. Team is a toggleable panel enabled by default for all four positions; baseline `people.directory.read` alone does not make a disabled Team panel visible. The server must enforce permissions before returning data, including for downloads, exports, and AOC-GPT tools.

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
| Internal-user baseline | `work.overview.read`, `work.tasks.read`, `work.activity.read`, `hubstaff.connection.read`, `hubstaff.connection.manage`, `account.password.change`, `people.directory.read`, `people.work_status.read` | Personal work, connection, and password: `self`. Team directory: active AOC Hubstaff members' names, portal position when mapped, portal-mapping label, and derived work status only; never saved tokens, colleague connection status, or leave details | Implemented |
| Shared Team work status | `people.work_status.read` | `organization` scope for derived **On Shift**, **Off Shift**, **Away**, or **Unknown** only; requires the Team panel and directory permission. No raw schedules, leave category, reason, date, balance, or request fields | Implemented as an on-demand read; shift labels require `HUBSTAFF_TEAM_SCHEDULES_VERIFIED=true` after coverage review. Deployed access and alert delivery remain to be verified |
| Project Management | `work.team_tasks.read`, `work.time.read`, `people.availability.read`, `clients.profile.read`, `crm.deals.read`, `support.conversations.read`, `billing.readiness.read` | Future reads limited to `assigned_projects`, `managed_team`, or `assigned_clients`. Billing exposes readiness only, not amounts. | Planned; no role-specific live data grant yet |
| Leadership | `reporting.executive.read`, `work.capacity.read`, `crm.summary.read`, `support.summary.read`, `analytics.summary.read`, `finance.summary.read` | `organization_summary`; individual HR and finance records require a separate role | Planned |
| HR | `people.availability.read`, `people.leave.read`, `people.leave_balance.read`, `people.schedules.read`, `work.capacity.read` | Active AOC Hubstaff team only; read-only member names, portal mapping/position, leave dates, status, policy, reason, per-day hours, annual policy balances, expected schedules, and aggregate counts. No pay, raw activity, screenshots, or write access | Implemented locally; deployed role-holder review and source verification pending |
| Sales | `crm.records.read`, `clients.profile.read` | `assigned_clients`; approved sales and profile fields | Planned |
| Support | `support.conversations.read`, `clients.profile.read` | Assigned inboxes and `assigned_clients`; approved conversation fields | Planned |
| Marketing | `content.pipeline.read`, `analytics.ga4.read` | `assigned_properties`; approved content and analytics fields | Planned |
| SEO/GEO | `search.gsc.read`, `seo.registry.read`, `seo.research.read` | `assigned_properties`; approved search and research fields | Planned |
| CRO | `analytics.ga4.read`, `analytics.behavior_summary.read` | `assigned_properties`; summary behavior data, not raw recordings | Planned |
| Development | `work.tasks.read`, `sites.inventory.read`, `tech.stack.read` | `assigned_projects` and `assigned_properties`; no site credentials | Planned |
| Billing | `billing.status.read`, `finance.spend_summary.read` | Approved billing portfolio and financial summaries; no banking or payment credentials | Planned; exact finance fields require approval |
| Internal Admin | Every Internal Access Manager and currently live HR permission, `platform.audit.read`, plus the self-service baseline | All current Internal Portal panels and live workspaces, including read-only AOC-scoped HR details; account management and operational/access audit read. May run the audited organization Hubstaff connection test. Personal tasks, activity, and Hubstaff connection remain `self`; no cross-user personal work data. | Implemented locally |
| Internal Access Manager | `internal_users.read`, `internal_users.create`, `internal_users.profile.update`, `internal_users.panel_access.update`, `internal_users.hubstaff_mapping.update`, `internal_users.status.update`, `internal_users.roles.manage`, `internal_users.password.reset`, `platform.audit.read` | Internal accounts, business roles, read-only portal audit and integration setup/health; cannot run the organization connection test, grant or revoke protected roles, or reset their own/other protected passwords | Implemented |

Project Management is a functional role distinct from the Project Manager position. Account Manager does not grant Sales or client access, and HR Admin does not grant the HR role or detailed leave access. A position change may present a suggested role assignment for review, but it must not silently grant or revoke business permissions. The same rule applies to every position. Custom-position creation is not part of the current fixed preset list; if added later, it needs audited administration, stable IDs, and safe retirement rules.

## Internal Settings management rules

The **Internal Settings** page at `/internal/internal-settings` is visible to an internal user with either the Internal Admin or Internal Access Manager role. Access Managers may assign and revoke business roles on other accounts and on their own account. Each assignment grants the permissions currently implemented for that role, without another per-account approval. Existing role holders also receive a permission when it is added to their role, so the role-holder list, record scopes, and allowed fields must be reviewed before enabling new live data. The protected Internal Access Manager role can be granted or revoked through the owner-controlled terminal command; audited changes in Internal Settings require privileged authorization and last-manager protection. Effective live permissions are shown for each account and derive from assigned roles plus the self-service baseline; permissions are not individually editable. `/internal/settings` is personal Settings: password change requires the separate, default-enabled `account_settings` panel; the Hubstaff connection requires its own panel. The management API checks permissions on every read and mutation; hiding a link is not an access control.

Internal Admin exposes the current panel allow-list regardless of position or stored panel preferences and receives every currently live Internal Portal data permission, including HR. Future integrations must explicitly add their permissions to Internal Admin and review existing administrators before deployment. Team is toggleable for ordinary internal users and enabled in all four position presets; Team tasks is reserved in the Project Management placeholder and has no organization-wide task data. Adding a new live panel requires an explicit review and allow-list update.

An Internal Access Manager or Internal Admin may create internal-user accounts and edit ordinary identity, position, panel, Hubstaff mapping, and active-status settings. An Internal Access Manager cannot change their own account details or protected role, but may change their own business roles; an Internal Admin may update their own identity, position, panels, and Hubstaff mapping, but not their own roles through this screen. Neither can deactivate an account holding an active Internal Access Manager or Internal Admin role, including their own. Both management roles may assign and revoke another account's business roles through a dedicated audited action. Protected Access Manager role changes are available through the owner-controlled terminal command; in Internal Settings they require privileged authorization, cannot be made by an Access Manager, and cannot revoke the last active manager. No portal role can grant or revoke Internal Admin. That role remains owner-controlled through the terminal command, and the ordinary account API rejects role fields. Account creation, access changes, mapping changes, status changes, and role changes write audit events.

Every active internal user with Account Settings enabled may change their own password in personal Settings after supplying the current password; other sessions are revoked. In Internal Settings, an Access Manager may reset an ordinary account's password only after re-entering their own password. They cannot reset themselves, another Access Manager, or an Internal Admin. An Internal Admin may reset another internal account, including a protected one, but never themselves. A manager reset revokes the target's sessions and writes an access-audit event in the same transaction. The new password is never stored or returned in plaintext.

The old administrator controls and `/api/admin/internal-users` have been removed. Run `npm run internal-user:migrate` and bootstrap an Internal Admin or first Access Manager through the owner-controlled role command before deploying this cutover. Use that command to grant or revoke the protected Access Manager role during setup or recovery; authorized changes in Internal Settings remain audited.

## Restricted data and deferred actions

| Data or action | Initial policy |
| --- | --- |
| Performance reviews and evaluations | No grant until HR and Leadership approve the source, fields, manager scope, retention, and audit policy. |
| Absence reasons and leave balances | Detailed leave dates, reasons, and exact policy balances are restricted to HR and Internal Admin through the read-only HR API. Other users' self-service balances remain undecided. The shared Team status never exposes these details. |
| Individual compensation, banking, and payment details | No general portal grant. Any future use needs a separate decision. |
| Raw Hotjar recordings | No grant; use approved summaries and deep links initially. |
| Hubstaff Tasks, HubSpot, Help Scout, and Drive write-back | No grant in the read-only integration phases. Define each action, owner, audit, and recovery policy before enabling it. |
| Internal Admin grants/revocations and permission policy changes | Owner-controlled operation outside ordinary Internal Settings. All other listed roles may be managed in Internal Settings. |

## Navigation and enforcement

The [Navigation Page and Panel Matrix](PORTAL_NAVIGATION_PAGE_PANEL_MATRIX.md) maps live navigation, panels, and actions alongside the planned role workspaces. The [Phase 0 panel access checklist](INTERNAL_PANEL_ACCESS_CHECKLIST.md) records each live page/API allowance, denied case, data boundary, and remaining non-production verification.

| Route | Required access |
| --- | --- |
| `/internal` | Active internal-user account and an enabled personal panel; data filtered by each authorized panel |
| `/internal/team` | Active internal-user account with assigned `team_directory` panel and baseline `people.directory.read`; names, positions, and derived status only when `people.work_status.read` is present |
| `/internal/settings` | `hubstaff.connection.read` or `hubstaff.connection.manage` for `self` |
| `/internal/internal-settings` | `internal_users.read` through Internal Admin or Internal Access Manager; Users & Access manages accounts and business roles, while protected-role changes require separate privileged authorization |
| `/internal/internal-settings/integrations` | `internal_users.read` to view non-secret connection state; Internal Admin only for the audited manual Hubstaff test |
| `/internal/internal-settings/sync` | `internal_users.read` to view feed freshness; Internal Admin only to change intervals |
| `/internal/roles/hr` and `GET /api/internal/hr?month=YYYY-MM` | Assigned HR functional role or Internal Admin, with live HR read permissions and enabled HR panels; active AOC Hubstaff team only. The API omits disabled panel data. Calendar shows approved leave only; request details are separate. |
| Other `/internal/roles/{role}` | Assigned business functional role opens its static Phase 0 panel directly from the sidebar; Internal Admin may view all placeholders. `/internal/roles` redirects to the first available role. |

When enabled, the Team directory uses the configured AOC Hubstaff team as its roster, including members without portal accounts. A matching portal account adds its saved position and a portal-mapping label; unmapped members have no portal position. The [Team work status policy](PORTAL_NAVIGATION_PAGE_PANEL_MATRIX.md#team-work-status-policy) uses the server-side organization token, returns **Unknown** when a member's status cannot be verified, and withholds shift labels until schedule coverage is explicitly confirmed. If AOC team membership itself cannot be verified, the Team request fails instead of showing an incomplete portal-account-only roster. The Team response contains no Hubstaff mapping ID, leave reason, leave dates, or raw schedule. Those detailed fields are in a separate HR/Internal Admin reader. Connection status remains confined to Internal Settings for account managers. Managed-team tasks and time remain disabled until authoritative team relationships and provider access are available.

For local UI checks, `?debug_panel=<panel_id>` can preview an allow-listed panel with sample data while signed in as an active internal user. This works only in development, does not call the live dashboard API, and does not change any server permission or record scope. It is not an access-control override.

## Rollout and remaining approvals

1. Apply the version-controlled migration to the intended database. It creates role assignments and audit records and backfills existing Project Manager accounts once.
2. Bootstrap an Internal Admin or first Internal Access Manager through the owner-controlled role command. Use the command for protected Access Manager grants or revocations during setup and recovery; authorized Internal Settings changes are audited. Access Managers may assign business roles. Position changes do not grant roles.
3. Verify the deployed manager page and API, denied requests, role assignment and revocation, the Internal Admin self-edit exception, manager deactivation protection, and audit events against a non-production database before production release.
4. Before activating a new business permission, review existing holders of that role and approve its data source, assignment relationship, and allowed fields; test server-side permission and scope enforcement.

The project owner accepted this matrix as the starting policy and requested the read-only HR panel and Internal Admin access to all currently live workspaces. Before deployment, review every existing HR and Internal Admin role holder, validate the deployed organization token, confirm retention and field policy with the HR data owner, and test denied direct API access. Team/project assignment sources, other restricted HR fields, and financial fields remain open.
