-- The assistant (docs/decisoes/0079): the tokens and cost of every response, so each user's daily limit can be
-- checked and the real cost per conversation measured. Applied by the API on start (docs/decisoes/0065).

create table if not exists assistant_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  model text not null,
  input_tokens integer not null,
  cache_write_tokens integer not null,
  cache_read_tokens integer not null,
  output_tokens integer not null,
  cost_usd numeric(12, 6) not null,
  created_at timestamptz not null default now()
);

create index if not exists assistant_usage_user_created on assistant_usage (user_id, created_at desc);
