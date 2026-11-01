# Public project AI

The platform provides three source-bound AI features:

- **AI Search** interprets a query and combines lexical/semantic retrieval over published project metadata. Canonical filters and current publication authority remain authoritative. It does not inspect private originals or introduce a per-project generative judge.
- **AI Brief** creates an on-demand short description from the project title, abstract and keywords. It does not add file content to that metadata boundary.
- **Project Assistant** answers questions about the current project's permitted Public originals using bounded read tools and validated citations. Quick, Balanced and Deep retain their existing reasoning, evidence and deadline budgets. A user's access to restricted academic evidence does not expand the Assistant's Public-source scope.

## Installation and use

Follow the [installation README](../../../README.md) and [model requirements](../../../MODEL_REQUIREMENTS.md). The operator supplies the supported generation and embedding models; model weights and credentials are not included. Normal installation preflights actual inference. Missing models produce setup instructions and an explicit retry/configure/disable/exit choice rather than silently disabling AI.

Search is available on public Home and Catalogue. AI Brief is opened from its project/card control. Open Project Assistant on a published project, choose an effort and ask a question about its Public evidence. Source links lead back to permitted native originals and their locations. Users can cancel a request and retry or rephrase an unsupported question. Ordinary catalogue and file workflows remain available in an explicitly AI-disabled profile.

## Source scope and response handling

The BETA AI features support project understanding within their admitted source scope. They can return an insufficient-evidence response, decline an unsupported claim or report a timeout. Evaluation records distinguish these outcomes from accepted answers. Academic grading and evaluator decisions remain with the authorized academic roles. Uploaded documents, code and user text are treated as evidence; they do not authorize code execution, arbitrary filesystem access or cross-project retrieval.

The current source scope, publication/version and citation checks remain authoritative before delivery. Queue/rate limits, cancellation, private derived storage and bounded validation/repair are preserved. Derived indexes are regenerable, installation-managed private data and are excluded from source distribution. They are not a model-weight bundle or a substitute for original records.

## Implementation references

- [Model IDs, limits and request contracts](core.ts)
- [AI HTTP entry points and streaming authorization](server.ts)
- [Model transport, queue, cancellation and derived store](runtime.ts)
- [Search execution and canonical projections](search-execution.ts)
- [Published metadata adapters and canonical filters](search-services.ts)
- [Metadata Brief and source retrieval](service.ts)
- [Current Public-source authorization and extraction](sources.ts)
- [Bounded project read tools](project-tools.ts)
- [Assistant composition and validation](adaptive-answer.ts)

These links describe the included implementation. Release-specific validation results and limitations must be read with their recorded source/build/environment identities; source presence alone is not an executed test result.
