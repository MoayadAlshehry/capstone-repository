# SecureArchive: Tamper-Evident Research Manifests

## 1. Research question and scope

Research bundles must detect changed bytes, deleted paths and ambiguous filenames without interpreting uploaded code or trusting a client-supplied checksum. The question is deliberately narrow: can the proposed decision rule improve the stated baseline on the supplied cases while keeping every outcome inspectable? The result is a computing graduation-project demonstrator, not operational guidance. Inputs, assumptions and failure definitions are part of the assessment scope; benefits outside that scope are not inferred.

## 2. Contribution and alternatives

Build canonical path manifests with SHA-256 leaf hashes and a reproducible Merkle root. Compare filename-only and path-free checksum indexes with controlled byte mutation, rename and input-order cases. The documented alternatives are: Filename and size index; unordered flat checksums. The design favors a small auditable implementation over an opaque external model. It exposes the constraints and the reason for each rejection rather than returning only an unexplained aggregate number. A more elaborate system might fit more realistic data, but would introduce training, calibration and validation needs absent from this bounded artifact.

## 3. Method and reproducibility

The owned reference experiment is experiments/integrity.py. It was executed on thirty separate seeded cases beginning at seed 53600. The same seed and project definition reproduce every CSV row. The public results file records the complete small dataset, not a hand-selected best example. The program uses Python standard-library arithmetic and deterministic random.Random inputs. No external private dataset or participant record is required. To reproduce, run the attached script with Python3.14 and compare the JSON rows with results/validation.csv. The web platform never executes this uploaded code.

## 4. Assumptions and decision record

Integrity is not authenticity or malware detection. The artifact does not execute uploads, issue trusted signatures or replace institutional retention policies. The model treats its input bounds as explicit preconditions. Missing or infeasible states are distinguished from successful outputs. Cost units are simulator units; they are not currency, human waiting-time estimates or certified safety margins. The baseline and proposed behavior receive the same input realization. Internal assertions check the named invariant or independent small-instance oracle before rows are emitted. A failed assertion stops generation; no successful result is synthesized to hide it.

## 5. Validation and evidence

The attached results contain 30 cases with 6 reported quantities. The table below is calculated from those exact rows. Minimum, maximum and mean are descriptive statistics of the supplied synthetic cases only. They do not estimate a population, establish statistical significance or measure the Capstone platform itself. Inspect individual rows before relying on the mean: unreachable routes, ties, budget limits and replay behavior are meaningful outcomes, not missing values to be silently discarded.

## 6. Critical interpretation

The primary value is traceability between a documented decision, executable reference and inspectable output. A positive comparison within this model does not prove superiority in deployment. The intervention changes more than one practical assumption relative to a real system: input quality, failure costs and operator behavior are simplified. Reviewers should credit reproducibility only within the declared scope, and should lower an impact or generalizability judgment when broader claims are not supported. The four independent rubric criteria remain judgments of the artifact; the simulator does not manufacture academic grades.

## 7. Security, privacy and operations

No personal data is used in these generated artifacts. Code and data are presented as inert native files. The platform controls public versus restricted delivery and exact frozen-version packets independently of file names. A separate restricted annex is available only through a current authorized grant or assessment packet. Research-file checksums provide byte integrity, not trust in arbitrary code. A real follow-on study would need threat modeling, input-provenance review, operational ownership and a documented failure response before real deployment.

## 8. Limitations and next experiment

Integrity is not authenticity or malware detection. The artifact does not execute uploads, issue trusted signatures or replace institutional retention policies. A suitable next experiment would replace one synthetic assumption at a time with independently validated observations, preserve a held-out case set, and preregister the comparison metric. Boundary and negative cases should be expanded before adding a more complex predictor. Any real participants, devices, institutions or field sites would require their own approvals and provenance. None is claimed by this demonstration.

## 9. Artifact and assessment map

README.md is the entry point. The research report describes question, alternatives, method, assumptions and interpretation. The experiment source supplies the exact reproducible calculation. results/validation.csv holds every case; results/summary.json holds the unrounded structured summary. design/architecture.md describes boundaries. These artifacts support evidence locators for contribution, rigor, validation and practical impact. The cover image is an AI-generated illustration of the subject and is not experiment evidence.

## 10. Provenance

All people, projects, assessment inputs and simulated observations in this bundle were authored for a controlled P5.3 demonstration. Real university names identify demo tenants only; no affiliation, real submission, institutional verification, academic endorsement, publication or award is asserted. No citations to unverified publications are invented. The comparison baselines are fully specified local algorithms or record-checking rules included in the artifact, so the claim can be checked without an external authority.
