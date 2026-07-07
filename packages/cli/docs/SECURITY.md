# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.35.x (latest minor) | :white_check_mark: |
| < 0.35.0 | :x: |

During the `0.x` phase, only the latest minor line receives security fixes.

## Known Security Considerations

### Development Dependencies

Our CI/CD pipeline may report moderate severity vulnerabilities in development dependencies (vitest, vite, esbuild). These packages are:

- ✅ **Only used during development and testing**
- ✅ **Not included in the published npm package**
- ✅ **Not shipped to end users**
- ✅ **Do not affect runtime security**

The published package only includes runtime dependencies required for workspace creation.

### Production Dependencies

We actively monitor and address any security vulnerabilities in production dependencies that are shipped with the package.

## Reporting a Vulnerability

If you discover a security vulnerability in Workspai, please report it by emailing **security@workspai.dev** or opening a private security advisory on GitHub.

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

We will respond within 48 hours and work to address critical issues as quickly as possible.

## Security Best Practices

When using Workspai:

1. **Keep dependencies updated**: Run `npm update` regularly
2. **Review generated code**: Always review the workspace structure before deployment
3. **Use official releases**: Install from npm registry, not from git directly
4. **Verify package integrity**: Use `npm audit` on your generated project

## Security Scanning

We use:
- GitHub Security Advisories
- npm audit (production dependencies)
- Dependabot for automated updates
- Regular manual security reviews

## Updates

Security updates are released as patch versions on the latest `0.x` minor line and announced in:
- GitHub Releases
- CHANGELOG.md
- npm package updates
