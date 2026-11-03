import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const useExternalServers = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://ttt:ttt@127.0.0.1:5432/ttt';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: executablePath ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
    },
  },
  webServer: useExternalServers
    ? undefined
    : [
        {
          command: 'pnpm --filter @ttt/server dev',
          url: 'http://127.0.0.1:3000/api/health/live',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            SESSION_SECRET: process.env.SESSION_SECRET ?? 'e2e-session-secret-change-me-32-chars',
            TURN_SECONDS: process.env.TURN_SECONDS ?? '60',
            SOCKET_PING_INTERVAL_MS: process.env.SOCKET_PING_INTERVAL_MS ?? '3000',
            SOCKET_PING_TIMEOUT_MS: process.env.SOCKET_PING_TIMEOUT_MS ?? '3000',
            RATE_LIMIT_ENABLED: 'false',
          },
        },
        {
          command: 'pnpm --filter @ttt/web dev --host 127.0.0.1 --port 5173',
          url: 'http://127.0.0.1:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
