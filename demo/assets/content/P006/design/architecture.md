# System boundaries

Input generation -> explicit preconditions -> microgrid reference calculation -> invariant/oracle checks -> complete case rows -> descriptive summary.

The reference is deterministic and local. It does not call external APIs or access personal data. Uploaded code is never executed by Capstone. Public research files and the restricted annex are separately authorized by the platform.

## Domain design

Compare greedy self-consumption, fixed reserve and dynamic-programming dispatch on seeded daily profiles; independently enumerate short horizons and perturb demand and battery bounds.

## Failure handling

Assertion failures abort the experiment; infeasible modeled routes use an explicit unavailable result. No failed case is replaced with a favorable measurement.
