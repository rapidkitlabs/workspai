# Documentation

Public documentation is split into two tracks:
- **User Track**: install, configure, and use RapidKit in open-source projects.
- **Contributor Track**: maintain/extend the npm CLI codebase.

## 📚 Available Documentation

### Getting Started

- **[../README.md](../README.md)** - Main project documentation, installation, and quick start
- **[../CHANGELOG.md](../CHANGELOG.md)** - Version history and changes
- **[SETUP.md](./SETUP.md)** - Maintainer setup, validation, and workspace smoke flow

### User Guides

- **[OPEN_SOURCE_USER_SCENARIOS.md](./OPEN_SOURCE_USER_SCENARIOS.md)** - Practical scenarios for OSS teams
- **[doctor-command.md](./doctor-command.md)** - Doctor command documentation
- **[config-file-guide.md](./config-file-guide.md)** - Configuration file reference
- **[PACKAGE_MANAGER_POLICY.md](./PACKAGE_MANAGER_POLICY.md)** - Supported package manager policy
- **[WORKSPACE_MARKER_SPEC.md](./WORKSPACE_MARKER_SPEC.md)** - Workspace marker specification

### Operations & Security

- **[SECURITY.md](./SECURITY.md)** - Security policy and vulnerability reporting
- **[mirror-config.enterprise.example.json](./mirror-config.enterprise.example.json)** - Enterprise mirror + evidence export template
- **[governance-policy.enterprise.example.json](./governance-policy.enterprise.example.json)** - Governance allowlist policy template
- **[policies.workspace.example.yml](./policies.workspace.example.yml)** - Workspace policy template

### AI Features

- **[AI_QUICKSTART.md](./AI_QUICKSTART.md)** - Quick start guide for AI-powered module recommendations
- **[AI_FEATURES.md](./AI_FEATURES.md)** - Complete AI features documentation
- **[AI_EXAMPLES.md](./AI_EXAMPLES.md)** - Real-world AI usage examples
- **[AI_DYNAMIC_INTEGRATION.md](./AI_DYNAMIC_INTEGRATION.md)** - Advanced AI integration patterns

### Contributor Docs

- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Development guide, configuration, testing, and debugging
- **[OPTIMIZATION_GUIDE.md](./OPTIMIZATION_GUIDE.md)** - Comprehensive optimization suggestions and best practices
- **[UTILITIES.md](./UTILITIES.md)** - Cache system and performance monitoring utilities documentation

## 🎯 Quick Links

### For Users

1. Start with [README.md](../README.md) for installation and basic usage
2. Try [AI_QUICKSTART.md](./AI_QUICKSTART.md) for AI-powered module recommendations
3. Use [OPEN_SOURCE_USER_SCENARIOS.md](./OPEN_SOURCE_USER_SCENARIOS.md) for practical workflows
4. Check [SECURITY.md](./SECURITY.md) for reporting/security policy
5. Check [CHANGELOG.md](../CHANGELOG.md) for latest features

### For Contributors

1. Read [DEVELOPMENT.md](./DEVELOPMENT.md) for development setup
2. Use [SETUP.md](./SETUP.md) for contributor workflow commands
3. Review [OPTIMIZATION_GUIDE.md](./OPTIMIZATION_GUIDE.md) for improvement opportunities
4. Check [UTILITIES.md](./UTILITIES.md) for cache/performance helpers
5. Validate docs JSON templates with `npm run validate:docs-examples`
6. Run full docs release checks with `npm run validate:docs`

## 📖 Documentation Structure

```
rapidkit-npm/
├── README.md                           # Main documentation
├── CHANGELOG.md                        # Version history
└── docs/
    ├── README.md                       # This file
    ├── AI_QUICKSTART.md                # AI quick start
    ├── AI_FEATURES.md                  # AI features documentation
    ├── AI_EXAMPLES.md                  # AI usage examples
    ├── AI_DYNAMIC_INTEGRATION.md       # Advanced AI integration
    ├── DEVELOPMENT.md                  # Development guide
    ├── SETUP.md                        # Setup and commands
    ├── OPEN_SOURCE_USER_SCENARIOS.md   # Publish-ready user scenarios by role
    ├── OPTIMIZATION_GUIDE.md           # Optimization suggestions
    ├── UTILITIES.md                    # Cache and performance utilities
    ├── SECURITY.md                     # Security policy
    ├── config-file-guide.md            # Configuration reference
    ├── mirror-config.enterprise.example.json # Enterprise mirror/evidence template
    ├── governance-policy.enterprise.example.json # Env policy allowlist template
    ├── policies.workspace.example.yml   # Workspace policy template
    ├── doctor-command.md               # Doctor command docs
    ├── WORKSPACE_MARKER_SPEC.md        # Workspace marker spec
    └── contracts/                      # Technical specifications
```

Enterprise governance runbook is intentionally excluded from the OSS docs index.

## 🚀 Quick Start

### Create a Project

```bash
# Canonical (recommended)
npx rapidkit create project fastapi.standard my-api
npx rapidkit create project nestjs.standard my-api

# Workspace (for multiple projects)
npx rapidkit my-workspace
```

### Use Project CLI

Use the local project launcher (`rapidkit`) after entering a generated project folder.

```bash
cd my-api
rapidkit init      # Install dependencies
rapidkit dev       # Start dev server (port 8000)
rapidkit test      # Run tests
rapidkit --help    # Show all commands
```

### Workspace Runtime Lifecycle

```bash
npx rapidkit bootstrap --profile polyglot
npx rapidkit setup python
npx rapidkit setup node --warm-deps
npx rapidkit setup go --warm-deps
npx rapidkit doctor workspace
npx rapidkit workspace list
npx rapidkit workspace policy show
npx rapidkit workspace policy set mode strict
npx rapidkit cache status
npx rapidkit mirror status
```

`npx rapidkit bootstrap` now auto-syncs legacy workspaces (missing `.rapidkit-workspace`
or newer `.rapidkit/*` foundation files) so older workspace roots can align with
the current workspace architecture without manual file creation.

Root help commands are equivalent and intentionally aligned:

```bash
npx rapidkit
npx rapidkit --help
npx rapidkit help
```
