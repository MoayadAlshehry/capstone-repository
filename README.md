# Capstone Repository

The complete bilingual application and self-hosted installation source are here. The public-release goal is a viewable repository with a working visitor evaluation installer. **Receiving this tree or finding it online is not proof that a release or its evaluation permission has been approved.** Check the rights-holder approval record for the exact release manifest and permission-document hash. Until that approval exists, this is an unapproved candidate and users need separate authorization. Public source viewability and permission to run are separate.

Original first-party source and branding remain **No License / All Rights Reserved**. The optional EVAL-1 proposal is nonoperative until expressly approved; it would permit personal noncommercial local download/build/run with limited build-only adaptations, while reserving ownership and broader redistribution/commercial rights. It is not an open-source license. Upstream dependencies/assets keep their own terms. See RIGHTS.md, PUBLIC_EVALUATION_PERMISSION_PROPOSAL.md and THIRD_PARTY_NOTICES.md.

## Supported clean installation

Verified baseline: Windows11 with WSL2Ubuntu, Linux-amd64 Node24.21.0, Corepack/pnpm11.28.3, Python3, DockerDesktop Linux engine and DockerCompose. Install those prerequisites yourself from official sources. The scripts never install/restart Docker, reconfigure Windows/WSL networking, issue a domain/certificate or touch an existing deployment. Hardware minima are unverified; the memory/disk/commit checks are execution guards only.

After verifying your permission and the trusted release checksums, extract the complete source into a NEW Linux directory. Inspect scripts before running; do not use `curl | bash`, a moving `main` URL, a serving checkout or an existing `.local` data directory.

```sh
bash scripts/install.sh --yes --admin-email local.admin@capstone.local
bash scripts/credentials.sh
bash scripts/doctor.sh
```

Installation creates a clean owned database/roles/secrets, applies current migrations, builds Web/Upload/Worker, starts loopback services and verifies all3health endpoints plus real admin login and a permitted read. It prints the actual web and Mailpit URLs. The initial administrator secret is randomly generated in a0600private file and never printed. The hidden-entry credentials procedure uses the normal authenticated password-change API, retires the initial secret and verifies the new login; it is not server-enforced first-login rotation. Use the chosen password and synthetic admin identity to sign in.

The supported v1 default is CLEAN, AI disabled, local account-mail capture and a localhost-only Mailpit sink for synthetic committee invitations/OTP. Use synthetic `.local` accounts during evaluation. Mailpit captures mail locally; it is not an external provider. Routine notifications remain in-app. Actual current scoring/publication/permissions are preserved; these are not official course grades.

## Optional flags and limits

`--ai` and `--demo` return **NOT_SUPPORTED_YET** before changing state. They do not pretend to enable a feature. No model download/start or canonical private Demo operation is performed. The v1 implementation is CLEAN-only; enabling these optional modes requires separate implementation and verification, not merely a model already running. Source model contracts remain documented in OPTIONAL_MODES.md; real inference is NOT_VERIFIED. Real Zoho/ZeptoMail inbox delivery, public TLS/DNS hosting, arbitrary OS support, HA and post-reboot supervision are not established by the local clean profile.

## Repeat, resume and retain data

```sh
bash scripts/install.sh --yes --resume --admin-email local.admin@capstone.local
bash scripts/status.sh
bash scripts/stop.sh
bash scripts/start.sh
bash scripts/uninstall.sh
```

Completed stages are journaled and not replayed as resets. Unknown state/foreign labels, nonowned DB targets, symlinks, unsafe permissions and collisions are refused. Stop/uninstall affect only verified owned resources and retain database, originals and private configuration/cache. There is no purge command. Account capture files contain single-use secrets; keep `.local` private. Do not paste production configuration into an evaluation instance.

Dependencies remain pinned in the lockfile. The FFmpeg installer downloads the upstream executable; its exact approved Linux-amd64 bytes and license are checked against third_party/binary-fingerprints.json. An altered download fails before use. This source ZIP contains no codec executable or node_modules; source-only fetching does not waive upstream obligations.

The release target is `MoayadAlshehry/capstone-repository`, with intended version tag `v1.0.0`. These identifiers are not proof of publication or permission activation: check the actual release, its checksums and its approval record. The approval packet defines the immutable source/hash plan. A pinned public download/install command must be verified after authorized publication; do not substitute a moving `main` URL. Publishing this source does not deploy or modify the separate production application.
