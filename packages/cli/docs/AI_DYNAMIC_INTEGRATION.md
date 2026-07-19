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
// Fetches through the validated Core bridge
export async function getModuleCatalog() {
  const result = await runCoreRapidkitCapture(
    ['modules', 'list', '--json-schema', '1'],
    { preferWorkspaceVenv: true }
  );
  return parseModules(result.stdout);
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
    ├─ Try through Core bridge: modules list --json-schema 1
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

- Calls the Core bridge with `modules list --json-schema 1`
- ✅ 5-minute cache (reduces Python calls)
- ✅ Fallback to hardcoded catalog if Python not available
- Validates the bridge result and falls back on failure
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
    const result = await runCoreRapidkitCapture(
      ['modules', 'list', '--json-schema', '1'],
      { preferWorkspaceVenv: true }
    );
    const modules = parseModules(result.stdout);
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
├─ Fetch from Python Core (duration depends on environment)
├─ Cache result
└─ Return

Subsequent calls (within 5 min):
├─ Return cached
└─ Avoid another Core bridge invocation

After 5 min:
├─ Re-fetch from Python
└─ Update cache
```

**Benefits:**

- Cached responses avoid repeated bridge calls
- Runtime catalog refreshes after five minutes
- Provider and Core latency remain environment-dependent

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
# 1. Calls the Core bridge: modules list --json-schema 1
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

### Cache behavior

The in-process catalog cache refreshes every five minutes. No fixed response-time
or throughput guarantee is made; Core startup, provider latency, and catalog size
vary by environment.

---

## 🔧 Configuration

### Environment Variables

```bash
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
# First call (cold cache; duration is environment-dependent)
time workspai ai recommend "auth"

# Second call (warm catalog cache; still includes provider latency)
time workspai ai recommend "database"

# Wait 6 minutes, try again
sleep 360
time workspai ai recommend "payment"
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
