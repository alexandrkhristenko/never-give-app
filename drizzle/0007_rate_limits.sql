-- Rate limiting, and a schema to keep it out of reach.
--
--------------------------------------------------------------------------------
-- Why a separate schema
--------------------------------------------------------------------------------
-- Supabase publishes the `public` schema through PostgREST, so every function
-- there is also an HTTP endpoint at /rest/v1/rpc/<name> for anyone holding the
-- anon key — which ships in the browser. That is fine for
-- `delete_own_account()`: reaching it needs the caller's own verified JWT, and
-- deleting your own account is something the interface offers anyway. It is
-- not fine for a rate limiter, whose entire job is to be the thing an attacker
-- cannot reach around. An endpoint that lets a caller spend any bucket they
-- can name is worse than no limiter, because the code above it will believe
-- it is protected.
--
-- PostgREST routes only the schemas it is configured to expose, so a function
-- in `private` is unreachable over HTTP regardless of its grants. `usage` on
-- the schema is still granted: the application connects to Postgres directly
-- as `anon`/`authenticated` and has to be able to call it.
--
-- `delete_own_account()` moves here too. Its exposure was not an escalation,
-- but "not an escalation" is a weaker property than "not reachable", and the
-- move costs one line.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- No table grants at all. The counter is touched exclusively through the
-- `security definer` function below, which means a caller can spend their
-- budget and can neither read it, reset it, nor discover anybody else's.
create table if not exists private.rate_limits (
  bucket text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

create index if not exists rate_limits_window_start_idx
  on private.rate_limits (window_start);

--------------------------------------------------------------------------------
-- The counter
--------------------------------------------------------------------------------
-- A fixed window rather than a sliding one. A sliding window needs either a
-- row per request or a background job to age them out, and neither is worth
-- it here: the failure mode of a fixed window is that a caller gets up to
-- twice the limit across a boundary, which for these limits is nothing.
--
-- The increment is a single upsert on purpose. Read-then-write would let two
-- concurrent requests both read the same count and both decide they were
-- under the limit — the same shape of race that `SELECT ... FOR UPDATE` was
-- added to `lockFreezeBalance` to close. `on conflict do update` takes a row
-- lock, so the increments serialise.
--
-- Returns true when the call is allowed.

create or replace function private.rate_limit_hit(
  p_bucket text,
  p_limit integer,
  p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into private.rate_limits as rl (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set hits = case
                 when rl.window_start < now() - p_window then 1
                 else rl.hits + 1
               end,
        window_start = case
                         when rl.window_start < now() - p_window then now()
                         else rl.window_start
                       end
  returning rl.hits into v_hits;

  -- Opportunistic sweep. Buckets are keyed by address, so the table does not
  -- grow without bound within a window, but it would grow forever across
  -- them. Doing this on a small fraction of calls keeps the cost off the hot
  -- path without needing a scheduler the project does not have.
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

revoke all on function private.rate_limit_hit(text, integer, interval) from public;
grant execute on function private.rate_limit_hit(text, integer, interval)
  to anon, authenticated;

--------------------------------------------------------------------------------
-- Move delete_own_account out of the published schema
--------------------------------------------------------------------------------

create or replace function private.delete_own_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke all on function private.delete_own_account() from public;
grant execute on function private.delete_own_account() to authenticated;

drop function if exists public.delete_own_account();
