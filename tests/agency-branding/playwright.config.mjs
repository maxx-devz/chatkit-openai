import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
if (!process.env.AGENCY_BRANDING_FIXTURE) throw Error('Supply the ignored synthetic AGENCY_BRANDING_FIXTURE file.');
const f = JSON.parse(readFileSync(process.env.AGENCY_BRANDING_FIXTURE, 'utf8'));
const origin = new URL(process.env.BETTER_AUTH_URL), database = new URL(process.env.DATABASE_URL);
if (origin.hostname !== '127.0.0.1' || database.hostname !== '127.0.0.1' || f.origin !== origin.origin || f.database !== database.pathname || !/^\/aoc_stage04_rehearsal_[a-f0-9]+$/.test(database.pathname)) throw Error('Use the matching disposable loopback fixture.');
export default defineConfig({ testDir: './browser', outputDir: '../../.tmp/agency-branding-browser', workers: 1, fullyParallel: false,
  timeout: 60000, expect: { timeout: 12000 }, retries: 0, reporter: 'list',
  use: { baseURL: origin.origin, channel: 'chrome', headless: true, launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] }, trace: 'off', screenshot: 'only-on-failure', viewport: { width: 1500, height: 1000 } } });
