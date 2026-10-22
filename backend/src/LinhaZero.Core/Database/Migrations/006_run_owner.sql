-- The simulation history (docs/decisoes/0073): who started each run, so each person lists their own. Applied by the API
-- on start (docs/decisoes/0065). Older rows keep a null owner and are not listed (they also lack the drawn scenario).

alter table runs add column if not exists user_id uuid references users (id);

create index if not exists runs_user_created on runs (user_id, created_at desc);
