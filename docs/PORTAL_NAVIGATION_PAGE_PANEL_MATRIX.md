# AOC Portal Navigation Page and Panel Matrix

| Field | Value |
| --- | --- |
| Status | Draft for review; live Internal Portal rows describe the current implementation |
| Last updated | 2026-10-14 |
| Coverage | Internal Portal first; Client and Portal Administrator sections remain to be defined |
| Related decisions | [Internal role and permission matrix](INTERNAL_ACCESS_MATRIX.md) and [Phase 0 access checklist](INTERNAL_PANEL_ACCESS_CHECKLIST.md) |

This matrix separates a navigation link, a visible panel, and permission to read or change data. An active `internal_user` account is required throughout the Internal Portal. Hiding a link does not protect its URL or API; the server enforces the same access rules on direct requests. The My Workspace proposals below describe future work, not permissions available today.

Both current positions, Team Member and Project Manager, start with the same six live panel toggles enabled. Position supplies defaults, not business permissions. Internal Access Managers and Internal Admins may change panel toggles in Internal Settings, subject to the account-management rules below. Internal Admin sees every current panel regardless of stored toggles, but personal work and Hubstaff data remain self-only. The migration enables Account Settings once for existing accounts; later per-account toggles remain effective.

## Live Internal Portal navigation and panels

The sidebar shows **My Work** when any of its three panels is accessible, **Team** when its directory panel is accessible, and **Settings** when either Account Settings or Hubstaff is accessible. Password change is self-service only while Account Settings is enabled; the Hubstaff connection section needs its own panel and permission. A panel needs both its saved toggle and its live permission; enabling a toggle alone never creates a data grant.

| Navigation group and page | Panel or area | Visibility rule | Required live permission | Data scope and fields | Available actions |
| --- | --- | --- | --- | --- | --- |
| My Work · `/internal` | Overview | `overview` panel enabled | `work.overview.read` | `self`; own Hubstaff summary and task-summary fields | View and refresh personal data |
| My Work · `/internal` | My tasks and daily plan | `my_tasks` panel enabled | `work.tasks.read` | `self`; own verified Hubstaff assignments | View tasks; organize a local daily plan. No provider task write-back |
| My Work · `/internal` | Activity | `activity` panel enabled | `work.activity.read` | `self`; recent personal task-status fields | View and refresh personal activity |
| Team · `/internal/team` | Team directory | `team_directory` panel enabled; on by default for both positions | `people.directory.read` | `organization`, basic fields: active users' names and positions only | View directory; no colleague account or task management |
| Settings · `/internal/settings` | Account security | `account_settings` panel enabled | `account.password.change` | `self`; current and new passwords are never returned or stored in portal tables | Change own password after current-password verification; revoke other sessions |
| Settings · `/internal/settings` | Hubstaff connection | `hubstaff` panel enabled | `hubstaff.connection.read` | `self`; own approved mapping and connection status, never token values | View connection status; connect or reconnect under a separate action permission |
| Internal Settings · `/internal/internal-settings` | Internal user accounts, panel toggles, and role assignments | Internal Access Manager or Internal Admin; no personal-panel toggle | `internal_users.read` to open and list accounts | Internal accounts and connection status; no token ciphertext | See action-specific rules below |
| Audit Log · `/internal/audit` | Recent integration runs and access changes | Internal Admin only; no personal-panel toggle | `platform.audit.read` | Safe operational fields and access-action identifiers; no tokens or provider payloads | Read only; server enforces the same check on `GET /api/internal/audit` |

The My Work API filters response fields by each accessible panel. For ordinary internal users, the Team API refuses requests when the directory toggle is off, including when a user opens the URL manually; Internal Admin's all-panels rule remains in effect. Internal Settings is an account-management area, not the personal Hubstaff Settings page. See the [access checklist](INTERNAL_PANEL_ACCESS_CHECKLIST.md) for denied cases and test coverage.

### Live action permissions

