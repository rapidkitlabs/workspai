# Create Planner Capabilities

Workspai is a Workspace Intelligence platform, not a blind scaffold wrapper.
The create planner separates project creation into three lanes so developers,
CI, and AI agents share the same expectations.

## Lanes

| Lane                    | Status    | Meaning                                                                                             |
| ----------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| `native-create`         | Available | Workspai owns the scaffold contract, marker, registry, doctor, bootstrap, and workspace model path. |
| `external-create-adopt` | Planned   | A stable ecosystem generator exists, but Workspai does not yet own the full post-create contract.   |
| `adopt-only`            | Available | The project enters Workspace Intelligence through import/adopt, not native create.                  |

## Native create

Native create is reserved for kits with deterministic Workspai contracts:

- FastAPI
- NestJS
- Go Fiber and Go Gin
- Spring Boot
- ASP.NET Core Web API
- Frontend kits (`frontend.nextjs`, `frontend.vite-react`, `frontend.angular`, and related frontend generators)

These kits can be exposed through `workspai create project` because Workspai can
create the project and immediately produce the expected `.workspai` metadata,
workspace registry entries, doctor evidence, and workspace model data.

## External create, then adopt

Some ecosystems have stable external commands but are not RapidKit-native create
targets yet:

- WordPress site: `wp core download`, `wp config create`, `wp db create`, `wp core install`
- WordPress block/plugin: `npx @wordpress/create-block@latest <slug>`
- Laravel: `composer create-project laravel/laravel <name>`
- Symfony: `composer create-project symfony/skeleton <name>`
- Rails: `rails new <name>`

These are `external-create-adopt` candidates, not active native kits. Until the
post-create contract is implemented end to end, Workspai should guide users to
create externally and then adopt/import the project.

## Adopt only

If a project already exists, or if the requested runtime has no Workspai-owned
create contract, the correct lane is `adopt-only`.

Adoption still gives the project Workspace Intelligence:

- framework and runtime detection
- workspace registry membership
- doctor and analyze evidence
- workspace model and context generation
- governance, Advisor, Studio, and agent grounding

## Product rule

Do not convert an unsupported or ambiguous stack request into a different native
kit. For example, a PHP, WordPress, Laravel, Symfony, or Rails request must not
be translated into FastAPI, NestJS, Go, Java, .NET, or a frontend kit.

If native create is unavailable, the planner should explain the supported lane
and guide the user to `adopt-only` or a future `external-create-adopt` flow.

## CLI guard

`workspai create project <kit> <name>` must check the capability lane before
running any native generator or delegating to the Core engine.

If the request resolves to `external-create-adopt` or an explicit `adopt-only`
runtime, the CLI must stop early and explain:

- native create is not available yet for the requested stack
- whether the future lane is `external-create-adopt` or current `adopt-only`
- which external generator commands are relevant, when known
- how to run `npx workspai adopt <project-path>` after the project exists

This keeps AI surfaces, CI, and developer terminals aligned: unsupported stacks
are never silently rewritten into unrelated native kits.
