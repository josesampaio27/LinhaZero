-- "Reportar problema ou sugestão" in the app (docs/decisoes/0066): one row per report from a signed-in user; admins
-- read them on #/feedback and close them. Applied by the API on start (docs/decisoes/0065).

create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id),
  kind        text not null check (kind in ('bug', 'suggestion', 'other')),
  message     text not null,
  may_contact boolean not null default false,
  context     jsonb not null default '{}',   -- page, scenario, app version, browser: filled in by the web
  status      text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  closed_by   uuid references users (id)
);

create index if not exists feedback_open on feedback (created_at) where status = 'open';
