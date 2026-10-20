# Browser-private network and performance debugger

Run the portal with `npm run dev`, then open the normal portal and
`http://127.0.0.1:3000/?debugger=true` in separate tabs. Refresh the normal tab
after enabling capture. Both tabs must use the exact same origin and an
authorized account. The dashboard discovers monitored tabs automatically.

The query works on **every portal page**, not just the client homepage: for
example `/internal?debugger=true`,
`/internal/internal-settings?debugger=true`, `/internal/team?debugger=true`, and
`/admin?debugger=true`. When a URL already has filters, append
`&debugger=true` instead. The page request is internally rewritten to the same
authenticated inspector; the address bar keeps the requested route. Its
**Open portal** link opens that original page without the debugger flag, with
normal filters preserved. API/asset responses and POST requests are never
rewritten. Capture is mounted in the root layout across client, internal-user,
employee and admin pages, subject to the same session access checks.

`skipProxyUrlNormalize` preserves the original request origin for these
same-origin rewrites, including local IPv4 listeners. Proxy routing deliberately
excludes `/_next` internals instead of relying on normalized data-route URLs.

"Site-wide" means every authorized account can inspect its **own browser's**
portal pages. It does not aggregate traffic from other accounts, browsers or
devices. Keep a normal portal tab open alongside the inspector to generate
real capture data; the inspector never records itself.

`DEBUGGER=true` explicitly enables capture in development **or production**.
The default in `.env.example` is false. In Vercel, set `DEBUGGER=true` on the
Next.js project and redeploy; also enable it on the Python service and redeploy
that service to see provider spans. No public `NEXT_PUBLIC_` flag or new secret
is needed. Use the existing matching `CHATKIT_BACKEND_SECRET` on both services.
Open `https://YOUR-PORTAL/?debugger=true` alongside the normal portal, using the
same browser profile and exact origin. Restart locally after environment/Python
changes. Set `DEBUGGER=false` and redeploy to disable the feature.

Every authenticated account, including client and employee logins, can inspect
its **own browser**. Leave `DEBUGGER_DEVELOPERS` empty for this behavior. An
optional non-empty comma-separated list of auth user IDs, emails, or usernames
can restrict access further. A URL query alone never grants access, and this
does not grant admin permissions or access to another account's API responses.

Channels/capabilities are derived from the authenticated login session, not just
the account ID. Capabilities are signed, bound to the matching auth cookie and
expire within one hour (or sooner if the login expires). Raw session IDs/cookies
are never included in trace records. Reload to renew expired authorization.

There is **no shared server history, database trace table, account-wide stream,
or telemetry collector**. Even another browser with identical login cookies
cannot retrieve your capture. The normal portal broadcasts its bounded in-memory
records only to tabs in the same browser/profile and origin via BroadcastChannel.
A different browser, profile, private-browsing context, device or login session
cannot receive those messages. Tabs sharing the same browser profile/login are
intentionally part of the same local debugging session; this is not isolation
from someone controlling your browser, same-origin scripts or malicious extensions.

Sign-out/sign-in attempts stop capture and clear the session's debugger views.
Other tabs also revalidate the session on focus and every 60 seconds. A changed,
revoked or expired session clears the in-memory views. A temporary network outage
does not count as evidence of logout. Closing all monitored tabs loses history.

## Capture modes and accurate coverage

| Observation | Baseline | Dedicated Chrome / CDP |
| --- | --- | --- |
| Document, image, CSS, JS, font, media timing | Buffered browser entries, after completion | Actual network lifecycle events |
| Fetch / XHR start and consumed stream end | Instrumented calls; early framework calls may expose timing only | Browser network events |
| Status and transfer size | When exposed by the browser / Timing-Allow-Origin | When exposed by CDP; cache indicator is separate |
| Exact initiator, priority, redirect hops | Generally unavailable | CDP initiator/stack/source/request IDs where supplied |
| WebSocket / EventSource activity | Connection and observable message counts, no payload | Network events and frame/message counts, no payload |
| Runtime exceptions / CSP | Error, rejection, resource-error, CSP listeners | Runtime / Log events plus baseline CSP listener |
| Cross-origin iframe internals / workers | Not observable from the parent page | Page-session CDP can still omit OOPIF or worker-owned targets |
| Request and response bodies | Off by default | Off by default |
| Server requests | Explicitly traced Next.js routes and Python clients | Same correlated server instrumentation |

