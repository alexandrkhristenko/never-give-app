import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // Next.js typically uses .env.local

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // Supabase owns `auth`, `storage` and friends. Only manage our own schema.
  schemaFilter: ['public'],
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
});
