import fsExtra from 'fs-extra';

import { readWorkspaceMarker, writeWorkspaceMarker } from '../workspace-marker.js';
import { workspaceMetadataCandidates } from './workspace-paths.js';

type InstallMethod = 'poetry' | 'venv' | 'pipx' | 'pip';

export interface MarkWorkspacePythonEngineInstalledOptions {
  installMethod: InstallMethod;
  pythonVersion?: string;
  coreVersion?: string;
  venvPath?: string;
  now?: string;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

async function updateJsonFile(
  filePath: string,
  updater: (value: JsonObject) => JsonObject
): Promise<boolean> {
  if (!(await fsExtra.pathExists(filePath))) {
    return false;
  }

  const current = asObject(await fsExtra.readJson(filePath));
  await fsExtra.outputJson(filePath, updater(current), { spaces: 2 });
  await fsExtra.appendFile(filePath, '\n', 'utf-8');
  return true;
}

export async function markWorkspacePythonEngineInstalled(
  workspacePath: string,
  options: MarkWorkspacePythonEngineInstalledOptions
): Promise<void> {
  const installedAt = options.now ?? new Date().toISOString();
  const installMethod = options.installMethod === 'pip' ? 'venv' : options.installMethod;

  for (const workspaceJsonPath of workspaceMetadataCandidates(workspacePath, 'workspace.json')) {
    await updateJsonFile(workspaceJsonPath, (manifest) => {
      const engine = asObject(manifest.engine);
      const pythonCore = asObject(engine.python_core);

      delete manifest.bootstrap_note;
      delete pythonCore.reason;

      return {
        ...manifest,
        engine: {
          ...engine,
          install_method: installMethod,
          python_version: options.pythonVersion ?? engine.python_version ?? null,
          python_core: {
            ...pythonCore,
            status: 'installed',
            installed_at: installedAt,
            ...(options.coreVersion ? { version: options.coreVersion } : {}),
          },
        },
      };
    });
  }

  for (const toolchainPath of workspaceMetadataCandidates(workspacePath, 'toolchain.lock')) {
    await updateJsonFile(toolchainPath, (toolchain) => {
      const runtime = asObject(toolchain.runtime);
      const python = asObject(runtime.python);
      const core = asObject(python.core);

      delete core.reason;

      return {
        ...toolchain,
        generated_at: installedAt,
        runtime: {
          ...runtime,
          python: {
            ...python,
            version: options.pythonVersion ?? python.version ?? null,
            install_method: installMethod,
            core: {
              ...core,
              status: 'installed',
              installed_at: installedAt,
              ...(options.coreVersion ? { version: options.coreVersion } : {}),
            },
          },
        },
      };
    });
  }

  const marker = await readWorkspaceMarker(workspacePath);
  if (marker) {
    const python = { ...(marker.metadata?.python ?? {}) };
    delete python.coreReason;

    marker.metadata = {
      ...marker.metadata,
      python: {
        ...python,
        coreStatus: 'installed',
        ...(options.coreVersion ? { coreVersion: options.coreVersion } : {}),
        ...(options.pythonVersion ? { pythonVersion: options.pythonVersion } : {}),
        ...(options.venvPath ? { venvPath: options.venvPath } : {}),
      },
      npm: {
        ...(marker.metadata?.npm ?? {}),
        packageVersion: marker.metadata?.npm?.packageVersion ?? marker.version,
        installMethod,
        lastUsedAt: installedAt,
      },
    };

    await writeWorkspaceMarker(workspacePath, marker);
  }
}
