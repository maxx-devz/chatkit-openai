import { synchronizeAllPreparedSources } from "../lib/prepared-source-sync.js";
import { databasePool } from "../lib/postgres.js";

const watch = process.argv.includes("--watch");
let stopping = false;
let wake;
let controller;
const stop = () => { stopping = true; controller?.abort(); wake?.(); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  do {
    controller = new AbortController();
    try {
      const result = await synchronizeAllPreparedSources({ signal: AbortSignal.any([controller.signal, AbortSignal.timeout(110_000)]) });
      console.log("Prepared-source sync:", JSON.stringify(result));
    } catch (error) {
      if (!stopping) console.error("Prepared-source sync unavailable", { code: error?.code || "sync_failed" });
      if (!watch) process.exitCode = 1;
    }
    if (watch && !stopping) await new Promise(resolve => {
      const timer = setTimeout(resolve, 60_000);
      wake = () => { clearTimeout(timer); resolve(); };
    });
  } while (watch && !stopping);
} finally { await databasePool.end(); }
