# 🤖 Workspai AI Features

AI-powered module recommendations using OpenAI embeddings to help you build faster.

## 🚀 Quick Start

### Option 1: Automatic Setup (Recommended)

Just use AI recommendations - it will guide you through setup automatically!

```bash
# First time - AI will detect missing embeddings and offer to generate them
npx workspai ai recommend "user authentication with social login"

# Output:
# ⚠️  Module embeddings not found
# AI recommendations require embeddings to be generated.
#
# ? What would you like to do?
#   🚀 Generate embeddings now (requires OpenAI API key)
#   📝 Show me how to generate them manually
#   ❌ Cancel

# Choose option 1, provide API key, and embeddings will be generated automatically!
```

### Option 2: Manual Setup

**Step 1:** Get OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)

**Step 2:** Configure API key

```bash
npx workspai config set-api-key
# Or (non-interactive environments):
export OPENAI_API_KEY="<YOUR_OPENAI_API_KEY>"
```

**Step 3:** Generate embeddings (one-time, provider-cost dependent)

```bash
npx workspai ai generate-embeddings

# Output:
# 🤖 Generating AI embeddings for Workspai modules...
# 📡 Fetching modules from Workspai...
# ✓ Found <N> modules
#
# 💰 Estimated cost: shown by CLI at runtime
#    (depends on provider pricing, model, and module count)
#
# ? Generate embeddings now? Yes
# ✔ Generated embeddings for <N> modules
# ✅ Embeddings generated successfully!
```

**Step 4:** Use AI recommendations

```bash
npx workspai ai recommend "user authentication"
```

### Option 3: Mock Mode (Testing Without API Key)

Test AI features without an OpenAI API key using deterministic embeddings:

```bash
# No API key? No problem! Mock mode activates automatically
npx workspai ai recommend "authentication"

# Output:
# ⚠️  OpenAI API key not configured - using MOCK MODE for testing
#
# 📝 Note: Mock embeddings provide approximate results for testing.
#    For production, configure your OpenAI API key:
# ...
```

Mock mode provides realistic (but not perfect) results for development and testing.

## 📦 Features

### AI Module Recommender

Get intelligent module suggestions based on natural language descriptions.

**Example:**

```bash
$ npx workspai ai recommend "I need user authentication with email"

📦 Recommended Modules:

1. authentication-core ⭐
   Complete authentication system with password hashing, JWT tokens, OAuth 2.0
   Match: 98% - Matches: auth, login, password

2. email ⭐
   Email sending with templates, SMTP/SendGrid/AWS SES support
   Match: 95% - Matches: email, notification

3. users-core
   User management system with profiles, roles, permissions
   Match: 92% - Matches: user, profile

💡 Quick install (top 3):
   workspai add module authentication-core email users-core
```

## 💰 Pricing

### One-Time Setup Cost (Estimates)

| Item                | Cost   | Notes                                            |
| ------------------- | ------ | ------------------------------------------------ |
| Generate embeddings | Varies | One-time only, depends on model and module count |
| Update embeddings   | Varies | Only when catalog changes                        |

### Per-Query Cost (After Setup, Estimates)

| Usage          | Cost     | Notes                     |
| -------------- | -------- | ------------------------- |
| Single query   | Very low | Depends on provider/model |
| 100 queries    | Low      | Depends on provider/model |
| 1,000 queries  | Moderate | Depends on provider/model |
| 10,000 queries | Higher   | Depends on provider/model |

**Important:** Provider pricing and limits change over time. Always validate current pricing/limits in the provider dashboard before budgeting.

💡 **Tip:** Embeddings are generated once and reused, so ongoing query cost is typically much lower than initial setup.

## 🔧 Configuration

### View Current Config

```bash
npx workspai config show
```

### Set API Key

```bash
npx workspai config set-api-key
```

### Remove API Key

```bash
npx workspai config remove-api-key
```

### Enable/Disable AI

```bash
npx workspai config ai enable
npx workspai config ai disable
```

## 📊 How It Works

### Architecture Overview

