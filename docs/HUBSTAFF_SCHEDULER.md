# Unattended Hubstaff indexing on Vercel Hobby

This runs with no administrator logged in. An external timer calls the **Next.js
portal**, which reads Hubstaff and saves resumable project-scoped batches in
PostgreSQL. It never changes Hubstaff tasks or calls an AI model. Keep the Python
ChatKit deployment configured normally; the scheduled endpoint belongs to the portal.

## Free setup, in order

1. In this checkout, run `npm run hubstaff:index:migrate` against the same
   database used by the production portal. The rerunnable migration adds scheduler
   timestamps/backoff to the existing index table and preserves saved task pages.
   Run it before deploying this code. It uses standard PostgreSQL.
2. Generate a random secret locally:
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
   Keep it private. Do not put it in a URL, screenshot, Git commit or browser variable.
3. Open **Vercel > chatkit-openai-portal > Settings > Environment Variables**.
   Add `HUBSTAFF_INDEX_SYNC_SECRET` for **Production** with that value.
   The portal also needs its existing database/Hubstaff credentials and matching
   PAT encryption key. Do not replace existing keys or client mappings.
4. Deploy the updated portal. Use its stable production HTTPS domain, not a
   preview deployment URL. A signed-out request to the endpoint should return 401.
5. Create a free account at [cron-job.org](https://cron-job.org/en/), then choose
   **CREATE CRONJOB**. Name it `AOC Hubstaff indexing`.
6. Set URL to
   `https://YOUR-PORTAL-DOMAIN/api/cron/hubstaff-index`.
   Select **Every minute** (cron expression `* * * * *`).
7. In **Advanced**, use request method **GET**, and add the request header
   `Authorization` with value `Bearer YOUR_SECRET` (the identical Vercel value).
   This narrow endpoint secret allows index work, not portal login. The scheduler
   stores it; rotate the Vercel and scheduler copies together if needed.
   Enable failure notifications and leave the job enabled.
8. Use **TEST RUN**. A normal run returns 200 JSON with `processedClients`,
   per-client processed counts/codes and `completedAt`. No task text is returned.
   A time-sliced run can report `batch_interrupted`; committed pages are retained.
   Transient/access/rate errors return 503, with safe codes and Retry-After.
9. Close the admin page for a few minutes. Check the scheduler's execution history,
   then open **Overview > Client controls**, select a client and look below its
   Hubstaff project URL. **Last attempt**, **Last completed batch**,
   access timestamps and saved totals show actual progress.
   Totals may stay the same when existing rows are refreshed. Test a normal Work
   question separately when ready; this setup does not make a paid AI request.

Vercel Deployment Protection or a firewall can block the scheduler before it
reaches the handler. A Vercel HTML/login response is not a successful run. Use the
stable public production domain; if that domain requires protection, configure a
Vercel automation bypass secret in the scheduler's header separately. Do not disable
portal authentication or put bypass secrets into query strings.

## What runs

- Each invocation selects up to three eligible projects, ordered by oldest
  **attempt** before queue priority, so repeated requests cannot starve other clients. **Start syncing** saves a
  queue request without calling Hubstaff or an AI provider. A queue survives closing
  the page; a configured worker/scheduler must be running to process it unattended.
- It starts work for at most 18 seconds, with 10-second per-project slices and
  a 20-second abort deadline. Cleanup/SQL can take additional time. The route's
  hosting ceiling is 60 seconds. The free scheduler normally closes requests
  after 30 seconds; monitor timeouts and throughput on the deployed environment.
- Each slice handles up to one task page and three discussion pages, each bounded
  to 100 records. Database leases prevent overlapping writes; cursors and committed
  pages survive cancellation, process restarts and repeated invocations.
- Access is checked before indexing. Inventory refreshes become due five minutes
  after the preceding full inventory pass; discussions rotate too. Large backlogs,
  many clients, provider delays and quotas increase refresh time. This is eventual
  synchronization, not a continuous process or a guarantee that all data is live.
- Transient errors back off up to five minutes; Hubstaff 429 waits at least a
  minute for that client and ends that invocation. Access denial retries after five
  minutes and blocks client index access. A normal cancellation preserves the
  existing access state rather than marking saved history as failed.
- Work chat reads a fresh index directly. An expired/failed matching index gets
  one bounded metadata/access check before reuse, without downloading history.
  Failed access, changed mappings/credentials and absent membership remain blocked.
  Python independently checks membership, project binding and the 15-minute access
  window on every search. General chat gets no project index.

The scheduler itself is free, but Vercel, PostgreSQL and Hubstaff usage limits still
apply. One-minute execution is a starting cadence for a small portal, not unlimited
free capacity. Reduce frequency if measured free quotas require it; an interval
longer than the 15-minute access window triggers a metadata check during Work chat.
Vercel Hobby's native cron only supports daily runs, so this checkout does not add
a too-frequent `vercel.json` cron. See
[Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) and
[cron-job.org limits](https://cron-job.org/en/faq/).

## Local worker and recovery

Run `npm run hubstaff:index:watch` in a separate terminal, or set
`LOCAL_HUBSTAFF_INDEX_SYNC=true` and restart `npm run dev`. This works without
logging into Admin while the local process is running. That flag does not start
a worker inside a Vercel serverless instance.

401: verify the scheduler header and redeploy after changing environment values.
503 / access_denied: inspect the configured Hubstaff account's project access.
503 / sync_failed: inspect provider availability and scheduler/Vercel logs; the
queue retries automatically up to five consecutive failures after agency migration 007. Use the authorized Queue/Sync control to retry after resolving the problem. A missing scheduler column means migration step 1
has not run on that deployment's database.

To stop unattended work, disable the external cron job. Existing saved records
remain, and the permission freshness window still applies. Rotate/remove the
endpoint secret to revoke scheduler access. No other portal is affected.


## Agency migration 007

On an agency-adopted database, apply `npm run agency:jobs` with its reviewed
operator target and runtime role before deploying these workers. Missing 007
fails closed. It adds an agency-wide five-active-job ceiling across Hubstaff,
source synchronization and Website Insights, while retaining existing resource
leases/cursors. See [the Stage 10 contract](agency-platform/STAGE10_JOBS.md) for
execution-time ownership/version checks, pause/retry semantics and private setup.
The Stage 11 rollout gate remains closed; AOC provider access is not inherited by
new agencies. Deployed scheduler delivery still needs a separate live check.
