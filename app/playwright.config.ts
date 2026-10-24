import { defineConfig, devices } from '@playwright/test';

/** Opens the built ../index.html in a real Chromium. Run `npm run build` first. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
    // software WebGL so the 3D brain also draws on machines without a GPU (GitHub's runners)
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
});
