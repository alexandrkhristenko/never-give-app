-- `promises.updated_at` was set once at insert and never touched again, so a
-- column whose name promises freshness held the creation time forever. Two ways
-- out: delete it, or make it true. Editing a promise is a planned feature — the
-- settings screen named throughout the docs — so it is kept and made true.
--
-- A trigger rather than application code on purpose: the column would otherwise
-- be correct only at the call sites that remember it, and the first one to
-- forget would reintroduce exactly this.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
-- No search_path dependency and no elevated rights: it only rewrites the row
-- already being written.
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists promises_touch_updated_at on public.promises;

create trigger promises_touch_updated_at
  before update on public.promises
  for each row
  execute function public.touch_updated_at();
