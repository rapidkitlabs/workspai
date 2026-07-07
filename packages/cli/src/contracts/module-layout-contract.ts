import {
  CANONICAL_MODULE_ROOT,
  MODULE_LAYOUT_FRAMEWORKS,
  MODULE_LAYOUT_SCHEMA_VERSION,
  MODULE_PATH_PATTERN,
  MODULE_SLUG_PATTERN,
  MODULE_UNSUPPORTED_MODULE_FRAMEWORKS,
} from '../utils/module-layout.js';

export type ModuleLayoutContract = {
  schemaVersion: string;
  canonicalModuleRoot: string;
  pathPattern: string;
  slugPattern: string;
  frameworks: typeof MODULE_LAYOUT_FRAMEWORKS;
  unsupportedModuleFrameworks: string[];
};

export function buildModuleLayoutContract(): ModuleLayoutContract {
  return {
    schemaVersion: MODULE_LAYOUT_SCHEMA_VERSION,
    canonicalModuleRoot: CANONICAL_MODULE_ROOT,
    pathPattern: MODULE_PATH_PATTERN,
    slugPattern: MODULE_SLUG_PATTERN,
    frameworks: MODULE_LAYOUT_FRAMEWORKS,
    unsupportedModuleFrameworks: [...MODULE_UNSUPPORTED_MODULE_FRAMEWORKS],
  };
}
