# Workspai Workspace Marker Specification

## Overview

The `.workspai-workspace` file is the canonical marker that identifies a Workspai workspace. The legacy `.rapidkit-workspace` marker is still read as a fallback for older workspaces. The marker uses a **metadata layer architecture** that allows multiple tools (Workspai CLI, VS Code Extension, Python Core, etc.) to add their own metadata while preserving a consistent core structure.

## File Structure

### Core Fields (Required)

```json
{
  "signature": "RAPIDKIT_WORKSPACE",
  "createdBy": "workspai-cli",
  "version": "<workspai-version>",
  "createdAt": "2026-02-01T12:23:31.993Z",
  "name": "workspace-name",
  "metadata": { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `signature` | `"RAPIDKIT_WORKSPACE"` | Fixed identifier for workspace detection |
| `createdBy` | `"workspai-cli" \| "rapidkit-npm" \| "rapidkit-vscode" \| "rapidkit-cli"` | Tool that originally created the workspace. `rapidkit-npm` is accepted for legacy workspaces. |
| `version` | `string` | Version of the tool that created the workspace |
| `createdAt` | `string` | ISO 8601 timestamp of workspace creation |
| `name` | `string` | Workspace name |
| `metadata` | `object` | Optional metadata layer (see below) |

### Metadata Layer (Optional)

The metadata layer allows each tool to store its own information without conflicts:

```json
{
  "metadata": {
    "vscode": {
      "extensionVersion": "<extension-version>",
      "createdViaExtension": true,
      "lastOpenedAt": "2026-02-01T14:30:00.000Z",
      "openCount": 5
    },
    "npm": {
      "packageVersion": "<workspai-version>",
      "installMethod": "poetry",
      "lastUsedAt": "2026-02-01T12:23:31.993Z"
    },
    "python": {
      "coreVersion": "<rapidkit-core-version>",
      "pythonVersion": "3.10",
      "venvPath": ".venv",
      "coreStatus": "installed",
      "coreReason": "workspace profile requires Python Core"
    },
    "custom": {
      "myTool": "data"
    }
  }
}
```

#### VS Code Metadata

| Field | Type | Description |
|-------|------|-------------|
| `extensionVersion` | `string` | Extension version that last interacted |
| `createdViaExtension` | `boolean` | Was workspace created via Extension? |
| `lastOpenedAt` | `string` | ISO 8601 timestamp of last open |
| `openCount` | `number` | Number of times opened in VS Code |

#### Workspai CLI Metadata

| Field | Type | Description |
|-------|------|-------------|
| `packageVersion` | `string` | npm package version |
| `installMethod` | `"poetry" \| "venv" \| "pipx"` | Install method used |
| `lastUsedAt` | `string` | ISO 8601 timestamp of last use |

#### Python Core Metadata

| Field | Type | Description |
|-------|------|-------------|
| `coreVersion` | `string` | RapidKit Core version |
| `pythonVersion` | `string` | Python version used |
| `venvPath` | `string` | Virtual environment path (relative) |
| `coreStatus` | `"installed" \| "skipped"` | Whether the optional Python engine is installed |
| `coreReason` | `string` | Reason for the current engine state |

## Usage Guidelines

### Creating a Workspace Marker

**Workspai CLI package:**
```typescript
import { createNpmWorkspaceMarker, writeWorkspaceMarker } from './workspace-marker';

const marker = createNpmWorkspaceMarker('my-workspace', '<workspai-version>', 'poetry');
await writeWorkspaceMarker('/path/to/workspace', marker);
```

**VS Code Extension:**
```typescript
// Let npm create the marker, then add VS Code metadata
await updateWorkspaceMetadata(workspacePath, {
  vscode: {
    extensionVersion: '<extension-version>',
    createdViaExtension: true,
    lastOpenedAt: new Date().toISOString(),
    openCount: 1,
  },
});
```

### Reading Workspace Metadata

```typescript
import { readWorkspaceMarker } from './workspace-marker';

const marker = await readWorkspaceMarker('/path/to/workspace');