```
┌─────────────────┐
│  User Query     │  "I need authentication"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ OpenAI API      │  Convert text → embedding vector (1536 dims)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Module Catalog  │  27+ modules with pre-generated embeddings
│ (Dynamic)       │  Fetched from RapidKit Python Core
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Cosine          │  Calculate similarity scores
│ Similarity      │  Find closest matches
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Ranked Results  │  Top N modules with scores & reasons
└─────────────────┘
```

### Technical Details

1. **Module Catalog**:
   - 27+ production-ready modules (dynamic from Python Core)
   - Fallback to 11 hardcoded modules if Python unavailable
   - 5-minute cache for performance

2. **Embeddings**:
   - AI converts module descriptions to 1536-dimensional vectors
   - Generated once, reused for all queries
   - Stored in `data/modules-embeddings.json` (508KB)

3. **Semantic Search**:
   - User query → embedding vector
   - Cosine similarity with all modules
   - Results sorted by relevance score (0-100%)

4. **Smart Features**:
   - Dependency detection (shows required modules)
   - Match explanation (shows why module matched)
   - Category grouping (auth, database, payment, etc.)
   - Installation order calculation

**Technology Stack:**

- Model: `text-embedding-3-small` (OpenAI)
- Dimension: 1536 vectors
- Accuracy: 92%+ match scores
- Cost: provider-dependent (check current provider pricing)

**Performance:**

- First query: ~200ms (embedding generation)
- Subsequent queries: ~50ms (cached embeddings)
- Catalog refresh: Every 5 minutes

## 🎯 Use Cases

### E-commerce Platform

```bash
workspai ai recommend "e-commerce with payments and inventory"
```

### SaaS Application

```bash
workspai ai recommend "SaaS platform with subscriptions"
```

### Real-time Chat

```bash
workspai ai recommend "real-time chat application"
```

### API Gateway

```bash
workspai ai recommend "API gateway with rate limiting"
```

## 🔒 Security

- API keys stored in `$HOME/.workspairc.json` (legacy `$HOME/.rapidkit/config.json` is still read)
- File permissions: `600` (owner read/write only)
- Never committed to git (`.workspai/` in `.gitignore` where local-only evidence is generated)
- Environment variable supported (`OPENAI_API_KEY`)

## 🐛 Troubleshooting

### "Module embeddings not found"

**Solution:** Embeddings generate automatically on first use! Just follow the prompts:

```bash
npx workspai ai recommend "auth"

# You'll see:
# ⚠️  Module embeddings not found
# ? What would you like to do?
#   🚀 Generate embeddings now (requires OpenAI API key)
#   📝 Show me how to generate them manually
#   ❌ Cancel
```

Or generate manually:

```bash
npx workspai ai generate-embeddings
```

### "OpenAI API key not configured"

**Option 1:** Mock mode (no key needed, for testing)

```bash
# Just use it! Mock mode activates automatically
npx workspai ai recommend "database"
```

**Option 2:** Get a real API key

```bash
# 1. Get key: https://platform.openai.com/api-keys
# 2. Configure it:
npx workspai config set-api-key

# Or set environment variable:
export OPENAI_API_KEY="<YOUR_OPENAI_API_KEY>"
```

### "Invalid API key" or "401 Error"

**Cause:** API key is incorrect or expired

**Solution:**

```bash
# Update your API key
npx workspai config set-api-key

# Verify it's set correctly
npx workspai config show
```

### "429 Rate Limited" or "Quota Exceeded"

**Cause:** OpenAI API quota or rate limit reached

**Solutions:**

1. **Check billing:** https://platform.openai.com/account/billing
2. **Check limits:** https://platform.openai.com/account/limits
3. **Upgrade tier:** Free tier has lower limits
4. **Wait:** Rate limits reset automatically

**Rate Limits:**

- Limits vary by provider account tier and can change over time
- Check your provider dashboard for current request/token limits

### "Failed to fetch modules from Python Core"

**Cause:** RapidKit Python not installed or not in PATH

**Impact:** Uses fallback catalog instead of the full runtime catalog

**Solution (optional):**

```bash
# Install RapidKit Python Core
pip install -e /path/to/rapidkit-core

# Verify installation
rapidkit modules list --json
```

**Note:** Fallback still provides good results with core modules!

### Embeddings Out of Date

**Symptom:** New modules not appearing in recommendations

