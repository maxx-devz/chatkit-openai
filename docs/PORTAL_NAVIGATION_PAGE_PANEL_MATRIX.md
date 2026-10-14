# AOC Portal Navigation Page and Panel Matrix

| Field | Value |
| --- | --- |
| Status | Draft for review; live Internal Portal rows describe the current implementation |
| Last updated | 2026-10-14 |
| Coverage | Internal Portal first; Client and Portal Administrator sections remain to be defined |
| Related decisions | [Internal role and permission matrix](INTERNAL_ACCESS_MATRIX.md) and [Phase 0 access checklist](INTERNAL_PANEL_ACCESS_CHECKLIST.md) |

This matrix separates a navigation link, a visible panel, and permission to read or change data. An active `internal_user` account is required throughout the Internal Portal. Hiding a link does not protect its URL or API; the server enforces the same access rules on direct requests. The My Workspace proposals below describe future work, not permissions available today.

Both current positions, Team Member and Project Manager, start with the same five live panel toggles enabled. Position supplies defaults, not business permissions. Internal Access Managers and Internal Admins may change panel toggles in Internal Settings, subject to the account-management rules below. Internal Admin sees every current panel regardless of stored toggles, but personal work and Hubstaff data remain self-only.

## Live Internal Portal navigation and panels

The sidebar shows **My Work** when any of its three panels is accessible, **Team** when its directory panel is accessible, and **Settings** when the Hubstaff panel is accessible. A panel needs both its saved toggle and its live permission; enabling a toggle alone never creates a data grant.

| Navigation group and page | Panel or area | Visibility rule | Required live permission | Data scope and fields | Available actions |
| --- | --- | --- | --- | --- | --- |
| My Work · `/internal` | Overview | `overview` panel enabled | `work.overview.read` | `self`; own Hubstaff summary and task-summary fields | View and refresh personal data |
| My Work · `/internal` | My tasks and daily plan | `my_tasks` panel enabled | `work.tasks.read` | `self`; own verified Hubstaff assignments | View tasks; organize a local daily plan. No provider task write-back |
| My Work · `/internal` | Activity | `activity` panel enabled | `work.activity.read` | `self`; recent personal task-status fields | View and refresh personal activity |
| Team · `/internal/team` | Team directory | `team_directory` panel enabled; on by default for both positions | `people.directory.read` | `organization`, basic fields: active users' names and positions only | View directory; no colleague account or task management |
| Settings · `/internal/settings` | Hubstaff connection | `hubstaff` panel enabled | `hubstaff.connection.read` | `self`; own approved mapping and connection status, never token values | View connection status; connect or reconnect under a separate action permission |
| Internal Settings · `/internal/internal-settings` | Internal user accounts, panel toggles, and role assignments | Internal Access Manager or Internal Admin; no personal-panel toggle | `internal_users.read` to open and list accounts | Internal accounts and connection status; no token ciphertext | See action-specific rules below |

The My Work API filters response fields by each accessible panel. For ordinary internal users, the Team API refuses requests when the directory toggle is off, including when a user opens the URL manually; Internal Admin's all-panels rule remains in effect. Internal Settings is an account-management area, not the personal Hubstaff Settings page. See the [access checklist](INTERNAL_PANEL_ACCESS_CHECKLIST.md) for denied cases and test coverage.

### Live action permissions

| Action | Required permission and condition | Record scope | Boundary |
| --- | --- | --- | --- |
| Connect or reconnect Hubstaff | `hubstaff.connection.manage` and enabled `hubstaff` panel | `self` | The server verifies the signed-in user's approved Hubstaff identity; no browser-selected identity or returned token |
| Create an internal user | `internal_users.create` | Internal accounts | Separate login, position defaults, and approved Hubstaff mapping; audited |
| Edit identity or position | `internal_users.profile.update` | Internal accounts | Access Managers cannot edit their own account; Internal Admin may edit their own ordinary details |
| Change panel toggles | `internal_users.panel_access.update` | Internal accounts | A toggle changes visibility, not the underlying data permission |
| Change approved Hubstaff mapping | `internal_users.hubstaff_mapping.update` | Internal accounts | Clears the saved connection and requires reconnection |
| Pause or reactivate an account | `internal_users.status.update` | Internal accounts | Protected-role accounts cannot be paused through this screen; pausing clears saved credentials |
| Grant or revoke a non-Internal-Admin role | `internal_users.roles.manage` | Internal accounts | No self-role changes; cannot revoke the last active Access Manager; audited |

The `internal_admin` role itself is granted or revoked only through the owner-controlled terminal command. It does not appear as an assignable UI role.

## My Workspace role panels

