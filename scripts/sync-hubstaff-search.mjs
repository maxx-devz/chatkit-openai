import { synchronizeAllHubstaffSearch, synchronizeHubstaffSearch } from "../lib/hubstaff-search-sync.js";
import { databasePool } from "../lib/postgres.js";
import { summarizeSync, syncFailureMessage } from "./dev-log-format.mjs";

const watch = process.argv.includes("--watch");
const clientId = process.argv.find(arg => arg.startsWith("--client="))?.slice(9);
if (clientId && !/^[1-9][0-9]{0,18}$/.test(clientId)) throw new Error("Invalid client ID");
let stopping = false;
let wake;
let controller;
const stop = () => { stopping = true; controller?.abort(); wake?.(); };
process.on("SIGINT",stop);
process.on("SIGTERM",stop);
try {
  do {
    controller = new AbortController();
    try {
      const options = {signal:AbortSignal.any([controller.signal,AbortSignal.timeout(100_000)])};
      const result = clientId ? await synchronizeHubstaffSearch(clientId,options) : await synchronizeAllHubstaffSearch(options);
      console.log(summarizeSync(result, "index"));
    } catch (error) {
      if (!stopping) console.error(syncFailureMessage(error, "index"));
      if (!watch) process.exitCode = 1;
    }
    if (watch && !stopping) await new Promise(resolve => {
      const timer = setTimeout(resolve,30_000);
      wake = () => {clearTimeout(timer);resolve();};
    });
  } while (watch && !stopping);
} finally {await databasePool.end();}
