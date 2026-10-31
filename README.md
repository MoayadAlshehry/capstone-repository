# Capstone Repository

A bilingual English/Arabic capstone platform with public discovery, native files, student/lead workspaces, supervisor and independent assessments, event-driven reviewer allocation, exact-version partner grants, administration, audit and in-app notifications. AI Search uses published metadata; AI Brief uses title/abstract/keywords; Project Assistant reads only permitted Public originals. Existing scoring and authorization policies are unchanged.

Original first-party source and branding remain **No License / All Rights Reserved**. The exact EVAL-1 wording is approved, but its evaluation grant activates only for an expressly approved release manifest/tree and public release. Check the release approval record before downloading/building/running beyond independently applicable rights. EVAL-1 permits limited personal noncommercial local evaluation; it is not an open-source license. Third-party materials retain their own terms. See RIGHTS.md, PUBLIC_EVALUATION_PERMISSION_PROPOSAL.md and THIRD_PARTY_NOTICES.md.

## Install

Verified target: Windows 11, Ubuntu WSL2/Linux-amd64, Docker Desktop Linux integration/Compose, Linux Node 24.21.0, Corepack/pnpm 11.28.3 and Python3. Host prerequisites and model weights are supplied by the operator. The installer does not install Docker, change networking/firewalls, download model weights or expose services publicly.

Verify the trusted release checksums and extract the complete source into a **new Linux directory**. Inspect the scripts, prepare the two supported models using [MODEL_REQUIREMENTS.md](MODEL_REQUIREMENTS.md), then run inside WSL:

```sh
bash scripts/install.sh
bash scripts/credentials.sh
bash scripts/doctor.sh
```

The installer asks for a synthetic initial administrator, optional existing Demo data and mail mode. AI is **on by default** and requires a successful real generation/embedding preflight. Missing models produce Retry / Configure / Explicitly Disable / Exit choices; AI is never silently disabled. A noninteractive clean-data installation is:

```sh
bash scripts/install.sh --yes --admin-email local.admin@capstone.local
```

It creates fresh owned database/roles/secrets, installs frozen dependencies, verifies the codec hash/license, applies migrations, builds Web/Upload/Worker and checks loopback readiness, actual login and authorized reads. READY prints the selected Web/Mailpit URLs. The random initial password stays in a private file with mode 0600. `credentials.sh` takes a hidden password and uses the normal authenticated password-change API, verifies the new login and retires the initial secret; this is not server-enforced first-login rotation.

## Existing synthetic Demo

Opt in during the prompt or add `--demo`. This loads the **existing**50 showcase projects and10 workflow examples with their original content, teams, relationships, native files, rubrics and intended scenarios. It uses normal application services, including real local committee SMTP/OTP and reviewer allocation. It can take several minutes and respects authentication rate limits; progress and resumable stages are shown.

```sh
bash scripts/install.sh --yes --demo --admin-email local.admin@capstone.local
bash scripts/demo-accounts.sh
```

Demo loading is limited to a new blank owned installation. A completed Demo is never reseeded: reruns retain user edits and do not duplicate records. It does not execute/distribute private reset/checkpoint/recovery tools or copy production data. Credentials are generated per installation and remain private. See [demo/README.md](demo/README.md).

## Configuration and operation

For an existing private model endpoint or authenticated service, use `--ai-base-url` and `--ai-token-file` with a private file with mode 0600. `bash scripts/configure.sh` updates supported settings without resetting data. `--ai-off` is an explicit **partial-feature** choice, not full-parity acceptance. See MODEL_REQUIREMENTS.md and MAIL_CONFIGURATION.md.

Default mail is local account capture plus loopback Mailpit for synthetic committee invitations/OTP. This is not real inbox delivery. The existing approved Zoho/ZeptoMail adapter is available through a private provider JSON file; no new provider is introduced. Routine notifications remain in-app. Actual external delivery and an existing HTTPS mail application origin require operator configuration/verification.

```sh
bash scripts/install.sh --yes --resume --admin-email local.admin@capstone.local
bash scripts/status.sh
bash scripts/stop.sh
bash scripts/start.sh
bash scripts/uninstall.sh
```

Repeat/resume preserves completed stages and data. Stop/uninstall affect only verified owned resources and retain volumes, originals and private configuration; no purge exists. Unsafe/foreign targets, symlinks, collisions and altered codec bytes are refused. AI-enabled restart verifies model readiness and fails clearly if unavailable. Read INSTALLER_OPERATIONS.md before backup or moving an instance. Never upload `.local`, captures, credentials or model caches.

The intended public target is `MoayadAlshehry/capstone-repository`, tag`v1.0.0`. Those names do not prove publication or permission activation. Use the exact approved release/checksums, never a moving-main installer or curl-pipe-shell. Public release does not deploy the separate production application. AI remains BETA: outputs may be refused when unsupported and are not official academic grades.
