import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env.test.local', override: true })

export default defineConfig({
  testDir: './e2e',
  // Every test creates its own user, but they share one Supabase project.
  // Serial execution keeps failures readable.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Tests run against a production build, the way the app actually ships.
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
