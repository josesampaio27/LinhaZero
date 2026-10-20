#!/bin/sh
# Keycloak's own database and role, next to the app's (runs once, on an empty volume, before 001_init.sql).
# The password comes from KEYCLOAK_DB_PASSWORD, set on the postgres service. For an existing volume, see infra/README.md.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v pw="$KEYCLOAK_DB_PASSWORD" <<'SQL'
create role keycloak login password :'pw';
create database keycloak owner keycloak;
SQL
