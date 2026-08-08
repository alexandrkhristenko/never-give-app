-- `timestamp` without a zone is a wall-clock reading with no anchor. The driver
-- parses it in whatever zone the Node process happens to run in, so the same
-- row reads differently on a laptop and on a server. Nothing renders these
-- columns today — they are only ever ordered by, inside SQL — which is exactly
-- why this is cheap to fix now and a trap for the first feature that does.
--
-- The existing values were written by `now()` under UTC, so interpreting them
-- as UTC is lossless.

alter table "users"          alter column "created_at" type timestamptz using "created_at" at time zone 'UTC';
alter table "promises"       alter column "created_at" type timestamptz using "created_at" at time zone 'UTC';
alter table "promises"       alter column "updated_at" type timestamptz using "updated_at" at time zone 'UTC';
alter table "checkins"       alter column "created_at" type timestamptz using "created_at" at time zone 'UTC';
alter table "streak_freezes" alter column "created_at" type timestamptz using "created_at" at time zone 'UTC';
alter table "followers"      alter column "created_at" type timestamptz using "created_at" at time zone 'UTC';
