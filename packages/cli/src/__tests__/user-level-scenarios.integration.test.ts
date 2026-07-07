import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createHash, createSign, generateKeyPairSync } from 'crypto';

const adapterCheckPrereqs = vi.fn();
const adapterDoctorHints = vi.fn();
const getRuntimeAdapterMock = vi.fn();
const areRuntimeAdaptersEnabledMock = vi.fn();

vi.mock('../runtime-adapters/index.js', () => ({
  getRuntimeAdapter: getRuntimeAdapterMock,
  areRuntimeAdaptersEnabled: areRuntimeAdaptersEnabledMock,
}));

describe('User-level practical scenarios', () => {
  let originalCwd = process.cwd();

  const cleanupWorkspaceDir = async (workspaceRoot: string): Promise<void> => {
    const cwd = process.cwd();
    if (cwd === workspaceRoot || cwd.startsWith(`${workspaceRoot}${path.sep}`)) {
      process.chdir(originalCwd);
    }
    await rm(workspaceRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  };

  beforeEach(() => {
    originalCwd = process.cwd();
    vi.resetModules();
    vi.clearAllMocks();

    areRuntimeAdaptersEnabledMock.mockReturnValue(false);
    getRuntimeAdapterMock.mockReturnValue({
      checkPrereqs: adapterCheckPrereqs,
      doctorHints: adapterDoctorHints,
    });

    adapterCheckPrereqs.mockResolvedValue({ exitCode: 0 });
    adapterDoctorHints.mockResolvedValue([]);

    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    delete process.env.RAPIDKIT_SIGSTORE_MOCK;
    delete process.env.RAPIDKIT_ENV;
    delete process.env.RAPIDKIT_BOOTSTRAP_CI;
    delete process.env.RAPIDKIT_OFFLINE_MODE;
  });

  async function createWorkspace(prefix: string) {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), `${prefix}-`));
    const workspaiDir = path.join(workspaceRoot, '.workspai');
    await mkdir(workspaiDir, { recursive: true });
    await writeFile(path.join(workspaceRoot, '.workspai-workspace'), '{}', 'utf-8');
    return { workspaceRoot, workspaiDir };
  }

  it('Scenario 1 (Junior): bootstrap works with minimal profile and writes compliance report', async () => {
    const { workspaceRoot, workspaiDir } = await createWorkspace('rapidkit-scenario-junior');

    try {
      await writeFile(
        path.join(workspaiDir, 'workspace.json'),
        JSON.stringify({ profile: 'minimal' }, null, 2),
        'utf-8'
      );
      await writeFile(
        path.join(workspaiDir, 'policies.yml'),
        ['version: "1.0"', 'mode: warn', 'rules:', '  enforce_workspace_marker: true', ''].join(
          '\n'
        ),
        'utf-8'
      );

      process.chdir(workspaceRoot);
      const index = await import('../index.js');
      const initRunner = vi.fn().mockResolvedValue(0);

      const code = await index.handleBootstrapCommand(['bootstrap'], initRunner);

      expect(code).toBe(0);
      expect(initRunner).toHaveBeenCalledWith(['init']);

      const fsExtra = await import('fs-extra');
      await expect(
        fsExtra.pathExists(path.join(workspaiDir, 'reports', 'bootstrap-compliance.latest.json'))
      ).resolves.toBe(true);
    } finally {
      await cleanupWorkspaceDir(workspaceRoot);
    }
  });

  it('Scenario 2 (Mid-level): mirror sync + verify succeeds with checksum-pinned local artifact', async () => {
    const { workspaceRoot, workspaiDir } = await createWorkspace('rapidkit-scenario-mid');

    try {
      const sourceDir = path.join(workspaceRoot, 'mirror-source');
      const sourceFile = path.join(sourceDir, 'artifact.tgz');
      const sourceContent = 'mid-level-artifact-content';
      const sourceSha = createHash('sha256').update(sourceContent).digest('hex');

      await mkdir(sourceDir, { recursive: true });
      await writeFile(sourceFile, sourceContent, 'utf-8');
      await writeFile(
        path.join(workspaiDir, 'mirror-config.json'),
        JSON.stringify(
          {
            enabled: true,
            mode: 'offline-first',
            artifacts: [
              {
                id: 'artifact-mid',
                source: path.relative(workspaceRoot, sourceFile),
                target: 'pkg/artifact.tgz',
                sha256: sourceSha,
                required: true,
              },
            ],
          },
          null,
          2
        ),
        'utf-8'
      );

      process.chdir(workspaceRoot);
      const index = await import('../index.js');

      const syncCode = await index.handleMirrorCommand(['mirror', 'sync']);
      const verifyCode = await index.handleMirrorCommand(['mirror', 'verify']);

      expect(syncCode).toBe(0);
      expect(verifyCode).toBe(0);

      const fsExtra = await import('fs-extra');
      await expect(fsExtra.pathExists(path.join(workspaiDir, 'mirror.lock'))).resolves.toBe(true);
    } finally {
      await cleanupWorkspaceDir(workspaceRoot);
    }
  });

  it('Scenario 3 (Senior): stage policy with attestation + Sigstore mock succeeds', async () => {
    const { workspaceRoot, workspaiDir } = await createWorkspace('rapidkit-scenario-senior');

    try {
      const sourceDir = path.join(workspaceRoot, 'senior-source');
      const sourceFile = path.join(sourceDir, 'artifact.bin');
      const sourceContent = 'senior-artifact-content';
      const sourceSha = createHash('sha256').update(sourceContent).digest('hex');

      await mkdir(sourceDir, { recursive: true });
      await writeFile(sourceFile, sourceContent, 'utf-8');
      await writeFile(path.join(workspaiDir, 'artifact.sig'), 'dummy-signature', 'utf-8');

      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const signer = createSign('sha256');
      signer.update(Buffer.from(sourceContent, 'utf-8'));
      signer.end();
      const detachedSignature = signer.sign(privateKey).toString('base64');

      await writeFile(
        path.join(workspaiDir, 'mirror-public.pem'),
        publicKey.export({ type: 'spki', format: 'pem' }),
        'utf-8'
      );

      await writeFile(
        path.join(workspaiDir, 'mirror-config.json'),
        JSON.stringify(
          {
            enabled: true,
            mode: 'offline-first',
            security: {
              requireAttestation: true,
              requireSigstore: true,
              requireTransparencyLog: true,
              policies: {
                stage: {
                  allowIdentities: ['release@getrapidkit.dev'],
                  allowIssuers: ['https://token.actions.githubusercontent.com'],
                  allowRekorUrls: ['https://rekor.sigstore.dev'],
                },
              },
            },
            artifacts: [
              {
                id: 'artifact-senior',
                source: path.relative(workspaceRoot, sourceFile),
                target: 'senior/artifact.bin',
                sha256: sourceSha,
                required: true,
                attestation: {
                  signature: detachedSignature,
                  publicKeyPath: '.workspai/mirror-public.pem',
                  sigstore: {
                    signaturePath: '.workspai/artifact.sig',
                    identity: 'release@getrapidkit.dev',
                    issuer: 'https://token.actions.githubusercontent.com',
                    rekorUrl: 'https://rekor.sigstore.dev',
                  },
                },
              },
            ],
          },
          null,
          2
        ),
        'utf-8'
      );

      process.env.RAPIDKIT_SIGSTORE_MOCK = 'success';
      process.env.RAPIDKIT_ENV = 'stage';
      process.chdir(workspaceRoot);

      const index = await import('../index.js');
      const code = await index.handleMirrorCommand(['mirror', 'sync', '--json']);

      expect(code).toBe(0);

      const fsExtra = await import('fs-extra');
      await expect(
        fsExtra.pathExists(path.join(workspaiDir, 'reports', 'transparency-evidence.latest.json'))
      ).resolves.toBe(true);
    } finally {
      await cleanupWorkspaceDir(workspaceRoot);
    }
  });

  it('Scenario 4 (Enterprise): prod governance bundle + evidence export succeeds', async () => {
    const { workspaceRoot, workspaiDir } = await createWorkspace('rapidkit-scenario-enterprise');

    try {
      const sourceDir = path.join(workspaceRoot, 'enterprise-source');
      const sourceFile = path.join(sourceDir, 'artifact.bin');
      const sourceContent = 'enterprise-artifact-content';
      const sourceSha = createHash('sha256').update(sourceContent).digest('hex');

      await mkdir(sourceDir, { recursive: true });
      await writeFile(sourceFile, sourceContent, 'utf-8');
      await writeFile(path.join(workspaiDir, 'artifact.sig'), 'dummy-signature', 'utf-8');

      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const signer = createSign('sha256');
      signer.update(Buffer.from(sourceContent, 'utf-8'));
      signer.end();
      const detachedSignature = signer.sign(privateKey).toString('base64');

      await writeFile(
        path.join(workspaiDir, 'mirror-public.pem'),
        publicKey.export({ type: 'spki', format: 'pem' }),
        'utf-8'
      );

      const policy = {
        policies: {
          prod: {
            allowIdentities: ['release@getrapidkit.dev'],
            allowIssuers: ['https://token.actions.githubusercontent.com'],
            allowRekorUrls: ['https://rekor.sigstore.dev'],
          },
        },
      };
      const policyRaw = JSON.stringify(policy, null, 2);
      await writeFile(path.join(workspaiDir, 'governance-policy.json'), policyRaw, 'utf-8');

      const policySigner = createSign('sha256');
      policySigner.update(Buffer.from(policyRaw, 'utf-8'));
      policySigner.end();
      const policySignature = policySigner.sign(privateKey).toString('base64');
      await writeFile(path.join(workspaiDir, 'governance-policy.sig'), policySignature, 'utf-8');
      await writeFile(
        path.join(workspaiDir, 'governance-public.pem'),
        publicKey.export({ type: 'spki', format: 'pem' }),
        'utf-8'
      );

      await writeFile(
        path.join(workspaiDir, 'mirror-config.json'),
        JSON.stringify(
          {
            enabled: true,
            mode: 'offline-first',
            security: {
              requireAttestation: true,
              requireSigstore: true,
              requireTransparencyLog: true,
              requireSignedGovernance: true,
              governanceBundle: {
                policyPath: '.workspai/governance-policy.json',
                signaturePath: '.workspai/governance-policy.sig',
                publicKeyPath: '.workspai/governance-public.pem',
                algorithm: 'sha256',
              },
              evidenceExport: {
                enabled: true,
                target: 'file',
                filePath: '.workspai/reports/siem-evidence.ndjson',
                failOnError: true,
              },
            },
            artifacts: [
              {
                id: 'artifact-enterprise',
                source: path.relative(workspaceRoot, sourceFile),
                target: 'enterprise/artifact.bin',
                sha256: sourceSha,
                required: true,
                attestation: {
                  signature: detachedSignature,
                  publicKeyPath: '.workspai/mirror-public.pem',
                  sigstore: {
                    signaturePath: '.workspai/artifact.sig',
                    identity: 'release@getrapidkit.dev',
                    issuer: 'https://token.actions.githubusercontent.com',
                    rekorUrl: 'https://rekor.sigstore.dev',
                  },
                },
              },
            ],
          },
          null,
          2
        ),
        'utf-8'
      );

      process.env.RAPIDKIT_SIGSTORE_MOCK = 'success';
      process.env.RAPIDKIT_ENV = 'prod';
      process.chdir(workspaceRoot);

      const index = await import('../index.js');
      const code = await index.handleMirrorCommand(['mirror', 'sync']);

      expect(code).toBe(0);

      const fsExtra = await import('fs-extra');
      await expect(
        fsExtra.pathExists(path.join(workspaceRoot, '.workspai', 'reports', 'siem-evidence.ndjson'))
      ).resolves.toBe(true);
      await expect(
        fsExtra.pathExists(path.join(workspaiDir, 'reports', 'transparency-evidence.latest.json'))
      ).resolves.toBe(true);
    } finally {
      await cleanupWorkspaceDir(workspaceRoot);
    }
  });
});
