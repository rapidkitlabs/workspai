# RapidKit Runtime Support Matrix

Last updated: 2026-06-04

This document defines the public support contract for RapidKit npm workspace projects.
It separates three concerns:

- **First-class**: curated RapidKit kit/framework with scaffold/import/govern/lifecycle support. Module mutation still follows the runtime row below.
- **Extended**: scaffold/import/govern/lifecycle or import/govern workflows are supported, but Core module mutation is disabled unless explicitly added later.
- **Observed**: import/govern/contract visibility is supported; lifecycle commands may require manual project scripts or future adapters.

## Runtime Tiers

| Runtime             | Tier        | Scaffold | Import | Lifecycle Commands                                | Module Commands | Doctor    |
| ------------------- | ----------- | -------: | -----: | ------------------------------------------------- | --------------: | --------- |
| Python              | first-class |      yes |    yes | init, dev, start, build, test, lint, format, help |             yes | full      |
| Node.js             | first-class |      yes |    yes | init, dev, start, build, test, lint, format, help |             yes | full      |
| Go                  | extended    |      yes |    yes | init, dev, start, build, test, lint, format, help |              no | readiness |
| Java / Spring Boot  | extended    |      yes |    yes | init, dev, start, build, test, lint, format, help |              no | readiness |
| .NET / ASP.NET Core | extended    |      yes |    yes | init, dev, start, build, test, lint, format, help |              no | readiness |
| PHP                 | observed    |       no |    yes | help                                              |              no | observed  |
| Ruby                | observed    |       no |    yes | help                                              |              no | observed  |
| Rust                | observed    |       no |    yes | help                                              |              no | observed  |
| Elixir              | observed    |       no |    yes | help                                              |              no | observed  |
| Clojure             | observed    |       no |    yes | help                                              |              no | observed  |
| Scala               | observed    |       no |    yes | help                                              |              no | observed  |
| Kotlin              | observed    |       no |    yes | help                                              |              no | observed  |
| Deno                | observed    |       no |    yes | help                                              |              no | observed  |
| Bun                 | observed    |       no |    yes | help                                              |              no | observed  |
| Unknown             | observed    |       no |    yes | help                                              |              no | observed  |

## Framework Tiers

| Tier        | Frameworks                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| first-class | FastAPI, NestJS                                                                                                                                              |
| extended    | Go/Fiber, Go/Gin, Spring Boot, ASP.NET Core, Django, Flask, Express, Fastify, Koa, Echo, Laravel, Symfony, Rails, Sinatra, Actix, Axum, Rocket, Phoenix     |
| observed    | Python, Node.js, Go, Java, PHP, Ruby, Rust, Elixir, Unknown/generic projects                                                                                |

## Import Policy

Imported projects are **observed and governed by default**:

- RapidKit writes `.rapidkit/project.json` so workspace contract, graph, doctor, and sharing flows can discover the project.
- RapidKit writes `.rapidkit/import.json` and `.rapidkit/import-readiness.json` for auditability.
- Secrets and dependency/build caches are not copied during local-folder import.
- `module_support` defaults to `false` for imported projects unless existing RapidKit metadata explicitly opts in.

This keeps imports safe for arbitrary repositories while still enabling workspace-level visibility and lifecycle support where adapters exist.

## Executable Acceptance Gate

The runtime support contract is validated by
[RUNTIME_ACCEPTANCE_MATRIX.md](RUNTIME_ACCEPTANCE_MATRIX.md).

Run the default, network-safe gate locally before release:

```bash
npm run test:runtime-matrix
```

Run the full lifecycle gate on a prepared machine with Go, Java, .NET, Python,
and Node installed:

```bash
npm run test:runtime-matrix:full
```

This gate is not wired into regular GitHub Actions yet because it creates real
workspaces and projects across multiple runtimes. Keep it manual/local until a
dedicated scheduled or manually dispatched workflow has runtime caches and cost
controls.
