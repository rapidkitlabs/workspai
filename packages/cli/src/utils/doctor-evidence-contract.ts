export type DoctorEvidenceType = 'workspace' | 'project';

import { WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS } from '../contracts/workspace-intelligence-runtime-registry.js';

export const DOCTOR_WORKSPACE_EVIDENCE_SCHEMA = WORKSPACE_INTELLIGENCE_ARTIFACT_SCHEMAS.doctor;
export const DOCTOR_PROJECT_EVIDENCE_SCHEMA = 'doctor-project-evidence-v1';

function toObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function isDoctorEvidencePayloadCompatible(
  payload: unknown,
  expectedType?: DoctorEvidenceType
): payload is Record<string, unknown> {
  const report = toObjectRecord(payload);
  if (!report) {
    return false;
  }

  const schemaVersion = report.schemaVersion;
  const evidenceType = report.evidenceType;

  if (typeof schemaVersion === 'string') {
    if (
      schemaVersion !== DOCTOR_WORKSPACE_EVIDENCE_SCHEMA &&
      schemaVersion !== DOCTOR_PROJECT_EVIDENCE_SCHEMA
    ) {
      return false;
    }

    if (expectedType === 'workspace' && schemaVersion !== DOCTOR_WORKSPACE_EVIDENCE_SCHEMA) {
      return false;
    }
    if (expectedType === 'project' && schemaVersion !== DOCTOR_PROJECT_EVIDENCE_SCHEMA) {
      return false;
    }
  }

  if (typeof evidenceType === 'string') {
    if (evidenceType !== 'workspace' && evidenceType !== 'project') {
      return false;
    }
    if (expectedType && evidenceType !== expectedType) {
      return false;
    }
  }

  return true;
}
