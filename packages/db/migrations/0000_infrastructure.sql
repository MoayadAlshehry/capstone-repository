CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION capstone_migrator;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS jobs AUTHORIZATION capstone_migrator;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app, jobs FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO capstone_runtime;
--> statement-breakpoint
GRANT USAGE ON SCHEMA jobs TO capstone_jobs;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE capstone_migrator IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO capstone_runtime;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE capstone_migrator IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO capstone_runtime;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE capstone_migrator IN SCHEMA jobs GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO capstone_jobs;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE capstone_migrator IN SCHEMA jobs GRANT USAGE, SELECT ON SEQUENCES TO capstone_jobs;
--> statement-breakpoint
GRANT USAGE ON SCHEMA drizzle TO capstone_runtime;
--> statement-breakpoint
GRANT SELECT ON TABLE drizzle.__drizzle_migrations TO capstone_runtime;
