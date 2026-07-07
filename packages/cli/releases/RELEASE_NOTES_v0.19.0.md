# Release Notes - v0.19.0

**Release Date:** February 10, 2026  
**Type:** Minor Release  
**Status:** Stable

## Overview

This minor release introduces the **AI-powered module recommender** - an intelligent system that uses OpenAI embeddings and semantic search to recommend RapidKit modules based on natural language queries. The feature includes dynamic module fetching from Python Core, auto-generation of embeddings, mock mode for testing, and secure API key management.

## New Features

### 🤖 AI Module Recommender

The AI module recommender understands your intent and suggests the most relevant RapidKit modules using semantic search powered by OpenAI embeddings.

**Key Features:**
- 🧠 **Semantic Search** - Understands intent, not just keywords
- 🔄 **Dynamic Module Fetching** - Real-time sync with Python Core (27+ production modules)
- 📦 **Production Modules** - Recommendations include: auth_core, oauth, db_postgres, stripe_payment, redis, email, and more
- 🤖 **Auto-Generation** - Automatic embedding setup with interactive prompts
- ✅ **Mock Mode** - Test without API key using deterministic embeddings
- 🎯 **High Accuracy** - Cosine similarity algorithm with 92%+ match scores
- 💰 **Ultra-Cheap** - ~$0.0002 per query after ~$0.50 one-time setup
- ⚡ **Fast** - 5-minute cache, ~50ms per query
- 🛡️ **Resilient** - Graceful fallback to 11 hardcoded modules if Core unavailable

**Usage Examples:**

```bash
# Get authentication module recommendations
rapidkit ai recommend "authentication with JWT and OAuth"

# Top 3 database recommendations
rapidkit ai recommend "PostgreSQL database connection" -n 3

# JSON output for scripting
rapidkit ai recommend "payment processing" --json

# Show AI features info
rapidkit ai info
```

**Example Output:**

```
📦 Recommended Modules:

1. Authentication Core
   Opinionated password hashing, token signing, and runtime ...
   Match: 94.3% - Matches: auth, passwords, security, tokens
   Category: auth

2. OAuth Providers
   Lightweight OAuth 2.0 scaffolding with provider registry
   Match: 92.7% - Matches: auth
   Category: auth

3. Session Management
   Production-ready session handling with Redis backend
   Match: 89.5% - Matches: auth, session
   Category: auth

💡 Quick install (top 3):
   rapidkit add module auth_core oauth session
```

### 🛠️ New CLI Commands

**AI Commands:**
- `rapidkit ai recommend [query]` - Get module recommendations with match scores
- `rapidkit ai recommend [query] -n <N>` - Get top N recommendations (default: 5)
- `rapidkit ai recommend [query] --json` - JSON output for scripting/automation
- `rapidkit ai generate-embeddings` - Generate embeddings (one-time setup)
- `rapidkit ai generate-embeddings --force` - Force regenerate embeddings
- `rapidkit ai update-embeddings` - Update embeddings with latest modules
- `rapidkit ai info` - Show AI features, pricing, and getting started guide

**Config Commands:**
- `rapidkit config set-api-key` - Configure OpenAI API key (interactive or --key option)
- `rapidkit config show` - View current configuration (API key masked)
- `rapidkit config remove-api-key` - Remove stored API key
- `rapidkit config ai enable|disable` - Toggle AI features

### 🔄 Dynamic Module Catalog

AI recommendations are powered by a dynamic module catalog that fetches the latest module list from Python Core in real-time.

**Features:**
- Single source of truth (Python Core)
- Always up-to-date recommendations
- No duplicate data maintenance
- 5-minute cache TTL
- Fallback to 11 core modules if Python unavailable

**Modules Cataloged (27+):**
- **Auth:** ai_assistant, api_keys, auth_core, oauth, passwordless, session
- **Database:** db_mongo, db_postgres, db_sqlite
- **Payment:** cart, inventory, stripe_payment
- **Communication:** email, notifications
- **Infrastructure:** celery, cors, deployment, logging, middleware, observability_core, rate_limiting, redis, security_headers, settings, storage, users_core, users_profiles

### 🔒 Security & Configuration

**API Key Management:**
- Secure storage in `~/.rapidkit/config.json` (600 permissions, owner only)
- Environment variable support: `OPENAI_API_KEY`
- Interactive setup with masked input
- Easy removal with `config remove-api-key`

**Privacy:**
- Embeddings file excluded from git (.gitignore)
- No local paths or personal information in distributed package
- Query data sent to OpenAI (standard embedding API)

### 📚 Documentation

New comprehensive documentation:
- **docs/AI_FEATURES.md** - Complete AI features guide with troubleshooting
- **docs/AI_QUICKSTART.md** - Get started in 60 seconds
- **docs/AI_EXAMPLES.md** - Real-world use cases (SaaS, E-commerce, Healthcare, Gaming)
- **docs/AI_DYNAMIC_INTEGRATION.md** - Dynamic integration architecture
- Updated README with comprehensive AI section

### 📦 New Dependencies

- `openai@^4.80.0` - Official OpenAI SDK for embeddings
- `inquirer@9.2.23` - Interactive prompts for auto-setup
- `ora@8.0.1` - Elegant terminal spinners for generation progress

