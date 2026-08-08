import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// `server-only` exports two builds keyed on the `react-server` condition: an
// empty module for the server, and one that throws on import everywhere else.
// Vitest does not set that condition, so without this every Data Access Layer
// module would be untestable. The package does not expose the subpath, so the
// alias points at the file — which is what the condition would have selected.
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
    // Unit tests only. Anything that talks to a database lives under `db/` and
    // runs via `npm run test:db`, because it needs DATABASE_URL and a network.
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'db/**'],
  },
})