Each assigned business role appears as a direct sidebar link under **My Workspace** at `/internal/roles/{role}`. Internal Admin can see all current role panels. These Phase 0 pages contain static placeholders only: assigning a role opens its page but grants none of the proposed business-data permissions below. Each future area needs its own source, verified record relationship, allowed fields, server authorization, and tests before it becomes live.

| Sidebar page | Required role for placeholder | Planned areas | Proposed read permissions, not active | Proposed scope |
| --- | --- | --- | --- | --- |
| Project Management | `project_management` | Team tasks and workload; tracked time; project and client status | `work.team_tasks.read`, `work.time.read`, `people.availability.read`, `clients.profile.read`, `crm.deals.read`, `support.conversations.read`, `billing.readiness.read` | `assigned_projects`, `managed_team`, `assigned_clients`; assignment sources pending |
| Leadership | `leadership` | Executive reporting; capacity; business summaries | `reporting.executive.read`, `work.capacity.read`, `crm.summary.read`, `support.summary.read`, `analytics.summary.read`, `finance.summary.read` | `organization_summary`; approved aggregates only |
| HR | `hr` | People and availability; leave; capacity | `people.availability.read`, `people.leave.read`, `work.capacity.read` | `organization`; leave fields require separate approval |
| Sales | `sales` | Pipeline; assigned clients | `crm.records.read`, `clients.profile.read` | `assigned_clients`; source pending |
| Support | `support` | Conversations; assigned clients | `support.conversations.read`, `clients.profile.read` | Assigned inboxes and `assigned_clients`; sources pending |
| Marketing | `marketing` | Content pipeline; campaign analytics | `content.pipeline.read`, `analytics.ga4.read` | `assigned_properties`; source pending |
| SEO/GEO | `seo_geo` | Search performance; SEO registry and research | `search.gsc.read`, `seo.registry.read`, `seo.research.read` | `assigned_properties`; source pending |
| CRO | `cro` | Conversion analytics; behavior summaries | `analytics.ga4.read`, `analytics.behavior_summary.read` | `assigned_properties`; summary data only |
| Development | `development` | Project work; site inventory; technology stack | `work.tasks.read`, `sites.inventory.read`, `tech.stack.read` | `assigned_projects`, `assigned_properties`; no site credentials |
| Billing | `billing` | Billing status; spend summaries | `billing.status.read`, `finance.spend_summary.read` | Approved billing portfolio; exact financial fields pending |

Internal Access Manager has no business placeholder; its live workspace is Internal Settings. Changing to the Project Manager *position* does not grant the Project Management *role* or team-task data. The migration's one-time backfill of existing Project Manager accounts is a separate transition rule.

## Proposed Team availability policy

The current directory returns only active users' names and positions. The proposed expansion shows a neutral **Available / Away** indicator to users with Team enabled, without exposing whether the absence is leave, its category, or its reason. This is a planning policy, not a live field or an approved data grant. An authoritative source and HR review are required before implementation. Missing or stale source data must not be presented as **Available**.

| Audience | Proposed visibility | Boundary before release |
| --- | --- | --- |
| Internal users with Team enabled | Colleague name, position, and a current Available / Away indicator | No leave type, reason, balance, or planning dates in the shared directory; exact source, freshness, and permission still need approval |
| Project Management role with a verified `managed_team` relationship | Availability dates needed to plan that managed team | No organization-wide dates or leave reasons; define and test the authoritative reporting relationship first |
| User viewing their own record | Their own leave requests and balances, if a self-service feature is added | Separate self-service page, source, and permissions; not part of today's Team API |
| HR role | Leave records and details needed for an approved HR responsibility | Approve the exact fields, record scope, and retention before enabling `people.leave.read` |
| Leadership role | Approved aggregate availability or capacity trends | No individual leave detail from the Leadership role alone |

The Team toggle does not grant these future fields. A business-role placeholder likewise does not grant a live availability read. When a source is approved, define separate data permissions and response-field filters for the shared indicator, managed-team dates, self-service, and HR details.

## Adding or changing a page or field

1. Record its navigation group, page, panel, default toggle, account type, position defaults, and role requirement. A person may hold several roles; a position change must not silently grant one.
2. Name each read and mutation permission, its authoritative source, record relationship, allowed fields, and responsible reviewer. If any required source or relationship is missing, keep the data feature planned.
3. Implement the same decision in sidebar visibility, page entry, API authorization, and response-field filtering. Check direct URLs and requests; a hidden tab is not an access control.
4. Update this matrix, the [role and permission matrix](INTERNAL_ACCESS_MATRIX.md), and the [access checklist](INTERNAL_PANEL_ACCESS_CHECKLIST.md) together with allowed and denied tests. Run non-production authenticated checks before production release.

## Other portal areas

Client and Portal Administrator navigation, panels, and action permissions need separate sections. Their existing account boundaries are not replaced by `internal_user` roles or the Internal Portal's My Workspace navigation.