## Bug Fixes

### 🐛 AI Module Name Format (Critical)

Fixed critical module ID format mismatch between AI recommender and Python Core.

**Issue:**
- AI module catalog was converting Python Core's underscore format (`ai_assistant`, `auth_core`, `db_postgres`) to dashes (`ai-assistant`, `auth-core`, `db-postgres`)
- This broke module lookups, causing incorrect or random recommendations
- Installation commands referenced non-existent dashed module names

**Solution:**
- **Module ID Format:** Now preserves underscores matching Python Core format exactly
- **API Version:** Updated to JSON Schema v1 API (`rapidkit modules list --json-schema 1`)
- **JSON Parsing:** Added extraction to handle emoji output from Python Core (🚀 RapidKit)
- **Command Routing:** Fixed routing so AI and config commands are handled by npm CLI (not forwarded to Python Core)
- **Bundle Optimization:** Externalized openai package to prevent bundling 10MB SDK

**Impact:**
- AI recommendations now correctly match Python Core module registry
- Installation commands use proper module names: `rapidkit add module auth_core oauth session`
- All 27 production modules correctly cataloged and recommendable

**Files Changed:**
- `src/ai/module-catalog.ts` - parsePythonModule(), fetchModulesFromPythonCore()
- `src/index.ts` - shouldForwardToCore()
- `tsup.config.ts` - external array

## Technical Details

**AI Architecture:**
- **Model:** text-embedding-3-small (1536 dimensions)
- **Algorithm:** Cosine similarity for semantic matching
- **Cache:** 5-minute TTL for module catalog
- **Cost:** ~$0.02 per 1M tokens (~$0.50 for 27 modules)
- **Performance:** ~50ms per query (cached), ~200ms (uncached)

**Build:**
- Bundle size: 151KB (ESM, minified)
- External dependencies: chalk, commander, execa, fs-extra, inquirer, nunjucks, **openai**, ora, validate-npm-package-name
- Target: Node.js 18+

**Module Catalog:**
- Dynamic fetch: `execAsync('rapidkit modules list --json-schema 1')`
- Cache TTL: 5 minutes
- Fallback: 11 hardcoded modules
- Format: JSON Schema v1 with metadata (name, display_name, version, category, tags, description)

## Testing

**Test Coverage:**
- ✅ **691 tests passing** (76 new AI tests)
- 13 tests skipped (e2e requiring Python Core)
- 35 test files passed
- Mock mode tests (no API key needed)
- Integration tests for auto-generation flow

**Mock Embeddings:**
- Generated for 27 production modules
- Deterministic vectors using hash-based LCG
- 1536-dimensional normalized vectors
- Tests cosine similarity matching

## Compatibility

✅ **Fully backward compatible** - All existing features work unchanged

**Requirements:**
- Node.js 18 or higher
- RapidKit Python Core (for dynamic module list, optional)
- OpenAI API key (for production recommendations, optional for mock mode)

## Installation

**New Installation:**

```bash
npm install -g rapidkit@0.19.0
```

**Upgrade from Earlier Version:**

```bash
npm install -g rapidkit
```

## Quick Start

**1. Get AI Recommendations (Mock Mode - No API Key):**

```bash
rapidkit ai recommend "authentication with OAuth"
```

**2. Configure OpenAI API Key (Optional - For Production):**

```bash
rapidkit config set-api-key
# Enter your OpenAI API key when prompted
```

**3. Generate Real Embeddings:**

```bash
rapidkit ai generate-embeddings
# Cost: ~$0.50 one-time for 27 modules
```

**4. Get Better Recommendations:**

```bash
rapidkit ai recommend "PostgreSQL with async support" -n 5
```

## Migration Notes

**No breaking changes** - AI features are additive.

**If you previously:**
- Used RapidKit without AI: No action needed, AI is opt-in
- Tested AI feature branch: Regenerate embeddings with fixed module names

**Recommendations:**
1. Configure your OpenAI API key for best results
2. Run `rapidkit ai info` to learn about features
3. Try mock mode first to understand the feature

## Known Limitations

**Mock Embeddings:**
- Provide approximate results for testing
- Use hash-based generation (not AI-powered)
- Recommendations may be less accurate than production mode

**For Production:**
- Configure OpenAI API key for semantic search
- Generate real embeddings (~$0.50 one-time cost)
- Enjoy 92%+ match accuracy

## Pricing

**OpenAI Costs:**
- **Setup:** ~$0.50 one-time (generate embeddings for 27 modules)
- **Per Query:** ~$0.0002 (practically free)
- **Monthly:** ~$0.06 if querying 300 times/month
- **Free Tier:** OpenAI offers $5 free credits for new accounts

## What's Next

**Planned for v0.20.0:**
- Telemetry for usage analytics
- VS Code Extension AI integration
- Enhanced module recommendations with dependency graphs
- Multi-language support

## Notes

This release represents a major enhancement to RapidKit's developer experience with intelligent, AI-powered module discovery. The dynamic integration with Python Core ensures recommendations are always current with the latest modules.

---

**Previous Release:** [v0.18.1](RELEASE_NOTES_v0.18.1.md)  
**Next Release:** TBD
