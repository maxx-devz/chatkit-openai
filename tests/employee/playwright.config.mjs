import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: './browser', outputDir: '../../test-results', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:3100', channel: 'chrome', headless: true },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev tests/employee/ui -H 127.0.0.1 -p 3100',
    cwd: fileURLToPath(new URL('../../', import.meta.url)), url: 'http://127.0.0.1:3100',
    reuseExistingServer: false, timeout: 90000,
  },
});
