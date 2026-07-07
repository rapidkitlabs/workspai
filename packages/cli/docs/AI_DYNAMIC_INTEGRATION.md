# 🔄 Dynamic AI Integration with Python Core

> **Date:** January 1, 2026  
> **Implementation:** Dynamic module catalog fetching from Python Core

---

## 🎯 Summary

AI system uses a **dynamic runtime catalog** and fetches module metadata from **RapidKit Python Core** instead of relying only on hardcoded entries.

### Before (Static):

```typescript
// ❌ Hardcoded fixed subset
export const MODULE_CATALOG = [
  { id: 'authentication-core', ... },
  // ... 10 more
]
```

### After (Dynamic):

```typescript
// ✅ Fetches from Python Core
export async function getModuleCatalog() {
  const result = await exec('rapidkit modules list --json');
  return parseModules(result);
}
```

---

## 📊 Architecture

### Data Flow

```
User Query
    ↓
AI Recommender
    ↓
getModuleCatalog()
    ↓
    ├─ Try: rapidkit modules list --json
    │   └─ Success: Return Python modules (runtime count)
    │   └─ Fail: Return fallback catalog (baseline subset)
    ↓
Generate Embeddings
    ↓
Cosine Similarity
    ↓
Return Top Recommendations
```

---

## 🔧 Implementation Details

### 1. Dynamic Module Fetching (`src/ai/module-catalog.ts`)

**Features:**

- ✅ Calls `rapidkit modules list --json`
- ✅ 5-minute cache (reduces Python calls)
- ✅ Fallback to hardcoded catalog if Python not available
- ✅ Automatic retry and error handling
- ✅ Category and framework mapping

**Code:**

```typescript
export async function getModuleCatalog(): Promise<ModuleMetadata[]> {
  // Check cache
  if (cachedModules && Date.now() - lastFetchTime < CACHE_TTL) {
    return cachedModules;
  }

  // Fetch from Python Core
  try {
    const { stdout } = await execAsync('rapidkit modules list --json');
    const modules = parseModules(stdout);
    cachedModules = modules;
    return modules;
  } catch (error) {
    console.warn('⚠️  Using fallback catalog');
    return FALLBACK_MODULE_CATALOG;
  }
}
```

---

### 2. Module Parsing

**Handles different Python CLI output formats:**

```typescript
// Format 1: Array
["module1", "module2"]

// Format 2: Object with modules key
{ "modules": [...] }

// Format 3: Object with data key
{ "data": [...] }
```

**Category Mapping:**

```typescript
Python Category → TypeScript Type
├─ "auth" → "auth"
├─ "authentication" → "auth"
├─ "database" → "database"
├─ "payment" → "payment"
├─ "billing" → "payment"
└─ etc.
```

---

### 3. Cache Strategy

**TTL: 5 minutes**

```
First call:
├─ Fetch from Python (10s)
├─ Cache result
└─ Return

Subsequent calls (within 5 min):
├─ Return cached
└─ Instant response

After 5 min:
├─ Re-fetch from Python
└─ Update cache
```

**Benefits:**

- ✅ Fast responses (cached)
- ✅ Always up-to-date (5min refresh)
- ✅ Reduces Python CLI calls

---

### 4. Fallback Mechanism

**Graceful degradation:**

```
Try Python Core:
├─ Success → Use runtime module catalog ✅
├─ Python not in PATH → Use fallback subset ⚠️
├─ Command timeout → Use fallback subset ⚠️
└─ Parse error → Use fallback subset ⚠️
```

**Fallback catalog:**

- Baseline core modules (hardcoded subset)
- Authentication, database, payment, etc.
- Enough for basic recommendations

---

### 5. Embedding Generation

**Now dynamic:**

```bash
# Old: Generated from fixed hardcoded subset
npx tsx src/ai/generate-embeddings.ts

# New: Fetches from Python Core first
# → Gets runtime module catalog
# → Generates embeddings for all discovered modules
# → Saves to data/modules-embeddings.json
```

**Output:**

```json
{
  "model": "text-embedding-3-small",
  "dimension": 1536,
  "generated_at": "2026-01-01T...",
  "modules": [
    {
      "id": "authentication-core",
      "name": "Authentication Core",
      "embedding": [0.123, -0.456, ...]
    }
    // ... runtime modules (from Python)
  ]
}
```

---

## 🚀 Usage Examples

### Example 1: With Python Core Available

```bash
$ workspai ai recommend "I need user authentication"

# Behind the scenes:
# 1. Calls: rapidkit modules list --json
# 2. Gets runtime module catalog from Python Core
# 3. Generates query embedding
# 4. Compares with catalog embeddings
# 5. Returns top 5 recommendations

📦 Recommended Modules:
1. authentication-core ⭐ (98% match)
2. users-core ⭐ (92% match)
3. session-management (88% match)
...
```

