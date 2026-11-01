# Public testing policy

## Safe static and unit checks

Install the frozen dependencies using the documented installer environment. `corepack pnpm check:public`, `corepack pnpm test:inventory`, `corepack pnpm test:unit:public`, `python3 tools/release/installer_guard_test.py` and `python3 tools/release/feature_settings_test.py` are the bounded public CI scope. Python settings tests use an owned loopback mock only to validate configuration/failure contracts; they are not evidence of real-model feature success. The Vitest allowlist contains AI runtime units, synthetic-Demo marker rendering and pure allocation policy units. It has **no test-name exclusion regex** and fails if no tests are collected. It does not require a database, running application, real model weights or provider credentials.

The workflow contains only safe checks with read-only repository permission. A local equivalent run is not a remote GitHub Actions pass. No green badge should be added before actual remote execution after owner-approved publication.

## What the selected results do not include

`test:inventory` lists every test source and relevant profile, including explicit NOT_SELECTED_BY_SAFE_UNIT_CI and HISTORICAL_TC_NOT_RUN classifications. Literal TC-name counts are source declarations, not dynamically expanded runtime case counts; dynamic declarations are labelled separately. The full default historical/configuration matrix is not advertised as one exhaustive passing suite.

Nineteen legacy integration configs consume `engineeringTestNames` from `tools/testing/source-policy.ts`. Their historical TC-numbered thesis scenarios remain deferred by design and now print a policy notice. Those scenarios stay in source and are reported NOT_RUN, never silently counted as passing or relabelled as modern engineering evidence. `docs/registries/validation-policy.json` explains that scope. `phase-status.json` now identifies PUBLIC_RELEASE; `tools/automation/core.ts` continues to protect historical acceptance records and place current engineering output in the private current engineering directory. No historical result registry is promoted.

## Opt-in isolated engineering

After a fresh owned local installation, `corepack pnpm test:isolated:release` first verifies the actual PID/start/CWD/socket and Docker labels, then runs the selected release integration fixture with private Mailpit ports derived from that installation. Its databases are separately disposable on the owned PostgreSQL service. It cannot target an arbitrary URL or database through CLI parameters. This is a long-running local engineering suite, not CI and not the complete historical thesis scenario set.

Read [tools/release/README.md](tools/release/README.md) before the genuine native upload, real AI, browser, retention and controlled failure scripts. Positive AI checks require the actual supported models and an authorized non-production token. No production or Internet-facing application testing is permitted.

Historical phase suites are not bulk enabled by flipping a flag. A historical scenario needs a reviewed per-fixture target mapping to disposable synthetic resources, explicit scope and honest result accounting. Until those prerequisites are supplied and verified, it is NOT_RUN; preserved source code is not a passing result. No public default command executes private reset/recovery or the canonical Demo Setup.

Installed proof adapters are development-only and add synthetic QA records outside the original Demo scenarios. Setup-token fixtures handle both queued encrypted content and a worker-delivered private local capture; they never weaken ciphertext retirement. Installed-fixture close only disconnects services and retains existing storage and databases. Some one-use workflow proofs require a fresh scenario rather than replaying consumed setup credentials. The additional safe unit file covers this capture transition and origin validation.
