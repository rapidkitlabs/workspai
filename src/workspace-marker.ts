/**
 * Workspace Marker Types and Utilities
 * Standardized structure for .rapidkit-workspace files
 *
 * This module defines the canonical workspace marker format used across
 * all RapidKit tools (npm, VS Code Extension, future CLI tools, etc.)
 */

import fsExtra from 'fs-extra';
import path from 'path';

export interface WorkspaceMarker {
  /** Signature identifier for workspace detection */
  signature: 'RAPIDKIT_WORKSPACE';

  /** Tool that originally created this workspace */
  createdBy: 'rapidkit-npm' | 'rapidkit-vscode' | 'rapidkit-cli';

  /** Version of the tool that created the workspace */
  version: string;

  /** ISO timestamp of workspace creation */
  createdAt: string;

  /** Workspace name */
  name: string;

  /** Optional metadata from various tools */
  metadata?: WorkspaceMetadata;
}

export interface WorkspaceMetadata {
  /** VS Code Extension metadata */
  vscode?: VscodeMetadata;

  /** npm CLI metadata */
  npm?: NpmMetadata;

  /** Python Core metadata */
  python?: PythonMetadata;

  /** Custom user-defined metadata */
  custom?: Record<string, unknown>;
}

export interface VscodeMetadata {
  /** Extension version that last interacted with this workspace */
  extensionVersion: string;

  /** Was this workspace created via the Extension? */
  createdViaExtension: boolean;

  /** Last time the workspace was opened in VS Code */
  lastOpenedAt?: string;

  /** Number of times opened in VS Code */
  openCount?: number;
}

export interface NpmMetadata {
  /** npm package version that last interacted with this workspace */
  packageVersion: string;

  /** Install method used (poetry, venv, pipx) */
  installMethod?: 'poetry' | 'venv' | 'pipx';

  /** Last time npm CLI was used in this workspace */
  lastUsedAt?: string;
}

export interface PythonMetadata {
  /** RapidKit Core version installed */
  coreVersion?: string;

  /** Python version used */
  pythonVersion?: string;

  /** Virtual environment path (relative to workspace) */
  venvPath?: string;
}

/**
 * Read workspace marker from a directory
 */
export async function readWorkspaceMarker(workspacePath: string): Promise<WorkspaceMarker | null> {
  const markerPath = path.join(workspacePath, '.rapidkit-workspace');

  try {
    if (await fsExtra.pathExists(markerPath)) {
      const content = await fsExtra.readJson(markerPath);
      return content as WorkspaceMarker;
    }
  } catch (_error) {
    // Invalid JSON or read error
    return null;
  }

  return null;
}

/**
 * Write workspace marker to a directory
 * Preserves existing metadata from other tools
 */
export async function writeWorkspaceMarker(
  workspacePath: string,
  marker: WorkspaceMarker
): Promise<void> {
  const markerPath = path.join(workspacePath, '.rapidkit-workspace');

  // Read existing marker to preserve metadata
  const existing = await readWorkspaceMarker(workspacePath);

  // Merge metadata if existing marker found
  if (existing?.metadata) {
    marker.metadata = {
      ...existing.metadata,
      ...marker.metadata,
    };
  }

  await fsExtra.outputFile(markerPath, JSON.stringify(marker, null, 2) + '\n', 'utf-8');
}

/**
 * Update metadata in an existing workspace marker
 * This is the preferred way for tools to add their metadata
 */
export async function updateWorkspaceMetadata(
  workspacePath: string,
  metadataUpdate: Partial<WorkspaceMetadata>
): Promise<boolean> {
  const marker = await readWorkspaceMarker(workspacePath);

  if (!marker) {
    return false; // No marker exists
  }

  // Merge metadata
  marker.metadata = {
    ...marker.metadata,
    ...metadataUpdate,
    // Deep merge for nested objects
    vscode: metadataUpdate.vscode
      ? { ...marker.metadata?.vscode, ...metadataUpdate.vscode }
      : marker.metadata?.vscode,
    npm: metadataUpdate.npm
      ? { ...marker.metadata?.npm, ...metadataUpdate.npm }
      : marker.metadata?.npm,
    python: metadataUpdate.python
      ? { ...marker.metadata?.python, ...metadataUpdate.python }
      : marker.metadata?.python,
  };

  await writeWorkspaceMarker(workspacePath, marker);
  return true;
}

/**
 * Create a new workspace marker with npm CLI metadata
 */
export function createNpmWorkspaceMarker(
  name: string,
  version: string,
  installMethod?: 'poetry' | 'venv' | 'pipx'
): WorkspaceMarker {
  return {
    signature: 'RAPIDKIT_WORKSPACE',
    createdBy: 'rapidkit-npm',
    version,
    createdAt: new Date().toISOString(),
    name,
    metadata: {
      npm: {
        packageVersion: version,
        installMethod,
        lastUsedAt: new Date().toISOString(),
      },
    },
  };
}

/**
 * Validate workspace marker structure
 */
export function isValidWorkspaceMarker(marker: unknown): marker is WorkspaceMarker {
  if (!marker || typeof marker !== 'object') {
    return false;
  }

  const m = marker as Partial<WorkspaceMarker>;

  return (
    m.signature === 'RAPIDKIT_WORKSPACE' &&
    typeof m.createdBy === 'string' &&
    typeof m.version === 'string' &&
    typeof m.createdAt === 'string' &&
    typeof m.name === 'string'
  );
}
