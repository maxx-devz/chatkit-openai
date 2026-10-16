# AOC Portal Navigation Page and Panel Matrix

| Field | Value |
| --- | --- |
| Status | Draft for review; live Internal Portal rows describe the current implementation |
| Last updated | 2026-10-15 |
| Coverage | Internal Portal first; Client and Portal Administrator sections remain to be defined |
| Related decisions | [Internal role and permission matrix](INTERNAL_ACCESS_MATRIX.md) and [Phase 0 access checklist](INTERNAL_PANEL_ACCESS_CHECKLIST.md) |

This matrix separates a navigation link, a visible panel, and permission to read or change data. An active `internal_user` account is required throughout the Internal Portal. Hiding a link does not protect its URL or API; the server enforces the same access rules on direct requests. HR is the first live My Workspace reader; the other business-role proposals remain placeholders.

The four current positions—Team Member, Project Manager, Account Manager, and HR Admin—start with the same six live panel toggles enabled. Position supplies defaults, not business permissions: Account Manager does not grant Sales access, and HR Admin does not grant HR access. Internal Access Managers and Internal Admins may change panel toggles in Internal Settings, subject to the account-management rules below. Internal Admin sees every current panel regardless of stored toggles and may read the HR workspace, but personal Hubstaff tasks, activity, and connection remain self-only. The migration enables Account Settings once for existing accounts; later per-account toggles remain effective.

## Live Internal Portal navigation and panels

The sidebar shows **My Work** when any of its three panels is accessible, **Team** when its directory panel is accessible, and **Settings** when either Account Settings or Hubstaff is accessible. Password change is self-service only while Account Settings is enabled; the Hubstaff connection section needs its own panel and permission. A panel needs both its saved toggle and its live permission; enabling a toggle alone never creates a data grant. Child navigation follows the same rule: a panel-backed child is hidden when its toggle or permission is absent, and a parent is hidden when no child remains available. Internal Admin's explicit all-panels override still applies.

| Navigation group and page | Panel or area | Visibility rule | Required live permission | Data scope and fields | Available actions |
| --- | --- | --- | --- | --- | --- |
| My Work · `/internal` | Overview | `overview` panel enabled | `work.overview.read` | `self`; own Hubstaff summary and task-summary fields | View and refresh personal data |
| My Work · `/internal` | My tasks and daily plan | `my_tasks` panel enabled | `work.tasks.read` | `self`; own verified Hubstaff assignments | View tasks; organize a local daily plan. No provider task write-back |
| My Work · `/internal` | Activity | `activity` panel enabled | `work.activity.read` | `self`; recent personal task-status fields | View and refresh personal activity |
| Team · `/internal/team` | Team directory and work status | `team_directory` panel enabled; on by default for all positions | `people.directory.read`; `people.work_status.read` for derived status | Configured AOC Hubstaff team: active member names, portal position when mapped, mapping label, and derived status only; no leave detail | View directory and status; no colleague account or task management |
| Settings · `/internal/settings` | Account security | `account_settings` panel enabled | `account.password.change` | `self`; current and new passwords are never returned or stored in portal tables | Change own password after current-password verification; revoke other sessions |
| Settings · `/internal/settings` | Hubstaff connection | `hubstaff` panel enabled | `hubstaff.connection.read` | `self`; own approved mapping and connection status, never token values | View connection status; connect or reconnect under a separate action permission |
| Internal Settings → Users & Access · `/internal/internal-settings` | Internal user accounts, panel toggles, and role assignments | Internal Access Manager or Internal Admin; no personal-panel toggle | `internal_users.read` to open and list accounts | Internal accounts and connection status; no token ciphertext | See action-specific rules below |
| Internal Settings → Integrations · `/internal/internal-settings/integrations` | Organization connection setup and manual Hubstaff test | Internal Access Manager or Internal Admin; no personal-panel toggle | `internal_users.read`; manual test additionally requires Internal Admin | Configuration presence and safe test history only | No tokens or member names returned |
| Internal Settings → Sync · `/internal/internal-settings/sync` | On-demand cache refresh intervals and last cached times | Internal Access Manager or Internal Admin; no personal-panel toggle | `internal_users.read`; interval edits additionally require Internal Admin | Feed settings and timestamps only | Not a scheduled background sync |
| Audit Log · `/internal/audit` | Recent integration runs, panel reads, role views, and access changes | Internal Access Manager or Internal Admin; no personal-panel toggle | `platform.audit.read` | Safe operational fields and access-action identifiers; no tokens or provider payloads | Read only; server enforces the same check on `GET /api/internal/audit` |

