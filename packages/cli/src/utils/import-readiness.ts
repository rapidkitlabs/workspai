import type {
  BackendConfidence,
  BackendFrameworkDetection,
  BackendImportStack,
  BackendRuntimeFamily,
  BackendSupportTier,
} from './backend-framework-contract.js';
import { getRuntimeSupport } from './support-matrix.js';
import { buildProjectAwareRuntimeCommandSupport } from './runtime-lifecycle-probes.js';

export type ImportReadinessStatus = 'ready' | 'review' | 'blocked';

export interface ImportReadinessCheck {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  recommendation?: string;
}

export interface ImportReadinessReport {
  schemaVersion: 1;
  kind: 'rapidkit.import_readiness';
  generatedAt: string;
  status: ImportReadinessStatus;
  project: {
    name: string;
    relativePath: string;
    kind?: string;
    source: 'local-folder' | 'git-url' | 'adopted-local';
  };
  detection: {
    runtime: BackendRuntimeFamily;
    framework: string;
    frameworkDisplayName: string;
    confidence: BackendConfidence;
    supportTier: BackendSupportTier;
    importStack: BackendImportStack;
  };
  commandSupport: {
    lifecycleCommands: string[];
    unsupportedLifecycleCommands: string[];
    moduleCommands: boolean;
  };
  checks: ImportReadinessCheck[];
}

export function buildImportReadinessReport(input: {
  projectName: string;
  relativePath: string;
  projectKind?: string;
  source: 'local-folder' | 'git-url' | 'adopted-local';
  detection: BackendFrameworkDetection;
  moduleSupport: boolean;
  projectPath?: string;
  generatedAt?: Date;
}): ImportReadinessReport {
  const runtimeSupport = getRuntimeSupport(input.detection.runtime);
  const commandSupport = buildProjectAwareRuntimeCommandSupport({
    runtime: input.detection.runtime,
    moduleSupport: input.moduleSupport,
    projectPath: input.projectPath,
    framework: input.detection.key,
  });
  const checks: ImportReadinessCheck[] = [];

  checks.push({
    id: 'framework-detection',
    status: input.detection.key === 'unknown' ? 'warn' : 'pass',
    message:
      input.detection.key === 'unknown'
        ? 'Workspai could not confidently identify the project framework.'
        : `Detected ${input.detection.displayName} with ${input.detection.confidence} confidence.`,
    recommendation:
      input.detection.key === 'unknown'
        ? 'Add .workspai/project.json metadata or import a project with recognizable runtime manifests.'
        : undefined,
  });

  checks.push({
    id: 'runtime-support',
    status: runtimeSupport.tier === 'observed' ? 'warn' : 'pass',
    message: `${runtimeSupport.displayName} is supported at ${runtimeSupport.tier} tier.`,
    recommendation:
      runtimeSupport.tier === 'observed'
        ? 'Observed runtimes are contract-aware but may need manual commands until a first-class kit exists.'
        : undefined,
  });

  checks.push({
    id: 'module-mutation-policy',
    status: input.moduleSupport ? 'pass' : 'warn',
    message: input.moduleSupport
      ? 'RapidKit Core module mutation is enabled for this project.'
      : 'RapidKit Core module mutation is disabled for this imported project.',
    recommendation: input.moduleSupport
      ? undefined
      : 'Use project lifecycle and workspace governance commands; enable module_support only after validating a compatible module generator.',
  });

  checks.push({
    id: 'lifecycle-commands',
    status: commandSupport.lifecycleCommands.length > 1 ? 'pass' : 'warn',
    message:
      commandSupport.lifecycleCommands.length > 1
        ? `Lifecycle commands available: ${commandSupport.lifecycleCommands.join(', ')}.`
        : 'Only help-level lifecycle support is available for this runtime today.',
    recommendation:
      commandSupport.lifecycleCommands.length > 1
        ? undefined
        : 'Add runtime scripts or a Workspai runtime adapter before relying on dev/test/build/start.',
  });

  const hasFail = checks.some((check) => check.status === 'fail');
  const hasWarn = checks.some((check) => check.status === 'warn');

  return {
    schemaVersion: 1,
    kind: 'rapidkit.import_readiness',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    status: hasFail ? 'blocked' : hasWarn ? 'review' : 'ready',
    project: {
      name: input.projectName,
      relativePath: input.relativePath,
      ...(input.projectKind ? { kind: input.projectKind } : {}),
      source: input.source,
    },
    detection: {
      runtime: input.detection.runtime,
      framework: input.detection.key,
      frameworkDisplayName: input.detection.displayName,
      confidence: input.detection.confidence,
      supportTier: input.detection.supportTier,
      importStack: input.detection.importStack,
    },
    commandSupport: {
      lifecycleCommands: commandSupport.lifecycleCommands,
      unsupportedLifecycleCommands: commandSupport.unsupportedLifecycleCommands,
      moduleCommands: commandSupport.moduleCommands,
    },
    checks,
  };
}