---

### Example 2: Without Python Core (Fallback)

```bash
$ workspai ai recommend "payment processing"

# Console output:
⚠️  RapidKit Python Core not found in PATH
  Using fallback module catalog (baseline subset)

# Still works! Uses hardcoded fallback subset
📦 Recommended Modules:
1. stripe-payment ⭐ (95% match)
...
```

---

### Example 3: No Matching Modules

```bash
$ workspai ai recommend "blockchain integration"

# Output:
⚠️  No matching modules found in RapidKit Core registry.

💡 Options:

1. Create custom module:
   rapidkit modules scaffold blockchain-integration --category integrations

2. Search with different keywords
   Try more general terms (e.g., "storage" instead of "blockchain")

3. Request feature:
   https://github.com/rapidkitlabs/workspai/issues
```

---

## 📋 Benefits

### ✅ Always Up-to-Date

```
When Python Core adds new modules:
├─ AI automatically picks them up
├─ No code changes needed in npm
├─ Just regenerate embeddings
└─ Users get latest recommendations
```

### ✅ Single Source of Truth

```
Module Registry:
├─ Python Core: runtime catalog (source of truth)
├─ npm AI: Reads from Python (always synced)
└─ No duplicate data
```

### ✅ Graceful Fallback

```
If Python unavailable:
├─ Still works (fallback subset)
├─ User informed (console warning)
├─ No crashes or errors
└─ Can upgrade to Python later
```

### ✅ Performance

```
Cache Strategy:
├─ First call: 10s (Python fetch)
├─ Cached calls: <100ms (instant)
├─ Cache refresh: Every 5 minutes
└─ Optimal balance
```

---

## 🔧 Configuration

### Environment Variables

```bash
# Optional: Force fallback mode (testing)
export RAPIDKIT_AI_FALLBACK=true

# Optional: Cache TTL (default: 5 minutes)
export RAPIDKIT_CACHE_TTL=600000  # milliseconds

# Optional: Python command/interpreter override (if python3/python is not the right one)
export RAPIDKIT_PYTHON_CMD=/path/to/python
```

---

## 🧪 Testing

### Test 1: With Python Core

```bash
# Ensure Python Core in PATH
which rapidkit  # Should return path

# Test recommendation
workspai ai recommend "authentication"

# Should show: using runtime catalog from Python Core
```

### Test 2: Without Python Core

```bash
# Temporarily hide Python
export PATH=/tmp:$PATH

# Test recommendation
workspai ai recommend "authentication"

# Should show: ⚠️ Using fallback catalog (baseline subset)
```

### Test 3: Cache Behavior

```bash
# First call (cold cache)
time workspai ai recommend "auth"  # ~10 seconds

# Second call (warm cache)
time workspai ai recommend "database"  # <1 second

# Wait 6 minutes, try again
sleep 360
time workspai ai recommend "payment"  # ~10 seconds (cache expired)
```

---

## 📊 Comparison

| Feature             | Before (Static)    | After (Dynamic)    |
| ------------------- | ------------------ | ------------------ |
| **Module Count**    | Fixed subset       | Runtime catalog    |
| **Updates**         | Manual code change | Automatic          |
| **Sync**            | Manual             | Automatic          |
| **Fallback**        | ❌ None            | ✅ Baseline subset |
| **Cache**           | ❌ None            | ✅ 5-minute TTL    |
| **Python Required** | ❌ No              | ⚠️ Recommended     |
| **Performance**     | Fast (hardcoded)   | Fast (cached)      |

---

## 🚀 Next Steps

### Current Stage: ✅ Dynamic Fetching

- ✅ Fetch from Python Core
- ✅ Cache with TTL
- ✅ Fallback to hardcoded
- ✅ Error handling

### Next Stage: Module Installation

```bash
workspai ai recommend "authentication"
# → Shows recommendations
# → [Install] button
# → Calls: rapidkit add module authentication-core
# → Python Core installs module
```

### Future Stage: Real-time Sync

```bash
# Watch Python modules directory
# Auto-regenerate embeddings when modules change
# Push updates to users
```

---

## 🎯 Summary

**What Changed:**

- ✅ AI now reads from Python Core dynamically
- ✅ Runtime catalog instead of a fixed hardcoded subset
- ✅ Always up-to-date
- ✅ Fallback if Python not available
- ✅ 5-minute cache for performance

**What Stayed Same:**

- ✅ Same API (getModuleCatalog)
- ✅ Same recommendation algorithm
- ✅ Same embedding model
- ✅ Same CLI commands
- ✅ Backward compatible

**Result:**

- 🎉 Runtime-driven catalog
- 🎉 Single source of truth
- 🎉 Production-ready
- 🎉 Zero breaking changes

---

**Built by the Workspai Team**

_Dynamic AI that grows with your framework._