The My Work API filters response fields by each accessible panel. For ordinary internal users, the Team API refuses requests when the directory toggle is off, including when a user opens the URL manually; Internal Admin's all-panels rule remains in effect. The HR page at `/internal/roles/hr` calls `GET /api/internal/hr?month=YYYY-MM` for an assigned HR role or Internal Admin; that API separately checks all HR read permissions and returns a private, no-store response. Internal Settings is an account-management area, not the personal Hubstaff Settings page. See the [access checklist](INTERNAL_PANEL_ACCESS_CHECKLIST.md) for denied cases and test coverage.

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

Assigned business roles expose the applicable sidebar pages under **My Workspace**. Client-facing labels describe outcomes and need not match a role ID; several roles can share one page. Website Performance is a single preview available to `seo_geo`, `marketing`, or `cro`, with site-wide conversions there and campaign-specific outcomes remaining in Marketing Performance. CRO and Development remain assignable planned roles without separate sidebar pages or available direct URLs. Internal Admin can see all current role panels and access every currently live workspace, including read-only HR details. HR data is gated by the HR role or Internal Admin and the API's explicit read permissions. Other role pages are explanatory previews, not live metrics; opening a shared preview does not grant its future GA4, Search Console, or behavior-data permissions. Each future area needs its own source, verified record relationship, allowed fields, server authorization, tests, and review of existing role holders, including administrators, before it becomes live. Once implemented, permissions follow the assigned role without a second per-account approval.

| Sidebar page | Required role for placeholder | Planned areas | Proposed read permissions, not active | Proposed scope |
| --- | --- | --- | --- | --- |
| Project Management | `project_management` | Live: shared Hubstaff Tasks folders, active projects, and selected-project tasks. Planned: workload, tracked time, and client status | Live: `work.projects.read`, `work.team_tasks.read`. Planned: `work.time.read`, `people.availability.read`, `clients.profile.read`, `crm.deals.read`, `support.conversations.read`, `billing.readiness.read` | Live read-only shared accessible AOC Tasks organization; future assignment, team, and client sources pending |
| Business Overview | `leadership` | Business snapshot across projects, capacity, website, sales, support, and billing; trends and follow-ups | `reporting.executive.read`, `work.capacity.read`, `crm.summary.read`, `support.summary.read`, `analytics.summary.read`, `finance.summary.read` | `organization_summary`; approved aggregates only |
| HR | `hr` | Live read-only people and schedules; leave requests/calendar; balances; counts | `people.availability.read`, `people.leave.read`, `people.leave_balance.read`, `people.schedules.read`, `work.capacity.read` | Active AOC Hubstaff team; explicit HR field filter, no approval write-back |
| Sales Pipeline | `sales` | Lead/deal counts by stage, pipeline movement, and approved client context from HubSpot | `crm.records.read`, `clients.profile.read` | `assigned_clients`; source pending |
| Customer Support | `support` | Open conversations, assigned work, response trends, and approved client context from Help Scout | `support.conversations.read`, `clients.profile.read` | Assigned inboxes and `assigned_clients`; sources pending |
| Marketing Performance | `marketing` | Campaign traffic and configured outcomes from GA4; content pipeline after its source is confirmed | `content.pipeline.read`, `analytics.ga4.read` | `assigned_properties`; source pending |
| Website Performance | `seo_geo`, `marketing`, or `cro` | Per-site traffic, channels, landing pages, and configured site-wide conversions from GA4; search visibility from Search Console later | Future cards need separate checks: `analytics.ga4.read` for traffic/conversions, `search.gsc.read` for search. The `seo_geo` role's GA4 grant remains undecided | `assigned_properties`; GA4 and GSC property access pending |
| Billing | `billing` | Client billing status/readiness from the approved index; later restricted decision summaries and aggregate Ramp spend | `billing.status.read`, `finance.spend_summary.read` | Approved billing portfolio; exact financial fields pending |

Internal Access Manager has no business placeholder; its live workspace is Internal Settings. Changing to the Project Manager *position* does not grant the Project Management *role* or shared project data. The migration's one-time backfill of existing Project Manager accounts is a separate transition rule.

## Team work status policy

