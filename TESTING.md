# Testing and verification

## Safe static and unit checks

Install the frozen dependencies in the documented environment. The public CI scope comprises `corepack pnpm check:public`, `corepack pnpm test:inventory`, `corepack pnpm test:unit:public`, `python3 tools/release/installer_guard_test.py` and `python3 tools/release/feature_settings_test.py`. The selected Vitest suite covers AI runtime units, synthetic-Demo rendering and allocation-policy units. Python settings tests use an owned loopback mock to check configuration and failure contracts. Positive inference verification uses the actual supported models in the isolated procedures below. The unit suite uses an explicit file allowlist, contains no test-name exclusion regex and fails if no tests are collected.

The workflow uses read-only repository permissions and requires no production database, model service or provider credentials. The published v1.0.1 commit passed [main-branch run 41266061780](https://github.com/MoayadAlshehry/capstone-repository/actions/runs/41266061780) on its first attempt: 108 Vitest tests, 14 installer guards and 13 settings-contract tests, alongside package builds, inventory/static checks, AI types and whitespace checks. Consult the checks on the relevant commit or PR for later changes.

## Test scope and result interpretation

`test:inventory` lists test sources and profiles, with explicit `NOT_SELECTED_BY_SAFE_UNIT_CI` and `HISTORICAL_TC_NOT_RUN` classifications. TC-name counts describe source declarations; dynamically expanded cases are labelled separately. Reports should identify the selected suite, executed outcomes, source/build identity and environment. This keeps unit, integration, real-model and historical academic evidence traceable.

Nineteen integration configurations use `engineeringTestNames` from `tools/testing/source-policy.ts` to separate current engineering selections from preserved historical TC-numbered thesis scenarios. Historical scenarios remain recorded as NOT_RUN unless a separately documented execution covers them. `docs/registries/validation-policy.json` defines this policy. Current engineering output is kept separate from historical acceptance records.

## Opt-in isolated engineering

After a fresh owned local installation, `corepack pnpm test:isolated:release` first verifies the actual PID/start/CWD/socket and Docker labels, then runs the selected release integration fixture with private Mailpit ports derived from that installation. Its databases are separately disposable on the owned PostgreSQL service. It cannot target an arbitrary URL or database through CLI parameters. This is a long-running local engineering suite, not CI and not the complete historical thesis scenario set.

Read [tools/release/README.md](tools/release/README.md) before the genuine native upload, real AI, browser, retention and controlled failure scripts. Positive AI checks require the actual supported models and an authorized non-production token. No production or Internet-facing application testing is permitted.

To replay a historical scenario, first map its fixture and target to an owned disposable environment and document the intended outcomes. Preserve its original record and report the new execution separately. Public verification commands use the supported installer and synthetic fixtures; private operator reset/recovery procedures remain outside this distribution.

Installed proof adapters are development-only and add synthetic QA records outside the original Demo scenarios. Setup-token fixtures handle both queued encrypted content and a worker-delivered private local capture; they never weaken ciphertext retirement. Installed-fixture close only disconnects services and retains existing storage and databases. Some one-use workflow proofs require a fresh scenario rather than replaying consumed setup credentials. The additional safe unit file covers this capture transition and origin validation.
