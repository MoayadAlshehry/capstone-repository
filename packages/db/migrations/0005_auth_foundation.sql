-- Custom SQL migration file, put your code below! --
-- Phase09 technical Better Auth fields map to the existing authoritative identity.
ALTER TABLE app.users ADD COLUMN auth_email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE app.users ADD COLUMN auth_image text;
--> statement-breakpoint
CREATE TABLE app.auth_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
 account_id text NOT NULL, provider_id text NOT NULL CHECK(provider_id='credential'), password text NOT NULL,
 access_token text, refresh_token text, id_token text, scope text,
 access_token_expires_at timestamptz(3), refresh_token_expires_at timestamptz(3),
 created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(provider_id,account_id), UNIQUE(user_id,provider_id), CHECK(account_id=user_id::text),
 CHECK(access_token IS NULL AND refresh_token IS NULL AND id_token IS NULL AND scope IS NULL)
);
CREATE TABLE app.auth_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
 token text NOT NULL UNIQUE CHECK(length(token)>=32), expires_at timestamptz(3) NOT NULL,
 ip_address text, user_agent text, created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user ON app.auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry ON app.auth_sessions(expires_at);
CREATE TABLE app.auth_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), identifier text NOT NULL, value text NOT NULL,
 expires_at timestamptz(3) NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX auth_verifications_identifier ON app.auth_verifications(identifier);
--> statement-breakpoint
REVOKE ALL ON app.auth_accounts,app.auth_sessions,app.auth_verifications FROM PUBLIC,capstone_jobs;
GRANT SELECT ON app.auth_accounts TO capstone_runtime;
GRANT UPDATE(password,updated_at) ON app.auth_accounts TO capstone_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.auth_sessions,app.auth_verifications TO capstone_runtime;
GRANT UPDATE(locale) ON app.users TO capstone_runtime;
-- Identity/role/tenant/status/profile governance writes remain forbidden to runtime.
