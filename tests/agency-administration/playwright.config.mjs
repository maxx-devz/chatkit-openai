import {defineConfig} from '@playwright/test';
import {readFileSync} from 'node:fs';
if(!process.env.AGENCY_ADMIN_FIXTURE)throw Error('Supply the ignored synthetic AGENCY_ADMIN_FIXTURE.');
const f=JSON.parse(readFileSync(process.env.AGENCY_ADMIN_FIXTURE,'utf8'));
const origin=new URL(process.env.BETTER_AUTH_URL),db=new URL(process.env.DATABASE_URL);
if(origin.hostname!=='127.0.0.1'||db.hostname!=='127.0.0.1'||f.origin!==origin.origin||db.pathname!==f.database||!/^\/aoc_stage04_rehearsal_[a-f0-9]+$/.test(db.pathname))throw Error('Require the matching disposable loopback fixture.');
export default defineConfig({testDir:'./browser',outputDir:'../../.tmp/agency-admin-browser',workers:1,fullyParallel:false,timeout:60000,expect:{timeout:12000},retries:0,reporter:'list',use:{baseURL:origin.origin,channel:'chrome',headless:true,trace:'off',screenshot:'only-on-failure',viewport:{width:1500,height:1000}}});
