# System boundaries

Input generation -> explicit preconditions -> retrieval reference calculation -> invariant/oracle checks -> complete case rows -> descriptive summary.

The reference is deterministic and local. It does not call external APIs or access personal data. Uploaded code is never executed by Capstone. Public research files and the restricted annex are separately authorized by the platform.

## Domain design

Use a versioned synthetic Arabic corpus, topic-based relevance labels, literal substring and Unicode-normalized token baselines. Report exact precision and recall on separately seeded query-topic groups.

## Failure handling

Assertion failures abort the experiment; infeasible modeled routes use an explicit unavailable result. No failed case is replaced with a favorable measurement.
