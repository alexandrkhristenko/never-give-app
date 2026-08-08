import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// See vitest.config.mts for why `server-only` needs an alias.
const serverOnlyStub = fileURLToPath(
  new URL('node_modules/server-only/empty.js', import.meta.url),
)

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: { 'server-only': serverOnlyStub },
  },
  test: {
    environment: 'node',
    include: ['db/**/*.test.ts'],
    // One shared database and one shared profile row: these must not overlap.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