This is not a claim of complete Chrome DevTools parity. Redirects, worker
targets, service workers, opaque responses and browser-specific fields have
different visibility. No missing value is filled with an invented HTTP status,
size, initiator or score. A zero transfer size alone does not identify a cache
hit. Download timing is separate from main-thread execution duration.

Baseline instrumentation loads after developer authorization and uses buffered
PerformanceObserver entries for earlier completed resources. Pending native
image/script/font starts require CDP. The tiny instrumentation-client hook only
forwards router transitions to an already-authorized capture runtime.

## Deep capture

Run `npm run debugger:deep`. It opens a separate local Chrome profile at
`.debugger-profile` using Playwright's private debugging pipe. Sign in inside
that window. It opens a normal portal tab and the debugger; only local portal
pages are monitored. It never opens a public remote-debugging TCP port or
attaches to the user's ordinary Chrome profile. Close that Chrome window or
press Ctrl+C to stop it. The profile is gitignored and may retain its login.

CDP observations are sanitized in the helper before injection into an authorized
portal runtime. That runtime broadcasts only inside this dedicated browser
profile. Open the debugger in that same window; another Chrome profile cannot
inspect it. No CDP records are uploaded to a shared server. This optional local
helper remains loopback-only and never enables remote CDP on production.

## Graph and data

Every resource node is created from an observed request/entry. Solid edges use
explicit parent request IDs, instrumented spans, redirect hops, or a unique
observed initiator source URL within the same tab/navigation. Dotted edges are
navigation associations. Timestamps never establish causality or a critical
path. Clusters retain every member record; click to inspect and double-click to
expand or collapse. The canvas supports
dragging, pan, zoom, fit, reset and grouping. Waterfall selection is an accessible
alternative to selecting a canvas node and shares the same inspector selection.

Capture and rendering use bounded maps (default 2,500 records). Old completed
records are evicted before active requests, using observed timestamps rather
than replay arrival order. Tab IDs survive reloads through sessionStorage; each document gets
a new navigation ID. Browser histories are in memory, not a database. Same-browser,
same-login BroadcastChannel snapshots recover a newly opened debugger while the
normal tab remains open. There is no EventSource connection to a shared server
feed. Pausing display keeps recording.

The normal tab batches lightweight records. Graph code loads only in the debug
view; canvas relationship layout is memoized, rendering is throttled, and static
or hidden graphs stop redrawing. The callback-work counter measures time inside
record insertion/sanitization only, not total instrumentation or CDP overhead.
Development compilation, source maps, developer auth checks, and the probe
traffic affect local timings. No overhead percentage or Lighthouse score is
claimed without a separate measurement.

The default graph groups repeated endpoints by method, origin, path, capture
layer, tab and navigation. Query variants/retries share one counted node; no
request is removed from retention or the waterfall. Click the node to inspect
the latest request and its same-endpoint history. Double-click to expand, or
choose Individual nodes. Browser, proxy and provider calls remain distinct hops.
An error in an earlier member remains visible in the group's color/count even
if a later retry succeeds. This is visual grouping, not request deduplication.

Expanded groups keep their original numbered hub and upstream connections.
Members open in a short, smooth outward fan in that hub's viewport sector
(northwest, northeast, and so on), with spaced rings for larger groups. Blue
dashed branches mean **group membership**, not invented request dependencies.
Neighboring nodes and the camera do not jump. New live members get free local
slots without moving existing ones; dragging the hub carries its whole fan.
Double-clicking the same hub closes just that group. Reduced-motion preferences
skip the opening animation while keeping the same layout and connections.

`node scripts/check-debugger-fan.mjs` uses real local read-only probe requests and
actual canvas interaction to check all four quadrants, anchored hubs, unchanged
neighbors, membership connections, live additions, group dragging, collapse and
reduced motion. It makes no AI calls or task changes. Pure geometry tests also
cover obstacle avoidance, deterministic placement, and a 1,000-member group.

