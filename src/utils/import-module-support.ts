import type { BackendFrameworkDetection } from './backend-framework-contract.js';
import { getRuntimeSupport } from './support-matrix.js';

export function resolveImportModuleSupport(input: {
  existingProjectJson: Record<string, unknown> | null;
  detection: BackendFrameworkDetection;
  enableModules?: boolean;
}): boolean {
  if (input.existingProjectJson?.module_support === true) {
    return true;
  }
  if (input.enableModules !== true) {
    return false;
  }
  return getRuntimeSupport(input.detection.runtime).moduleCommands;
}
