import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';

const validatorCache = new Map<string, ValidateFunction>();

function resolveContractPath(relativeContractPath: string): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDirectory, '..', relativeContractPath),
    path.resolve(moduleDirectory, '../..', relativeContractPath),
    path.resolve(process.cwd(), relativeContractPath),
  ];
  const contractPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!contractPath) {
    throw new Error(`JSON Schema contract is unavailable: ${relativeContractPath}`);
  }
  return contractPath;
}

function validatorFor(relativeContractPath: string): ValidateFunction {
  const contractPath = resolveContractPath(relativeContractPath);
  const cached = validatorCache.get(contractPath);
  if (cached) return cached;

  const schema = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as AnySchema & {
    $schema?: string;
    $ref?: string;
  };
  if (typeof schema.$ref === 'string' && !schema.$ref.startsWith('#')) {
    const referencedRelativePath = path
      .join(path.dirname(relativeContractPath), schema.$ref)
      .split(path.sep)
      .join('/');
    const validator = validatorFor(referencedRelativePath);
    validatorCache.set(contractPath, validator);
    return validator;
  }
  const AjvConstructor = schema.$schema?.includes('2020-12') ? Ajv2020 : Ajv;
  const ajv = new AjvConstructor({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  const validator = ajv.compile(schema);
  validatorCache.set(contractPath, validator);
  return validator;
}

function summarizeErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .slice(0, 8)
    .map((error) => {
      const location = error.instancePath || '/';
      const detail =
        error.keyword === 'additionalProperties'
          ? ` (${String(error.params.additionalProperty)})`
          : '';
      return `${location} ${error.message ?? error.keyword}${detail}`;
    })
    .join('; ');
}

export function assertJsonSchemaContract(
  payload: unknown,
  relativeContractPath: string,
  artifactLabel: string
): void {
  const validator = validatorFor(relativeContractPath);
  if (!validator(payload)) {
    throw new Error(
      `${artifactLabel} violates ${relativeContractPath}: ${summarizeErrors(validator.errors)}`
    );
  }
}
