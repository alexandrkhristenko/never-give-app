import { pgTable, uuid, varchar, timestamp, integer, boolean, text, date, primaryKey, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  timezone: varchar('timezone', { length: 255 }).notNull().default('UTC'),
  avatar_level: integer('avatar_level').notNull().default(1),
  total_score: integer('total_score').notNull().default(0),
  streak_freezes_balance: integer('streak_freezes_balance').notNull().default(0),
  is_premium: boolean('is_premium').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const promises = pgTable('promises', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  visibility: varchar('visibility', { length: 50 }).notNull().default('public'), // 'public', 'unlisted', 'private'
  cadence: varchar('cadence', { length: 50 }).notNull().default('daily'), // 'daily', 'weekly'
  cadence_count: integer('cadence_count').notNull().default(1),
  status: varchar('status', { length: 50 }).notNull().default('active'), // 'active', 'archived', 'failed'
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const checkins = pgTable('checkins', {
  id: uuid('id').primaryKey().defaultRandom(),
  promise_id: uuid('promise_id').notNull().references(() => promises.id, { onDelete: 'cascade' }),
  local_date: date('local_date').notNull(), // 'YYYY-MM-DD' in user's timezone
  note: text('note'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    uq: unique('checkin_promise_date_unique').on(table.promise_id, table.local_date), // Prevent double check-ins
  };
});

export const followers = pgTable('followers', {
  follower_id: uuid('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  following_id: uuid('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.follower_id, table.following_id] }),
  };
});
