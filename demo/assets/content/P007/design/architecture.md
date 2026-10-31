# System boundaries

Input generation -> explicit preconditions -> integrity reference calculation -> invariant/oracle checks -> complete case rows -> descriptive summary.

The reference is deterministic and local. It does not call external APIs or access personal data. Uploaded code is never executed by Capstone. Public research files and the restricted annex are separately authorized by the platform.

## Domain design

Build canonical path manifests with SHA-256 leaf hashes and a reproducible Merkle root. Compare filename-only and path-free checksum indexes with controlled byte mutation, rename and input-order cases.

## Failure handling

Assertion failures abort the experiment; infeasible modeled routes use an explicit unavailable result. No failed case is replaced with a favorable measurement.
