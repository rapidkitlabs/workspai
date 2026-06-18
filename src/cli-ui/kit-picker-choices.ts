import { listFrontendGenerators } from '../frontend-project.js';
import { listInteractiveKits, type KitDefinition } from '../utils/kit-registry.js';
import type { PromptChoice } from './prompts.js';

function kitPickerLabel(kit: KitDefinition): string {
  const separator = ' — ';
  const index = kit.label.indexOf(separator);
  if (index >= 0) {
    return kit.label.slice(index + separator.length).trim();
  }
  return kit.label.trim();
}

export function buildKitPickerChoices(): PromptChoice<string>[] {
  const backendChoices = listInteractiveKits().map((kit) => ({
    value: kit.id,
    label: kitPickerLabel(kit),
    hint: kit.description,
    name: kit.label,
  }));

  const frontendChoices = listFrontendGenerators().map((generator) => ({
    value: generator.kitId,
    label: generator.displayName,
    hint: generator.commandDisplay('my-app'),
    name: `${generator.displayName} — ${generator.framework}`,
  }));

  return [...backendChoices, ...frontendChoices];
}

export function assertUniqueKitPickerLabels(choices: PromptChoice<string>[]): void {
  const seen = new Set<string>();
  for (const choice of choices) {
    const label = choice.label ?? choice.name ?? String(choice.value);
    if (seen.has(label)) {
      throw new Error(`Duplicate kit picker label: ${label}`);
    }
    seen.add(label);
  }
}
