import "server-only";
import { randomUUID } from "node:crypto";
import { databasePool } from "./database.js";
import { legacyBackfillInstalled } from "./legacy-agency-compat.js";

export async function checkJobResource(db, kind, resource, context, retry = false) {
  if (!await legacyBackfillInstalled(db)) return;
  const session = context?.session;
  const args=[kind,String(resource),session?.user?.id || null,session?.session?.id || null,context?.client?.id || null];
  const {rows}=await db.query("SELECT * FROM agency_platform.job_scope($1,$2,$3,$4,$5)",args);
  if (context?.agency?.id && String(rows[0]?.agency_id)!==String(context.agency.id)) {
    throw Object.assign(new Error("Job access denied"),{code:"job_scope_changed",status:403});
  }
  if (retry) await db.query("SELECT agency_platform.retry_job($1,$2,$3,$4,$5)",args);
}

export async function runBackgroundJob(kind, resource, { context, signal, manual = false } = {}, work) {
  signal = AbortSignal.any([...(signal ? [signal] : []),AbortSignal.timeout(110_000)]);
  signal.throwIfAborted();
  // Pre-adoption compatibility retains the existing legacy permissions/leases.
  // An adopted database without migration 007 fails closed; no silent fallback.
  const adopted = await legacyBackfillInstalled(databasePool);
  const token = randomUUID(), session = context?.session;
  const args = [kind,String(resource),session?.user?.id || null,session?.session?.id || null,context?.client?.id || null];
  if (adopted) {
    if (context) await checkJobResource(databasePool,kind,resource,context);
    let rows;
    try { ({ rows } = await databasePool.query("SELECT * FROM agency_platform.claim_job($1,$2,$3,$4,$5,$6,$7)", [...args,token,manual])); }
    catch(error) {
      throw Object.assign(new Error(error.code==='55000' ? 'This job is paused after repeated failures. Use Synchronize, Queue or Resume to retry.' : 'This job is not available in the current workspace.'),
        {code:error.code==='55000' ? 'job_paused' : 'job_scope_changed',status:error.code==='55000' ? 429 : 403});
    }
    if (!rows.length) return { skipped:true,code:"job_busy_or_backoff" };
    if (context?.agency?.id && String(rows[0].agency_id)!==String(context.agency.id)) {
      await databasePool.query("SELECT agency_platform.finish_job($1,$2,$3,'cancelled')",[kind,String(resource),token]);
      throw Object.assign(new Error("Job access denied"),{code:"job_scope_changed",status:403});
    }
  }
  const check = async (db = databasePool) => {
    signal.throwIfAborted();
    if (adopted) await db.query("SELECT agency_platform.check_job($1,$2,$3,$4,$5,$6)",
      [kind,String(resource),token,...args.slice(2)]);
  };
  const write = async apply => {
    if (!adopted) { await check(); return apply(databasePool); }
    const db = await databasePool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL lock_timeout='3s'");
      await check(db);
      const result = await apply(db);
      signal.throwIfAborted();
      await db.query("COMMIT"); return result;
    } catch(error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  };
  let outcome="job_failed";
  try {
    const result = await work({token,signal,check,write});
    await check(); // Reauthorize delivery as well as saved batches.
    outcome="ok";
    return result;
  } finally {
    // Hubstaff deadline slices keep their saved cursors. Atomic source/report
    // timeouts count toward the retry ceiling; closing a tab does not.
    const cancelled=signal.aborted && (kind==="hubstaff" || signal.reason?.name!=="TimeoutError");
    if (adopted) await databasePool.query("SELECT agency_platform.finish_job($1,$2,$3,$4)",
      [kind,String(resource),token,cancelled ? "cancelled" : outcome]);
  }
}
