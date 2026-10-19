-- Applied once by the postgres image when the pgdata volume is empty. A schema change means `npm run down -- -v`.

create table snapshots (
  id          bigserial primary key,
  source      text        not null,   -- 'ipma-observations', 'open-meteo', 'fogos-active', ...
  key         text        not null,   -- '' for national files; the domain (grid) name for open-meteo
  fetched_at  timestamptz not null,
  body        jsonb       not null,   -- upstream body (jsonb normalises whitespace and key order; fine for the parsers)
  url         text        not null    -- never contains the fogos key
);
create index on snapshots (source, key, fetched_at desc);

create table source_status (          -- the last attempt per (source, key), for "stale" and backoff
  source text not null, key text not null,
  last_attempt_at timestamptz, last_ok_at timestamptz, last_error text, retry_after timestamptz,
  primary key (source, key)
);

create table runs (
  id          uuid primary key,
  status      text not null check (status in ('queued','running','done','failed')),
  created_at  timestamptz not null default now(),
  started_at  timestamptz, finished_at timestamptz,
  request     jsonb not null,           -- the run-request contract, including grid name and seed
  grid_hash   text,                     -- hashGrid of the grid the worker loaded: sha256 of header (canonical JSON) + layers (audit)
  progress    int not null default 0,   -- decisions done: 0, 1 or 2
  result      jsonb,                    -- the run-result contract without the rasters
  error       text,
  attempts    int not null default 0,   -- deliveries started by workers
  worker      text                      -- HOSTNAME of the worker that finished it
);

create table run_rasters (
  run_id   uuid not null references runs(id) on delete cascade,
  decision char(1) not null check (decision in ('A','B')),
  layer    text not null check (layer in ('arrival','probability')),
  data     bytea not null,              -- little-endian Float32, rows*cols*4 bytes
  primary key (run_id, decision, layer)
);
