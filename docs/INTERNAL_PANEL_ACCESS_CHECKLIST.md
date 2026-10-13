# Phase 0 Internal Portal panel access checklist

This checklist covers **live Phase 0 access**, not future business dashboards. A visible panel never grants data permission by itself. The server checks the active internal-user account, assigned panel, effective permission, and record/field policy before returning data. Team is enabled by both position presets, but can be toggled off per account. Use ordinary page URLs for manual checks; `debug_panel` is a local sample-data preview and is **not** an authorization test.

| Panel | Page / API | Allowed account | Denied or limited case | Live data boundary |
| --- | --- | --- | --- | --- |
| Overview | `/internal` / `GET /api/internal/dashboard?workspace=personal` | Active internal user with `overview` and `work.overview.read` | No personal panel or missing permission: API `403`; Overview-only must not receive task descriptions or links | Own Hubstaff summary and approved task-summary fields only |
| My tasks | Same page/API | Active internal user with `my_tasks` and `work.tasks.read` | No `my_tasks`: no full task details, even when Overview or Activity is visible | Verified user's own assigned tasks only |
| Activity | Same page/API | Active internal user with `activity` and `work.activity.read` | Activity-only response has no task description, project collection, or work summary | Own recent task-status fields only |
| Team directory | `/internal/team` / `GET /api/internal/dashboard?workspace=team` | Active internal user with `team_directory` panel and baseline `people.directory.read` | Team toggled off or missing from saved panel list: API `403` and no sidebar link; inactive or unauthenticated accounts also denied | Active users' names and positions only; no colleague connection status |
| Project Management team tasks | `/internal/roles/project_management` | Assigned Project Management role or Internal Admin may view a static placeholder | No live task read or assignment action; old `team_tasks` panel keys are ignored | No organization-wide task API or data |
| Hubstaff settings | `/internal/settings` / `GET /api/internal/dashboard?workspace=settings`; `POST /api/internal/connection` | Active internal user with `hubstaff` and the relevant `hubstaff.connection.read`/`.manage` permission | No panel or permission: settings API denied and connection mutation refused | Own approved Hubstaff mapping and connection status; never saved token fields |
| Internal Settings | `/internal/internal-settings` / `GET/POST/PATCH/PUT /api/internal/internal-users` | Internal Access Manager or Internal Admin with the action-specific permission | Ordinary or planned-only role: API `403`; role edits reject self-change and `internal_admin` | Internal accounts and effective permissions; audited changes; no credential ciphertext |
| My Workspace role panels | `/internal/roles/{role}`; `/internal/roles` redirects to the first available role | Active internal user assigned that business role; Internal Admin may view all Phase 0 panels | Unassigned, unknown, and protected administrative role URLs have no panel content | Static placeholder text only; no business API requests or live data |

The shared live-panel policy in `lib/internal-panel-access.js` drives navigation, page entry, and dashboard API gates. Individual dashboard response fields still use panel-specific checks. The Phase 0 role panels are separate static placeholders, gated by assigned role; they do not add live data permissions until their source, scope, and field policy is approved.

## Automated checks

- `npm run test:internal-user` covers allowed/denied panel and workspace combinations, role-panel visibility, API response-field filtering, toggleable basic Team fields, planned-role denial, account-management actions, and cross-account Hubstaff isolation.
- `npm run test:internal-user:ui` covers responsive My Work, basic Team, Settings, direct role-panel sidebar links/mobile drawer, and the Internal Settings role/permission display with fixture data. It does not substitute for real authentication or database authorization testing.
- `npm run lint` and `npm run build` check integration and compilation.

## Non-production deployment check — pending

1. Confirm the intended database, apply `npm run internal-user:migrate -- --dry-run`, then apply the migration. Do not use production as the first test target.
2. Prepare distinct active accounts: baseline internal users with Team enabled and disabled, Project Management, Internal Access Manager, Internal Admin, and a planned-role-only user. Give the baseline user only one personal panel at a time when testing data minimization.
3. Sign in as each account and check sidebar links, direct page URLs, and the matching API. A redirect or hidden link is **not** sufficient: denied APIs must refuse the request and must not return restricted fields.
4. Verify role grant/revoke audit records, self-role and protected-role denials, last active manager protection, and that planned roles do not expose business data.
5. Verify that a role change is reflected after a fresh request/sign-in, and that a disabled account cannot use any internal endpoint. Record environment, date, account fixture IDs, and results without copying tokens or personal task contents into the report.

Completion status: automated checks are in place; the non-production authenticated/database check remains pending until a target environment and test accounts are available.