The Team directory lists every active member of the configured AOC Hubstaff team, whether or not that member has a portal account. Hubstaff supplies the name; a mapped portal account adds its saved position and a **Portal account** label. An unmapped member has no portal position. The server never sends the Hubstaff ID. If the AOC roster cannot be verified, the Team request fails rather than falling back to portal accounts. Hubstaff is where leave requests are approved, and its [Time Off Requests API](https://developer.hubstaff.com/reference/time_off_requests/) supplies **Away**. The [Attendance Schedules API](https://developer.hubstaff.com/reference/attendance_schedules/) supplies expected shifts only after AOC confirms schedule coverage and sets `HUBSTAFF_TEAM_SCHEDULES_VERIFIED=true` in the deployment. Until then, a member without confirmed current approved leave is **Unknown**. Only HR and Internal Admin may see detailed leave dates and reasons; the shared Team response excludes them.

| Proposed Team status | When it may be shown | Field boundary |
| --- | --- | --- |
| **Away** | An AOC Hubstaff team member has approved Hubstaff time off covering the current time in that member's timezone; partial-day requests count only during their approved interval. This takes precedence over a scheduled shift and does not require a portal account | No leave type, reason, request details, or future dates are disclosed |
| **On Shift** | A complete, fresh leave read finds no approved leave now, and a verified expected schedule places the member on shift now | No shift start or end time disclosed |
| **Off Shift** | A complete, fresh leave read finds no approved leave now, and a verified, complete schedule explicitly places the member outside a shift now | Not inferred from a missing schedule record or missing time entry |
| **Unknown** | Leave coverage, pagination, or freshness is insufficient; the member's request state cannot be resolved; or no current approved leave is found but the member timezone or schedule coverage is missing, stale, or unverified | Never silently treated as Off Shift or as no leave; confirmed current approved leave with an explicit timestamp offset can still yield Away without schedule data |

Pending and denied requests do not produce **Away**. The on-demand reader uses complete cursor pagination, a bounded 35-second request budget, and a 60-second server-side cache of minimal source fields. Incomplete, malformed, stale, or unavailable reads return **Unknown** rather than a guessed shift. `people.work_status.read` is a baseline permission limited to this derived field; it also requires an active internal account, the enabled `team_directory` panel, and `people.directory.read`. The schedule-verification switch keeps **On Shift** and **Off Shift** unavailable until the source is approved. Production freshness and alert thresholds still need operational validation.

The current internal-user Hubstaff connection is a personal-token integration and does not read time-off requests for the organization. A separate, read-only, server-side organization reader must explicitly use `HUBSTAFF_ACCESS_TOKEN`, not the shared connector's personal-token preference. A local read-only check on 2026-10-14 confirmed the replacement token can read requests for multiple members and time-off balances; the deployed environment remains unverified. The same token read 18 attendance-schedule records for 17 distinct members in the 2026-10-07 through 2026-10-21 window: 17 weekly schedules and one non-repeating schedule, all with timezone and duration fields. The organization Members API returned 31 members; 14 had no schedule record in that window. The business expectation is that the scheduled members cover everyone in Team. Both active internal accounts in the database configured by `.env.local` matched organization members with schedules; the other 15 scheduled members had no active portal account there. Recheck mapping as the portal roster expands; this partial match does not establish the schedule source as authoritative. Hubstaff's [time-off sync guidance](https://developer.hubstaff.com/time-off-sync/) warns that an under-permissioned request can succeed while returning only the token holder's own records. The time-off API has no webhook or update filter, so implementation needs bounded polling and reconciliation of changed or removed requests; schedule reads also need a defined refresh and freshness policy.

| Audience | Proposed visibility | Boundary before release |
| --- | --- | --- |
| Internal users with Team enabled | Colleague name, position, and **On Shift**, **Off Shift**, **Away**, or **Unknown** | No raw schedules, leave type, reason, balance, or planning dates in the shared directory; require `people.work_status.read`. Shift labels require verified schedules |
| Project Management role with a verified `managed_team` relationship | Availability dates needed to plan that managed team | No organization-wide dates or leave reasons; define and test the authoritative reporting relationship first |
| User viewing their own record | Their own leave requests and balances, if a self-service feature is added | Separate self-service page, source, and permissions; not part of today's Team API |
| HR role or Internal Admin | Detailed leave dates and reasons for an approved HR or administrative responsibility | Enforce this boundary server-side; define exact fields, record scope, and retention before enabling `people.leave.read` |
| Leadership role | Approved aggregate availability or capacity trends | No individual leave detail from the Leadership role alone |

The Team toggle alone does not grant the status field; the baseline `people.work_status.read` permission and server-side field filter do. A business-role placeholder does not grant managed-team dates or HR details. The shared-status filter and read-only HR/Internal Admin detail reader are implemented; managed-team dates and self-service leave remain separate future features. Internal Admin receives the HR read permissions explicitly, not merely through panel visibility.

## Adding or changing a page or field

1. Record its navigation group, page, panel, default toggle, account type, position defaults, and role requirement. A person may hold several roles; a position change must not silently grant one.
2. Name each read and mutation permission, its authoritative source, record relationship, allowed fields, and responsible reviewer. If any required source or relationship is missing, keep the data feature planned.
3. Implement the same decision in sidebar visibility, page entry, API authorization, and response-field filtering. Check direct URLs and requests; a hidden tab is not an access control.
4. Update this matrix, the [role and permission matrix](INTERNAL_ACCESS_MATRIX.md), and the [access checklist](INTERNAL_PANEL_ACCESS_CHECKLIST.md) together with allowed and denied tests. Run non-production authenticated checks before production release.

## Other portal areas

Client and Portal Administrator navigation, panels, and action permissions need separate sections. Their existing account boundaries are not replaced by `internal_user` roles or the Internal Portal's My Workspace navigation.