| Action | Required permission and condition | Record scope | Boundary |
| --- | --- | --- | --- |
| Connect or reconnect Hubstaff | `hubstaff.connection.manage` and enabled `hubstaff` panel | `self` | The server verifies the signed-in user's approved Hubstaff identity; no browser-selected identity or returned token |
| Change own portal password | `account.password.change` and enabled `account_settings` panel | `self` | Requires current password; other sessions are revoked |
| Create an internal user | `internal_users.create` | Internal accounts | Separate login, position defaults, and approved Hubstaff mapping; audited |
| Edit identity or position | `internal_users.profile.update` | Internal accounts | Access Managers cannot edit their own account; Internal Admin may edit their own ordinary details |
| Change panel toggles | `internal_users.panel_access.update` | Internal accounts | A toggle changes visibility, not the underlying data permission |
| Change approved Hubstaff mapping | `internal_users.hubstaff_mapping.update` | Internal accounts | Clears the saved connection and requires reconnection |
| Pause or reactivate an account | `internal_users.status.update` | Internal accounts | Protected-role accounts cannot be paused through this screen; pausing clears saved credentials |
| Grant or revoke a business role | `internal_users.roles.manage` | Other internal accounts; Access Manager's own account | Access Managers may manage their own and others' business roles; Internal Admin cannot change their own roles. Implemented role permissions take effect without a second approval. Actions are audited |
| Grant or revoke Internal Access Manager | Owner-controlled terminal command; separately authorized Internal Settings action | Other internal accounts | Access Managers cannot grant or revoke this role; self-role changes are denied. The last active Access Manager cannot be revoked. Actions are audited |
| Reset another internal user's password | `internal_users.password.reset` | Internal accounts | Requires manager reauthentication; Access Managers cannot reset protected accounts; target sessions revoked and action audited |

The `internal_admin` role itself is granted or revoked only through the owner-controlled terminal command. It does not appear as an assignable UI role.

## My Workspace role panels

Each assigned business role appears as a direct sidebar link under **My Workspace** at `/internal/roles/{role}`. Internal Admin can see all current role panels. These Phase 0 pages contain static placeholders only: assigning a role opens its page but grants none of the proposed business-data permissions below because they are not implemented yet. Each future area needs its own source, verified record relationship, allowed fields, server authorization, tests, and review of existing role holders before it becomes live. Once implemented, permissions follow the assigned role without a second per-account approval.

| Sidebar page | Required role for placeholder | Planned areas | Proposed read permissions, not active | Proposed scope |
| --- | --- | --- | --- | --- |
| Project Management | `project_management` | Team tasks and workload; tracked time; project and client status | `work.team_tasks.read`, `work.time.read`, `people.availability.read`, `clients.profile.read`, `crm.deals.read`, `support.conversations.read`, `billing.readiness.read` | `assigned_projects`, `managed_team`, `assigned_clients`; assignment sources pending |
| Leadership | `leadership` | Executive reporting; capacity; business summaries | `reporting.executive.read`, `work.capacity.read`, `crm.summary.read`, `support.summary.read`, `analytics.summary.read`, `finance.summary.read` | `organization_summary`; approved aggregates only |
| HR | `hr` | People and availability; leave; capacity | `people.availability.read`, `people.leave.read`, `work.capacity.read` | `organization`; define allowed leave fields before live integration |
| Sales | `sales` | Pipeline; assigned clients | `crm.records.read`, `clients.profile.read` | `assigned_clients`; source pending |
| Support | `support` | Conversations; assigned clients | `support.conversations.read`, `clients.profile.read` | Assigned inboxes and `assigned_clients`; sources pending |
| Marketing | `marketing` | Content pipeline; campaign analytics | `content.pipeline.read`, `analytics.ga4.read` | `assigned_properties`; source pending |
| SEO/GEO | `seo_geo` | Search performance; SEO registry and research | `search.gsc.read`, `seo.registry.read`, `seo.research.read` | `assigned_properties`; source pending |
| CRO | `cro` | Conversion analytics; behavior summaries | `analytics.ga4.read`, `analytics.behavior_summary.read` | `assigned_properties`; summary data only |
| Development | `development` | Project work; site inventory; technology stack | `work.tasks.read`, `sites.inventory.read`, `tech.stack.read` | `assigned_projects`, `assigned_properties`; no site credentials |
| Billing | `billing` | Billing status; spend summaries | `billing.status.read`, `finance.spend_summary.read` | Approved billing portfolio; exact financial fields pending |

Internal Access Manager has no business placeholder; its live workspace is Internal Settings. Changing to the Project Manager *position* does not grant the Project Management *role* or team-task data. The migration's one-time backfill of existing Project Manager accounts is a separate transition rule.

## Proposed Team work status policy

The current directory returns only active users' names and positions. The proposed expansion adds a derived work status for those members to all users with Team enabled, subject to HR approval. Hubstaff is where leave requests are approved, and its [Time Off Requests API](https://developer.hubstaff.com/reference/time_off_requests/) is the leave source. The [Attendance Schedules API](https://developer.hubstaff.com/reference/attendance_schedules/) is a candidate for expected shifts; confirm that AOC maintains complete, accurate schedules there before treating it as authoritative. This is a planned field, not a live data grant. **Away** may reveal approved leave even without its category or reason, so HR must approve that organization-wide disclosure before release.

