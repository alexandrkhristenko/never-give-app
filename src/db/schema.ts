import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  boolean,
  text,
  date,
  primaryKey,
  unique,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  // Always equal to auth.users.id. Every RLS policy compares it to auth.uid().
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  timezone: varchar('timezone', { length: 255 }).notNull().default('UTC'),
  avatar_level: integer('avatar_level').notNull().default(1),
  total_score: integer('total_score').notNull().default(0),
  streak_freezes_balance: integer('streak_freezes_balance').notNull().default(0),
  is_premium: boolean('is_premium').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  // Usernames are compared case-insensitively: Player1 and player1 collide.
  uniqueIndex('users_username_lower_idx').on(sql`lower(${table.username})`),
  check(
    'users_freeze_balance_range',
    sql`${table.streak_freezes_balance} between 0 and 3`,
  ),
]);

export const promises = pgTable('promises', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // 80 characters is what the pixel font fits on a 320px screen without
  // wrecking the layout. See the frontend design spec, section 5.3.
  title: varchar('title', { length: 80 }).notNull(),
  visibility: varchar('visibility', { length: 50 }).notNull().default('public'), // 'public', 'unlisted', 'private'
  cadence: varchar('cadence', { length: 50 }).notNull().default('daily'), // reserved: 'daily', 'weekly'
  cadence_count: integer('cadence_count').notNull().default(1), // reserved
  status: varchar('status', { length: 50 }).notNull().default('active'), // reserved: 'active', 'archived', 'failed'
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  // RLS policies filter by owner on every read; without this they seq-scan.
  index('promises_user_id_idx').on(table.user_id),
]);

export const checkins = pgTable('checkins', {
  id: uuid('id').primaryKey().defaultRandom(),
  promise_id: uuid('promise_id').notNull().references(() => promises.id, { onDelete: 'cascade' }),
  local_date: date('local_date').notNull(), // 'YYYY-MM-DD' in the user's timezone
  note: text('note'), // reserved
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  // One check-in per day, and a covering index for lookups by promise.
  unique('checkin_promise_date_unique').on(table.promise_id, table.local_date),
]);

/**
 * Ledger of spent streak freezes. Without it lazy spending is not idempotent:
 * every dashboard load would re-detect the same gap and burn another freeze.
 */
export const streak_freezes = pgTable('streak_freezes', {
  id: uuid('id').primaryKey().defaultRandom(),
  promise_id: uuid('promise_id').notNull().references(() => promises.id, { onDelete: 'cascade' }),
  local_date: date('local_date').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  unique('streak_freeze_promise_date_unique').on(table.promise_id, table.local_date),
]);

/** Reserved. No policies are defined, so RLS denies every role. */
export const followers = pgTable('followers', {
  follower_id: uuid('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  following_id: uuid('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.follower_id, table.following_id] }),
]);
