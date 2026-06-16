# Workspace Run — Polyglot Fleet Orchestration

`workspace run` executes CI-safe stages (`init`, `test`, `build`, `start`) across discovered projects in a workspace. Command syntax is in [commands-reference.md](./commands-reference.md).

## Quick start

```bash
npx rapidkit workspace run test --parallel
npx rapidkit workspace run test --affected --since HEAD~1
npx rapidkit workspace run test --affected --blast-radius
npx rapidkit workspace run build --json --max-workers 8
```

`--blast-radius` uses `.rapidkit/workspace.contract.json` (and legacy `.rapidkit/workspace-dependency-graph.json` as fallback) to expand direct `dependsOn` and publish/consume event relationships.

## Supported runtimes

| Runtime | Frameworks | Status |
| --- | --- | --- |
| Node | NestJS, Express, Next.js, Nuxt | Built-in |
| Go | Fiber, Gin, Echo, Chi | Built-in |
| Java | Spring Boot, Quarkus, Gradle | Built-in |
| Python | FastAPI, Django, Flask, Poetry | Built-in |
| PHP | Laravel, Symfony, Slim | Observed |
| Rust | Actix, Axum, Rocket, Tokio | Observed |
| .NET | ASP.NET Core, Entity Framework | Built-in |
| Elixir | Phoenix, Umbrella | Observed |
| Ruby | Rails, Sinatra, RSpec | Observed |

Public scaffold/import/lifecycle contract: [contracts/RUNTIME_SUPPORT_MATRIX.md](./contracts/RUNTIME_SUPPORT_MATRIX.md).

## Enterprise configuration

Override stage commands per project via `.rapidkit/context.json`:

```json
{
  "runtime": "php",
  "framework": "Laravel",
  "commands": {
    "test": "php artisan test --parallel=4",
    "build": "php artisan config:cache && php artisan route:cache",
    "lint": "php bin/phpstan analyse --level=8"
  },
  "environment": "dev"
}
```

Enterprise features include command overrides, multi-framework projects, error categorization (setup vs test vs runtime), preflight validation, health checks, custom stages, stage dependencies, environment variants, caching, and composite steps.

## JSON reporting

```bash
npx rapidkit workspace run test --json > test-results.json
cat test-results.json | jq '.projects[] | {path, status, errorCategory}'
```

`errorCategory` values: `setup`, `test-failure`, `runtime`, `dependency`, `timeout`.

## Command semantics

RapidKit has two workspace-level execution surfaces and three equivalent full-init aliases at workspace root:

| Command | Intent | Scope |
| --- | --- | --- |
| `init`, `workspace init`, `workspace run init` (at workspace root) | Mirrored full-init (workspace deps + project init) | Workspace + fleet |
| `workspace run <test\|build\|start>` | Fleet stage execution | Selected projects |
| `init`, `test`, `build`, `start`, `dev` (inside project dir) | Project primitive | Single project |

At workspace root, `npx rapidkit init`, `npx rapidkit workspace init`, and `npx rapidkit workspace run init` are equivalent aliases.

Inside a project directory, `npx rapidkit init` remains project-scoped.

`dev` is excluded from `workspace run` — it is a long-running local process, not a CI batch stage.

## See also

- [Documentation index](./README.md)
- [commands-reference.md](./commands-reference.md)
- [contracts/RUNTIME_SUPPORT_MATRIX.md](./contracts/RUNTIME_SUPPORT_MATRIX.md)