if (marker) {
  console.log('Workspace:', marker.name);
  console.log('Created by:', marker.createdBy);
  
  if (marker.metadata?.vscode) {
    console.log('Opened', marker.metadata.vscode.openCount, 'times in VS Code');
  }
}
```

### Updating Metadata

Prefer `updateWorkspaceMetadata()` for nested metadata updates. The marker writer
preserves existing top-level metadata namespaces, but can replace core fields or
an individual nested namespace value; it is not a deep-merge API.

```typescript
// ✅ Correct - preserves other metadata
await updateWorkspaceMetadata(workspacePath, {
  vscode: {
    extensionVersion: '<extension-version>',
    createdViaExtension: false,
    lastOpenedAt: new Date().toISOString(),
  },
});

// Use direct writes only when intentionally replacing core marker fields.
await writeWorkspaceMarker(workspacePath, newMarker);
```

## Benefits

### 1. **Cross-Tool Compatibility**
- npm, Extension, and future tools share the same format
- No conflicts between different tools

### 2. **Traceability**
- Know which tool created the workspace
- Track usage across different interfaces
- Debug issues by checking tool versions

### 3. **Extensibility**
- New tools can add their own metadata
- No breaking changes to core structure
- Custom metadata for user tools

### 4. **Backwards Compatibility**
- Old markers without metadata still work
- Metadata is optional
- Validation checks only core fields

## Migration Guide

### From Legacy Markers

Old format (Extension-specific):
```json
{
  "signature": "RAPIDKIT_WORKSPACE",
  "createdBy": "rapidkit-vscode",
  "version": "<legacy-tool-version>",
  "createdAt": "2026-02-01T12:24:21.830Z",
  "name": "alef",
  "vscodeVersion": "<legacy-extension-version>",
  "originalCreatedBy": "rapidkit-npm"
}
```

New format (standardized):
```json
{
  "signature": "RAPIDKIT_WORKSPACE",
  "createdBy": "workspai-cli",
  "version": "<workspai-version>",
  "createdAt": "2026-02-01T12:24:21.830Z",
  "name": "alef",
  "metadata": {
    "vscode": {
      "extensionVersion": "<extension-version>",
      "createdViaExtension": true,
      "lastOpenedAt": "2026-02-01T12:24:21.830Z",
      "openCount": 1
    }
  }
}
```

## Best Practices

1. **Workspai CLI creates the marker** - Only the CLI package should create the core marker
2. **Tools add metadata** - Other tools use `updateWorkspaceMetadata()`
3. **Preserve existing data** - Always merge, never overwrite
4. **Validate on read** - Use `isValidWorkspaceMarker()` to check structure
5. **Handle missing metadata gracefully** - Metadata is always optional

## Example Workflows

### Workflow 1: Create workspace with npm, open in VS Code
```
1. User: npx workspai my-workspace
2. CLI: Creates marker with npm metadata
3. User: Opens workspace in VS Code
4. Extension: Adds VS Code metadata to existing marker
```

Result:
```json
{
  "signature": "RAPIDKIT_WORKSPACE",
  "createdBy": "workspai-cli",
  "version": "<workspai-version>",
  "createdAt": "2026-02-01T10:00:00.000Z",
  "name": "my-workspace",
  "metadata": {
    "npm": {
      "packageVersion": "<workspai-version>",
      "installMethod": "poetry"
    },
    "vscode": {
      "extensionVersion": "<extension-version>",
      "createdViaExtension": false,
      "lastOpenedAt": "2026-02-01T11:00:00.000Z",
      "openCount": 1
    }
  }
}
```

### Workflow 2: Create workspace via Extension
```
1. User: Creates workspace via Extension
2. Extension: Calls npm package to create marker
3. CLI: Creates marker with npm metadata
4. Extension: Adds VS Code metadata
```

Result:
```json
{
  "signature": "RAPIDKIT_WORKSPACE",
  "createdBy": "workspai-cli",
  "version": "<workspai-version>",
  "createdAt": "2026-02-01T10:00:00.000Z",
  "name": "my-workspace",
  "metadata": {
    "npm": {
      "packageVersion": "<workspai-version>",
      "installMethod": "poetry"
    },
    "vscode": {
      "extensionVersion": "<extension-version>",
      "createdViaExtension": true,
      "lastOpenedAt": "2026-02-01T10:00:00.000Z",
      "openCount": 1
    }
  }
}
```

## Version History

- **v1.0** (2026-02-01): Initial specification with metadata layer architecture
