-- Loads the recorded demo seed (newest snapshot per source and key, without ids) into the compose Postgres.
-- Run with: docker compose -f infra/docker-compose.yml --profile demo run --rm demo-seed
\copy snapshots(source, key, fetched_at, body, url) from '/demo/snapshots.csv' csv header
select source, key, fetched_at, length(body::text) as bytes from snapshots order by source, key, fetched_at desc;
