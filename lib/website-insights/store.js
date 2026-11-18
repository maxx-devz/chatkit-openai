import "server-only";
import { runBackgroundJob, checkJobResource } from "../background-jobs.js";
import { randomUUID } from "node:crypto";
import { databasePool as db } from "../database.js";
import { InsightError, resourceId, websiteInput } from "./policy.js";
import { createAudit, crawlBatch, finalizeAudit } from "./audit.js";
import { publicGet, resolvePublicHost } from "./public-http.js";
import { pageSpeed } from "./google-data.js";

export async function getWebsite(context, id) {
  const { rows } = await db.query("SELECT id,name,url,created_at FROM portal_website_insights_sites WHERE id=$1 AND client_id=$2 AND archived_at IS NULL", [resourceId(id), context.client.id]);
  if (!rows[0]) throw new InsightError("not_found", "This website is not available in your current client workspace.", 404);
  return rows[0];
}
export async function listWebsites(context) {
  return (await db.query(`SELECT s.id,s.name,s.url,s.created_at,
    (SELECT jsonb_build_object('id',r.id,'status',r.status,'createdAt',r.created_at,'stage',r.state->>'stage')
     FROM portal_website_insights_reports r WHERE r.website_id=s.id AND r.client_id=s.client_id ORDER BY r.created_at DESC LIMIT 1) AS latest
    FROM portal_website_insights_sites s WHERE s.client_id=$1 AND s.archived_at IS NULL ORDER BY s.created_at`, [context.client.id])).rows;
}
export async function addWebsite(context, input) {
  const { name, url } = websiteInput(input), client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM portal_clients WHERE id=$1 FOR UPDATE", [context.client.id]);
    const count = await client.query("SELECT count(*)::int AS count FROM portal_website_insights_sites WHERE client_id=$1 AND archived_at IS NULL", [context.client.id]);
    if (count.rows[0].count >= 10) throw new InsightError("site_limit", "This workspace can monitor up to 10 active websites.");
    const result = await client.query("INSERT INTO portal_website_insights_sites(id,client_id,name,url,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,name,url", [randomUUID(), context.client.id, name, url, context.user.id]);
    await client.query("COMMIT"); return result.rows[0];
  } catch (error) { await client.query("ROLLBACK"); if (error.code === "23505") throw new InsightError("duplicate_website", "This website is already in your workspace."); throw error; }
  finally { client.release(); }
}
export async function editWebsite(context, id, input) {
  const site = await getWebsite(context, id);
  const { name } = websiteInput({ name: input.name, url: site.url });
  await db.query("UPDATE portal_website_insights_sites SET name=$3 WHERE id=$1 AND client_id=$2", [id, context.client.id, name]);
  return { ...site, name };
}
export async function archiveWebsite(context, id) {
  await getWebsite(context, id);
  await db.query("UPDATE portal_website_insights_sites SET archived_at=NOW() WHERE id=$1 AND client_id=$2", [id, context.client.id]);
  // Reports are retained, not destroyed. Disconnect separately before archiving.
}
export async function reportHistory(context, id) {
  await getWebsite(context, id);
  return (await db.query(`SELECT id,status,created_at,finished_at,state->>'stage' AS stage,result->'summary' AS summary,
    result->'performance' AS performance,result->'search'->'summary' AS search_summary
    FROM portal_website_insights_reports WHERE website_id=$1 AND client_id=$2 ORDER BY created_at DESC LIMIT 60`, [id, context.client.id])).rows;
}
export async function getReport(context, id) {
  const { rows } = await db.query(`SELECT r.id,r.website_id,r.status,r.created_at,r.finished_at,r.state,r.result FROM portal_website_insights_reports r
    JOIN portal_website_insights_sites s ON s.id=r.website_id AND s.client_id=r.client_id
    WHERE r.id=$1 AND r.client_id=$2 AND s.archived_at IS NULL`, [resourceId(id), context.client.id]);
  if (!rows[0]) throw new InsightError("not_found", "This report is not available in your current client workspace.", 404);
  const row = rows[0];
  return { ...row, state: { stage: row.state.stage }, result: row.result };
}
export async function startReport(context, id) {
  const site = await getWebsite(context, id), client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM portal_clients WHERE id=$1 FOR UPDATE", [context.client.id]);
    const active = await client.query("SELECT id FROM portal_website_insights_reports WHERE website_id=$1 AND client_id=$2 AND status='running'", [id, context.client.id]);
    if (active.rows[0]) { await client.query("COMMIT"); return active.rows[0].id; }
    const recent = await client.query("SELECT id FROM portal_website_insights_reports WHERE client_id=$1 AND created_at>NOW()-INTERVAL '1 minute' LIMIT 1", [context.client.id]);
    if (recent.rows.length) throw new InsightError("rate_limit", "Wait one minute between new website analyses in this workspace.", 429);
    const reportId = randomUUID(), audit = createAudit(site.url);
    await client.query("INSERT INTO portal_website_insights_reports(id,website_id,client_id,started_by,state,result) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)",
      [reportId, id, context.client.id, context.user.id, JSON.stringify(audit.state), JSON.stringify(audit.result)]);
    await checkJobResource(client,"report",reportId,context,true);
    await client.query("COMMIT"); return reportId;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export async function advanceReport(context, id, readGoogle, signal, manual = false) {
  const value = await runBackgroundJob("report",String(id),{context,signal,manual},job => advanceReportBatch(context,id,readGoogle,job.signal,job));
  if (value?.skipped) { await checkJobResource(db,"report",String(id),context); return getReport(context,id); }
  return value;
}
async function advanceReportBatch(context,id,readGoogle,signal,job) {
  await getReport(context, id);
  const lease = randomUUID();
  // Outlive the 120-second route so another tab cannot duplicate a slow run.
  const acquired = await job.write(db => db.query(`UPDATE portal_website_insights_reports SET lease_token=$3,lease_until=NOW()+INTERVAL '130 seconds'
    WHERE id=$1 AND client_id=$2 AND status='running' AND (lease_until IS NULL OR lease_until<NOW()) RETURNING website_id,state,result`, [id, context.client.id, lease]));
  if (!acquired.rows.length) return getReport(context, id);
  const { state, result, website_id: websiteId } = acquired.rows[0];
  try {
    if (["discovery", "crawl"].includes(state.stage)) await crawlBatch(state, result, async (...args) => { await job.check(); return publicGet(...args); }, signal);
    else if (state.stage === "mobile" || state.stage === "desktop") {
      const strategy = state.stage;
      try {
        await resolvePublicHost(new URL(result.root).hostname);
        result.performance[strategy] = await pageSpeed(result.root, strategy, { signal });
      } catch (error) {
        if (signal?.aborted) throw error;
        result.performance[strategy] = { status: "unavailable", message: "The website could not be verified as a public destination. No Google performance request was sent." };
      }
      state.stage = strategy === "mobile" ? "desktop" : "search";
    } else if (state.stage === "search") {
      result.search = await readGoogle(context, websiteId, result.root, signal);
      finalizeAudit(result); state.stage = "complete";
    }
    signal?.throwIfAborted();
    await job.write(db => db.query(`UPDATE portal_website_insights_reports SET state=$4::jsonb,result=$5::jsonb,status=$6,
      finished_at=CASE WHEN $6='complete' THEN NOW() ELSE NULL END,lease_token=NULL,lease_until=NULL
      WHERE id=$1 AND client_id=$2 AND lease_token=$3 AND lease_until>NOW()`, [id, context.client.id, lease, JSON.stringify(state), JSON.stringify(result), state.stage === "complete" ? "complete" : "running"]));
  } catch (error) {
    // The last committed batch remains resumable after disconnects/timeouts.
    await db.query("UPDATE portal_website_insights_reports SET lease_token=NULL,lease_until=NULL WHERE id=$1 AND client_id=$2 AND lease_token=$3", [id, context.client.id, lease]);
    if (!signal?.aborted) throw new InsightError("batch_failed", "This batch could not finish. Your saved progress is safe; resume the analysis.", 502);
    throw error;
  }
  return getReport(context, id);
}
