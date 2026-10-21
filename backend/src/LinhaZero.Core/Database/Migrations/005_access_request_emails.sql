-- Email to every admin on each "Pedir acesso" (docs/decisoes/0067). Applied by the API on start (docs/decisoes/0065).

-- Who has the linhazero-admin role, as of their last login: the recipients (the API can't list Keycloak roles).
alter table users add column if not exists is_admin boolean not null default false;

-- When the admins were told about a request, and to how many of them: the daily email budget is the sum of
-- notified_count over today's notified_at.
alter table access_requests add column if not exists notified_at timestamptz;
alter table access_requests add column if not exists notified_count int not null default 0;
