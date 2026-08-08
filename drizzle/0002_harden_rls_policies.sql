-- Fix round 1 review findings for never-give.app RLS.
--
-- 1. Visibility predicates change from "not private" (fails open on any
--    unvalidated value, since promises.visibility is a free-text varchar)
--    to an explicit allow-list, and a CHECK constraint now enforces that
--    promises.visibility can only ever be one of the three known values.
-- 2. users' INSERT grant is narrowed from the whole table to exactly the
--    four columns onboarding writes, so a caller cannot self-assign
--    is_premium, total_score or streak_freezes_balance at signup.
-- 3. users' SELECT grant for `authenticated` drops total_score and
--    is_premium: both are reserved/unused columns and the row policy is
--    `using (true)`, so leaving them selectable let any logged-in user
--    read every other user's values.
--
-- Every rule from 0001 still applies: role in TO, never auth.role(),
-- auth.uid() wrapped as (select auth.uid()), TO authenticated always paired
-- with an ownership predicate. Policy drops use IF EXISTS so this file is
-- safe to replay.

--------------------------------------------------------------------------------
-- promises: visibility becomes an explicit allow-list, not a deny-list
--------------------------------------------------------------------------------

alter table "promises"
  add constraint "promises_visibility_check"
  check (visibility in ('public', 'unlisted', 'private'));

drop policy if exists "promises_select_public" on "promises";
create policy "promises_select_public" on "promises"
  for select to anon
  using (visibility in ('public', 'unlisted'));

drop policy if exists "promises_select_visible_or_own" on "promises";
create policy "promises_select_visible_or_own" on "promises"
  for select to authenticated
  using (visibility in ('public', 'unlisted') or (select auth.uid()) = user_id);

--------------------------------------------------------------------------------
-- checkins: same allow-list, reached through the parent promise
--------------------------------------------------------------------------------

drop policy if exists "checkins_select_public" on "checkins";
create policy "checkins_select_public" on "checkins"
  for select to anon
  using (exists (
    select 1 from "promises" p
    where p.id = "checkins".promise_id
      and p.visibility in ('public', 'unlisted')
  ));

drop policy if exists "checkins_select_visible_or_own" on "checkins";
create policy "checkins_select_visible_or_own" on "checkins"
  for select to authenticated
  using (exists (
    select 1 from "promises" p
    where p.id = "checkins".promise_id
      and (p.visibility in ('public', 'unlisted') or p.user_id = (select auth.uid()))
  ));

--------------------------------------------------------------------------------
-- streak_freezes: same allow-list, reached through the parent promise
--------------------------------------------------------------------------------

drop policy if exists "streak_freezes_select_public" on "streak_freezes";
create policy "streak_freezes_select_public" on "streak_freezes"
  for select to anon
  using (exists (
    select 1 from "promises" p
    where p.id = "streak_freezes".promise_id
      and p.visibility in ('public', 'unlisted')
  ));

drop policy if exists "streak_freezes_select_visible_or_own" on "streak_freezes";
create policy "streak_freezes_select_visible_or_own" on "streak_freezes"
  for select to authenticated
  using (exists (
    select 1 from "promises" p
    where p.id = "streak_freezes".promise_id
      and (p.visibility in ('public', 'unlisted') or p.user_id = (select auth.uid()))
  ));

--------------------------------------------------------------------------------
-- users: narrow INSERT to the four onboarding columns, drop SELECT on the
-- two reserved columns that let one user read another's account state.
--
-- The UPDATE grant on streak_freezes_balance is intentionally left as-is: a
-- later task's data-access layer updates that column under the
-- authenticated role when spending and earning freezes.
--------------------------------------------------------------------------------

revoke insert on table "users" from authenticated;
grant insert (id, email, username, timezone) on table "users" to authenticated;

revoke select (total_score, is_premium) on table "users" from authenticated;
