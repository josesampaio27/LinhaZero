-- The login (docs/decisoes/0061): who signed in, and the keys that encrypt the session cookie.
-- Runs once on an empty volume; for an existing one: docker compose exec -T postgres psql -U dois -d dois < infra/db/002_users.sql

create table if not exists users (           -- created on the first login; identified by the Keycloak issuer + subject
  id            uuid primary key default gen_random_uuid(),
  issuer        text not null,
  subject       text not null,
  email         text,
  name          text not null,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  unique (issuer, subject)
);

create table if not exists data_protection_keys (  -- ASP.NET Data Protection key ring, shared by every API replica
  id         text primary key,
  xml        text not null,
  created_at timestamptz not null default now()
);
