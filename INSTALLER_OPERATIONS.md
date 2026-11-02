# Owned local operation and retention

Run Node, pnpm and application commands inside WSL from the extracted Linux root, using the pinned Linux runtime. Windows Node against a UNC path is unsupported. The kit verifies WSL Ubuntu/Linux-amd64, Node 24.21.0, pnpm 11.28.3, Docker Linux/Compose and resource guards. These guards are preflight checks; measured minimum hardware requirements require a separate workload study.

`.local/installation.json` is the private instance journal. Database credentials, runtime settings, account-message capture and original storage stay under `.local`; derived AI data uses a private directory outside the source tree. Use this installation’s generated settings and the documented model/provider configuration. Ownership, path, listener and codec checks protect the selected instance and its existing data.

`install.sh --resume` retains completed stages. Optional Demo uses its own resumable journal and cannot open the app before completion. Concurrent installers are refused. `stop.sh` and `uninstall.sh` stop only verified owned processes/containers and retain data; there is no purge. `start.sh` verifies the codec and enabled model readiness before starting services; `doctor.sh` checks owned readiness and actual authenticated reads. Maintain the private administrator handoff record; the supported hidden-password handoff uses the normal API and verifies old-secret denial/new login.

Maintain consistent backups in addition to the data retained by stop/resume. Stop owned application writers and capture a PostgreSQL logical backup together with the matching originals and private configuration, credential and encryption-key set. Protect that material from disclosure. Test restoration only on a separately owned blank database/storage target; keep production and existing user installations outside the test. Record executed restoration evidence separately from the procedure itself.

Local readiness covers the documented WSL/Docker environment and loopback services. Post-reboot supervision, public TLS/DNS, other host combinations and external-inbox delivery require their own configuration and verification. The kit leaves host adapters, WSL/Docker networking, DNS, VPN, firewall and existing deployments unchanged. Keep credentials, cookies, one-use links, OTPs, private originals and dumps out of shared diagnostics.

The Windows free-commit measurement has one bounded retry for a transient WSL helper failure, before installation data changes. A valid measurement below the existing minimum stops immediately. If both helper attempts fail, `WINDOWS_COMMIT_MEASUREMENT_UNAVAILABLE` stops setup; no guard is skipped and no host/WSL/network configuration is changed.

## Recovering after a local service interruption

Run `bash scripts/start.sh` from the same extracted installation, then `bash scripts/doctor.sh`. Enabled models must be available for guarded startup. These commands reuse the existing owned resources; a missing expected database or volume is a reason to stop and investigate, not to initialize replacement data.

A lost Web response does not prove that a save failed: the database may have committed it. Use the displayed receipt/status check before retrying. When the page retains the original request, use its same-request retry. After a full refresh, inspect the server's saved state before entering another change.

If the database becomes unavailable, a protected workspace may close because authorization cannot be confirmed. After readiness is restored, sign in and reopen the saved task. Server-saved drafts and completed records are distinct from unsaved text in a browser document. Check the current record before finalizing again.

When Worker is stopped, committed job and allocation events remain queued. Restart the owned service and check readiness; queued work resumes through the existing policy. Do not create manual assignments to bypass an unavailable worker.
