import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export default defineConfig({testDir:'./browser',outputDir:'./output',fullyParallel:false,workers:1,timeout:60000,
  use:{baseURL:'http://127.0.0.1:3115',channel:'chrome',headless:true},
  projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'touch',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],
  webServer:{command:'node node_modules/next/dist/bin/next dev tests/client-readiness/ui -H 127.0.0.1 -p 3115',cwd:fileURLToPath(new URL('../../',import.meta.url)),url:'http://127.0.0.1:3115',reuseExistingServer:false,timeout:180000,env:{DATABASE_URL:''}}});
