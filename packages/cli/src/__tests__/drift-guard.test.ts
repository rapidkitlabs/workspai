import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, test } from 'vitest';
import {
  getCoreTopLevelCommands,
  runCoreRapidkitCapture,
} from '../core-bridge/pythonRapidkitExec.js';
import { BOOTSTRAP_CORE_COMMANDS_SET } from '../core-bridge/bootstrapCoreCommands.js';

const enabled = process.env.RAPIDKIT_DRIFT_GUARD === '1';

describe('Core command drift guard', () => {
  test(
    enabled
      ? 'bootstrap forwarding list matches Core top-level commands'
      : 'skipped (set RAPIDKIT_DRIFT_GUARD=1)',
    async () => {
      if (!enabled) return;

      // Modes:
      // - monorepo (default): install engine from this repo's `core/` path (pip install -U <path>)
      // - pypi: install engine from PyPI (or a wheel/sdist/git ref) like real users
      const mode = (process.env.RAPIDKIT_DRIFT_GUARD_MODE || 'monorepo').trim().toLowerCase();
      if (mode !== 'monorepo' && mode !== 'pypi') {
        throw new Error(
          `Invalid RAPIDKIT_DRIFT_GUARD_MODE=${mode}. Expected 'monorepo' or 'pypi'.`
        );
      }

      // Make the guard deterministic and avoid polluting developer caches.
      if (!process.env.XDG_CACHE_HOME) {
        process.env.XDG_CACHE_HOME = path.join(os.tmpdir(), `rapidkit-npm-drift-${Date.now()}`);
      }

      // Drift-guard should validate against a real pip-installed engine surface.
      // Avoid picking up a globally installed rapidkit from the developer machine.
      process.env.RAPIDKIT_BRIDGE_FORCE_VENV = '1';

      // Allow CI to pin the engine under test (PyPI, local wheel, git ref, etc.).
      // Examples:
      // - RAPIDKIT_DRIFT_GUARD_ENGINE_SPEC=rapidkit-core==1.2.3
      // - RAPIDKIT_DRIFT_GUARD_ENGINE_SPEC=/abs/path/to/rapidkit_core-1.2.3-py3-none-any.whl
      let engineSpec = process.env.RAPIDKIT_DRIFT_GUARD_ENGINE_SPEC;
      if (!engineSpec || !engineSpec.trim()) {
        if (mode === 'monorepo') {
          // In the monorepo, default to the local Core workspace path.
          // This keeps drift-guard verifying npm ↔ Core parity within the same commit.
          const repoRoot = path.resolve(__dirname, '../../../..');
          engineSpec = path.join(repoRoot, 'core');
        } else {
          // Simulate a user install.
          engineSpec = 'rapidkit-core';
        }
      }
      engineSpec = engineSpec.trim();

      if (mode === 'pypi') {
        // In PyPI mode, we want strict release-safety.
        // 1) Avoid source-tree installs.
        // 2) Require a pinned version OR a concrete artifact/URL.
        //    (Testing against "latest" is not deterministic and can fail for reasons unrelated to this repo.)
        const isArtifact =
          engineSpec.endsWith('.whl') ||
          engineSpec.endsWith('.tar.gz') ||
          engineSpec.endsWith('.zip');
        const isVcsOrUrl = /^(git\+)?https?:\/\//i.test(engineSpec);
        const looksPinned = /([<>=!~]=|@)/.test(engineSpec);

        if (!isArtifact && !isVcsOrUrl && !looksPinned) {
          throw new Error(
            'RAPIDKIT_DRIFT_GUARD_MODE=pypi requires a pinned engine spec for release-safety.\n' +
              "Examples: RAPIDKIT_DRIFT_GUARD_ENGINE_SPEC='rapidkit-core==X.Y.Z' or '/path/to/rapidkit_core-*.whl'"
          );
        }

        const looksLikeDirPath =
          /[\\/]/.test(engineSpec) && !isArtifact && !isVcsOrUrl && !engineSpec.startsWith('file:');
        if (looksLikeDirPath) {
          throw new Error(
            'RAPIDKIT_DRIFT_GUARD_MODE=pypi does not allow directory installs (source-tree paths).\n' +
              "Use RAPIDKIT_DRIFT_GUARD_ENGINE_SPEC='rapidkit-core==X.Y.Z' (or point at a wheel/sdist/VCS URL)."
          );
        }
      }

      process.env.RAPIDKIT_CORE_PYTHON_PACKAGE = engineSpec;

      // Optional: force a tier surface for testing.
      // Default behavior:
      // - monorepo: default to community (no distribution marker is guaranteed)
      // - pypi: do NOT force (we want the real published surface)
      const forceTier = process.env.RAPIDKIT_DRIFT_GUARD_FORCE_TIER;
      const looksLikePath =
        /[\\/]/.test(engineSpec) || engineSpec.startsWith('.') || engineSpec.startsWith('file:');
      if (forceTier && forceTier.trim()) {
        process.env.RAPIDKIT_FORCE_TIER = forceTier.trim();
      } else if (mode === 'monorepo' && looksLikePath) {
        process.env.RAPIDKIT_FORCE_TIER = 'community';
      }

      const coreCommands = await getCoreTopLevelCommands();

      const schemaPath = path.resolve(
        __dirname,
        '..',
        '..',
        'docs',
        'contracts',
        'rapidkit-cli-contracts.json'
      );
      if (!fs.existsSync(schemaPath)) {
        throw new Error(`Contract schema missing at ${schemaPath}`);
      }
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8')) as {
        definitions?: Record<string, unknown>;
      };
      const defs = schema.definitions || {};
      if (!defs.VersionResponse || !defs.CommandsResponse || !defs.ProjectDetectResponse) {
        throw new Error('Contract schema missing required definitions');
      }

      const parseJson = (label: string, raw: string) => {
        try {
          return JSON.parse(raw);
        } catch (err) {
          throw new Error(`${label} returned invalid JSON: ${String(err)}\nRaw: ${raw}`);
        }
      };

      const versionRes = await runCoreRapidkitCapture(['version', '--json']);
      expect(versionRes.exitCode).toBe(0);
      const versionPayload = parseJson('version --json', versionRes.stdout);
      expect(versionPayload.schema_version).toBe(1);
      expect(typeof versionPayload.version).toBe('string');

      const commandsRes = await runCoreRapidkitCapture(['commands', '--json']);
      expect(commandsRes.exitCode).toBe(0);
      const commandsPayload = parseJson('commands --json', commandsRes.stdout);
      expect(commandsPayload.schema_version).toBe(1);
      expect(Array.isArray(commandsPayload.commands)).toBe(true);
      expect(commandsPayload.commands).toEqual(
        [...commandsPayload.commands].filter((c) => typeof c === 'string')
      );

      const tmpRoot = path.join(os.tmpdir(), `rapidkit-contract-${Date.now()}`);
      const projectRes = await runCoreRapidkitCapture([
        'project',
        'detect',
        '--path',
        tmpRoot,
        '--json',
      ]);
      expect(projectRes.exitCode).toBe(0);
      const projectPayload = parseJson('project detect --json', projectRes.stdout);
      expect(projectPayload.schema_version).toBe(1);
      expect(typeof projectPayload.input).toBe('string');
      expect(['strong', 'weak', 'none']).toContain(projectPayload.confidence);
      expect(typeof projectPayload.isRapidkitProject).toBe('boolean');
      expect('projectRoot' in projectPayload).toBe(true);

      // The npm wrapper intentionally owns some UX commands.
      // The drift guard focuses on the cold-start forwarding contract.
      const WRAPPER_OWNED = new Set(['help']);
      for (const c of WRAPPER_OWNED) coreCommands.delete(c);

      const missingInCore = Array.from(BOOTSTRAP_CORE_COMMANDS_SET).filter(
        (c) => !coreCommands.has(c)
      );
      const missingInBootstrap = Array.from(coreCommands).filter(
        (c) => !BOOTSTRAP_CORE_COMMANDS_SET.has(c)
      );

      if (missingInCore.length || missingInBootstrap.length) {
        const msg = [
          `Drift-guard mode: ${mode}`,
          `Engine spec: ${engineSpec}`,
          process.env.RAPIDKIT_FORCE_TIER
            ? `Forced tier: ${process.env.RAPIDKIT_FORCE_TIER}`
            : null,
          missingInCore.length
            ? `Commands present in npm bootstrap list but missing in Core: ${missingInCore.join(', ')}`
            : null,
          missingInBootstrap.length
            ? `Commands present in Core but missing in npm bootstrap list: ${missingInBootstrap.join(', ')}`
            : null,
          'Update src/core-bridge/bootstrapCoreCommands.ts (and scenario scripts if needed).',
        ]
          .filter(Boolean)
          .join('\n');

        expect.fail(msg);
      }

      expect(missingInCore).toEqual([]);
      expect(missingInBootstrap).toEqual([]);
    },
    120_000
  );
});
