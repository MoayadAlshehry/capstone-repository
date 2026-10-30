#!/bin/sh
set -eu
# Infrastructure credentials are mounted files, never command-line arguments.
MIGRATION_PASSWORD="$(cat /run/capstone-secrets/migration_password)"
RUNTIME_PASSWORD="$(cat /run/capstone-secrets/runtime_password)"
JOBS_PASSWORD="$(cat /run/capstone-secrets/jobs_password)"
test -n "$MIGRATION_PASSWORD" && test -n "$RUNTIME_PASSWORD" && test -n "$JOBS_PASSWORD"
export MIGRATION_PASSWORD RUNTIME_PASSWORD JOBS_PASSWORD
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
\getenv migration_password MIGRATION_PASSWORD
\getenv runtime_password RUNTIME_PASSWORD
\getenv jobs_password JOBS_PASSWORD
CREATE ROLE capstone_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'migration_password';
CREATE ROLE capstone_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'runtime_password';
CREATE ROLE capstone_jobs LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'jobs_password';
REVOKE ALL ON DATABASE capstone_local FROM PUBLIC;
GRANT CONNECT, CREATE ON DATABASE capstone_local TO capstone_migrator;
GRANT CONNECT ON DATABASE capstone_local TO capstone_runtime, capstone_jobs;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO capstone_migrator;
ALTER ROLE capstone_runtime SET search_path = app, public;
ALTER ROLE capstone_jobs SET search_path = jobs, public;
SQL
unset MIGRATION_PASSWORD RUNTIME_PASSWORD JOBS_PASSWORD
