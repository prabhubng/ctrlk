import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/integration',
  timeout: 15000,
  retries: 1,
  use: {
    headless: true,
    viewport: { width: 1400, height: 900 },
    actionTimeout: 5000,
  },
  webServer: {
    command: 'npx serve website -l 3456 --no-clipboard',
    port: 3456,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
