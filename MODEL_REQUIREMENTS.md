# Model setup and AI readiness

The current application requires exactly these API identifiers:

| Purpose    | Identifier                            | Contract                                                                                                                |
| ---------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Generation | `qwen/qwen3.5-9b`                     | Structured OpenAI-compatible Chat Completions and native LM Studio streaming chat;16384-token context; reasoning off/on |
| Embeddings | `text-embedding-qwen3-embedding-0.6b` | 1024 finite, nonzero components through `/v1/embeddings`                                                                |

A reranker is not required. Quick uses reasoning off; Balanced and Deep use reasoning on with their respective evidence, output and deadline budgets. Provision the model weights and hardware for these contracts before installation. The kit uses the existing service and leaves model management and host configuration to the operator. Response time depends on the runtime, request context and available resources; perform repeatable verification with competing intensive workloads paused.

Use LM Studio's official [model discovery/download instructions](https://lmstudio.ai/docs/app/basics/download-model) to obtain appropriate models yourself if not already present. Select the downloaded models locally and serve the exact API identifiers. The [lms load documentation](https://lmstudio.ai/docs/cli/local-models/load) explains identifiers/context: `lms ls` lists locally available model keys, and an operator can load the selected generation key with `--identifier qwen/qwen3.5-9b --context-length 16384`; set the embedding identifier correspondingly. These are operator actions, not commands run by this installer. Preserve any existing model-server configuration used by other workloads.

Start the local server using LM Studio's Developer controls or its documented [server-start command](https://lmstudio.ai/docs/cli/serve/server-start). Keep the inference server private; no public bind, CORS expansion, firewall rule, DNS change or network reset is needed or performed by the kit. The application's [native chat protocol](https://lmstudio.ai/docs/developer/rest/chat) and OpenAI-compatible endpoints must both be available.

Default endpoint is `http://127.0.0.1:1234`, from inside WSL where Web/Worker run. If your existing Windows/WSL arrangement uses another reachable private IPv4 endpoint, choose Configure and enter that already supported endpoint or pass `--ai-base-url`. The same address must work from the running WSL processes. The kit does not create bridges, proxies or networking rules. Endpoint paths/credentials/query strings and Internet model hosts are rejected in accordance with the current application contract.

If authentication is enabled, supply a separately authorized API token in an owned file with mode 0600:

```sh
chmod 600 /your/private/model-token.txt
bash scripts/install.sh --yes --admin-email local.admin@capstone.local --ai-base-url http://127.0.0.1:1234 --ai-token-file /your/private/model-token.txt
```

Do not put a token value in command arguments, Git, logs or screenshots. The kit copies it to its private per-install file. A server without authentication uses a generated per-install bearer value solely to meet the application's private-token-file contract; that does not configure authentication on the model server.

Preflight checks model IDs, real embedding dimensions/finiteness/nonzero norm, actual structured generation and actual native streaming generation. It never treats `/models` alone as readiness. AI data lives in a private owned directory outside the source tree, with per-install namespaces and the existing queue, rate limits, cancellation and source validation.

On failure, choose Retry, Configure endpoint/token, explicitly Disable AI, or Exit. Noninteractive setup fails with instructions; `--ai-off` deliberately selects a partial profile. After models are ready, use `bash scripts/configure.sh --ai --ai-base-url ... --ai-token-file ...`. Normal stop/start retains all data and rechecks model readiness. No hard-coded production endpoint, production credential or weights are shipped.

Search inspects published metadata; Brief uses title, abstract and keywords. Assistant reads the current permitted Public originals and validates source support. Access to restricted academic evidence elsewhere in the platform does not expand the AI source scope. Inspect citations when using an answer, and consult the originals or narrow the question when evidence is insufficient. Evaluation reports should identify the tested requests, source scope and runtime conditions.
