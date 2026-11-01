# Focused local verification

Run only against an independently verified disposable owned localhost installation with synthetic data. No command here targets production, alters host networking or starts/downloads model weights. Read each script before use. Positive AI feature checks require the actual supported models and a separately authorized private token; synthetic fault responses are used only for negative cases.

```sh
python3 tools/release/installer_guard_test.py
python3 tools/release/feature_settings_test.py
corepack pnpm exec tsc --project scripts/demo/tsconfig.json
corepack pnpm exec tsc --project tools/release/tsconfig.ai.json
corepack pnpm exec tsc --project tools/tsconfig.json
corepack pnpm exec vitest run --config config/testing/vitest.installer-ai.config.ts
node --conditions=react-server --import tsx tools/release/mail-contract.mts
node scripts/verify-owned.mjs
node tools/release/ai-feature-proof.mjs
node tools/release/demo-permission-proof.mjs
python3 tools/release/failure-campaign.py
```

The AI/Demo scripts require the existing Demo already loaded. They use real normal login, role boundaries and Public-source checks. `demo-edit-proof.mjs` deliberately edits the isolated S01 draft through its real lead/API for a subsequent idempotence check; it never edits the shipped fixture inputs. `scripts/snapshot.mjs` records own local row/original fingerprints for lifecycle comparisons; its raw storage-key index is private and must be aliased before evidence export.

The failure campaign creates one owned loopback test harness, forwards positive requests unchanged to the already configured actual model service, blocks controlled negative requests locally, verifies bounded failure and actual recovery, restores the prior per-install endpoint and stops its own harness. It does not change the model service or publish a new application provider. Never run it on a shared/production source root. Actual current results, failures/rephrasing, environment/build identities and matrices belong in the private release evidence; these commands alone are not PASS evidence.

The selected release integration suite (`corepack pnpm test:release`) uses disposable databases on the owned PostgreSQL service. Its exact-70 compound has a defined scope distinct from private operator recovery exercises. Preserve historical scenario records and identify any new execution separately. Published release artifacts and [GitHub Actions results](https://github.com/MoayadAlshehry/capstone-repository/actions) provide version-specific verification references; real-model and lifecycle outcomes require their own recorded executions.
