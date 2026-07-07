import { INFRA_STACK_SCHEMA_VERSION, type InfraStackContract } from '../utils/infra-stack.js';
import { INFRA_STACK_CATALOG_BODY } from './infra-stack-catalog.js';

export function buildInfraStackContract(): InfraStackContract {
  return {
    schemaVersion: INFRA_STACK_SCHEMA_VERSION,
    ...INFRA_STACK_CATALOG_BODY,
  };
}
