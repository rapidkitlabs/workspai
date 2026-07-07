# Workspai

Workspace Intelligence for Software Systems

Build an evidence-backed understanding of your software system for AI agents, developer tools, and engineering teams.

This repository is the monorepo home for Workspai packages. The first published package is the CLI:

```bash
npx workspai --help
npx wspai --help
```

`workspai` is the canonical package. `wspai` is the short npm alias for `npx` workflows.

## Packages

| Package | Status | Purpose |
| --- | --- | --- |
| `packages/cli` | Active | `workspai`, the Workspai command-line interface |
| `packages/wspai` | Active | `wspai`, the short npm alias package for `npx wspai ...` |
s| `packages/mcp` | Planned | MCP server package boundary |
| `packages/sdk` | Planned | Public SDK package boundary |

Only `workspai` and its short alias package `wspai` are published from this repository today.

## Development

```bash
npm ci
npm run build
npm test
```

CLI package-specific commands can be run directly:

```bash
npm --workspace workspai run validate
```

## Brand Boundary

Workspai is the product and npm CLI surface. RapidKit Core remains the Python engine contract used by the CLI bridge, including `rapidkit-core`, `.rapidkit`, and the Python `rapidkit` console script.
