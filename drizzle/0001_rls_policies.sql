-- Row Level Security for never-give.app.
--
-- Rules applied throughout:
--   * the target role is named in TO, never checked via the deprecated auth.role()
--   * TO authenticated is always paired with an ownership predicate
--   * UPDATE carries both USING and WITH CHECK so user_id cannot be reassigned
--   * auth.uid() is wrapped in (select ...) so it evaluates once, not per row
--   * RLS filters rows, not columns, so `email` is closed off with column grants

--------------------------------------------------------------------------------
-- users
--------------------------------------------------------------------------------

alter table "users" enable row level security;

revoke all on table "users" from anon, authenticated;

-- `email` is granted to NOBODY for select. The row policy below is
-- `using (true)`, so any column readable here is readable for every user;
-- the app reads the address from the Supabase session instead.
grant select (id, username, timezone, avatar_level, created_at)
  on table "users" to anon;

grant select (id, username, timezone, avatar_level,
              total_score, streak_freezes_balance, is_premium, created_at)
  on table "users" to authenticated;

-- Insert covers every column, which is how `email` gets written at onboarding.
grant insert on table "users" to authenticated;
grant update (username, timezone, streak_freezes_balance)
  on table "users" to authenticated;

create policy "users_select_public" on "users"
  for select to anon, authenticated
  using (true);

create policy "users_insert_own" on "users"
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "users_update_own" on "users"
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

--------------------------------------------------------------------------------
-- promises
--------------------------------------------------------------------------------

alter table "promises" enable row level security;

revoke all on table "promises" from anon, authenticated;
grant select on table "promises" to anon, authenticated;
grant insert, update on table "promises" to authenticated;

create policy "promises_select_public" on "promises"
  for select to anon
  using (visibility <> 'private');

create policy "promises_select_visible_or_own" on "promises"
  for select to authenticated
  using (visibility <> 'private' or (select auth.uid()) = user_id);

create policy "promises_insert_own" on "promises"
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "promises_update_own" on "promises"
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

--------------------------------------------------------------------------------
-- checkins
--------------------------------------------------------------------------------

alter table "checkins" enable row level security;

revoke all on table "checkins" from anon, authenticated;
grant select on table "checkins" to anon, authenticated;
grant insert on table "checkins" to authenticated;

create policy "checkins_select_public" on "checkins"
  for select to anon
  using (exists (
    select 1 from "promises" p
    where p.id = "checkins".promise_id
      and p.visibility <> 'private'
  ));

create policy "checkins_select_visible_or_own" on "checkins"
  for select to authenticated
  using (exists (
    select 1 from "promises" p
    where p.id = "checkins".promise_id
      and (p.visibility <> 'private' or p.user_id = (select auth.uid()))
  ));

create policy "checkins_insert_own" on "checkins"
  for insert to authenticated
  with check (exists (
    select 1 from "promises" p
    where p.id = "checkins".promise_id
      and p.user_id = (select auth.uid())
  ));

--------------------------------------------------------------------------------
-- streak_freezes
--------------------------------------------------------------------------------

alter table "streak_freezes" enable row level security;

revoke all on table "streak_freezes" from anon, authenticated;
grant select on table "streak_freezes" to anon, authenticated;
grant insert on table "streak_freezes" to authenticated;

create policy "streak_freezes_select_public" on "streak_freezes"
  for select to anon
  using (exists (
    select 1 from "promises" p
    where p.id = "streak_freezes".promise_id
      and p.visibility <> 'private'
  ));

create policy "streak_freezes_select_visible_or_own" on "streak_freezes"
  for select to authenticated
  using (exists (
    select 1 from "promises" p
    where p.id = "streak_freezes".promise_id
      and (p.visibility <> 'private' or p.user_id = (select auth.uid()))
  ));

create policy "streak_freezes_insert_own" on "streak_freezes"
  for insert to authenticated
  with check (exists (
    select 1 from "promises" p
    where p.id = "streak_freezes".promise_id
      and p.user_id = (select auth.uid())
  ));

--------------------------------------------------------------------------------
-- followers
--------------------------------------------------------------------------------

-- Reserved for a future feature. RLS is on and no policy exists, so neither
-- anon nor authenticated can reach a single row. That is the intended default.
alter table "followers" enable row level security;
revoke all on table "followers" from anon, authenticated;

--------------------------------------------------------------------------------
-- Keep public.users tied to auth.users
--------------------------------------------------------------------------------

alter table "users"
  add constraint "users_id_auth_users_id_fk"
  foreign key (id) references auth.users (id) on delete cascade;
