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

/**
 * `POSTGRES_URL` is not an alias anyone invented here: it is the name Vercel's
 * Supabase integration writes the pooled connection string under. A project set
 * up that way already has the value and still reports the variable as missing,
 * which is a confusing way to be broken over a difference in spelling.
 *
 * Order matters. `DATABASE_URL` wins, so an explicitly set variable is never
 * quietly overruled by one the platform put there. Deliberately absent:
 * `POSTGRES_URL_NON_POOLING`, which the same integration sets to the direct
 * connection — unreachable from Vercel over IPv4, and wrong for serverless even
 * where it resolves.
 */
const SOURCES = ['DATABASE_URL', 'POSTGRES_URL'] as const;

function connect() {
  const name = SOURCES.find((key) => process.env[key]);

  if (!name) {
    throw new Error(
      `Neither ${SOURCES.join(' nor ')} is set. Every page and every action ` +
        'needs one of them; see docs/architecture.md §9.',
    );
  }

  const connectionString = process.env[name]!;

  // Disable prefetch as it is not supported for "Transaction" pool mode (often
  // used with Supabase/Neon connection poolers)
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

export function database() {
  return (handle ??= connect());
}
