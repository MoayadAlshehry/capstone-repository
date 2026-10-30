-- Clock returns JavaScript Date instants. Preserve exact round-trips and expiry equality.
ALTER TABLE app.access_grants ALTER COLUMN granted_at TYPE timestamptz(3), ALTER COLUMN expires_at TYPE timestamptz(3), ALTER COLUMN revoked_at TYPE timestamptz(3);