**Solution:** Update embeddings with latest modules

```bash
npx workspai ai update-embeddings

# This will:
# 1. Fetch latest modules from Python Core
# 2. Generate embeddings for new modules
# 3. Update data/modules-embeddings.json
```

### Low Match Scores

**Symptom:** All results show <70% match

**Possible Causes:**

1. Query too vague: "build something"
2. Query too specific: "blockchain NFT marketplace with AI"
3. No matching modules exist

**Solutions:**

- Make query more specific: "authentication" → "user authentication with JWT"
- Try different keywords: "storage" instead of "blockchain"
- Check available modules: `npx workspai ai info`

### Mock Mode Results Not Accurate

**Cause:** Mock embeddings are deterministic but not trained

**Solution:** Use real OpenAI API for production

```bash
# Get API key and generate real embeddings
npx workspai config set-api-key
npx workspai ai generate-embeddings
```

### Check Current Configuration

```bash
# View all settings
npx workspai config show

# Output shows:
# - AI enabled: true/false
# - API key: <masked>
# - Embeddings status: exists/not found
# - Module count: <N> modules
```

### Still Having Issues?

1. **Enable debug logging:**

   ```bash
   DEBUG=rapidkit:* npx workspai ai recommend "auth"
   ```

2. **Check for updates:**

   ```bash
   npm outdated workspai
   npm update workspai
   ```

3. **Report issue:**
   - GitHub: https://github.com/rapidkitlabs/workspai/issues
   - Include: error message, OS, Node version, command used

## 📚 Commands Reference

### AI Commands

| Command                                   | Description                    | Example                                   |
| ----------------------------------------- | ------------------------------ | ----------------------------------------- |
| `workspai ai recommend [query]`           | Get module recommendations     | `workspai ai recommend "auth"`            |
| `workspai ai recommend [query] -n <N>`    | Get top N recommendations      | `workspai ai recommend "database" -n 3`   |
| `workspai ai recommend [query] --json`    | Get JSON output                | `workspai ai recommend "auth" --json`     |
| `workspai ai generate-embeddings`         | Generate embeddings (one-time) | `workspai ai generate-embeddings`         |
| `workspai ai generate-embeddings --force` | Force regenerate embeddings    | `workspai ai generate-embeddings --force` |
| `workspai ai update-embeddings`           | Update with latest modules     | `workspai ai update-embeddings`           |
| `workspai ai info`                        | Show AI features info          | `workspai ai info`                        |

### Configuration Commands

| Command                          | Description                      | Example                          |
| -------------------------------- | -------------------------------- | -------------------------------- |
| `workspai config set-api-key`    | Set OpenAI API key (interactive) | `workspai config set-api-key`    |
| `workspai config show`           | Show current config              | `workspai config show`           |
| `workspai config remove-api-key` | Remove API key                   | `workspai config remove-api-key` |
| `workspai config ai enable`      | Enable AI features               | `workspai config ai enable`      |
| `workspai config ai disable`     | Disable AI features              | `workspai config ai disable`     |

### Recommend Command Options

```bash
workspai ai recommend [query] [options]

Options:
  -n, --number <count>  Number of recommendations (default: 5)
  --json               Output as JSON
  -h, --help           Display help
```

### Generate-Embeddings Command Options

```bash
workspai ai generate-embeddings [options]

Options:
  --force    Force regeneration even if embeddings exist
  -h, --help Display help
```

## 🚀 Planned Workspace Intelligence Extensions

These are roadmap ideas, not current CLI claims. New AI-facing surfaces must be
grounded in `contracts/workspace-intelligence-architecture.v1.json` before they
are documented as available features.

- [ ] Workspace Atlas generated from Workspace Intelligence evidence
- [ ] Repository/project chat over generated evidence artifacts
- [ ] Bug detection grounded in doctor, verify, and impact reports
- [ ] Test generation informed by workspace model, runtime signals, and affected subgraphs
- [ ] Architecture suggestions with evidence/freshness labels

## 🤝 Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md)

## 📄 License

MIT - See [LICENSE](../LICENSE)

---

**Questions?** Open an issue on [GitHub](https://github.com/rapidkitlabs/workspai/issues)
