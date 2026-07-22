# AI Recommender Architecture

This document describes the optional module recommender implementation for
contributors. It does not define the canonical Workspace Intelligence chain.

## Runtime flow

```text
ai recommend
    ↓
load user configuration and provider mode
    ↓
load module catalog + compatible embeddings
    ↓
embed the query
    ↓
rank by cosine similarity
    ↓
return human or JSON recommendations
    ↓ optional, interactive
validate project `add` capability → Core bridge module install
```

## Source ownership

| Concern                          | Source area                                 |
| -------------------------------- | ------------------------------------------- |
| Command and error behavior       | `src/commands/ai.ts`                        |
| Provider/mock embedding client   | `src/ai/openai-client.ts`                   |
| Module catalog and Core fallback | `src/ai/module-catalog.ts`                  |
| Ranking                          | `src/ai/recommender.ts`                     |
| Catalog generation/update        | `src/ai/embeddings-manager.ts`              |
| User configuration               | `src/config/user-config.ts`                 |
| Core process boundary            | `src/core-bridge/pythonRapidkitExec.ts`     |
| Project command capability       | `src/utils/project-command-capabilities.ts` |

## Catalog resolution

The recommender prefers compatible bundled catalog data. Development refreshes
can request module metadata through the validated Core bridge. If Core is not
available, a bounded fallback catalog permits basic discovery.

Catalog records must preserve their embedding model and dimension metadata.
Never combine vectors produced by incompatible models. Catalog caches are
in-process optimizations, not durable sources of truth.

## Failure behavior

- Missing provider key selects mock mode for `recommend`.
- Missing catalog in provider mode returns a structured remediation pointing to
  `ai generate-embeddings`.
- Provider authentication, rate-limit, and network failures return non-zero.
- Invalid or unavailable project `add` capability blocks installation without
  weakening the recommendation response.
- Human and JSON output must preserve the same underlying result semantics.

## Security boundaries

- Provider secrets come from user configuration or environment, never workspace
  evidence.
- Logs and JSON responses must not emit provider keys.
- Core commands execute through the shared bridge rather than ad-hoc process
  spawning.
- Module recommendation is advisory; installation remains capability-gated and
  verification remains the responsibility of project/Workspace Intelligence
  commands.

## Testing expectations

Changes to this area require coverage for:

- provider and mock modes;
- missing/invalid configuration;
- catalog present, missing, and incompatible cases;
- deterministic ranking fixtures;
- JSON error contracts and non-zero exits;
- supported and unsupported Core installation capabilities;
- secret redaction.

Use [AI_QUICKSTART.md](./AI_QUICKSTART.md) for user setup and
[AI_FEATURES.md](./AI_FEATURES.md) for the public behavioral contract.
