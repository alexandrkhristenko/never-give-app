-- Onboarding was broken for every user.
--
-- Migration 0002 narrowed `grant insert` on `public.users` to the four columns
-- onboarding writes, to stop a caller seeding `is_premium` or a full freeze
-- balance for themselves. That intent is right, but the grant is the wrong
-- instrument: Drizzle names every column of the table in its INSERT and lets
-- Postgres apply the defaults, and Postgres checks column privileges for every
-- column *named*, not every column given a value. So the insert was refused
-- with `permission denied for table users`, and nobody could finish signing up.
--
-- The fix separates the two concerns. The grant decides which columns may be
-- named; the row policy decides what values they may hold. Naming a reserved
-- column is allowed again, but only at its default — so the escalation 0002
-- closed stays closed, and onboarding works.

grant insert (
  id,
  email,
  username,
  timezone,
  avatar_level,
  total_score,
  streak_freezes_balance,
  is_premium,
  created_at
) on table "users" to authenticated;

drop policy if exists "users_insert_own" on "users";

create policy "users_insert_own"
  on "users" for insert
  to authenticated
  with check (
    (select auth.uid()) = id
    -- Reserved roadmap fields must start where the schema says they start. A
    -- user granting themselves premium, a score or three freezes at signup is
    -- what this clause exists to prevent.
    and avatar_level = 1
    and total_score = 0
    and streak_freezes_balance = 0
    and is_premium = false
  );
