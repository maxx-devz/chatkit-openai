import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export default defineConfig({testDir:'./browser',outputDir:'../../.tmp/client-documents-preview-results',workers:1,fullyParallel:false,timeout:45000,
 use:{baseURL:'http://127.0.0.1:3116',channel:'chrome',headless:true,trace:'off'},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{viewport:{width:390,height:844}}}],
 webServer:{command:'node node_modules/next/dist/bin/next dev tests/client-documents-preview/ui -H 127.0.0.1 -p 3116',cwd:fileURLToPath(new URL('../../',import.meta.url)),url:'http://127.0.0.1:3116',reuseExistingServer:false,timeout:120000,env:{DATABASE_URL:'',NEXT_TELEMETRY_DISABLED:'1'}}});
