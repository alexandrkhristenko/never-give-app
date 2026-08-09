import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * The database handle, built on first use rather than on import.
 *
 * Two reasons, and the second one cost a production outage to learn.
 *
 * Lazily, because `next build` runs without `DATABASE_URL` — the build needs to
 * compile pages, not query them — and a connection built at module scope would
 * make the variable a build-time requirement it is not.
 *
 * And with an explicit check, because the previous `process.env.DATABASE_URL ||
 * ''` was worse than no fallback. An empty connection string does not fail; it
 * makes postgres.js fall back to its own defaults and dial `127.0.0.1:5432`. So
 * a variable that was never set reported itself as `ECONNREFUSED` against
 * localhost — a network fault, in a place where the real fault was a missing
 * setting. The two need different fixes and looked identical in the log.
 */
let handle: ReturnType<typeof connect> | null = null;

function connect() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Every page and every action needs it; ' +
        'see docs/architecture.md §9.',
    );
  }

  // Disable prefetch as it is not supported for "Transaction" pool mode (often
  // used with Supabase/Neon connection poolers)
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

export function database() {
  return (handle ??= connect());
}
