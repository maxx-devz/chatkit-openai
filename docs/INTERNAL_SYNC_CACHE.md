# Internal Portal on-demand data freshness

The portal keeps server-only PostgreSQL snapshots for four Hubstaff-backed feeds. A configured interval is entered as a **whole number of minutes** in Internal Settings → Integration & Sync. It is a maximum freshness target when a user opens or refreshes a workspace, not a background timer. If nobody visits, no Hubstaff request runs. A manual refresh bypasses a still-fresh snapshot only when it was last refreshed at least one minute ago. Direct API responses remain private and `no-store`.

| Feed | Default minutes | Scope |
| --- | ---: | --- |
| My Work | 5 | Individual portal account and Hubstaff connection |
| AOC member directory | 60 | Organization token and AOC team |
| Team work status | 1 | Current AOC members and organization token |
| HR leave, balances, schedules | 1440 | Selected month, current date for the current month, and organization token |

Values can be set from 1 to 1440 minutes. Internal Admin can edit; Access Managers can view. Role and panel authorization runs **before** cache access. The HR snapshot contains authorized HR fields, including leave details, so database access, backups, and retention require the same protections as HR data. Cache rows are keyed by SHA-256 digests of scope, not raw tokens. My Work is never shared between users. Integration run audits are written only on provider reads; successful live-panel reads are additionally logged on cache hits.

Only currently implemented live feeds are listed. When Hubstaff Time, HubSpot, Help Scout, Drive, or another functional panel gains a live reader, register a separate feed and access policy before presenting its interval in this UI.

## Installation and behavior

Verify the target development/staging database before running `npm run internal-sync:migrate -- --dry-run` and then `npm run internal-sync:migrate` against the same target. This migration creates `portal_internal_sync_settings`, `portal_internal_sync_settings_audit`, and `portal_internal_sync_snapshots` using standard PostgreSQL features. It does not contact Hubstaff. On 2026-10-15, the migration was applied to the database configured in this workspace's `.env.local`; `npm run internal-sync:check` confirmed all three tables. Other environments still need their own migration. Before it is applied, feeds continue with their prior live-fetch behavior and the UI says the shared cache is unavailable.

When a snapshot expires, one request claims the refresh; concurrent requests wait for the new snapshot. A failed provider read does not replace the previous snapshot, and stale data is not silently served. A successful read prunes snapshots expired more than seven days ago. This on-request prune cannot ensure timely deletion when traffic stops; add a separately approved cleanup job before production. The 2 MB maximum per snapshot avoids unexpectedly large JSONB rows; oversized responses are served live without being cached.

The settings UI reports the latest cache refresh for each feed. That timestamp is a portal fetch time, not proof of Hubstaff source freshness. Cache health and integration-run audit are separate. The current implementation does not include background scheduling, cross-provider feeds, automatic failure notifications, or a formal HR retention approval. Add these as separate work before claiming production sync SLAs.

My Work, Team, and HR display a small muted source note beside the data they show. “Saved copy” means that response was read from the PostgreSQL snapshot; “Fetched from Hubstaff” means the server called Hubstaff for it. Team shows separate notes for the member directory and work status because their intervals differ. The displayed time is when the portal obtained that snapshot, not a Hubstaff source-update timestamp. Returning to a workspace already held in browser state can reuse its response without another server request; its source note remains attached to that displayed response.
