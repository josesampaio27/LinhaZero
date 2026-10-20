#!/bin/sh
# Keycloak's own database and role, next to the app's (runs once, on an empty volume, before 001_init.sql).
# The password comes from KEYCLOAK_DB_PASSWORD, set on the postgres service. Safe to run again: it only creates what is
# missing (README.md, "Primeira vez", step 3).
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v pw="$KEYCLOAK_DB_PASSWORD" <<'SQL'
select format('create role keycloak login password %L', :'pw') where not exists (select from pg_roles where rolname = 'keycloak')\gexec
select 'create database keycloak owner keycloak' where not exists (select from pg_database where datname = 'keycloak')\gexec
SQL
