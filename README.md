# Capstone Repository

Capstone Repository integrates public discovery, supervised academic review and version-specific project access in one bilingual platform. Students prepare projects and native files; supervisors and independent evaluators assess frozen submissions; partners request access to specific published versions.

![Capstone Repository public discovery with fictional demonstration projects](docs/images/platform-overview.png)

The screenshot shows the working platform with its original synthetic Demo projects.

## What the platform does

| Workspace        | Capabilities                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public discovery | Catalogue, project details and permitted originals; English/Arabic, light/dark and responsive layouts                                                           |
| AI               | Metadata Search, metadata Brief, and Quick/Balanced/Deep Project Assistant grounded in permitted Public originals, with source citations and refusal boundaries |
| Student and lead | Project editing, resumable native uploads, immutable submissions, lead consent and exact-version access decisions                                               |
| Academic review  | Assigned-supervisor review and publication; independent committee assessments; eligible external-review offers, packets and assessments                         |
| Partner          | Requests, exact-edition grants, restricted originals, revocation and access history                                                                             |
| Administration   | Institutions, accounts, eligibility, scoped audit and in-app notifications                                                                                      |

The platform preserves independent scores, exact evaluation arithmetic, bounded reviewer allocation and server-side file permissions. Its BETA AI features support discovery and evidence reading with source-linked responses; academic judgement remains with authorized evaluators. Unsupported AI requests may be declined. Uploaded code is stored and read as evidence and is never executed.

## Getting started

The steps below introduce the supported installation path. Allow time for dependency installation, the application build and optional Demo generation.

1. Read the [release and permission status](RELEASE_STATUS.md). First-party source and branding remain **No License / All Rights Reserved**. EVAL-1 allows only its approved limited personal noncommercial local evaluation; it is not an open-source license. Third-party terms remain independent.
2. Choose a pinned version from [GitHub Releases](https://github.com/MoayadAlshehry/capstone-repository/releases). Download that version's complete source ZIP and SHA256SUMS, verify the checksum before extraction, and check its exact EVAL-1 activation receipt using [release and permission status](RELEASE_STATUS.md). A moving branch or version field alone establishes neither a published release nor activated evaluation permission.
3. Prepare the documented host and two models below. Extract the complete source into a new Linux directory inside WSL.
4. Run the installer; choose clean data or the optional existing Demo.
5. Set your administrator password privately, run doctor and sign in to the printed loopback address.

## Supported environment

The installation targets **Windows 11 + Ubuntu WSL2/Linux-amd64 + Linux Docker/Compose**, Linux Node **24.21.0**, Corepack/pnpm **11.28.3**, and Python 3. Docker Desktop Linux integration is the documented Windows setup. An existing Ubuntu Docker engine is a separate host profile; consult the exact release’s test-scope asset for the engine and versions actually verified. The installer does not switch engines or configure their integration. Supply these prerequisites and the supported model weights before installation. The installer checks memory, disk and Windows commit availability, and verifies its pinned codec bytes. Host networking and model provisioning remain under the operator’s control.

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

The initial secret is stored in a private file with mode 0600. Use `credentials.sh` to choose a password through the authenticated password-change API before handing the installation to its user. This is an operator handoff step rather than a forced-first-login mechanism. The installer builds packages before Web/Upload/Worker and verifies real login and authorized reads. Services bind to loopback. Keep `.local`, browser state, mail captures, tokens and backups private.

```sh
bash scripts/install.sh --yes --resume --admin-email local.admin@capstone.local
bash scripts/status.sh
bash scripts/stop.sh
bash scripts/start.sh
```

Repeat/resume and stop preserve application data. Ownership, path and listener checks protect existing resources. Read [INSTALLER_OPERATIONS.md](INSTALLER_OPERATIONS.md) for lifecycle operations, consistent backups and restoration prerequisites.

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

Default mail uses private account-message capture and loopback Mailpit. Configure the supported transactional adapter using [MAIL_CONFIGURATION.md](MAIL_CONFIGURATION.md) when an authorized sender and recipients are available. Verify external delivery separately; ordinary application notifications remain in-app.

## Verification and supporting guides

- [TESTING.md](TESTING.md): automated checks, recorded test scope and isolated engineering procedures.
- [SECURITY.md](SECURITY.md): confidential vulnerability reporting and responsible assessment procedures.
- [RIGHTS.md](RIGHTS.md), [FILE_RIGHTS.csv](FILE_RIGHTS.csv), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): first-party and independent upstream obligations.
- [MODEL_REQUIREMENTS.md](MODEL_REQUIREMENTS.md), [MAIL_CONFIGURATION.md](MAIL_CONFIGURATION.md), [OPTIONAL_MODES.md](OPTIONAL_MODES.md): external prerequisites and profile limits.

The published v1.0.1 source passed its [GitHub Actions checks](https://github.com/MoayadAlshehry/capstone-repository/actions/runs/41266061780). See [TESTING.md](TESTING.md) for what that workflow verifies and how installation and real-model evidence are recorded separately. [RELEASE.json](RELEASE.json) identifies the checkout version. When citing the project, include the immutable release or commit and its repository URL.
