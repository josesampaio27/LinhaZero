-- "Pedir acesso" on the landing (docs/decisoes/0062): one row per request; an admin approves it in the app, which
-- creates the Keycloak account and emails the invite. Runs once on an empty volume; for an existing one:
--   docker compose cp infra/db/003_access_requests.sql postgres:/tmp/ && docker compose exec postgres psql -U dois -d dois -f /tmp/003_access_requests.sql

create table if not exists access_requests (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  email             text not null,
  organization      text not null,
  organization_type text not null,
  message           text,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at        timestamptz not null default now(),
  decided_at        timestamptz,
  decided_by        uuid references users (id),
  keycloak_user_id  text
);

create index if not exists access_requests_pending on access_requests (created_at) where status = 'pending';
