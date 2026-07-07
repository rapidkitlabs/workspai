# Contributing to Workspai CLI

## Development Workflow

### Prerequisites
- Node.js 20.19.6+ and npm
- Python 3.10+ (optional, for full testing)
- Git

See package-manager policy: `docs/PACKAGE_MANAGER_POLICY.md`.

### Setup
```bash
git clone <repo-url>
cd workspai
npm install
```

### Building
```bash
npm run build          # Build for production
npm run dev            # Build and watch for changes
```

### Testing
```bash
npm test               # Run unit tests
npm run test:e2e       # Run end-to-end tests
npm run validate       # Run all checks (lint, format, test)
```

### Local Testing
```bash
npm run install:local  # Install globally for testing
workspai --version     # Test installed version
npm run uninstall:local # Uninstall after testing
```

## Release Process

### Before Publishing

1. **Sync kits from Python Core** (if you have access to core repo):
   ```bash
   npm run sync-kits
   ```
   
   This updates the bundled templates from the latest Python Core kits.
   
   **Note:** If you don't have Python Core repo locally, skip this step - 
   existing templates will be used.

2. **Update version**:
   ```bash
   # Edit package versions, or use scripts/release.sh to bump both levels
   npm version patch  # or minor, major
   ```

3. **Build and validate**:
   ```bash
   npm run build
   npm run validate
   npm run bundle-size  # Check package size
   ```

4. **Test locally**:
   ```bash
   npm run install:local
   cd /tmp
   workspai test-workspace
   cd test-workspace
   workspai create project fastapi.standard test-api
   ```

5. **Commit and tag**:
   ```bash
   git add .
   git commit -m "chore: release v0.x.x"
   git tag v0.x.x
   git push origin main --tags
   ```

### Publishing

```bash
bash scripts/release.sh patch
```

### Post-Release

- Verify on npm: https://www.npmjs.com/package/workspai
- Test installation: `npm install -g workspai@latest`
- Update GitHub release notes

## Kit Synchronization

The `npm run sync-kits` script copies the latest kit templates from Python Core.

**When to sync:**
- Before major releases
- After significant Python Core kit updates
- When fixing template bugs

**Structure:**
- Python Core kits: `/path/to/core/src/kits/`
- npm templates: `templates/kits/`

**Important:** npm uses static Jinja2 templates, while Python Core uses 
dynamic generators. They are similar but not identical.

## Fallback Mode

When Python Core is not available on the user's system, Workspai CLI uses
bundled templates in "fallback mode":

- Limited to essential kits (fastapi.standard, nestjs.standard)
- Creates basic project structure
- Includes `.rapidkit/context.json` for workspace registry compatibility
- Shows warning message to user

For full features, users should install Python Core:
```bash
pip install rapidkit-core
```

## Architecture

```
workspai/
├── packages/
│   └── cli/
│       ├── src/
│       │   ├── index.ts              # Main CLI entry
│       │   ├── core-bridge/          # Python Core integration
│       │   ├── demo-kit.ts           # Fallback template generator
│       │   ├── workspace.ts          # Workspace management
│       │   └── __tests__/
│       ├── templates/kits/   # Bundled templates (fallback)
│       ├── scripts/
│       │   └── sync-kits.sh  # Sync from Python Core
│       └── dist/             # Built files (published)
└── package.json              # Private monorepo scripts
```

## Troubleshooting

### Build fails with "Python Core not found"
This is a warning, not an error. Build will continue with existing templates.

### Tests fail with Python errors
Install Python 3.10+ and rapidkit-core:
```bash
pip install rapidkit-core
```

### Templates out of sync
Run `npm run sync-kits` to update from Python Core.
