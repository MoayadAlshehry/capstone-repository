# HaramainFlow: Fair Resource Queue Scheduling

A service queue can reduce average delay while deferring long jobs. This finite-batch study makes the effect of a bounded scheduling look-ahead inspectable without promising a real operational wait guarantee.

## Read in this order
1. report/research.pdf
2. methods/research.md
3. experiments/queues.py
4. results/validation.csv
5. design/architecture.md

## Reproducibility

Thirty deterministic synthetic cases; no field deployment or human study is claimed. All comparison outputs are reproducible with the attached Python source. Cover media is an AI-generated conceptual illustration.

## Scope limitations

No real visitor, location trace or operational crowd data is used. Simulation excludes emergency rules, human behavior and site-specific safety requirements.
