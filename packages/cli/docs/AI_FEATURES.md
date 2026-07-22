# AI Module Recommender

The AI module recommender translates a natural-language requirement into a
ranked list of modules. It is an optional catalog-discovery feature; it is not
the Workspace Intelligence model, graph, context engine, or autonomous repair
loop.

## Commands

| Task                          | Command                                                 |
| ----------------------------- | ------------------------------------------------------- |
| Recommend modules             | `workspai ai recommend <query> [--number <n>] [--json]` |
| Show current AI configuration | `workspai ai info`                                      |
| Generate a missing catalog    | `workspai ai generate-embeddings [--force]`             |
| Refresh an existing catalog   | `workspai ai update-embeddings`                         |
| Enable or disable AI          | `workspai config ai <enable\|disable>`                  |
| Store a local provider key    | `workspai config set-api-key`                           |
| Remove the stored key         | `workspai config remove-api-key [--yes]`                |

Use `npx workspai` instead of `workspai` when the CLI is not installed globally.

## How ranking works

```text
Natural-language requirement
            ↓
Query embedding (provider or deterministic mock)
            ↓
Bundled/runtime module embedding catalog
            ↓
Cosine similarity + dependency metadata
            ↓
Ranked suggestions
```

The catalog is loaded from the published package when available. Development and
refresh workflows can obtain current module metadata through the validated
Python Core bridge. A bounded fallback catalog keeps discovery available when
Core is absent.

## Interpreting a result

A recommendation contains module identity, description, category, declared
dependencies, similarity score, and a short match reason.

Treat the score as a ranking signal only:

- it is not a probability that the module is correct;
- it does not prove framework/runtime compatibility;
- it does not approve licensing, security, or production readiness;
- it is not comparable across embedding models or catalog revisions without a
  controlled benchmark.

Before installation, inspect the project capability and the selected module's
dependencies. Workspai refuses Core-backed installation when the current project
does not advertise the required command surface.

## Provider and mock behavior

- With `OPENAI_API_KEY` or a stored key, the current implementation uses the
  configured OpenAI embedding client.
- Without a key, deterministic mock mode exercises the workflow without a
  network request.
- Mock results are for development and UI testing, not production selection.
- Provider latency, limits, model availability, and prices can change. Consult
  the provider dashboard rather than relying on hard-coded cost estimates.

The current default embedding model and vector dimensions are implementation
details recorded with generated catalog data. Consumers must read that metadata
instead of assuming every catalog uses the same model.

## Key storage and security

The preferred order is:

1. environment secret (`OPENAI_API_KEY`) for CI and ephemeral sessions;
2. interactive user configuration for a trusted local machine;
3. never a committed workspace file, shell history entry, screenshot, or issue.

`workspai config show` masks a stored key. `config remove-api-key --yes` supports
non-interactive cleanup. See [config-file-guide.md](./config-file-guide.md) for
configuration precedence and locations.

## JSON automation

```bash
npx workspai ai recommend "PostgreSQL with migrations" --number 3 --json
```

JSON mode is intended for scripts. Treat non-zero exit codes and structured error
codes as failures; do not scrape human-formatted output.

## Relationship to Workspace Intelligence

| Capability              | Requires provider AI? | Durable evidence? | Main purpose                         |
| ----------------------- | --------------------- | ----------------- | ------------------------------------ |
| Module recommender      | Optional              | No                | Discover modules from requirements   |
| Workspace model/graph   | No                    | Yes               | Describe the current software system |
| Context and agent sync  | No                    | Yes               | Ground AI tools in shared evidence   |
| Impact/verify/readiness | No                    | Yes               | Govern changes and releases          |

For the main Workspai architecture, start with
[workspace-knowledge-graph.md](./workspace-knowledge-graph.md) and
[workspace-intelligence-runner.md](./workspace-intelligence-runner.md).
