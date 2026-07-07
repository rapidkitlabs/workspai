import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const docsDir = path.resolve(process.cwd(), 'docs');

const mirrorPath = path.join(docsDir, 'mirror-config.enterprise.example.json');
const governancePath = path.join(docsDir, 'governance-policy.enterprise.example.json');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensure(condition, message, errors) {
  if (!condition) errors.push(message);
}

function validateMirrorConfig(data, errors) {
  ensure(isObject(data), 'mirror-config must be a JSON object.', errors);
  if (!isObject(data)) return;

  ensure(data.enabled === true, 'mirror-config.enabled must be true.', errors);
  ensure(
    ['online', 'offline-first', 'offline-only'].includes(data.mode),
    'mirror-config.mode must be one of: online, offline-first, offline-only.',
    errors
  );

  ensure(Array.isArray(data.artifacts) && data.artifacts.length > 0, 'mirror-config.artifacts must be a non-empty array.', errors);

  if (Array.isArray(data.artifacts)) {
    for (const [index, artifact] of data.artifacts.entries()) {
      const prefix = `mirror-config.artifacts[${index}]`;
      ensure(isObject(artifact), `${prefix} must be an object.`, errors);
      if (!isObject(artifact)) continue;

      ensure(typeof artifact.id === 'string' && artifact.id.length > 0, `${prefix}.id must be a non-empty string.`, errors);
      ensure(typeof artifact.target === 'string' && artifact.target.length > 0, `${prefix}.target must be a non-empty string.`, errors);
      ensure(typeof artifact.sha256 === 'string' && artifact.sha256.length > 0, `${prefix}.sha256 must be a non-empty string.`, errors);
      ensure(artifact.required === true, `${prefix}.required must be true for enterprise template.`, errors);

      const hasSource = typeof artifact.source === 'string' && artifact.source.length > 0;
      const hasUrl = typeof artifact.url === 'string' && artifact.url.length > 0;
      ensure(hasSource || hasUrl, `${prefix} must define source or url.`, errors);

      ensure(isObject(artifact.attestation), `${prefix}.attestation must be an object.`, errors);
      if (!isObject(artifact.attestation)) continue;

      ensure(
        typeof artifact.attestation.signature === 'string' && artifact.attestation.signature.length > 0,
        `${prefix}.attestation.signature must be a non-empty string.`,
        errors
      );
      ensure(
        typeof artifact.attestation.publicKeyPath === 'string' && artifact.attestation.publicKeyPath.length > 0,
        `${prefix}.attestation.publicKeyPath must be a non-empty string.`,
        errors
      );

      ensure(isObject(artifact.attestation.sigstore), `${prefix}.attestation.sigstore must be an object.`, errors);
      if (isObject(artifact.attestation.sigstore)) {
        const sigstore = artifact.attestation.sigstore;
        ensure(
          typeof sigstore.signaturePath === 'string' && sigstore.signaturePath.length > 0,
          `${prefix}.attestation.sigstore.signaturePath must be a non-empty string.`,
          errors
        );
        ensure(
          typeof sigstore.identity === 'string' && sigstore.identity.length > 0,
          `${prefix}.attestation.sigstore.identity must be a non-empty string.`,
          errors
        );
        ensure(
          typeof sigstore.issuer === 'string' && sigstore.issuer.length > 0,
          `${prefix}.attestation.sigstore.issuer must be a non-empty string.`,
          errors
        );
      }
    }
  }

  ensure(isObject(data.security), 'mirror-config.security must be an object.', errors);
  if (!isObject(data.security)) return;

  ensure(data.security.requireAttestation === true, 'mirror-config.security.requireAttestation must be true.', errors);
  ensure(data.security.requireSigstore === true, 'mirror-config.security.requireSigstore must be true.', errors);
  ensure(data.security.requireSignedGovernance === true, 'mirror-config.security.requireSignedGovernance must be true.', errors);

  ensure(isObject(data.security.governanceBundle), 'mirror-config.security.governanceBundle must be an object.', errors);
  if (isObject(data.security.governanceBundle)) {
    const bundle = data.security.governanceBundle;
    ensure(
      typeof bundle.policyPath === 'string' && bundle.policyPath.length > 0,
      'mirror-config.security.governanceBundle.policyPath must be a non-empty string.',
      errors
    );
    ensure(
      typeof bundle.signaturePath === 'string' && bundle.signaturePath.length > 0,
      'mirror-config.security.governanceBundle.signaturePath must be a non-empty string.',
      errors
    );
    ensure(
      typeof bundle.publicKeyPath === 'string' && bundle.publicKeyPath.length > 0,
      'mirror-config.security.governanceBundle.publicKeyPath must be a non-empty string.',
      errors
    );
  }

  ensure(isObject(data.security.evidenceExport), 'mirror-config.security.evidenceExport must be an object.', errors);
  if (isObject(data.security.evidenceExport)) {
    const exportConfig = data.security.evidenceExport;
    ensure(exportConfig.enabled === true, 'mirror-config.security.evidenceExport.enabled must be true.', errors);
    ensure(
      ['file', 'http'].includes(exportConfig.target),
      'mirror-config.security.evidenceExport.target must be file or http.',
      errors
    );

    if (exportConfig.target === 'file') {
      ensure(
        typeof exportConfig.filePath === 'string' && exportConfig.filePath.length > 0,
        'mirror-config.security.evidenceExport.filePath is required when target=file.',
        errors
      );
    }

    if (exportConfig.target === 'http') {
      ensure(
        typeof exportConfig.endpoint === 'string' && exportConfig.endpoint.length > 0,
        'mirror-config.security.evidenceExport.endpoint is required when target=http.',
        errors
      );
      if (isObject(exportConfig.signing) && exportConfig.signing.enabled === true) {
        ensure(
          typeof exportConfig.signing.hmacKeyEnv === 'string' && exportConfig.signing.hmacKeyEnv.length > 0,
          'mirror-config.security.evidenceExport.signing.hmacKeyEnv is required when signing.enabled=true.',
          errors
        );
      }
    }
  }
}

