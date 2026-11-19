import {defineConfig} from "@playwright/test";
import {readFileSync} from "node:fs";
const f=JSON.parse(readFileSync(process.env.CLIENT_DOCUMENTS_FIXTURE,"utf8"));const u=new URL(process.env.DATABASE_URL),o=new URL(process.env.CLIENT_DOCUMENTS_TEST_DATABASE_URL),origin=new URL(process.env.BETTER_AUTH_URL);
if(u.hostname!=="127.0.0.1"||o.hostname!=="127.0.0.1"||u.host!==o.host||u.pathname!==o.pathname||u.username===o.username||u.pathname!=="/"+f.database||origin.origin!==f.origin||!/^\/aoc_documents_[a-f0-9]{10}$/.test(u.pathname))throw Error("Require the matching disposable document fixture");
export default defineConfig({testDir:"./browser",outputDir:"../../.tmp/document-assignment-browser",workers:1,fullyParallel:false,retries:0,timeout:45000,expect:{timeout:10000},reporter:"list",use:{baseURL:origin.origin,channel:"chrome",headless:true,trace:"off",screenshot:"only-on-failure",viewport:{width:1440,height:1000}}});
