import { resolveKitDefinition } from './kit-registry.js';

function resolveExistingKitName(projectJson: Record<string, unknown> | null): string | undefined {
  if (typeof projectJson?.kit_name === 'string') {
    return projectJson.kit_name;
  }
  if (typeof projectJson?.kit === 'string') {
    return projectJson.kit;
  }
  return undefined;
}

export function resolveImportModuleSupport(input: {
  existingProjectJson: Record<string, unknown> | null;
  detection: unknown;
  enableModules?: boolean;
}): boolean {
  if (input.existingProjectJson?.module_support === true) {
    const kitName = resolveExistingKitName(input.existingProjectJson);
    const kit = kitName ? resolveKitDefinition(kitName) : undefined;
    return kit?.owner === 'core' && kit.moduleSupport === true;
  }

  return false;
}
