import { defineConfig } from '@playwright/test';

const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  use: { baseURL: remote ?? 'http://localhost:3000' },
  webServer: remote
    ? undefined
    : { command: 'pnpm build && pnpm start', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 180_000 },
});
