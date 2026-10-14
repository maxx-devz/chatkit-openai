# Phase 0 Architecture and Source of Truth Decisions

| Field | Value |
| --- | --- |
| Status | Draft for review |
| Decision stage | Proposed |
| Last updated | 2026-10-14 |
| Proposed technical owner | Roeland |
| Business approvers | Steve and AOC Leadership |
| Security and data approvers | Pending assignment by domain |
| Planning source | [AOC Portal Integration Scope - Master Matrix](https://docs.google.com/spreadsheets/d/15sky-E2X0anax-GdUg9q-NBXWU3W6w44HTr0i5q_4Ro/edit) |

## Purpose and decision summary

The AOC portal will provide one secure, role-aware view of operational data from AOC applications and controlled Google Drive sources. The portal will normalize the data needed for dashboards, search, and approved workflows without silently becoming a competing editable master.

The proposed architecture keeps each operational application or approved Drive file authoritative for its own data. Server-side connectors synchronize approved data into PostgreSQL. The Next.js application applies authorization before returning that data to the portal UI or AOC-GPT. Write-back actions remain out of scope until their permissions, audit behavior, failure recovery, and source ownership are approved.

Better Auth with the current PostgreSQL-backed portal accounts is the approved login architecture. Google SSO may be added later as an optional sign-in method, but it is not a Phase 0 dependency.

This decision establishes the Phase 0 boundary. It does not approve production credentials, unrestricted data ingestion, third-party write actions, or the replacement of Help Scout or another operational system.

## Scope

This decision covers:

- system boundaries and component responsibilities;
- authoritative sources for portal data;
- direct API, webhook, Make, and Google Drive usage;
- identity, role, and authorization boundaries;
- synchronization, conflict, and traceability rules;
- credential, audit, and AOC-GPT boundaries;
- decisions that must be resolved before Phase 1 production work.

This decision does not define the final dashboard design, implement every domain table, approve sensitive field access, or authorize write-back workflows.

## Proposed system architecture

```text
Operational applications                 Controlled Google Drive sources
Hubstaff, HubSpot, Help Scout,            Docs, Sheets, policies, indexes,
analytics, finance, web platforms         repositories, and trackers
                 \                         /
                  \                       /
                   v                     v
             Server-side integration layer
       Direct APIs, webhooks, scheduled reads, Make
                             |
                             v
                  PostgreSQL portal data layer
       Normalized entities, permissions, checkpoints,
             synchronization runs, and audit events
                             |
                             v
                  Permission-aware portal API
                             |
              +--------------+--------------+
              |                             |
              v                             v
       Role-based portal UI        AOC-GPT access layer
```

The browser must communicate with authenticated portal routes. It must not connect directly to PostgreSQL or receive external-system credentials.

## Component responsibilities

| Component | Responsibility | Data authority | Proposed status |
| --- | --- | --- | --- |
| Operational applications | Own live operational records such as time, tasks, CRM objects, and support conversations | Authoritative for their domains | Approved principle |
| Controlled Google Drive sources | Own approved policies, indexes, repositories, trackers, and reference records | Authoritative for identified Drive-managed data | Approved principle |
| Next.js application | Own portal authentication integration, authorization, APIs, UI, connector orchestration, and admin controls | Authoritative for portal configuration and permissions | Proposed |
| PostgreSQL | Store normalized portal records, source references, integration state, checkpoints, sync history, and audit events | Authoritative for portal-owned state only | Proposed |
| Make | Orchestrate explicitly assigned workflows when it adds value or a direct connector is impractical | Never authoritative | Proposed |
| Python ChatKit service | Run AI conversations and approved tools using a permission-scoped portal context | Never authoritative for business data | Proposed |
| AOC-GPT | Query approved portal data and later invoke individually approved actions | Never authoritative | Proposed |

The existing PostgreSQL layer remains provider-neutral according to [DATABASE_PORTABILITY.md](./DATABASE_PORTABILITY.md). A move from Neon to another PostgreSQL provider must not require a redesign of the portal data model.

## Standard data flow

All synchronized records follow the same logical flow:

1. A source changes or a scheduled synchronization begins.
2. A server-side connector or approved Make scenario reads the change.
3. The integration layer validates the payload and maps it into a stable portal entity.
4. PostgreSQL upserts the record using the source system and source record ID.
5. The integration records its checkpoint, counts, status, timestamps, and safe error details.
6. The portal API applies role and field permissions before returning data.
7. The UI or AOC-GPT shows the data with source and freshness context where useful.

Each synchronized entity must retain, directly or through a source-reference table:

- source system;
- source record ID;
- source URL when available;
- source modification time when available;
- last successful synchronization time;
- synchronization status;
- responsible data owner.

## Source of truth policy

An authoritative source is the location where AOC expects a record to be corrected and maintained. A portal copy is a synchronized representation unless this decision explicitly declares the portal authoritative.

When portal data conflicts with an authoritative source, the authoritative source wins. The portal must not silently overwrite the source or preserve an unapproved conflicting value. It records the discrepancy, marks affected data stale or failed when appropriate, and reconciles from the source.

Portal-native configuration, permissions, checkpoints, synchronization runs, and audit events are exceptions because the portal creates and owns them.

## Initial source of truth matrix

| Data domain | Authoritative source | Portal treatment | Initial write policy | Decision status |
| --- | --- | --- | --- | --- |
| Authentication credentials and sessions | Better Auth records in the portal PostgreSQL database | Continue the current database-backed account and session model | Authentication administration only | Approved for the current architecture |
| Internal account mapping | Portal PostgreSQL through `portal_users` and `portal_internal_users` | Link each authenticated account to one portal user and its approved internal user access record | Managed by authorized administrators | Approved for the current architecture; future SSO must reuse this mapping |
| Portal roles and permissions | Portal PostgreSQL | Evaluate on every protected request | Authorized portal administrators only | Proposed |
| Client portal accounts and memberships | Portal PostgreSQL | Continue current client access model | Authorized portal administrators only | Existing |
| Internal user directory, department, role, and capability | Human Resources Drive masters | Synchronize approved fields into permissioned internal user profiles | Edit in the approved HR source initially | Proposed; field approval pending |
| Leave and time-off requests | Hubstaff, where leave is approved; portal reads the Time Off Requests API | Derive approved dates and minimum permitted availability fields; do not expose raw request details in the Team directory | Read-only initially | Source confirmed; local cross-member read passed; deployed access and HR field approval pending |
| Expected work schedules | Hubstaff Attendance Schedules API is a candidate; HR must confirm whether AOC maintains complete schedules there | Derive shift status only from a verified schedule source; no raw schedules in the shared Team directory | Read-only initially | Local API access confirmed; 2 of 2 active portal mappings in `.env.local` matched schedules; full roster and source authority pending |
| Other absences and leave balances | Pending HR decision | Normalize only approved dates and visibility fields for future calendar or self-service views | Read-only initially | Pending |
| Time entries and activity | Hubstaff Time | Normalize time records and approved aggregates | Read-only | Proposed |
| Projects and tasks | Hubstaff Tasks | Mirror approved project, task, assignee, status, and due-date fields | Read-only initially | Proposed |
| Companies, contacts, deals, and CRM activity | HubSpot | Normalize approved CRM objects and source IDs | Read-only initially; controlled writes in Phase 4 | Proposed |
| Support conversations, assignments, tags, and status | Help Scout | Mirror approved conversations and workflow state | Help Scout remains authoritative until an approved replacement migration | Proposed |
| Client profile and durable client context | Client Profiles Repository in Drive | Synchronize approved structured fields and retain source links | Edit in Drive initially | Proposed |
| Company policies, governance, and meeting records | Approved Drive masters | Index, summarize, or link according to source classification | Edit in Drive | Proposed |
| Website sessions and conversion metrics | GA4 property approved by AOC | Store selected hourly or daily aggregates | Read-only | Pending property confirmation |
| Search clicks, impressions, queries, and pages | Approved Google Search Console properties | Store selected daily aggregates | Read-only | Pending property confirmation |
| Content pipeline | Marketing Content Master Tracker in Drive | Mirror structured tracker fields | Edit in Drive initially | Proposed |
| SEO page registry | AOC Website Page Registry and SEO/GEO Master in Drive | Synchronize page and SEO reference fields | Edit in Drive initially | Proposed |
| Billing status and readiness | Client Billing Status Index in Drive | Synchronize explicitly approved status fields | Read-only | Proposed; field approval pending |
| Spend and transaction summaries | Ramp, if approved | Store approved summaries only | Read-only | Pending scope decision |
| Integration configuration and ownership | Portal PostgreSQL plus deployment secrets | Store non-secret metadata, owners, scopes, and state | Authorized administrators only | Proposed |
| Synchronization checkpoints and run history | Portal PostgreSQL | Store connector cursors, counts, outcomes, and freshness | Connector services only | Proposed |
| Portal audit events | Portal PostgreSQL | Store security and business action history | Append through trusted server routes | Proposed |
| AOC-GPT answers | No authoritative source | Generate from authorized portal data with source references | Never treated as authoritative | Proposed |

## Google Drive source classifications

Every Drive source must be assigned one of the following classifications before production ingestion.

### Structured synchronization

Use structured synchronization when the portal must filter, join, calculate, or enforce field-level permissions on individual records. Initial candidates include internal user indexes, client profiles, billing status, content tracking, the SEO registry, the tech stack repository, and structured project or source matrices.

### Permission-aware search or indexing

Use search or indexing for policies, standards, meeting records, governance documents, and knowledge libraries whose content should remain in Drive. Indexed results must retain the source URL and respect the requesting user's portal permissions. Drive permission mirroring or a separately approved access policy is required before restricted documents are indexed.

### Link only

Use link-only access when ingestion adds unnecessary security, privacy, or maintenance risk. Initial candidates include highly sensitive HR records, raw financial documents, raw Hotjar recordings, and files that do not support a defined portal use case.

Source owners must approve the classification and the exact fields or sections available to the portal.

## Integration method decisions

### Direct API connectors

Use a direct server-side connector when the data is high volume, permission-sensitive, requires pagination or reconciliation, or needs stable incremental synchronization. Hubstaff, HubSpot, Help Scout, GA4, and Search Console are expected to use direct connectors where their plans and APIs permit.

### Webhooks

Use authenticated webhooks for change notifications when supported. A webhook does not replace scheduled reconciliation. The connector must verify signatures or an equivalent shared secret, reject replays where the provider supports replay protection, and process duplicate events idempotently.

### Scheduled synchronization

Use scheduled reads for backfills, reconciliation, Drive sources, and providers without complete webhook coverage. Each schedule requires an owner, freshness target, retry rule, and rate-limit strategy.

### Make

Use Make for explicitly assigned orchestration, notifications, or connectors where a direct backend integration is not justified. Make must not become the primary data store. A direct connector and a Make scenario must not independently own the same data flow.

Existing Make scenarios must be inventoried before new scenarios are approved. Each retained scenario needs a documented trigger, source, destination, owner, failure path, and relationship to portal synchronization.

## Identity and authorization boundary

Better Auth with the current PostgreSQL-backed portal user accounts is the approved authentication architecture. The existing username and password flow remains the default login method for clients, administrators, and internal users. Authentication accounts and sessions remain in the portal database and continue to map to the existing portal user, membership, administrator, and internal user records.

Google SSO may be added later as an optional sign-in method through Better Auth. It is not required for Phase 0 or the initial read-only portal. A future SSO design must link an approved Google identity to the correct existing portal account instead of silently creating duplicate access. It also requires a separate decision covering allowed accounts or domains, account linking, account recovery, rollout, session revocation, and protected administrator access.

Authentication proves who the user is. Authorization determines what that user may see or do. The portal must enforce authorization on the server for every protected request.

The current client, administrator, and internal user account boundaries remain in place while the internal role model is designed. Internal user position and UI panel access do not by themselves authorize sensitive data. The Phase 0 authorization matrix must define domain and field permissions for Leadership, HR/Admin, PM, Sales, Marketing, Development, Billing, internal users, and client users.

The [Internal Portal Role and Permission Matrix](INTERNAL_ACCESS_MATRIX.md) records the proposed four-layer model and internal-user grants. Its planned business permissions remain unavailable until their scopes, fields, and sources are approved and implemented. Client account permissions require a separate matrix.

Sensitive access follows these rules:

- deny access by default;
- grant the minimum role and field permissions required;
- scope internal user self-service separately from manager and HR access;
- restrict evaluation, absence reasons, leave balances, billing, and finance fields;
- verify authorization again for exports, downloads, AOC-GPT queries, and future write actions;
- record privileged administrative and write actions in the portal audit log.

## Portal data model requirements

Phase 0 must approve an entity relationship model for:

- portal users, internal users, teams, roles, and permissions;
- clients, contacts, and companies;
- projects, tasks, and assignments;
- time entries, schedules, and approved absences;
- CRM deals and approved activity summaries;
- support conversations and assignments;
- Drive source documents and source classifications;
- integrations, checkpoints, synchronization runs, and audit events.

The initial `portal_integration_runs` operational table is now defined by the separate [integration audit migration](INTEGRATION_AUDIT.md). The remaining shared integration design is expected to introduce tables equivalent to:

- `portal_data_sources`;
- `portal_integrations`;
- `portal_sync_checkpoints`;
- `portal_audit_events`.

The exact names and relationships require ERD review. Schema changes must remain standard PostgreSQL and must be committed as repeatable migrations.

## Synchronization and reconciliation rules

Connectors must:

- use stable provider IDs rather than names as identifiers;
- use incremental cursors or source modification times where available;
- make repeated processing idempotent;
- prevent an older event from overwriting newer source data;
- distinguish complete, partial, failed, and rate-limited runs;
- record safe error codes without storing credentials or unnecessary sensitive payloads;
- use bounded pagination, timeouts, and retry policies;
- run scheduled reconciliation even when webhooks are enabled;
- define how source deletions, archived records, and revoked access are represented;
- expose freshness and failure state to authorized administrators.

The portal must not infer approved leave or an off-shift state from missing time entries. Hubstaff is the confirmed approval source for leave, and its time-off requests are the portal feed. Hubstaff attendance schedules are a candidate for expected shifts, subject to confirming AOC's schedule coverage and authority; other absences and leave balances still need confirmed sources.

## Credential and secret rules

Static service credentials belong in deployment-managed server secrets. Per-user or rotating credentials may be encrypted in PostgreSQL when the workflow requires shared server-side refresh state.

All credentials must follow these rules:

- never use a `NEXT_PUBLIC_` variable for a secret;
- never return a saved token, ciphertext, or webhook URL to the browser;
- keep separate staging and production credentials;
- document the credential owner, approved scopes, creation path, expiration, and revocation path;
- encrypt database-held credentials with authenticated encryption and context-bound associated data;
- define key rotation and reconnection consequences before production use;
- exclude request bodies, authorization headers, tokens, and sensitive provider responses from logs.

Provider-specific secret handling may reuse the existing Hubstaff and AI-provider encryption patterns, but Phase 0 must establish one documented policy for all connectors.

## Audit and observability requirements

The portal must provide authorized administrators with a consistent view of integration health. Each synchronization run should record:

- integration and environment;
- connector version when useful;
- trigger type;
- start and completion times;
- checkpoint or source window;
- records read, written, skipped, and failed;
- complete or partial status;
- safe error code and retry state;
- correlation or request ID.

Audit events should identify the actor, action, target, source system, result, request ID, and timestamp. They must not contain plaintext secrets or unrestricted sensitive record payloads.

Retention periods for raw provider payloads, normalized records, synchronization history, audit events, deleted records, and support history remain pending. Raw payloads should not be retained by default unless a defined debugging, migration, or compliance need justifies them.

## AOC-GPT boundary

AOC-GPT may access portal data only through permission-aware APIs or tools. It must not receive database credentials, provider credentials, unrestricted Drive access, or a broader role than the requesting user.

Read access must be proven before actions are added. Responses should include source links and freshness timestamps when they affect the user's interpretation. Future actions require separate approval, idempotency, audit logging, permission checks, error recovery, and confirmation rules.

## Current codebase alignment

The following foundations are retained:

- Better Auth and its PostgreSQL persistence;
- the server-only database boundary in `lib/database.js`;
- the provider-neutral PostgreSQL implementation in `lib/postgres.js`;
- existing client, administrator, and internal user access guards;
- encrypted Hubstaff and AI-provider secret patterns;
- read-only Hubstaff integrations and their tests;
- the Next.js portal and separate Python ChatKit deployment.

Phase 0 requires the following additions before broader Phase 1 integration work:

- an approved identity and authorization matrix;
- the internal portal ERD;
- a data-source and integration ownership register;
- shared integration and checkpoint migrations, fuller action-audit coverage, and connector adoption of the implemented run-history lifecycle;
- a common connector contract and safe error model;
- access-verification checks for each P0 provider;
- documented synchronization targets, retention rules, and incident ownership.

## Resolved decisions

| ID | Decision | Resolution | Date | Status |
| --- | --- | --- | --- | --- |
| D-01 | Login authentication | Continue using the current Better Auth PostgreSQL-backed portal accounts. Google SSO remains a possible future optional login integration and is not a Phase 0 dependency. | 2026-10-12 | Approved for the current architecture |

## Remaining open decisions

| ID | Decision | Proposed owner | Resolution required | Status |
| --- | --- | --- | --- | --- |
| D-02 | Validate Hubstaff time-off requests as the leave feed and decide whether Hubstaff attendance schedules are the authoritative expected-shift source; confirm other absences and balances | HR/Admin, Leadership, and Hubstaff owner | Verify deployed organization-wide leave and schedule access, recheck mappings as the portal roster expands beyond the two active accounts in `.env.local`, and validate approval/status and partial-day mapping, time zones, freshness, HR field policy, and remaining sources before the Team work status or Phase 1 staff calendar is released | Hubstaff confirmed as leave approval source; local cross-member leave and schedule reads passed; both current active portal mappings matched schedules; full roster and source authority pending |
| D-03 | Confirm whether employee evaluations are in scope; if approved, identify their source, visible fields, retention, and manager scope | HR/Admin and Leadership | Before the HR module | Pending |
| D-04 | Confirm Hubstaff Time and Tasks scopes, limits, organization-wide authorization, webhooks, and future write support | Roeland and Hubstaff owner | Before Phase 1 connector implementation | Pending |
| D-05 | Confirm HubSpot authentication, objects, properties, scopes, ownership, and webhook coverage | Roeland and Sales/HubSpot owner | Before Phase 1 connector implementation | Pending |
| D-06 | Confirm Help Scout API capabilities and produce a workflow parity checklist | PM/Support, Roeland, and Leadership | Mirror scope before Phase 1; replacement scope before Phase 5 | Pending |
| D-07 | Classify each controlled Drive source as structured synchronization, search/index, or link only | Roeland and source owners | Before each source is ingested | Pending |
| D-08 | Inventory existing Make scenarios and assign one owner to each retained data flow | Roeland and Make owner | Before adding production scenarios | Pending |
| D-09 | Approve retention periods for raw data, normalized data, sync logs, audits, deleted records, and support history | Leadership, Security/IT, and system owners | Before production readiness | Pending |
| D-10 | Define the datasets and actions that AOC-GPT may query or trigger | AI Program Owner, Leadership, and Roeland | Before Phase 6 | Pending |

## Consequences and tradeoffs

This architecture reduces conflicting masters and keeps the portal portable across standard PostgreSQL providers. It also requires explicit source ownership, connector monitoring, and permission design before the portal can provide broad internal access.

Read-only synchronization will deliver useful dashboards earlier and with lower operational risk. Write-back features will arrive later because they require stronger audit, idempotency, permission, and recovery controls.

Keeping Drive files authoritative avoids premature migrations, but structured portal features will depend on stable source layouts and agreed field ownership. Search and indexing must also account for restricted content instead of assuming that every internal user may search every Drive file.

Using both direct connectors and Make provides flexibility, but it creates duplicate-flow risk. The one-owner-per-flow rule and the integration register are therefore required controls.

## Phase 0 approval checklist

- [ ] Business and technical owners approve the component boundaries.
- [ ] The source of truth for every P0 data domain is confirmed.
- [x] The current Better Auth database-backed login architecture is approved; Google SSO is a future optional integration.
- [ ] The role and field permission matrix is approved.
- [ ] The portal entity relationship model is approved.
- [ ] Every P0 integration has an owner, approved authentication method, and verified access path or assigned blocker.
- [ ] Every controlled Drive source has an approved ingestion classification.
- [ ] Synchronization freshness, retries, reconciliation, and incident ownership are defined.
- [ ] Data-retention periods are approved by domain.
- [ ] Credential storage and rotation procedures are approved.
- [ ] Integration-run, checkpoint, and audit schemas are approved.
- [ ] All unresolved P0 items have an owner and target resolution point.

## Approval record

| Role | Name | Decision | Date | Notes |
| --- | --- | --- | --- | --- |
| Business approver | Pending | Pending | Pending |  |
| Technical owner | Roeland, proposed | Pending | Pending |  |
| Security or IT approver | Pending | Pending | Pending |  |
| HR data owner | Pending | Pending | Pending |  |
| Sales and CRM owner | Pending | Pending | Pending |  |
| PM and Support owner | Pending | Pending | Pending |  |
| Billing and Finance owner | Pending | Pending | Pending |  |

## Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-10-14 | Matched both active internal portal Hubstaff IDs in the `.env.local` database to organization members with schedules; 15 other scheduled members have no active portal account there | Codex |
| 2026-10-14 | Recorded the expectation that scheduled Hubstaff members cover Team; portal account matching remains pending | Codex, based on user confirmation |
| 2026-10-14 | Confirmed local attendance-schedule API access: 18 records for 17 of 31 Hubstaff members in a 15-day window; source authority and coverage remain open | Codex |
| 2026-10-14 | Drafted On Shift, Off Shift, Away, and Unknown for Team; shift labels require a verified schedule source and HR approval before release | Codex, based on user confirmation |
| 2026-10-14 | Recorded Hubstaff as the leave-approval source and its Time Off Requests API as the portal feed; API coverage and field access remain pending | Codex, based on user confirmation |
| 2026-10-12 | Approved the current database-backed Better Auth accounts for login and moved Google SSO to a future optional integration | Codex |
| 2026-10-12 | Initial draft based on the current portal architecture and Phase 0 integration plan | Codex |
