# Release Notes: v0.16.4

**Date:** February 2, 2026  
**Type:** Patch Release  
**Compatibility:** ✅ Fully backward compatible

---

## 📝 Overview

This patch release focuses on documentation quality, test stability, and code quality improvements. No breaking changes.

---

## 📝 What's Improved

### Documentation Quality
- **Standardized documentation language**
  - Workspace comparison guide reviewed and polished for clarity
  - Development runbooks enhanced and consistently formatted
  - All public-facing documentation now consistently styled

### Test Stability
- **Enhanced workspace registration tests**
  - Tests now account for Python discovery side-effects in Poetry workflows
  - Improved assertions to be more flexible and resilient
- **Workspace marker tests improved**
  - Added tests with real temporary directories for realistic behavior
  - Reduced brittle assertions that depend on exact call sequences
  - Better isolation and maintenance

### Code Quality
- **Test coverage** maintained above 80% threshold
  - All 488+ tests passing with improved reliability
  - Improved test robustness across the suite
- **Build metrics validated**
  - Bundle size: 116 KB
  - Test coverage: 80%+
  - ESLint: 0 errors, minimal warnings

---

## 🔧 Installation

### Install Globally
```bash
npm install -g rapidkit@0.16.4
```

### Use with npx
```bash
npx rapidkit@0.16.4 create project fastapi.standard my-api --output .
npx rapidkit@0.16.4 workspace list
```

---

## ⚠️ Deprecation Notices

None for this release.

---

## 🔗 Related Releases

- **Previous:** [v0.16.3](RELEASE_NOTES_v0.16.3.md) — Template fixes & Python Core 0.2.2 compatibility
- **Next:** [v0.16.5](RELEASE_NOTES_v0.16.5.md) (planned)

---

## 📚 Documentation

For complete changelog, see [CHANGELOG.md](../CHANGELOG.md).

## 🙏 Contributors

Thanks to the RapidKit team for the improvements in this release.
