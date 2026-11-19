import {defineConfig} from '@playwright/test';
import {readFileSync} from 'node:fs';
if(!process.env.SPECIALIST_FIXTURE)throw Error('Supply the ignored synthetic SPECIALIST_FIXTURE.');
const f=JSON.parse(readFileSync(process.env.SPECIALIST_FIXTURE,'utf8')),origin=new URL(process.env.BETTER_AUTH_URL),db=new URL(process.env.DATABASE_URL);
if(origin.hostname!=='127.0.0.1'||db.hostname!=='127.0.0.1'||f.origin!==origin.origin||db.pathname!==f.database||!/^\/aoc_stage04_rehearsal_[a-f0-9]+$/.test(db.pathname))throw Error('Require matching disposable loopback fixtures.');
export default defineConfig({testDir:'./browser',outputDir:'../../.tmp/specialist-browser',workers:1,fullyParallel:false,timeout:45000,expect:{timeout:12000},reporter:'list',use:{baseURL:origin.origin,channel:'chrome',headless:true,trace:'off',screenshot:'only-on-failure',viewport:{width:1500,height:1000}}});