Wheel zoom is handled by a local non-passive canvas listener and does not scroll
the HTML page. Maximize expands only the graph/inspector workspace to the viewport;
the inspector stays on the right. Restore size or Escape exits and restores the
previous page scrolling behavior. Other debugger tabs have no maximize control.

## Performance and errors

The official `web-vitals` library reports TTFB, FCP, LCP, CLS and INP. INP remains
unavailable until supported qualifying interactions exist. A page initially
loaded in the background may have no eligible paint metric. DCL/load come from
navigation timing. Long tasks, long animation frames and layout shifts use
supported browser observers. LCP associates with a resource only for a unique
matching observed URL. Warnings are candidates, not proven root causes. Metrics
belong to the monitored page's latest navigation and are local runtime values,
not CrUX field data. Earlier navigation metrics are not reconstructed.

The Next.js ChatKit and Hubstaff routes run in a request-scoped async context.
Only requests carrying a valid cookie-bound debugger capability activate server capture.
Outbound fetches retain their original body backpressure and cancellation.
Python provider clients receive a separate service-signed trace context and
record real HTTP/stream lifecycles through the installed SDK's `httpx2` client.
They never read prompt or response bodies. Errors inside a traced scope are
recorded; errors outside that scope cannot be recovered from a global history.
Other uninstrumented services/databases are not silently shown
as traced operations. Hosted OpenAI tool internals are not visible HTTP calls
from this process and cannot be invented as nodes.

Server trace buffers belong to one request and return only in that request's
response: bounded sanitized metadata in `x-aoc-debug-records` for JSON responses,
or SSE comments for ChatKit. Header budget truncation is explicitly marked.
Metadata comments are inserted only at SSE frame boundaries, preserving data
bytes, backpressure and cancellation. Python provider progress uses a bounded
per-request queue and the same response, not callback HTTP requests or a global
broker. This works across serverless instances without sticky sessions. Node
and Python must both run the updated code; the Python service must have a valid
`BETTER_AUTH_URL` (HTTPS in production, HTTP allowed only on loopback).

The former `/api/debugger/events` and `/api/debugger/backend` routes always
return 404. `/api/debugger/session` only verifies the current session/channel;
it has no trace records or replay facility. Non-debug requests get no added
debugger headers/comments. All traced responses are private and non-cacheable.

If the browser cancels a stream, its own cancellation is captured immediately.
Further server/provider updates cannot arrive on that now-closed response.
Retained child spans therefore show their last observed state, not proof that
the backend is still running. No shared collector is used to fill those gaps.

Some SDK parsers stop at an SSE protocol terminator before transport EOF. Such
responses are marked `closed` with an explicit observation, not incorrectly
called user cancellations or claimed to have a fully observed network EOF.

## Sensitive data and optional previews

Header capture uses a small allowlist; credentials, cookies and authorization
headers are omitted. All URL query values are redacted. Structured JSON bodies
redact credential and conversation fields and are bounded. Bodies are off unless
both `DEBUGGER_CAPTURE_BODIES=true` and exact `DEBUGGER_BODY_PATHS` are set in
**development**. Production body/payload previews are always off regardless of
these settings. Server/provider spans never include bodies in either environment.
Only same-origin, allowlisted GET JSON responses under 12 KB can be previewed.
Auth, ChatKit, provider, credential, connection, library and file paths are
excluded even if listed. Image previews require an explicit click and a safe
same-origin URL; the preview may issue another browser request. No conversations,
WebSocket payloads, binary bodies, or large image copies are collected.

## Repeatable live probes

Open `/debugger-lab` while signed in as an authorized developer. It deliberately
requests real fixture resources: CSS imports, an OFL-licensed Abel font, SVGs,
missing image (404), delayed JSON, streamed JSON, parallel calls, a dynamic JS
chunk and a deliberate runtime exception. Scroll to trigger native lazy images;
the 500-image control creates a large real resource session. Static fixtures
contain no portal data and require development mode; the page and active API
probes also require developer authentication. The delay is bounded at 1.8 seconds.
These are explicitly test operations, never synthetic records injected into the
normal portal graph.