function validateGovernancePolicy(data, errors) {
  ensure(isObject(data), 'governance-policy must be a JSON object.', errors);
  if (!isObject(data)) return;

  ensure(isObject(data.policies), 'governance-policy.policies must be an object.', errors);
  if (!isObject(data.policies)) return;

  const requiredEnvironments = ['dev', 'stage', 'prod'];
  for (const envName of requiredEnvironments) {
    const policy = data.policies[envName];
    ensure(isObject(policy), `governance-policy.policies.${envName} must be an object.`, errors);
    if (!isObject(policy)) continue;

    ensure(
      Array.isArray(policy.allowedIdentities) && policy.allowedIdentities.length > 0,
      `governance-policy.policies.${envName}.allowedIdentities must be a non-empty array.`,
      errors
    );
    ensure(
      Array.isArray(policy.allowedIssuers) && policy.allowedIssuers.length > 0,
      `governance-policy.policies.${envName}.allowedIssuers must be a non-empty array.`,
      errors
    );
    ensure(
      Array.isArray(policy.allowedRekorUrls) && policy.allowedRekorUrls.length > 0,
      `governance-policy.policies.${envName}.allowedRekorUrls must be a non-empty array.`,
      errors
    );
    ensure(
      typeof policy.requireTransparencyLog === 'boolean',
      `governance-policy.policies.${envName}.requireTransparencyLog must be boolean.`,
      errors
    );
  }
}

async function loadJson(filePath, label, errors) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    errors.push(`${label}: failed to load/parse JSON (${error.message}).`);
    return null;
  }
}

async function main() {
  const errors = [];

  const mirrorConfig = await loadJson(mirrorPath, 'mirror-config.enterprise.example.json', errors);
  const governancePolicy = await loadJson(governancePath, 'governance-policy.enterprise.example.json', errors);

  if (mirrorConfig) validateMirrorConfig(mirrorConfig, errors);
  if (governancePolicy) validateGovernancePolicy(governancePolicy, errors);

  if (errors.length > 0) {
    console.error('❌ Docs example validation failed:\n');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('✅ Docs example validation passed.');
  console.log(`- ${path.relative(process.cwd(), mirrorPath)}`);
  console.log(`- ${path.relative(process.cwd(), governancePath)}`);
}

await main();
