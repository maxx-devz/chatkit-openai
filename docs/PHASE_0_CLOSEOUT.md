# Phase 0 Architecture and Access Closeout

| Field | Value |
| --- | --- |
| Status | Open; first-increment scope and baseline access rules decided, technical handoff pending |
| Scope | Architecture, identity, permissions, source ownership, credentials, sync policy, and verification |
| Planning source | [AOC Portal Integration Scope - Implementation Phases](https://docs.google.com/spreadsheets/d/15sky-E2X0anax-GdUg9q-NBXWU3W6w44HTr0i5q_4Ro/edit?gid=596018147#gid=596018147) |

The scope sheet's Phase 0 decision gate is approved architecture, a known owner and access path for each P0 source, and a named person with a target resolution point for every unresolved P0 item. The project owner has approved an internal-first increment covering Hubstaff Time, Tasks, and leave/shift status. HubSpot, Help Scout, Drive, and other integrations can follow in Phase 1. A working connector or verification of the temporary staging deployment is **not** a Phase 0 architecture gate; deployment checks remain required before releasing the corresponding feature.

## Decision and approval register

| Decision | Current position | Required approver or owner | Exit evidence |
| --- | --- | --- | --- |
| Portal boundaries and source of truth | Internal-first increment approved; new client-portal work deferred. Source applications and approved Drive masters remain authoritative | Project owner and technical owner | Technical review of [architecture](PHASE_0_ARCHITECTURE.md) and remaining source-key decisions |
| Login and account type | Better Auth database-backed accounts approved; Google SSO is optional later | Existing decision D-01; Security/IT review of operational controls pending | Preserve D-01 and record security reviewer |
| Internal roles, records, and fields | Project owner accepts the current role matrix as the starting policy. Team status has an implemented baseline filter; a separate read-only HR reader now exposes leave, balance, and schedule fields to HR and Internal Admin | Project owner for baseline; HR data owner for detailed fields | Review existing HR and Internal Admin role holders, field policy, retention, and deployed Hubstaff reader before release; verify schedule coverage before enabling shared shift labels |
| Client and portal-admin access | Existing boundaries remain; new client-portal work is deferred | Project owner | Decision recorded; retain existing boundaries without treating a missing client matrix as approval |
| Entity relationships | [Data model](PHASE_0_DATA_MODEL.md) proposed; only current identity/access and run-audit tables are implemented | Technical owner and domain owners | ERD reviewed; unresolved assignment and source-key questions assigned |
| Sync and secret policy | Scope-sheet refresh times remain planning targets until each connector is built and tested. Failed syncs notify Internal Access Managers and Internal Admins; developer coordinates access requests with provider owners | Developer and provider owners | Define alert delivery, escalation, credential/revocation path, and tested connector-specific targets |
| Retention and audit | Access audit and one Hubstaff run lifecycle exist; retention and generic action audit undecided | Leadership, Security/IT, and data owners | Retention decision by domain and approved checkpoint/audit schema |

Account Manager and HR Admin have been added as position presets. A position controls default panels, not a functional role or data permission; detailed HR access requires the HR or Internal Admin role. Custom-position administration is a separate future design decision, not part of the Phase 0 baseline.

## P0 source, owner, and access register

The developer is the integration coordinator and will request access from provider owners. That does not make the developer the data owner or automatically grant a provider credential. Name the provider owner and access/revocation route before building each connector; assign a developer-owned target for any unresolved P0 source. Do not copy tokens into this file.

| P0 source or decision | Source of truth and use | Data owner to name | Credential custodian to name | Access evidence | Open decision or blocker |
| --- | --- | --- | --- | --- | --- |
| Portal PostgreSQL and Better Auth | Portal accounts, roles, configuration, audits | Technical owner | Deployment/Vercel owner | Versioned migrations and local tests passed against the current development database | Choose the database and recovery plan for the new Vercel project before its deployment; current Neon branch identity is not a Phase 0 gate |
| Hubstaff Time | Time entries and later utilization; Hubstaff stays authoritative | Hubstaff organization owner | Hubstaff token owner | Current server-side integration and local API checks exist | First increment: developer to confirm organization-wide time scopes, pagination, quotas, freshness, and deployed credentials |
| Hubstaff Tasks | Projects, assignments, task status; read-only first | Hubstaff Tasks owner | Hubstaff token owner | Current My Work personal adapter exists | First increment: developer to confirm organization-wide task access and assignment IDs; future writes remain out of scope |
| Hubstaff approved leave | Staff days-off feed | HR/Admin | Hubstaff token owner | Local organization token read multiple members' requests; derived Team and HR/Internal Admin read-only readers and tests exist | First increment: developer to verify deployed cross-member read, HR and Internal Admin role-holder lists, retention, and detailed-field boundary |
| Hubstaff attendance schedules | Candidate expected-shift source | HR/Admin | Hubstaff token owner | Local schedule read succeeded for some organization members; derived reader handles weekly schedules | First increment: confirm Team coverage and authoritative schedules, then set `HUBSTAFF_TEAM_SCHEDULES_VERIFIED=true`; otherwise show Unknown, not an inferred On/Off Shift |
| HubSpot | Companies, contacts, deals, and approved CRM activity | Sales/HubSpot owner | HubSpot app admin | Access method and scopes not verified | Name private-app/OAuth owner, objects/properties, webhook and revocation path |
| Help Scout | Conversation mirror; no Phase 0 replacement | PM/Support owner | Help Scout admin | API plan/scopes not verified | Name mailbox owner and read scope; defer workflow parity/cutover to replacement phase |
| Google Workspace and Drive | Approved source documents and structured records | Each file's data owner | Workspace admin | Source links identified in the scope sheet | Choose service account or OAuth path; approve per-file classification and permissions |
| Make | Retained orchestration only, never authoritative storage | Make scenario owner | Make admin | Existing scenarios not inventoried | Name owner and inventory trigger, destination, failure path, and duplicate-flow risk |
| GA4 | P0-listed source, implementation scheduled for Phase 2 | Marketing/CRO owner | GA4 property admin | Property and access unverified | Assign named owner and target for property mapping; no Phase 1 connector required |
| Performance/evaluation data | Restricted HR source, not a live role grant | HR/Admin and Leadership | None until access approved | Exact source/fields unapproved | Assign named owner and target; defer implementation to the HR phase |

### P0 Drive classification decisions

These are proposed treatments, not permission grants. The source owner must approve exact fields, audience, and access method before ingestion.

| Drive master from scope sheet | Proposed treatment | Required owner decision |
| --- | --- | --- |
| Project Directory and Project - Source File Matrix | Link or permission-aware reference index | Confirm canonical files and who may read them |
| Employee Admin Records Index | Link only until HR approves a restricted structured subset | Confirm index visibility; never mirror unrestricted HR records |
| Human Resources - Team Directory & Capability Standards | Link/index approved standards; structured fields only if needed | Confirm directory versus restricted HR fields |
| AOC Hubstaff Monthly Activity Review | Link to metric definitions | Confirm which utilization rules are authoritative |
| Client Profiles Repository | Structured sync of approved fields, if included in the first release | Confirm row key, fields, client mapping, and owner |

## Proposed sync and security policy for approval

| Source | Planning refresh target from scope sheet | Phase 0 decision needed |
| --- | --- | --- |
| Hubstaff Time | 15–60 minutes | Named owner, bounded pagination, incremental key, and reconciliation window |
| Hubstaff Tasks | 5–15 minutes | API/webhook coverage, source IDs, retries, and completeness rule |
| Staff days off | Daily | Approved/partial-day mapping, timezone, and stale-data treatment |
| HubSpot | 5–15 minutes | Object scope, webhook/poll split, and failure owner |
| Help Scout | Near-real-time | Mirror scope, webhook/reconciliation path, and failure owner |
| Approved Drive masters | Daily or on change | Per-file classification, permission model, and change detection |
| GA4 | Hourly or daily; Phase 2 implementation | Named property owner and target resolution point |

These are **planning targets**, not approved service-level agreements; the project owner accepted them until each integration is built and tested. Each connector must identify its source owner, environment, credential owner, stable source IDs, checkpoint, last successful run, retry/rate-limit rule, stale-data behavior, and incident contact. A failed or incomplete read must not be displayed as fresh or complete. Failed-sync alerts go to Internal Access Managers and Internal Admins; alert delivery and escalation still need implementation. Webhooks require authentication, duplicate protection, and scheduled reconciliation. Make and a direct connector must not both own the same flow.

Keep provider credentials server-only. Record who can create, rotate, revoke, and recover each credential; use separate staging and production values. Never store plaintext secrets, raw provider responses, or unrestricted HR fields in audit logs. Approve retention for normalized records, deleted records, sync runs, access/action audit, and raw payloads before production volume grows. The [architecture](PHASE_0_ARCHITECTURE.md) states the proposed safeguards; owner approvals remain open.

## Staging verification record

On **2026-10-15**, the local `.env.local` `DATABASE_URL` pointed to a Neon PostgreSQL database named `neondb`, which the project owner identified as staging/development. The temporary staging deployment URL is `https://staging-aoc-portal.vercel.app/`. The future Vercel project may use this database or a different one; its database selection and deployed configuration will be verified during deployment planning. No credential value was printed or saved in this document.

| Check | Result | Boundary |
| --- | --- | --- |
| Schema inventory | Passed: portal user, internal-user, and integration-run tables present; legacy employee table empty | Read-only; four current internal-user rows and three integration-run rows at check time |
| `internal-user:migrate -- --dry-run` | Passed and rolled back | No persisted migration changes |
| `integration-audit:migrate -- --dry-run` | Passed and rolled back | No persisted migration changes |
| Apply both versioned migrations | Passed | Applied to the user-designated staging database; scripts report preserved account IDs, sessions, mappings, and tokens |
| `test:internal-user:database` | Passed | Uses temporary fixtures and rolls back all changes |
| `test:internal-user` | Passed: 71 tests | Mostly mocked/unit coverage, including auth fixtures; not deployed HTTP proof |
| `test:internal-user:ui` | Passed: 25 browser tests | Isolated local fixture app; not the staging deployment or live database |
| `lint` and `build` | Passed | Local code-quality and production-build checks; no Vercel deployment performed |
| `setup:check -- --internal-user` | **Failed one configuration check** | `PROVIDER_SETTINGS_SECRET` is absent from `.env.local`; one encrypted provider-key row exists in this staging database, so restore the existing stable secret rather than generating a replacement. Other listed configuration/schema checks passed |
| Public staging reachability | Passed: anonymous `GET /` returned HTTP 307 to `/login` | Confirms a public response only, not the deployed database, authenticated flows, or access policy |
| Authenticated staging HTTP and browser checks | Pending | Need test accounts and an approved fixture procedure; do not infer success from unit tests or the anonymous redirect |
| Deployed Hubstaff organization-token check | Pending | Local API results do not prove the Vercel deployment has the same token or cross-member scope |

The PostgreSQL SSL-mode compatibility warning printed by `pg` is not a migration failure. Review the connection string before adopting the next major `pg`/`pg-connection-string` release; do not change TLS semantics casually.

## Phase 0 exit decision

Do **not** mark Phase 0 complete until the following are recorded:

- [x] Record the internal-first scope, baseline access rules, shared Team status audience, and planning refresh targets supplied by the project owner.
- [ ] Technical review of [architecture](PHASE_0_ARCHITECTURE.md) and [data model](PHASE_0_DATA_MODEL.md), including first-increment Hubstaff source IDs and assignment relationships.
- [ ] Assign the developer and a target resolution point for each unknown P0 provider owner/access route; confirm Hubstaff organization access for the first increment.
- [ ] Define alert delivery to Internal Access Managers and Internal Admins, secret rotation, checkpoint/audit schema, and retention by domain.
- [ ] Record who can administer HR-role detailed leave fields and confirm their server-side field boundary before the feature is released.

The temporary staging URL, its exact Neon branch, and its missing local provider-encryption secret are **deployment readiness findings**, not Phase 0 exit conditions. Before reusing that encrypted provider-key row in any deployment, recover its existing stable secret or reprovision the credential through an approved process. Real-account allow/deny and integration checks remain required before releasing the corresponding feature on the new Vercel project.

| Approval role | Named approver | Decision | Date |
| --- | --- | --- | --- |
| Project owner | Name not recorded | First-increment scope, baseline access, Team-status audience, and planning refresh targets accepted | 2026-10-15 |
| Technical owner | Roeland, proposed | Pending | Pending |
| Security/IT | Pending | Pending | Pending |
| HR data owner | Pending | Pending | Pending |
| Hubstaff owner | Pending | Pending | Pending |
| Sales/HubSpot owner | Pending | Pending | Pending |
| PM/Support and Help Scout owner | Pending | Pending | Pending |
| Workspace/Drive and Make owners | Pending | Pending | Pending |

The project owner has given the policy decisions above, but the technical, provider, and restricted-data owners have not been named or accepted their operational responsibilities. The proposed technical-owner name above is not an acceptance or sign-off.
