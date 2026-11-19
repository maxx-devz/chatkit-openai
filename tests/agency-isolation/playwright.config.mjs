import {defineConfig} from '@playwright/test';
import {readFileSync} from 'node:fs';

const fixturePath=process.env.AGENCY_ISOLATION_FIXTURE;
if(!fixturePath)throw Error('Supply the private synthetic AGENCY_ISOLATION_FIXTURE file.');
const fixture=JSON.parse(readFileSync(fixturePath,'utf8'));
const origin=new URL(process.env.BETTER_AUTH_URL),database=new URL(process.env.DATABASE_URL);
if(origin.hostname!=='127.0.0.1'||database.hostname!=='127.0.0.1'||fixture.origin!==origin.origin||
  fixture.database!==database.pathname||!/^\/aoc_stage04_rehearsal_[a-f0-9]+$/.test(database.pathname))throw Error('Browser tests require the matching disposable loopback fixture.');
export default defineConfig({
  testDir:'./browser',outputDir:'../../.tmp/agency-isolation-browser',workers:1,fullyParallel:false,
  timeout:60000,expect:{timeout:12000},retries:0,reporter:'list',
  use:{baseURL:origin.origin,channel:'chrome',headless:true,trace:'off',screenshot:'only-on-failure',viewport:{width:1440,height:1000}},
});
