# AI Module Recommendation Examples

These examples show useful query wording. They intentionally omit fabricated
scores and module names because results depend on the active catalog, embedding
model, provider/mock mode, and catalog revision.

## Authentication

```bash
npx workspai ai recommend \
  "email and password authentication with OAuth login and session revocation" \
  --number 5
```

Check whether returned modules cover identity storage, sessions, provider
integration, and required dependencies. A high similarity score does not prove
the implementation meets your security policy.

## SaaS billing

```bash
npx workspai ai recommend \
  "subscription billing with recurring payments, invoices, webhooks, and retries" \
  --number 5 --json
```

Use JSON when another tool will filter or present the recommendations. Review
provider-specific operational requirements before installing a payment module.

## Data and caching

```bash
npx workspai ai recommend \
  "PostgreSQL persistence with migrations and Redis caching" \
  --number 5
```

Describe both the primary capability and important constraints. This gives the
embedding query more useful meaning than a keyword list such as `db cache`.

## Background processing

```bash
npx workspai ai recommend \
  "scheduled background jobs with retries, dead-letter handling, and monitoring" \
  --number 5
```

Dependencies shown by the command are catalog metadata. Verify the current
project runtime and Core capability before applying an installation.

## A practical evaluation loop

1. Run the recommendation with a precise requirement.
2. Read the reason and declared dependencies, not only the score.
3. Compare the top candidates with project runtime and policy constraints.
4. Install only from a compatible, module-enabled project.
5. Run project tests and `workspai doctor project` after installation.

For testing a UI or script without provider usage, omit the API key and use mock
mode. Do not use mock rankings as production evidence.
