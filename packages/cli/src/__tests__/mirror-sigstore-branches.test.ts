import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createHash, createSign, generateKeyPairSync } from 'crypto';
import { execa } from 'execa';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const execaMock = vi.mocked(execa);

async function makeWorkspace(prefix: string) {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), `${prefix}-`));
  await mkdir(path.join(workspaceRoot, '.rapidkit'), { recursive: true });
  return workspaceRoot;
}

async function writeMirrorConfig(workspaceRoot: string, config: unknown) {
  await writeFile(
    path.join(workspaceRoot, '.rapidkit', 'mirror-config.json'),
    JSON.stringify(config, null, 2),
    'utf-8'
  );
}

async function makeSignedArtifact(workspaceRoot: string, id: string) {
  const sourceDir = path.join(workspaceRoot, 'artifact-source');
  const sourceFile = path.join(sourceDir, `${id}.bin`);
  const content = `${id}-content`;

  await mkdir(sourceDir, { recursive: true });
  await writeFile(sourceFile, content, 'utf-8');

  const sha = createHash('sha256').update(content).digest('hex');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const signer = createSign('sha256');
  signer.update(Buffer.from(content, 'utf-8'));
  signer.end();
  const detachedSignature = signer.sign(privateKey).toString('base64');

  const publicKeyPath = path.join(workspaceRoot, '.rapidkit', `${id}-pub.pem`);
  const sigstorePath = path.join(workspaceRoot, '.rapidkit', `${id}.sig`);
  const certPath = path.join(workspaceRoot, '.rapidkit', `${id}.crt`);
  const bundlePath = path.join(workspaceRoot, '.rapidkit', `${id}.bundle`);
  const keyPath = path.join(workspaceRoot, '.rapidkit', `${id}.key`);

  await writeFile(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }), 'utf-8');
  await writeFile(sigstorePath, 'mock-sig', 'utf-8');
  await writeFile(certPath, 'mock-cert', 'utf-8');
  await writeFile(bundlePath, 'mock-bundle', 'utf-8');
  await writeFile(keyPath, 'mock-key', 'utf-8');

  return {
    sourceFile,
    sha,
    detachedSignature,
    publicKeyPath: path.relative(workspaceRoot, publicKeyPath),
    sigstorePath: path.relative(workspaceRoot, sigstorePath),
    certPath: path.relative(workspaceRoot, certPath),
    bundlePath: path.relative(workspaceRoot, bundlePath),
    keyPath: path.relative(workspaceRoot, keyPath),
  };
}

describe('mirror sigstore verification branches', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.clearAllMocks();
    delete process.env.RAPIDKIT_SIGSTORE_MOCK;
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('handles cosign success path and passes all sigstore options', async () => {
    const workspaceRoot = await makeWorkspace('mirror-sigstore-success');
    tempDirs.push(workspaceRoot);

    const artifact = await makeSignedArtifact(workspaceRoot, 'sigstore-ok');

    await writeMirrorConfig(workspaceRoot, {
      enabled: true,
      mode: 'offline-first',
      security: {
        requireTransparencyLog: false,
      },
      artifacts: [
        {
          id: 'sigstore-ok',
          source: path.relative(workspaceRoot, artifact.sourceFile),
          target: 'sigstore-ok/artifact.bin',
          sha256: artifact.sha,
          required: true,
          attestation: {
            signature: artifact.detachedSignature,
            publicKeyPath: artifact.publicKeyPath,
            sigstore: {
              signaturePath: artifact.sigstorePath,
              certificatePath: artifact.certPath,
              bundlePath: artifact.bundlePath,
              keyPath: artifact.keyPath,
              identity: 'release@getrapidkit.dev',
              issuer: 'https://token.actions.githubusercontent.com',
              rekorUrl: 'https://rekor.sigstore.dev',
            },
          },
        },
      ],
    });

    execaMock.mockResolvedValue({
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
    } as any);

    const { runMirrorLifecycle } = await import('../utils/mirror.js');
    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: true,
      offlineMode: false,
    });

    expect(
      result.checks.some((c) => c.id === 'mirror.sigstore.sigstore-ok' && c.status === 'passed')
    ).toBe(true);
    expect(execaMock).toHaveBeenCalledWith(
      'cosign',
      expect.arrayContaining([
        'verify-blob',
        '--signature',
        expect.any(String),
        '--certificate',
        expect.any(String),
        '--bundle',
        expect.any(String),
        '--key',
        expect.any(String),
        '--certificate-identity',
        'release@getrapidkit.dev',
        '--certificate-oidc-issuer',
        'https://token.actions.githubusercontent.com',
        '--rekor-url',
        'https://rekor.sigstore.dev',
        '--insecure-ignore-tlog',
      ]),
      { reject: false }
    );
  });

  it('handles cosign non-zero exit as verification failed', async () => {
    const workspaceRoot = await makeWorkspace('mirror-sigstore-fail');
    tempDirs.push(workspaceRoot);

    const artifact = await makeSignedArtifact(workspaceRoot, 'sigstore-fail');

    await writeMirrorConfig(workspaceRoot, {
      enabled: true,
      mode: 'offline-first',
      artifacts: [
        {
          id: 'sigstore-fail',
          source: path.relative(workspaceRoot, artifact.sourceFile),
          target: 'sigstore-fail/artifact.bin',
          sha256: artifact.sha,
          required: true,
          attestation: {
            signature: artifact.detachedSignature,
            publicKeyPath: artifact.publicKeyPath,
            sigstore: {
              signaturePath: artifact.sigstorePath,
            },
          },
        },
      ],
    });

    execaMock.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'signature mismatch',
    } as any);

    const { runMirrorLifecycle } = await import('../utils/mirror.js');
    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: true,
      offlineMode: false,
    });

    expect(
      result.checks.some(
        (c) =>
          c.id === 'mirror.sigstore.sigstore-fail' &&
          c.status === 'failed' &&
          c.message.includes('Sigstore verification failed: signature mismatch')
      )
    ).toBe(true);
  });

  it('handles cosign runtime exception as verification error', async () => {
    const workspaceRoot = await makeWorkspace('mirror-sigstore-error');
    tempDirs.push(workspaceRoot);

    const artifact = await makeSignedArtifact(workspaceRoot, 'sigstore-error');

    await writeMirrorConfig(workspaceRoot, {
      enabled: true,
      mode: 'offline-first',
      artifacts: [
        {
          id: 'sigstore-error',
          source: path.relative(workspaceRoot, artifact.sourceFile),
          target: 'sigstore-error/artifact.bin',
          sha256: artifact.sha,
          required: true,
          attestation: {
            signature: artifact.detachedSignature,
            publicKeyPath: artifact.publicKeyPath,
            sigstore: {
              signaturePath: artifact.sigstorePath,
            },
          },
        },
      ],
    });

    execaMock.mockRejectedValue(new Error('cosign not found'));

    const { runMirrorLifecycle } = await import('../utils/mirror.js');
    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: true,
      offlineMode: false,
    });

    expect(
      result.checks.some(
        (c) =>
          c.id === 'mirror.sigstore.sigstore-error' &&
          c.status === 'failed' &&
          c.message.includes('Sigstore verification error: cosign not found')
      )
    ).toBe(true);
  });
});
