# RapidKit v0.12.6 Release Notes

**Release Date:** December 12, 2025

## 🎯 Quality & Security Infrastructure

This release introduces a comprehensive quality and security infrastructure to ensure code reliability, maintainability, and safety.

## ✨ What's New

### Quality Metrics System

A brand new automated metrics system to track and validate project quality:

- **`scripts/metrics.ts`** - Automated metrics collector
  - Bundle size tracking (target: < 500 KB)
  - Test coverage monitoring (target: > 80%)
  - ESLint error/warning counts
  - Security vulnerability tracking
  - Dependency health checks

- **New npm Script:** `npm run metrics`
  ```bash
  📊 Collecting metrics...

  📦 Bundle size: 34 KB
  🎯 Test coverage: 85%
  🧪 Tests: 431/431 passing
  🧹 ESLint: 0 errors, 1 warning
  📚 Dependencies: 41
  🔒 Security vulnerabilities: 0

  🎯 Metrics Validation:
  ✅ Bundle size: 34 KB (target: <500 KB)
  ✅ Test coverage: 85% (target: >80%)
  ✅ ESLint errors: 0 (target: 0)
  ✅ Security vulnerabilities: 0 (target: 0)
  ```

- **Complete Documentation:** `docs/METRICS.md`
  - Metrics targets and rationale
  - Collection instructions
  - CI/CD integration guide
  - Best practices

### Enhanced Pre-commit Hooks

Stricter quality gates before every commit:

```bash
🔍 Running type check...
✅ Type check passed

🧹 Running linter...
✅ Linting passed

💅 Checking code formatting...
✅ Format check passed

🧪 Running tests...
✅ All 431 tests passed

✅ All checks passed!
```

**What runs:**
1. TypeScript type checking (`tsc --noEmit`)
2. ESLint validation
3. Prettier format checking
4. Full test suite (431 tests)

### Commit Message Validation

New `.husky/commit-msg` hook enforces [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# ✅ Valid
git commit -m "feat(cli): add metrics tracking"
git commit -m "fix(hooks): correct type checking path"
git commit -m "docs: update metrics documentation"

# ❌ Invalid
git commit -m "added metrics"
git commit -m "WIP"
```

**Supported types:**
- `feat` - New features
- `fix` - Bug fixes
- `docs` - Documentation changes
- `style` - Code style changes
- `refactor` - Code refactoring
- `perf` - Performance improvements
- `test` - Test updates
- `build` - Build system changes
- `ci` - CI/CD changes
- `chore` - Maintenance tasks
- `revert` - Revert commits

### Security & Quality Automation

Two new GitHub Actions workflows:

**1. Security Workflow** (`.github/workflows/security.yml`)
- Runs daily at 2 AM UTC
- Triggers on every push and PR
- npm audit with artifact uploads
- Dependency update checks
- Historical security tracking

**2. Metrics Workflow** (`.github/workflows/metrics.yml`)
- Runs on every PR and push to main/develop
- Collects all metrics
- Validates bundle size (fails if > 500KB)
- Uploads coverage to Codecov
- Generates quality badges

### Code Quality Improvements

**ESLint Refinements:**
- Warnings reduced from **61 → 1** (98% reduction!)
- Context-aware rules:
  - Strict type checking in production code
  - Relaxed rules in test files (allow `any` for mocking)
- Only 1 warning remaining in production code (`src/index.ts:240`)

**New npm Scripts:**
```bash
npm run quality        # Run all checks (validate + security + metrics)
npm run security:fix   # Auto-fix vulnerabilities
npm run metrics        # Collect and validate metrics
```

## 📊 Current Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Bundle Size | < 500 KB | 34 KB | ✅ |
| Test Coverage | > 80% | 85%+ | ✅ |
| ESLint Errors | 0 | 0 | ✅ |
| ESLint Warnings | < 10 | 1 | ✅ |
| TypeScript Errors | 0 | 0 | ✅ |
| Tests Passing | 100% | 431/431 | ✅ |
| Security Vulns | 0 | 0 | ✅ |

## 📚 New Documentation

- **`docs/METRICS.md`** - Complete metrics guide
  - Metrics definitions and targets
  - Manual and automated collection
  - CI/CD integration
  - Best practices

- **`QUALITY_IMPROVEMENTS.md`** - Implementation summary
  - Detailed breakdown of changes
  - Current status
  - Usage instructions
  - Next steps

## 🚀 Upgrade Guide

### From v0.12.5 to v0.12.6

1. **Update package:**
   ```bash
   npm update -g rapidkit@latest
   # or
   npx rapidkit@latest --version  # Should show 0.12.6
   ```

2. **Try new quality commands:**
   ```bash
   npm run quality    # Run all checks
   npm run metrics    # View metrics
   ```

3. **Update git hooks (if you have local modifications):**
   ```bash
   npx husky install
   chmod +x .husky/pre-commit .husky/commit-msg
   ```

## 🔧 Breaking Changes

None! This release is fully backward compatible.

## 🐛 Bug Fixes

- Fixed ESLint configuration for test files
- Improved git hook reliability
- Enhanced error messages in metrics collection

## 📈 Impact

**For Contributors:**
- Stricter quality gates ensure code reliability
- Automated checks catch issues before CI
- Clear feedback on what needs fixing

**For Users:**
- Higher quality releases
- Better security posture
- Transparent quality metrics

**For Maintainers:**
- Easier code reviews
- Automated quality tracking
- Historical metrics for trend analysis

## 🎓 Best Practices

1. **Before committing:** Run `npm run validate`
2. **Before releasing:** Run `npm run quality`
3. **Weekly:** Check `npm outdated`
4. **Monthly:** Review security advisories

## 📖 Resources

- [Metrics Documentation](../docs/METRICS.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [Security Policy](../SECURITY.md)
- [Conventional Commits](https://www.conventionalcommits.org/)

## 🙏 Credits

This release focused on infrastructure improvements to ensure long-term code quality and security.

---

**Full Changelog:** [CHANGELOG.md](../CHANGELOG.md)
