# System boundaries

Input generation -> explicit preconditions -> routes reference calculation -> invariant/oracle checks -> complete case rows -> descriptive summary.

The reference is deterministic and local. It does not call external APIs or access personal data. Uploaded code is never executed by Capstone. Public research files and the restricted annex are separately authorized by the platform.

## Domain design

Evaluate distance-only, binary accessible and constraint-aware routing against seeded annotated graphs; use exhaustive path enumeration, disconnected graphs and incomplete annotations as adversarial cases.

## Failure handling

Assertion failures abort the experiment; infeasible modeled routes use an explicit unavailable result. No failed case is replaced with a favorable measurement.
