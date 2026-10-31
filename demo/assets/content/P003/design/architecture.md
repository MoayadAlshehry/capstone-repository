# System boundaries

Input generation -> explicit preconditions -> anomalies reference calculation -> invariant/oracle checks -> complete case rows -> descriptive summary.

The reference is deterministic and local. It does not call external APIs or access personal data. Uploaded code is never executed by Capstone. Public research files and the restricted annex are separately authorized by the platform.

## Domain design

Replay seeded synthetic temperature series through fixed thresholds, a rolling z-score and a two-sample persistence rule. Measure alarm delay, false alarms and detected event samples; the model does not emulate field packet loss.

## Failure handling

Assertion failures abort the experiment; infeasible modeled routes use an explicit unavailable result. No failed case is replaced with a favorable measurement.