`/debugger-lab/workflow` is a separately labeled animation fixture protected by
the same developer access checks. It renders the actual client loader with
test-only progress markers; it never invokes AI or injects fake network records.
Run `node scripts/check-workflow-animation.mjs` to verify batched stage order,
curved flight, cancellation, completion, resizing, and reduced-motion behavior.
These are presentation tests, not measurements of provider latency. Real responses
are never held back to finish an animation; terminal events stop queued flights.

Run `npm test`, `npm run lint`, and Python's
`python -m unittest discover -s chatkit_backend/tests` for regression checks.
`node scripts/check-debugger-chat.mjs --general-only` is the focused, real-login
ChatKit/provider-stream check without canvas hit-testing (one actual short AI
request). Omit the flag to exercise both chat modes.
The browser-check script uses the dedicated, already signed-in profile and
compares observed resources with a separate CDP session. It does not bypass auth.
Run it with `npm run debugger:check` after closing the interactive deep-capture
window. After `npm run build`, `npm run debugger:check-disabled` starts an
isolated production server on loopback port 3105, verifies `DEBUGGER=false`
disables the feature, and stops that test server.

`npm run debugger:check-isolation` uses the existing signed-in dedicated profile,
starts a production server on port 3105 with debugging enabled, and opens a
second isolated browser with the same real login cookies copied only in memory.
It verifies separate discovery/history, real concurrent read-only Hubstaff
request traces, anonymous denial, retired collectors, disabled production body
previews, production-only probe denial, and the false-flag kill switch. It never
creates fake sessions, changes passwords, signs the user out, or prints cookies.
It closes its own browsers/server afterwards. No test deploys to Vercel.

`node scripts/check-debugger-interactions.mjs` checks endpoint grouping, request
history, wheel isolation and desktop/mobile maximize/restore using the dedicated
signed-in profile. It sends one short real prompt in each chat mode and verifies
the replies and provider/server correlations. Use `--graph-only` to skip AI calls.

If both chat modes fail with a backend 503 and `provider_encryption_missing`,
restore the original `PROVIDER_SETTINGS_SECRET` used to encrypt the saved keys
on both services and restart them. Generating a new secret cannot decrypt the
existing keys. Never paste secrets into the debugger or commit `.env.local`.

The local signed-in browser check passed with 502 image requests, six concurrent
requests, streamed completion and cancellation, a real redirect, runtime errors,
the shared resource inspector, and a 390px responsive layout. In that controlled
portal refresh, all 30 unique URLs observed by the independent CDP session were
also captured. This is evidence for that test session, not universal coverage.
Python transport tests separately verify signed correlation, stream completion,
and failure propagation; restart the development backend to load that tracing.

## Production-isolation verification (2026-10-19)

The production build, 81 core JavaScript tests, 81 backend tests, and all eight
same-cookie/two-browser isolation checks passed locally. The focused live chat
check also verified an actual rendered AI reply and correlated Python/provider
spans returning inline to that browser. This was a local production-mode test,
not a Vercel deployment.

The additional employee suite passed 102 of 103 tests. Its unchanged SQLite
login fixture is incompatible with the installed Node 22.12 (`node:sqlite`
requires an experimental flag, and even with it the adapter needs the missing
`StatementSync.columns` API). No production PostgreSQL/auth change was made to
work around this test-only environment issue. The combined canvas/chat runner
verified graph grouping/scroll/maximize and both chat modes in its first run,
but lost its capture after a transient DB verification failure; that case now
returns 503 instead of clearing history and has a passing watchdog regression.
A later canvas replay timed out selecting its node; streaming was therefore
verified separately with the focused runner, not claimed as a full canvas replay.

Sources: [W3C Resource Timing](https://www.w3.org/TR/resource-timing/),
[Chrome CDP Network](https://chromedevtools.github.io/devtools-protocol/tot/Network/),
[Playwright CDPSession](https://playwright.dev/docs/api/class-cdpsession), and
[GoogleChrome web-vitals](https://github.com/GoogleChrome/web-vitals).
