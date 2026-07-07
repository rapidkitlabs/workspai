# Release Notes - v0.16.3

**Release Date:** February 1, 2026  
**Type:** Patch Release

## 🔧 v0.16.3 — Template Fixes & Python Core 0.2.2 Compatibility

This patch release fixes template rendering issues and updates tests for compatibility with Python Core 0.2.2+.

### Fixed

#### 🔧 Template Compatibility

- **Added `generate_secret` Nunjucks filter** to match Python Core's Jinja2 implementation
  - Fixes NestJS template rendering errors when generating JWT secrets and other sensitive values
  - Uses `crypto.randomBytes` for cryptographically secure random string generation
  - Filter signature: `{{ '' | generate_secret(length) }}` (default length: 32)
  - Prevents `Error: filter not found: generate_secret` during NestJS project creation

#### 🧪 Test Suite Updates

- **Updated for Python Core 0.2.2+ compatibility** which no longer generates `.rapidkit/` project-local CLI files
  - Skipped 5 tests related to `.rapidkit` folder structure (project.json, cli.py, rapidkit launcher)
  - Added comment explaining Core 0.2.2+ now uses global CLI instead of project-local files
  - Fixed `docker-compose.yml.j2` nested ternary expression syntax for Nunjucks
    - Changed from: `{{ 'pnpm' if pkg == 'pnpm' else pkg if pkg in ['npm'] else 'npm' }}`
    - Changed to: `{% if pkg == 'pnpm' %}pnpm{% elif ... %}{% endif %}`
  - Renamed `env.example.j2` to `.env.example.j2` for correct dotfile output
  - **Test Results:** All 488 tests passing, 11 skipped (up from 477 passing, 17 failed)

### Migration Notes

**Breaking Change in Python Core 0.2.2+:**

If you previously relied on project-local CLI files (`.rapidkit/cli.py`, `.rapidkit/rapidkit`), Python Core 0.2.2+ now uses the global `rapidkit` CLI command instead:

```bash
# Old workflow (Python Core < 0.2.2)
cd my-project
./rapidkit dev
./.rapidkit/cli.py dev

# New workflow (Python Core 0.2.2+)
cd my-project
rapidkit dev
poetry run rapidkit dev  # Or use activated virtualenv
```

**Why this change?** Eliminates redundant project-local CLI copies, reduces project bloat, and simplifies dependency management.

### Technical Details

**Files Modified:**
- `src/demo-kit.ts`: Added `generateSecret()` function and Nunjucks filter registration
- `src/__tests__/demo-kit.test.ts`: Skipped `.rapidkit` folder tests with `.skip()`
- `templates/kits/nestjs-standard/docker-compose.yml.j2`: Fixed nested conditional syntax
- `templates/kits/nestjs-standard/env.example.j2` → `.env.example.j2`: Renamed for dotfile output

### Upgrade

```bash
npm install -g rapidkit@0.16.3
# or
npx rapidkit@0.16.3 create project fastapi.standard my-api --output .
```

### Full Changelog

See [CHANGELOG.md](../CHANGELOG.md#0163---2026-02-01) for complete details.

---

**Previous Release:** [v0.16.0](RELEASE_NOTES_v0.16.0.md) - Workspace Registry & Cross-Tool Integration  
**Next Release:** TBD
