-- Everything the settings screen needs that the database did not already allow.
--
-- Two changes, opposite in direction: one narrows what a user may write, the
-- other grants a power they had no way to exercise at all.

--------------------------------------------------------------------------------
-- promises: narrow UPDATE to the two columns a person actually edits
--------------------------------------------------------------------------------
-- `grant insert, update on table promises` in 0001 covered every column,
-- because at the time nothing updated a promise and the grant was never
-- exercised. The settings screen exercises it. Under the table-wide grant an
-- edit request could also carry `status`, `cadence`, `cadence_count` or
-- `created_at` — the row policy checks ownership, not which columns changed,
-- so it would let all of them through.
--
-- This is the same correction 0002 made for users' INSERT, and it comes with
-- the lesson 0003 taught about that one: Postgres checks column privileges for
-- every column *named* in the statement. That broke the narrowed INSERT
-- because Drizzle names every column when inserting. UPDATE is not affected —
-- `.set({...})` names only what it is given — so the narrow grant is safe
-- here. A test drives a real update through the authenticated role to prove
-- that claim rather than trusting it.
--
-- `updated_at` stays out of the grant deliberately. It is written by the
-- `promises_touch_updated_at` trigger from 0005, and a BEFORE trigger
-- assigning to NEW is not a privilege check point — the caller never names the
-- column. Granting it would hand the client the ability to forge a freshness
-- timestamp, which is the one thing the trigger exists to prevent.

revoke update on table "promises" from authenticated;
grant update (title, visibility) on table "promises" to authenticated;

--------------------------------------------------------------------------------
-- Account deletion
--------------------------------------------------------------------------------
-- Deleting `public.users` alone would not delete the account: the row in
-- `auth.users` would survive, holding the email address hostage. The person
-- could neither sign in to anything nor register again with that address.
--
-- The cascade runs the other way. `users_id_auth_users_id_fk` (0001) points
-- `public.users` at `auth.users` with `on delete cascade`, and promises,
-- checkins, streak_freezes and followers cascade from there. So removing the
-- one row in `auth.users` removes everything.
--
-- No role the application runs as can do that, and none should be able to:
-- `auth.users` is owned by `supabase_auth_admin`, and handing the app's
-- runtime a key that reaches it would undo the reason RLS is here at all.
-- A `security definer` function is the narrow exception — it borrows the
-- owner's rights for exactly one statement.
--
-- What keeps that exception narrow:
--
--   * No parameters. There is no argument to point it at another account;
--     the target comes from the verified JWT and nowhere else.
--   * `set search_path = ''` — mandatory for `security definer`. Without it a
--     caller who can create objects could shadow `auth.users` and have the
--     function delete something else with the owner's rights. Everything below
--     is schema-qualified because of it.
--   * Execute revoked from `public` and `anon`. An anonymous caller has no
--     `sub` claim, so the predicate would match no rows anyway — but a
--     function that deletes accounts should not merely *happen* to be safe
--     when called by strangers.

create or replace function public.delete_own_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
