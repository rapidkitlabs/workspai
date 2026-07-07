# Release Notes v0.11.3

**Release Date:** December 3, 2025

## 🎯 Highlights

This release adds **local RapidKit CLI commands** to demo projects, providing a consistent command interface that matches the full RapidKit Python CLI. Demo projects now include a `.rapidkit/` folder with a local launcher that enables `rapidkit init`, `rapidkit dev`, and other commands.

## ✨ New Features

### Local RapidKit Commands
Demo projects now support familiar `rapidkit` CLI commands without needing the full Python package installed:

```bash
cd my-demo-project

rapidkit init       # Install dependencies via poetry
rapidkit dev        # Start dev server with hot reload (port 8000)
rapidkit start      # Start production server
rapidkit test       # Run tests
rapidkit help       # Show available commands
```

### .rapidkit/ Folder Structure
Each demo project now includes:
```
my-project/
├── .rapidkit/
│   ├── project.json    # Project metadata (kit, profile, version)
│   ├── cli.py          # Python CLI handler for commands
│   └── rapidkit        # Bash launcher script
├── src/
├── tests/
└── pyproject.toml
```

## 📝 Documentation Updates

- **README.md** - Updated all examples to use `rapidkit init` and `rapidkit dev`
- **README.md.j2** template - Consistent rapidkit commands in generated READMEs
- **Demo workspace structure** - Now shows `.rapidkit/` folder in project tree
- **Success messages** - Display rapidkit commands with helpful emoji descriptions

## ✅ Testing

- **6 new tests** added for `.rapidkit/` folder generation
- **431 total tests** (all passing)
- Tests cover:
  - Folder structure creation
  - File permissions (executable on Unix)
  - project.json content validation
  - cli.py command handler content
  - rapidkit launcher script content

## 🐛 Bug Fixes

- Fixed template string escaping for bash variables (`${1:-}`) in embedded scripts

## 📦 Installation

```bash
# Create demo workspace with new features
npx rapidkit@0.11.3 my-workspace --demo
cd my-workspace

# Generate a project
node generate-demo.js my-api
cd my-api

# Use rapidkit commands
rapidkit init
rapidkit dev
```

## 🔄 Upgrade

If you have existing demo projects, regenerate them to get the new `.rapidkit/` folder:

```bash
cd my-workspace
node generate-demo.js new-project
```

## 📊 Stats

- **Bundle Size:** ~34KB (no change)
- **Tests:** 431 passed
- **Coverage:** 74%+

---

**Full Changelog:** [CHANGELOG.md](./CHANGELOG.md)
