# Release Notes - v0.18.1

**Release Date:** February 9, 2026  
**Type:** Patch Release  
**Status:** Stable

## Overview

This patch release fixes a cross-platform compatibility issue in the test suite that was causing Windows CI failures.

## Bug Fixes

### 🐛 Fixed Cross-Platform Path Normalization Test
- **Issue:** Path normalization test was expecting Unix-style forward slashes, but Windows returns backslashes from `path.normalize()`
- **Impact:** Windows CI pipeline was failing on `create-helpers.test.ts`
- **Solution:** Updated test to use regex pattern matching that accepts both Unix (/) and Windows (\\) path separators
- **File:** `src/__tests__/create-helpers.test.ts`
- **Test:** Path Operations > should normalize paths

## Changelog

### Fixed
- 🐛 Fixed cross-platform path normalization test for Windows CI
  - Updated path test to use regex pattern accepting both Unix (/) and Windows (\) path separators
  - Resolves Windows CI failure in create-helpers.test.ts

## Compatibility

✅ **Fully backward compatible** - No API changes, no breaking changes

## Installation

```bash
npm install -g rapidkit@0.18.1
```

Or upgrade from an earlier version:

```bash
npm install -g rapidkit
```

## Testing

All tests pass on all platforms:
- ✅ Ubuntu (Linux)
- ✅ macOS
- ✅ Windows

**Test Summary:** 628 tests passing, 13 skipped

## Notes

This is a maintenance release that improves CI/CD reliability without affecting end-users.

---

**Previous Release:** [v0.18.0](RELEASE_NOTES_v0.18.0.md)