| Proposed Team status | When it may be shown | Field boundary |
| --- | --- | --- |
| **Away** | A mapped member has approved Hubstaff time off covering the current time in that member's timezone; partial-day requests count only during their approved interval. This takes precedence over a scheduled shift | No leave type, reason, request details, or future dates are disclosed |
| **On Shift** | A complete, fresh leave read finds no approved leave now, and a verified expected schedule places the member on shift now | No shift start or end time disclosed |
| **Off Shift** | A complete, fresh leave read finds no approved leave now, and a verified, complete schedule explicitly places the member outside a shift now | Not inferred from a missing schedule record or missing time entry |
| **Unknown** | Leave coverage, pagination, or freshness is insufficient; the member mapping, timezone, or request state cannot be resolved; or no current approved leave is found but schedule coverage is missing, stale, or unverified | Never silently treated as Off Shift or as no leave; confirmed current approved leave can still yield Away when schedule data is unavailable |

Pending and denied requests do not produce **Away**. The exact freshness thresholds, approved-status mapping (including any paid states), schedule coverage rules, and timezone handling must be validated before release. The planned `people.work_status.read` permission covers only this derived status; it requires an active internal account, the enabled `team_directory` panel, and `people.directory.read`. It is not granted by today's Team toggle or by a business-role placeholder. If the schedules are not complete or authoritative, keep **On Shift** and **Off Shift** unavailable until an approved schedule source is identified.

The current internal-user Hubstaff connection is a personal-token integration and does not read time-off requests for the organization. A separate, read-only, server-side organization reader must explicitly use `HUBSTAFF_ACCESS_TOKEN`, not the shared connector's personal-token preference. A local read-only check on 2026-10-14 confirmed the replacement token can read requests for multiple members and time-off balances; the deployed environment remains unverified. The same token read 18 attendance-schedule records for 17 distinct members in the 2026-10-07 through 2026-10-21 window: 17 weekly schedules and one non-repeating schedule, all with timezone and duration fields. The organization Members API returned 31 members; 14 had no schedule record in that window. The business expectation is that the scheduled members cover everyone in Team. Both active internal accounts in the database configured by `.env.local` matched organization members with schedules; the other 15 scheduled members had no active portal account there. Recheck mapping as the portal roster expands; this partial match does not establish the schedule source as authoritative. Hubstaff's [time-off sync guidance](https://developer.hubstaff.com/time-off-sync/) warns that an under-permissioned request can succeed while returning only the token holder's own records. The time-off API has no webhook or update filter, so implementation needs bounded polling and reconciliation of changed or removed requests; schedule reads also need a defined refresh and freshness policy.

| Audience | Proposed visibility | Boundary before release |
| --- | --- | --- |
| Internal users with Team enabled | Colleague name, position, and **On Shift**, **Off Shift**, **Away**, or **Unknown** after HR approval | No raw schedules, leave type, reason, balance, or planning dates in the shared directory; require `people.work_status.read` and approved freshness rules |
| Project Management role with a verified `managed_team` relationship | Availability dates needed to plan that managed team | No organization-wide dates or leave reasons; define and test the authoritative reporting relationship first |
| User viewing their own record | Their own leave requests and balances, if a self-service feature is added | Separate self-service page, source, and permissions; not part of today's Team API |
| HR role | Leave records and details needed for an approved HR responsibility | Approve the exact fields, record scope, and retention before enabling `people.leave.read` |
| Leadership role | Approved aggregate availability or capacity trends | No individual leave detail from the Leadership role alone |

The Team toggle does not grant these future fields. A business-role placeholder likewise does not grant a live work-status read. Implement separate response-field filters for the shared status, managed-team dates, self-service, and HR details. Internal Admin's all-panels rule does not grant HR leave details.

## Adding or changing a page or field

1. Record its navigation group, page, panel, default toggle, account type, position defaults, and role requirement. A person may hold several roles; a position change must not silently grant one.
2. Name each read and mutation permission, its authoritative source, record relationship, allowed fields, and responsible reviewer. If any required source or relationship is missing, keep the data feature planned.
3. Implement the same decision in sidebar visibility, page entry, API authorization, and response-field filtering. Check direct URLs and requests; a hidden tab is not an access control.
4. Update this matrix, the [role and permission matrix](INTERNAL_ACCESS_MATRIX.md), and the [access checklist](INTERNAL_PANEL_ACCESS_CHECKLIST.md) together with allowed and denied tests. Run non-production authenticated checks before production release.

## Other portal areas

Client and Portal Administrator navigation, panels, and action permissions need separate sections. Their existing account boundaries are not replaced by `internal_user` roles or the Internal Portal's My Workspace navigation.
