# Maintenance candidate v1.0.2-rc.1

This local candidate preserves the platform's academic policies, original synthetic Demo, supported model contracts and third-party notices. It contains four focused corrections:

- Allocation snapshots compute shared cohort ranks and committee-identity exclusions once per transaction. Existing authority checks, capacity locks and scoring decisions are preserved; migration 0139 applies the change forward.
- Public publication dates keep their intended numeric order in Arabic presentation.
- An accepted AI Search result no longer triggers another inference request solely because its URL changes to semantic mode. Changed queries, explicit refinement and context revalidation remain available.
- Search fields reserve icon space according to the surrounding interface language while retaining automatic direction for entered text. This prevents an empty Arabic placeholder or opposite-direction input from overlapping the icon.

The candidate expects 140 migration records. Existing migrations and all 540 original Demo inputs are unchanged. The approved EVAL-1 wording is byte-identical; permission for another published release does not activate this candidate.

## Verification and use

Use a new owned installation for a clean rehearsal. The retained same-instance tests, original/corrected lock observations, role journeys, model checks and bounded evaluation records are supplied in the matching evidence handover. Selected test groups have different scopes and overlapping cases; their counts must not be summed as an exhaustive total.

The installation kit retains data on stop and same-source resume. This candidate does not introduce a general in-place upgrade command: do not transplant a private `.local` directory or treat `git pull` followed by resume as a verified upgrade procedure.

The optional browser check `node tools/release/search-request-count.mjs` requires a running, owned Demo installation with the supported models available. It uses only that instance's loopback origin and checks one search dispatch per action, changed queries, explicit refinement and semantic-link reload. Its output stays in `.local/public-checks`.

The optional `node tools/release/search-field-spacing.mjs` check covers English and Arabic interfaces, light/dark appearance, desktop/mobile widths and empty/English/Arabic input. It checks rendered icon clearance without submitting searches or invoking a model.

The public release reference remains [v1.0.1](https://github.com/MoayadAlshehry/capstone-repository/releases/tag/v1.0.1). Publication of a replacement requires a separately identified release and matching activation receipt.
