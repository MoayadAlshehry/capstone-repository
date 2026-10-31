# Capstone Repository

A bilingual capstone platform that connects published research with the academic work needed to produce it. Students prepare projects and native files; supervisors and independent evaluators assess frozen submissions; partners request access to specific published versions.

![Capstone Repository public discovery with fictional demonstration projects](docs/images/platform-overview.png)

The image is an authentic local application capture using the existing synthetic Demo. It does not depict real students or a human evaluation study.

## What the platform does

| Workspace        | Capabilities                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public discovery | Catalogue, project details and permitted originals; English/Arabic, light/dark and responsive layouts                                                           |
| AI               | Metadata Search, metadata Brief, and Quick/Balanced/Deep Project Assistant grounded in permitted Public originals, with source citations and refusal boundaries |
| Student and lead | Project editing, resumable native uploads, immutable submissions, lead consent and exact-version access decisions                                               |
| Academic review  | Assigned-supervisor review and publication; independent committee assessments; eligible external-review offers, packets and assessments                         |
| Partner          | Requests, exact-edition grants, restricted originals, revocation and access history                                                                             |
| Administration   | Institutions, accounts, eligibility, scoped audit and in-app notifications                                                                                      |

The system preserves independent scores, exact/unrounded evaluation policy, bounded reviewer allocation and server-side file permissions. AI is BETA, may refuse unsupported requests, and does not award academic grades. Uploaded code is treated as data and is never executed.

## A five-minute orientation

This is a short reading path, not a five-minute installation promise. Building and loading the original Demo can take substantially longer.

1. Read the [release and permission status](RELEASE_STATUS.md). First-party source and branding remain **No License / All Rights Reserved**. EVAL-1 allows only its approved limited personal noncommercial local evaluation; it is not an open-source license. Third-party terms remain independent.
2. Use a pinned release and verify its checksum before extraction. The current published distribution is [v1.0.0](https://github.com/MoayadAlshehry/capstone-repository/releases/tag/v1.0.0), with [source ZIP](https://github.com/MoayadAlshehry/capstone-repository/releases/download/v1.0.0/capstone-repository-v1.0.0-source.zip), [SHA256SUMS](https://github.com/MoayadAlshehry/capstone-repository/releases/download/v1.0.0/SHA256SUMS), and [EVAL-1 receipt](https://github.com/MoayadAlshehry/capstone-repository/releases/download/v1.0.0/EVAL-1_ACTIVATION_RECEIPT.json). This version 1.0.1 checkout requires its own exact approval before public publication; a moving branch is not a pinned installer.
3. Prepare the documented host and two models below. Extract the complete source into a new Linux directory inside WSL.
4. Run the installer; choose clean data or the optional existing Demo.
5. Set your administrator password privately, run doctor and sign in to the printed loopback address.

## Supported environment

The verified host path is **Windows 11 + Ubuntu WSL2/Linux-amd64 + Docker Desktop Linux integration/Compose**, Linux Node **24.21.0**, Corepack/pnpm **11.28.3**, and Python 3. Universal Linux, macOS and other host combinations are not claimed. Host prerequisites and model weights are operator supplied. The installer checks memory/disk and Windows commit, verifies its pinned codec bytes, and does not alter networking/firewalls or install/download models.

Architecture: the Next.js Web application calls shared domain services; the Upload service handles native resumable files; the Worker processes jobs; PostgreSQL holds transactional state and private storage retains originals. A separately configured local model service provides generation and embeddings. Local Mailpit captures synthetic committee mail; ordinary notifications remain in-app.

## Install and operate

Run inside the extracted Linux directory:

```sh
bash scripts/install.sh
bash scripts/credentials.sh
bash scripts/doctor.sh
```

The default is a new clean database, a securely generated initial administrator and AI enabled after real preflight. A noninteractive clean installation is:

```sh
bash scripts/install.sh --yes --admin-email local.admin@capstone.local
```

The initial secret stays in a private 0600 file. `credentials.sh` asks for a hidden new password and uses the real authenticated password-change API; this is not a forced-first-login policy. The installer builds packages before Web/Upload/Worker and verifies real login and authorized reads. Services bind to loopback. Keep `.local`, browser state, mail captures, tokens and backups private.

```sh
bash scripts/install.sh --yes --resume --admin-email local.admin@capstone.local
bash scripts/status.sh
bash scripts/stop.sh
bash scripts/start.sh
```

Repeat/resume and stop retain data. Foreign resources, symlinks and occupied application listeners are refused. Read [INSTALLER_OPERATIONS.md](INSTALLER_OPERATIONS.md) for lifecycle, backup and recovery limits; no purge or public deployment is implied.

## Existing synthetic Demo

Choose Demo in the prompt or add `--demo`:

```sh
bash scripts/install.sh --yes --demo --admin-email local.admin@capstone.local
bash scripts/demo-accounts.sh
```

This reuses the original **50 showcase projects + 10 workflow examples** and **540 unchanged input assets** (480 native files and 60 covers). It preserves their content, relationships and academic scenarios. It runs real onboarding, hashing/login, local committee SMTP/OTP and allocation workflows; rate limits add pauses. Loading requires a new blank owned installation. Once completed, reruns keep user edits and do not duplicate records. It never runs or distributes the private canonical Demo Setup. See [demo/README.md](demo/README.md).

## AI and mail

Prepare `qwen/qwen3.5-9b` and `text-embedding-qwen3-embedding-0.6b` with **1024-dimensional** embeddings using [MODEL_REQUIREMENTS.md](MODEL_REQUIREMENTS.md). A reranker is not required. No weights are bundled. Private endpoint/token-file options are documented there; never put credentials in chat, source or public logs.

AI is on by default. Missing/unavailable models produce explicit Retry / Configure / Disable / Exit choices; the installer never silently disables AI. `--ai-off` is an explicit partial-feature profile. Search and Brief use published metadata; Assistant reads only currently permitted Public originals and validates source support.

Default mail is local account capture plus loopback Mailpit, not delivery to real inboxes. The existing approved transactional adapter can be configured privately as described in [MAIL_CONFIGURATION.md](MAIL_CONFIGURATION.md). External delivery requires an authorized sender/inbox and separate verification; it is not claimed by local capture tests. No unwanted email-notification channel is added.

## Testing, rights and limits

- [TESTING.md](TESTING.md): exact safe CI scope, inventory of nonselected tests and guarded isolated engineering commands. A passing selected suite is not a claim that every historical thesis scenario ran.
- [SECURITY.md](SECURITY.md): bounded disclosure guidance without a security guarantee.
- [RIGHTS.md](RIGHTS.md), [FILE_RIGHTS.csv](FILE_RIGHTS.csv), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): first-party and independent upstream obligations.
- [MODEL_REQUIREMENTS.md](MODEL_REQUIREMENTS.md), [MAIL_CONFIGURATION.md](MAIL_CONFIGURATION.md), [OPTIONAL_MODES.md](OPTIONAL_MODES.md): external prerequisites and profile limits.

Release identity is read from [RELEASE.json](RELEASE.json), not the npm-private workspace `0.0.0` versions. Cite a verified immutable release/commit and URL when referencing this software; no paper, DOI or university endorsement is asserted. No remote CI badge, universal host support, cross-host restore, measured superiority or user-satisfaction claim is made without corresponding evidence.
