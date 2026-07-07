/**
 * Cross-platform Python command utility
 */

import { getDefaultPythonCommand } from './utils/platform-capabilities.js';

export function getPythonCommand(): string {
  return getDefaultPythonCommand();
}
