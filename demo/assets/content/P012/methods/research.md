# SouqLedger: Traceable Inventory Reconciliation

## 1. Research question and scope

SouqLedger explores inventory reconciliation in a bounded, inspectable graduation-project demonstrator. The work emphasizes traceable input assumptions and visible failure cases rather than production claims. The question is deliberately narrow: can the proposed decision rule improve the stated baseline on the supplied cases while keeping every outcome inspectable? The result is a computing graduation-project demonstrator, not operational guidance. Inputs, assumptions and failure definitions are part of the assessment scope; benefits outside that scope are not inferred.

## 2. Implementation maturity

Compare a fixed-rule baseline with a structured validation approach for inventory reconciliation, using versioned synthetic cases, explicit input constraints and documented failure modes. This presentable early artifact supplies a small record-validation experiment as a reproducibility example. It does not implement every domain behavior named by the project title. That limited scope is a reason for the moderate or weak demonstration evaluation; reviewers must not confuse a tidy report with a complete domain system.

## 3. Method and reproducibility

The owned reference experiment is experiments/validation.py. It was executed on thirty separate seeded cases beginning at seed 54100. The same seed and project definition reproduce every CSV row. The public results file records the complete small dataset, not a hand-selected best example. The program uses Python standard-library arithmetic and deterministic random.Random inputs. No external private dataset or participant record is required. To reproduce, run the attached script with Python3.14 and compare the JSON rows with results/validation.csv. The web platform never executes this uploaded code.

## 4. Assumptions and decision record

This bounded prototype has no field deployment, institutional endorsement or human study. The attached review identifies limited coverage and remaining validation work. The model treats its input bounds as explicit preconditions. Missing or infeasible states are distinguished from successful outputs. Cost units are simulator units; they are not currency, human waiting-time estimates or certified safety margins. The baseline and proposed behavior receive the same input realization. Internal assertions check the named invariant or independent small-instance oracle before rows are emitted. A failed assertion stops generation; no successful result is synthesized to hide it.

## 5. Validation and evidence

The attached results contain 30 cases with 4 reported quantities. The table below is calculated from those exact rows. Minimum, maximum and mean are descriptive statistics of the supplied synthetic cases only. They do not estimate a population, establish statistical significance or measure the Capstone platform itself. Inspect individual rows before relying on the mean: unreachable routes, ties, budget limits and replay behavior are meaningful outcomes, not missing values to be silently discarded.

## 8. Limitations and next experiment

This bounded prototype has no field deployment, institutional endorsement or human study. The attached review identifies limited coverage and remaining validation work. A suitable next experiment would replace one synthetic assumption at a time with independently validated observations, preserve a held-out case set, and preregister the comparison metric. Boundary and negative cases should be expanded before adding a more complex predictor. Any real participants, devices, institutions or field sites would require their own approvals and provenance. None is claimed by this demonstration.

## 10. Provenance

All people, projects, assessment inputs and simulated observations in this bundle were authored for a controlled P5.3 demonstration. Real university names identify demo tenants only; no affiliation, real submission, institutional verification, academic endorsement, publication or award is asserted. No citations to unverified publications are invented. The comparison baselines are fully specified local algorithms or record-checking rules included in the artifact, so the claim can be checked without an external authority.
