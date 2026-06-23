import fs from 'fs';
import path from 'path';

import { buildAgentCustomizationPackContract } from '../src/contracts/agent-customization-pack-contract.js';
import { buildImportStackParitySnapshot } from '../src/contracts/import-stack-parity-snapshot.js';
import { buildCreatePlannerCapabilitiesContract } from '../src/contracts/create-planner-capabilities-contract.js';
import { buildInfraStackContract } from '../src/contracts/infra-stack-contract.js';
import { buildModuleLayoutContract } from '../src/contracts/module-layout-contract.js';
import { buildRuntimeCommandSurfaceContract } from '../src/contracts/runtime-command-surface-contract.js';

const contractsDir = path.resolve(process.cwd(), 'contracts');

function writeJson(fileName: string, value: unknown) {
  const targetPath = path.join(contractsDir, fileName);
  fs.mkdirSync(contractsDir, { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  console.log(`- wrote ${targetPath}`);
}

writeJson('runtime-command-surface.v1.json', buildRuntimeCommandSurfaceContract());
writeJson('create-planner-capabilities.v1.json', buildCreatePlannerCapabilitiesContract());
writeJson('agent-customization-pack.v1.json', buildAgentCustomizationPackContract());
writeJson('backend-import-stack-parity.snapshot.json', buildImportStackParitySnapshot());
writeJson('module-layout.v1.json', buildModuleLayoutContract());
writeJson('infra-stack.v1.json', buildInfraStackContract());
