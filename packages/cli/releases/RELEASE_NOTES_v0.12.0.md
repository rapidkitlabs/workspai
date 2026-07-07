# Release Notes - v0.12.0

**Release Date:** December 3, 2025

---

## 🎉 Highlights

This release introduces a **simplified developer experience** with the new `activate` script, unified port configuration, and improved CLI commands.

---

## ✨ New Features

### 1. `.rapidkit/activate` Script
No more dealing with `./rapidkit` or modifying PATH! Just source once and use `rapidkit` commands directly:

```bash
cd my-project
source .rapidkit/activate
rapidkit dev      # Start development server
rapidkit test     # Run tests
rapidkit build    # Build for production
```

### 2. Direct Project Creation with `--template`
Create projects instantly without the interactive workspace flow:

```bash
npx rapidkit my-api --template fastapi    # FastAPI project
npx rapidkit my-app --template nestjs     # NestJS project
```

### 3. Unified Port 8000
All templates now use port **8000** as the default development server port for consistency:
- FastAPI: `http://localhost:8000`
- NestJS: `http://localhost:8000`

---

## 🔧 Improvements

- **Simplified CLI**: `--template` option replaces the old `--demo` flag
- **Better Error Messages**: Updated to reference new `--template` syntax
- **Documentation**: Comprehensive updates to README, CHANGELOG, and docs/

---

## 📦 Installation

```bash
# Create a new project
npx rapidkit my-project --template fastapi

# Or create a workspace
npx rapidkit my-workspace
```

---

## ⚠️ Breaking Changes

| Change | Before | After |
|--------|--------|-------|
| NestJS default port | 3000 | 8000 |
| Demo flag | `--demo` | `--template` |

---

## 🚀 Quick Start

### FastAPI Project
```bash
npx rapidkit my-api --template fastapi
cd my-api
source .rapidkit/activate
rapidkit dev
# Server running at http://localhost:8000
```

### NestJS Project
```bash
npx rapidkit my-app --template nestjs
cd my-app
source .rapidkit/activate
rapidkit dev
# Server running at http://localhost:8000
```

### Workspace Mode
```bash
npx rapidkit my-workspace
cd my-workspace
source .rapidkit/activate
rapidkit new api --template fastapi
```

---

## 📝 Full Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the complete list of changes.

---

## 🙏 Contributors

Thanks to everyone who contributed to this release!

---

**Happy Coding! 🚀**
