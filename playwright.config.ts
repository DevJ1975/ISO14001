import { defineConfig, devices } from '@playwright/test';

/**
 * Opt-in browser E2E. NOT part of the gating CI (it needs browser binaries and
 * a running app + backend). To run locally:
 *   npx playwright install chromium
 *   npm run mongo:init && npm run api   # terminal 1 (backend on :4300)
 *   npm start                            # terminal 2 (app on :4200)
 *   npm run e2e
 * Or let Playwright start the dev server via the webServer block below.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:4200',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : {
        command: 'npm start',
        url: 'http://127.0.0.1:4200',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
      },
});
