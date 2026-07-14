import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createHash, createSign, generateKeyPairSync } from 'crypto';
import { createServer } from 'http';
import type { AddressInfo } from 'net';

const adapterCheckPrereqs = vi.fn();
const adapterDoctorHints = vi.fn();
const getRuntimeAdapterMock = vi.fn();
const areRuntimeAdaptersEnabledMock = vi.fn();

vi.mock('../runtime-adapters/index.js', () => ({
  getRuntimeAdapter: getRuntimeAdapterMock,
  areRuntimeAdaptersEnabled: areRuntimeAdaptersEnabledMock,
}));

describe('Mirror evidence export hardening', () => {
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
  });

  async function createMirrorFixture(prefix: string) {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), `${prefix}-`));
    const rapidkitDir = path.join(workspaceRoot, '.rapidkit');
    const sourceDir = path.join(workspaceRoot, 'artifact-source');
    const sourceFile = path.join(sourceDir, 'artifact.bin');
    const sourceContent = `${prefix}-artifact-content`;
    const sourceSha = createHash('sha256').update(sourceContent).digest('hex');

    await mkdir(rapidkitDir, { recursive: true });
    await mkdir(sourceDir, { recursive: true });
    await writeFile(path.join(workspaceRoot, '.rapidkit-workspace'), '{}', 'utf-8');
    await writeFile(sourceFile, sourceContent, 'utf-8');
    await writeFile(path.join(rapidkitDir, 'artifact.sig'), 'dummy-signature', 'utf-8');

    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const signer = createSign('sha256');
    signer.update(Buffer.from(sourceContent, 'utf-8'));
    signer.end();
    const detachedSignature = signer.sign(privateKey).toString('base64');

    await writeFile(
      path.join(rapidkitDir, 'mirror-public.pem'),
      publicKey.export({ type: 'spki', format: 'pem' }),
      'utf-8'
    );

    return {
      workspaceRoot,
      rapidkitDir,
      sourceFile,
      sourceSha,
      detachedSignature,
    };
  }

  it('retries HTTP evidence export and succeeds on later attempt', async () => {
    const fixture = await createMirrorFixture('rapidkit-evidence-retry');
    let requestCount = 0;

    const server = createServer((_req, res) => {
      requestCount += 1;
      if (requestCount < 3) {
        res.statusCode = 503;
        res.end('temporary-failure');
        return;
      }
      res.statusCode = 200;
      res.end('ok');
    });

    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address() as AddressInfo;
      const endpoint = `http://127.0.0.1:${address.port}/evidence`;

      await writeFile(
        path.join(fixture.rapidkitDir, 'mirror-config.json'),
        JSON.stringify(
          {
            enabled: true,
            mode: 'offline-first',
            security: {
              requireSigstore: true,
              evidenceExport: {
                enabled: true,
                target: 'http',
                endpoint,
                retries: 2,
                backoffMs: 10,
                failOnError: true,
              },
            },
            artifacts: [
              {
                id: 'artifact-retry',
                source: path.relative(fixture.workspaceRoot, fixture.sourceFile),
                target: 'retry/artifact.bin',
                sha256: fixture.sourceSha,
                required: true,
                attestation: {
                  signature: fixture.detachedSignature,
                  publicKeyPath: '.rapidkit/mirror-public.pem',
                  sigstore: {
                    signaturePath: '.rapidkit/artifact.sig',
                    identity: 'release@getrapidkit.dev',
                    issuer: 'https://token.actions.githubusercontent.com',
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
      process.chdir(fixture.workspaceRoot);

      const index = await import('../index.js');
      const code = await index.handleMirrorCommand(['mirror', 'sync']);

      expect(code).toBe(0);
      expect(requestCount).toBe(3);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      await cleanupWorkspaceDir(fixture.workspaceRoot);
    }
  }, 15_000);

  it('writes dead-letter evidence when HTTP export exhausts retries', async () => {
    const fixture = await createMirrorFixture('rapidkit-evidence-deadletter');

    const server = createServer((_req, res) => {
      res.statusCode = 503;
      res.end('always-fail');
    });

    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address() as AddressInfo;
      const endpoint = `http://127.0.0.1:${address.port}/evidence`;

      await writeFile(
        path.join(fixture.rapidkitDir, 'mirror-config.json'),
        JSON.stringify(
          {
            enabled: true,
            mode: 'offline-first',
            security: {
              requireSigstore: true,
              evidenceExport: {
                enabled: true,
                target: 'http',
                endpoint,
                retries: 1,
                backoffMs: 10,
                deadLetterPath: '.workspai/reports/custom-dead-letter.ndjson',
                failOnError: true,
              },
            },
            artifacts: [
              {
                id: 'artifact-deadletter',
                source: path.relative(fixture.workspaceRoot, fixture.sourceFile),
                target: 'deadletter/artifact.bin',
                sha256: fixture.sourceSha,
                required: true,
                attestation: {
                  signature: fixture.detachedSignature,
                  publicKeyPath: '.rapidkit/mirror-public.pem',
                  sigstore: {
                    signaturePath: '.rapidkit/artifact.sig',
                    identity: 'release@getrapidkit.dev',
                    issuer: 'https://token.actions.githubusercontent.com',
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
      process.chdir(fixture.workspaceRoot);

      const index = await import('../index.js');
      const code = await index.handleMirrorCommand(['mirror', 'sync']);

      expect(code).toBe(1);
      const fsExtra = await import('fs-extra');
      const deadLetter = path.join(
        fixture.workspaceRoot,
        '.workspai',
        'reports',
        'custom-dead-letter.ndjson'
      );
      await expect(fsExtra.pathExists(deadLetter)).resolves.toBe(true);
      const raw = await fsExtra.readFile(deadLetter, 'utf-8');
      expect(raw).toContain('Evidence HTTP export failed');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      await cleanupWorkspaceDir(fixture.workspaceRoot);
    }
  }, 15_000);
});
