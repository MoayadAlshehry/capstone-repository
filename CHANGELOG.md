# Maintenance changes

## v1.0.2

This version improves allocation responsiveness, concurrent upload error handling and AI Search source admission while preserving the platform's academic policies, original synthetic Demo and supported model contracts.

- Allocation snapshots compute shared cohort ranks and committee-identity exclusions once per transaction. Forward migration 0139 preserves authority checks, capacity constraints and scoring rules.
- Forward migration 0140 builds snapshot arrays without repeated JSON concatenation and aggregates reviewer workloads under the existing capacity locks. Reviewer facts, ordering, consent checks and permissions remain unchanged.
- The allocation worker verifies immutable original bytes outside reviewer and project transactions. It then rechecks the current lawful selection and exact file identities before issuing an offer. Changed selections are retried through the existing durable queue.
- Competing upload reservations return the controlled HTTP 409 conflict response instead of an internal-error response. Existing path, quota and file-authorization rules remain in force.
- Demo original-file uploads retain private operation identities across interruptions. The loader reuses staged bytes only after exact size/hash verification and removes only that recorded upload’s abandoned temporary writes; normal format and permission checks remain in force.
- Signature-validation diagnostics retain the underlying detector cause privately without changing admission rules or time limits.
- Unqualified negative capability statements such as “not implemented” do not supply affirmative metadata evidence; qualified conditions are kept distinct.
- Qualified metadata requirements cannot be satisfied solely by generic procedural alternatives. Existing cached search memberships are invalidated so the corrected admission rule applies consistently.
- An accepted AI Search result does not issue another inference request solely because its URL changes to semantic mode. Changed queries, explicit refinement and context revalidation remain supported.
- Search fields reserve icon space according to interface language while preserving automatic direction for entered text. Public publication dates retain their intended numeric order in Arabic.
- Shared packages build sequentially to bound resource use. The safe test inventory reads the same explicit file selection as CI. Additional regressions cover source admission, allocation revalidation and failures from an owned local model mock.

The schema comprises 141 migration records. Previously applied migration files and all 540 original Demo inputs are unchanged. The approved EVAL-1 wording and third-party notices are preserved. Consult [release identity and permission](RELEASE_STATUS.md) and the exact release's verification assets for publication, activation and executed test scope.

## Installation and compatibility

Use the complete versioned source archive for a new owned installation. Stop and same-source resume retain its data. This version does not add a general in-place upgrade command: copying an existing private `.local` directory into another source tree, or running `git pull` followed by resume, is not a verified upgrade procedure.

The optional checks in [tools/release/README.md](tools/release/README.md) use independently owned localhost resources. Their execution records identify source/build, environment and outcomes. Unit, integration, browser and model checks have different scopes; overlapping counts must not be added into an exhaustive acceptance total.

Earlier immutable releases and their activation receipts remain available from [GitHub Releases](https://github.com/MoayadAlshehry/capstone-repository/releases).
