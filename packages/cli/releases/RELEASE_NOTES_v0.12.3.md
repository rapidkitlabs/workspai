# Release Notes - RapidKit npm v0.12.3

**Release Date:** December 4, 2025

## 🎯 Smart CLI Delegation: Seamless Project Integration

This release introduces **automatic context detection** so the global `rapidkit` command intelligently delegates to your project's local CLI. No more confusion between global and local commands!

---

## ✨ What's New

### 🧠 Auto-Delegating Global CLI

**Before (v0.12.2):**
```bash
npx rapidkit my-api --template fastapi
cd my-api
source .rapidkit/activate          # ❌ Still need to activate
rapidkit init                       # ❌ Uses global npm CLI
```

**After (v0.12.3):**
```bash
npx rapidkit my-api --template fastapi
cd my-api
rapidkit init                       # ✅ Automatically delegates to local CLI!
rapidkit dev                        # ✅ Works seamlessly!
```

### 🔍 How Smart Delegation Works

The global `rapidkit` command now:

1. **Detects project context** - Walks up directory tree looking for `.rapidkit/context.json`
2. **Identifies engine type** - Checks if project uses `pip` (Python) or `npm` (Node.js)
3. **Routes commands intelligently** - Automatically delegates to the appropriate local launcher
4. **Shows helpful warnings** - Guides users when operating on pip-engine projects

**Supported delegation commands:**
- `init` - Initialize project dependencies
- `dev` - Start development server
- `start` - Start production server
- `build` - Build project
- `test` - Run tests
- `lint` - Run linter
- `format` - Format code
- `help` - Show help

### 🚀 Benefits

- ✅ **No confusion** - Users don't need to think about `./rapidkit` vs `rapidkit`
- ✅ **One workflow** - Same commands work regardless of location in project tree
- ✅ **Better UX** - Helpful messages guide pip-engine project users to run `rapidkit init`
- ✅ **Backwards compatible** - Existing workflows continue to work
- ✅ **Faster development** - Jump into any project and run `rapidkit dev` immediately

### 📋 Technical Details

- Added `findLocalLauncherUpSync()` to detect project-local CLI in sync phase
- Modified top-level IIFE to allow delegation even for pip-engine projects when local launcher exists
- Enhanced `delegateToLocalCLI()` async function with robust error handling
- Graceful fallback when context.json is unreadable or missing

---

## 🐛 Fixes

- **Context Detection** - More robust handling of missing or malformed `context.json` files
- **Permission Handling** - Improved execution permission detection for local launchers
- **Error Messages** - Clearer, more actionable guidance for users

---

## 📚 Updated Documentation

- ✅ **README.md** - Updated workflow to showcase auto-delegation
- ✅ **docs/README.md** - Project CLI section now reflects smart delegation
- ✅ **docs/DEVELOPMENT.md** - Updated manual testing guide
- ✅ **All guides** - Simplified to use `rapidkit <command>` directly

---

## 🧪 Testing

- ✅ All 431 existing tests passing
- ✅ Tested with pip-engine projects (FastAPI)
- ✅ Tested with npm-engine projects (NestJS)
- ✅ Context detection validated across directory structures
- ✅ Fallback behavior verified when local CLI missing

---

## 💡 Tips

**For Project Maintainers:**
- Your local `.rapidkit/rapidkit` launcher is now automatically discovered by the global CLI
- Users can run commands from anywhere in your project tree
- Use `rapidkit help` to see available commands

**For Users:**
- No need to think about `./rapidkit` anymore
- Just run `rapidkit <command>` from anywhere in your project
- Global `rapidkit` will intelligently route to your project's local CLI

---

## 🔗 Related Changes

- See v0.12.4 for improved activation UX with green headers and robust fallback logic
- See v0.12.2 for simplified initialization workflow
- See v0.12.0 for NestJS template support and workspace modes
