# System boundaries

Input generation -> explicit preconditions -> edge_jobs reference calculation -> invariant/oracle checks -> complete case rows -> descriptive summary.

The reference is deterministic and local. It does not call external APIs or access personal data. Uploaded code is never executed by Capstone. Public research files and the restricted annex are separately authorized by the platform.

## Domain design

Replay seeded job streams through FIFO, earliest-deadline and admission-aware scheduling; inspect capacity, idempotency and deadline invariants with crash/replay and bounded queue experiments.

## Failure handling

Assertion failures abort the experiment; infeasible modeled routes use an explicit unavailable result. No failed case is replaced with a favorable measurement.
