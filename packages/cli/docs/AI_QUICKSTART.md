# Optional AI Module Recommendations

Workspai has two different AI-facing capabilities:

1. **Workspace Intelligence** builds deterministic model, graph, impact,
   verification, context, and agent artifacts. It does not require an API key.
2. **AI module recommendations** use embeddings to suggest optional RapidKit
   modules from a natural-language description. This page covers only that
   optional recommender.

## Try it without an API key

```bash
npx workspai ai recommend "authentication with email"
```

When no OpenAI key is configured, the command uses deterministic mock mode. Mock
mode is useful for testing the command flow; its ranking is not suitable for a
production module decision.

## Use provider-backed recommendations

Prefer an environment variable in CI or short-lived shells:

```bash
export OPENAI_API_KEY="<your-key>"
npx workspai ai recommend "authentication with email" --number 5
```

For local interactive use, Workspai can store the key in the user configuration:

```bash
npx workspai config set-api-key
npx workspai config show
```

Do not pass secrets through `--key` in shared terminals or CI logs. Use an
environment secret instead.

Published packages normally include the module embedding catalog. If the
catalog is missing or intentionally being refreshed:

```bash
npx workspai ai generate-embeddings
npx workspai ai update-embeddings
```

Both commands require a provider key and may incur provider charges.

## Script-friendly output

```bash
npx workspai ai recommend "database caching" --number 3 --json
```

Recommendation scores are embedding similarity values. They are not confidence
probabilities, security approvals, compatibility guarantees, or measured task
accuracy. Verify runtime compatibility and module dependencies before install.

## Install a selected module

Module installation is available only in projects whose validated Core bridge
reports the `add` capability:

```bash
npx workspai add module <module-id>
```

If the project does not expose that capability, the recommender can still return
suggestions but Workspai will refuse the installation step with a reason.

## Troubleshooting

| Symptom                         | What to do                                                                 |
| ------------------------------- | -------------------------------------------------------------------------- |
| AI features are disabled        | `npx workspai config ai enable`                                            |
| Provider key is missing         | Use mock mode or set `OPENAI_API_KEY`                                      |
| Embedding catalog is missing    | Run `npx workspai ai generate-embeddings`                                  |
| Provider returns 401            | Replace the key; never paste it into an issue                              |
| Provider returns 429            | Check the provider quota/rate limit and retry later                        |
| Recommendation looks irrelevant | Use a clearer requirement and treat the score as similarity, not certainty |
| Module install is refused       | Run the command inside a module-enabled project and inspect its capability |

For full behavior and architecture, see [AI_FEATURES.md](./AI_FEATURES.md) and
[AI_DYNAMIC_INTEGRATION.md](./AI_DYNAMIC_INTEGRATION.md).
