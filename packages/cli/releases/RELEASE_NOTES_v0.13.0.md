# Release Notes v0.13.0

📅 **Release Date:** December 22, 2025

## 🎯 Highlights

This release focuses on **test quality and coverage**, adding comprehensive NestJS tests and boosting demo-kit coverage from 75% to 90%+.

---

## 🧪 New Tests

### NestJS Test Suite
- **13 new tests** for NestJS project generation:
  - Project structure validation (src folder, .rapidkit folder)
  - Configuration files (tsconfig.json, .env.example)
  - Package manager variants (npm, yarn, pnpm)
  - Git init and skip options
  - Test folder generation

### Mock Infrastructure
- **Mocked execa** for package manager commands
  - Fast, reliable tests (no real npm/yarn/pnpm install)
  - Git commands still work normally for realistic testing

---

## 📈 Coverage Improvements

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| demo-kit.ts | 75.47% | 90.56% | **+15%** |
| Overall | 93.50% | 95.35% | +1.85% |
| Branch | 85.14% | 92.57% | +7.43% |
| Tests | 431 | 444 | +13 |

---

## 📝 Documentation

- Fixed dates in release notes
- Minor documentation corrections

---

## 📦 Install

```bash
npm install -g rapidkit@0.13.0
# or
npx rapidkit@0.13.0 my-project --template fastapi
```

---

## 🔗 Links

- [Full Changelog](../CHANGELOG.md)
- [npm Package](https://www.npmjs.com/package/rapidkit)
