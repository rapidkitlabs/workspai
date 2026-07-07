import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createHash, createSign, generateKeyPairSync } from 'crypto';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { runMirrorLifecycle } from '../utils/mirror.js';

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

  await writeFile(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }), 'utf-8');
  await writeFile(sigstorePath, 'mock-sig', 'utf-8');

  return {
    sourceFile,
    sha,
    detachedSignature,
    publicKeyPath: path.relative(workspaceRoot, publicKeyPath),
    sigstorePath: path.relative(workspaceRoot, sigstorePath),
  };
}

describe('runMirrorLifecycle unit coverage', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    delete process.env.RAPIDKIT_SIGSTORE_MOCK;
    delete process.env.RAPIDKIT_TRUSTED_SOURCES;
    delete process.env.RAPIDKIT_EVIDENCE_HMAC;
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('skips when mirror-config.json does not exist', async () => {
    const workspaceRoot = await makeWorkspace('mirror-no-config');
    tempDirs.push(workspaceRoot);

    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: true,
      offlineMode: false,
    });

    expect(result.checks.some((c) => c.id === 'mirror.lifecycle' && c.status === 'skipped')).toBe(
      true
    );
    expect(result.details.lockWritten).toBe(false);
  });

  it('fails on invalid mirror-config.json', async () => {
    const workspaceRoot = await makeWorkspace('mirror-invalid-config');
    tempDirs.push(workspaceRoot);

    await writeFile(
      path.join(workspaceRoot, '.rapidkit', 'mirror-config.json'),
      '{bad-json',
      'utf-8'
    );

    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: true,
      offlineMode: false,
    });

    expect(
      result.checks.some((c) => c.id === 'mirror.lifecycle.config' && c.status === 'failed')
    ).toBe(true);
    expect(result.details.lockWritten).toBe(false);
  });

  it('skips lifecycle when not in ci/offline and mode is not offline-only', async () => {
    const workspaceRoot = await makeWorkspace('mirror-not-should-run');
    tempDirs.push(workspaceRoot);

    await writeMirrorConfig(workspaceRoot, {
      enabled: true,
      mode: 'online',
      artifacts: [],
    });

    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: false,
      offlineMode: false,
      forceRun: false,
    });

    expect(result.checks.some((c) => c.id === 'mirror.lifecycle' && c.status === 'skipped')).toBe(
      true
    );
    expect(result.details.lockWritten).toBe(false);
  });

  it('marks malformed artifact url as prefetch failure', async () => {
    const workspaceRoot = await makeWorkspace('mirror-bad-url');
    tempDirs.push(workspaceRoot);

    await writeMirrorConfig(workspaceRoot, {
      enabled: true,
      mode: 'offline-first',
      artifacts: [
        {
          id: 'bad-url-artifact',
          url: 'http://:invalid-url',
          required: true,
        },
      ],
    });

    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: true,
      offlineMode: false,
    });

    expect(
      result.checks.some(
        (c) =>
          c.id === 'mirror.prefetch.bad-url-artifact' &&
          c.status === 'failed' &&
          c.message.includes('Invalid URL')
      )
    ).toBe(true);
  });

  it('fails file evidence export without filePath when failOnError is enabled', async () => {
    const workspaceRoot = await makeWorkspace('mirror-file-export-missing-path');
    tempDirs.push(workspaceRoot);

    const artifact = await makeSignedArtifact(workspaceRoot, 'file-export-artifact');

    await writeMirrorConfig(workspaceRoot, {
      enabled: true,
      mode: 'offline-first',
      security: {
        evidenceExport: {
          enabled: true,
          target: 'file',
          failOnError: true,
        },
      },
      artifacts: [
        {
          id: 'file-export-artifact',
          source: path.relative(workspaceRoot, artifact.sourceFile),
          target: 'file-export/artifact.bin',
          sha256: artifact.sha,
          required: true,
          attestation: {
            signature: artifact.detachedSignature,
            publicKeyPath: artifact.publicKeyPath,
            sigstore: {
              signaturePath: artifact.sigstorePath,
              identity: 'release@getrapidkit.dev',
              issuer: 'https://token.actions.githubusercontent.com',
            },
          },
        },
      ],
    });

    process.env.RAPIDKIT_SIGSTORE_MOCK = 'success';

    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: true,
      offlineMode: false,
    });

    expect(
      result.checks.some(
        (c) =>
          c.id === 'sigstore.evidence.export.file' &&
          c.status === 'failed' &&
          c.message.includes('requires security.evidenceExport.filePath')
      )
    ).toBe(true);
    expect(result.details.transparencyEvidenceWritten).toBe(true);
    expect(result.details.evidenceExported).toBe(false);
  });

  it('fails http evidence export without endpoint when failOnError is enabled', async () => {
    const workspaceRoot = await makeWorkspace('mirror-http-export-missing-endpoint');
    tempDirs.push(workspaceRoot);

    const artifact = await makeSignedArtifact(workspaceRoot, 'http-export-artifact');

    await writeMirrorConfig(workspaceRoot, {
      enabled: true,
      mode: 'offline-first',
      security: {
        evidenceExport: {
          enabled: true,
          target: 'http',
          failOnError: true,
        },
      },
      artifacts: [
        {
          id: 'http-export-artifact',
          source: path.relative(workspaceRoot, artifact.sourceFile),
          target: 'http-export/artifact.bin',
          sha256: artifact.sha,
          required: true,
          attestation: {
            signature: artifact.detachedSignature,
            publicKeyPath: artifact.publicKeyPath,
            sigstore: {
              signaturePath: artifact.sigstorePath,
              identity: 'release@getrapidkit.dev',
              issuer: 'https://token.actions.githubusercontent.com',
            },
          },
        },
      ],
    });

    process.env.RAPIDKIT_SIGSTORE_MOCK = 'success';

    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: true,
      offlineMode: false,
    });

    expect(
      result.checks.some(
        (c) =>
          c.id === 'sigstore.evidence.export.http' &&
          c.status === 'failed' &&
          c.message.includes('requires security.evidenceExport.endpoint')
      )
    ).toBe(true);
    expect(result.details.transparencyEvidenceWritten).toBe(true);
    expect(result.details.evidenceExported).toBe(false);
  });

  it('fails prefetch trust check for untrusted host', async () => {
    const workspaceRoot = await makeWorkspace('mirror-untrusted-host');
    tempDirs.push(workspaceRoot);

    await writeMirrorConfig(workspaceRoot, {
      enabled: true,
      mode: 'offline-first',
      artifacts: [
        {
          id: 'untrusted-artifact',
          url: 'https://example.com/pkg.tgz',
          required: true,
        },
      ],
    });

    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: true,
      offlineMode: false,
    });

    expect(
      result.checks.some(
        (c) => c.id === 'mirror.prefetch.trust.untrusted-artifact' && c.status === 'failed'
      )
    ).toBe(true);
  });

  it('fails HTTP evidence export when signing key env is missing', async () => {
    const workspaceRoot = await makeWorkspace('mirror-http-signing-missing-key');
    tempDirs.push(workspaceRoot);

    const artifact = await makeSignedArtifact(workspaceRoot, 'http-signing-artifact');

    await writeMirrorConfig(workspaceRoot, {
      enabled: true,
      mode: 'offline-first',
      security: {
        evidenceExport: {
          enabled: true,
          target: 'http',
          endpoint: 'http://127.0.0.1:9/evidence',
          failOnError: true,
          signing: {
            enabled: true,
            hmacKeyEnv: 'RAPIDKIT_EVIDENCE_HMAC',
          },
        },
      },
      artifacts: [
        {
          id: 'http-signing-artifact',
          source: path.relative(workspaceRoot, artifact.sourceFile),
          target: 'http-signing/artifact.bin',
          sha256: artifact.sha,
          required: true,
          attestation: {
            signature: artifact.detachedSignature,
            publicKeyPath: artifact.publicKeyPath,
            sigstore: {
              signaturePath: artifact.sigstorePath,
              identity: 'release@getrapidkit.dev',
              issuer: 'https://token.actions.githubusercontent.com',
            },
          },
        },
      ],
    });

    process.env.RAPIDKIT_SIGSTORE_MOCK = 'success';

    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: true,
      offlineMode: false,
    });

    expect(
      result.checks.some(
        (c) =>
          c.id === 'sigstore.evidence.export.http' &&
          c.status === 'failed' &&
          c.message.includes('Evidence signing key env is missing')
      )
    ).toBe(true);
  });

  it('rotates old artifacts when retention keepLast is configured', async () => {
    const workspaceRoot = await makeWorkspace('mirror-retention-rotation');
    tempDirs.push(workspaceRoot);

    const artifactA = await makeSignedArtifact(workspaceRoot, 'rotation-a');
    const artifactB = await makeSignedArtifact(workspaceRoot, 'rotation-b');

    await writeMirrorConfig(workspaceRoot, {
      enabled: true,
      mode: 'offline-first',
      retention: {
        keepLast: 1,
      },
      artifacts: [
        {
          id: 'rotation-a',
          source: path.relative(workspaceRoot, artifactA.sourceFile),
          target: 'rotation-a.bin',
          sha256: artifactA.sha,
          required: true,
        },
        {
          id: 'rotation-b',
          source: path.relative(workspaceRoot, artifactB.sourceFile),
          target: 'rotation-b.bin',
          sha256: artifactB.sha,
          required: true,
        },
      ],
    });

    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: true,
      offlineMode: false,
    });

    expect(result.details.rotatedFiles).toBeGreaterThan(0);
    expect(result.checks.some((c) => c.id === 'mirror.rotate' && c.status === 'passed')).toBe(true);
  });

  it('fails fast when signed governance is required but governance bundle is missing', async () => {
    const workspaceRoot = await makeWorkspace('mirror-governance-required');
    tempDirs.push(workspaceRoot);

    await writeMirrorConfig(workspaceRoot, {
      enabled: true,
      mode: 'offline-first',
      security: {
        requireSignedGovernance: true,
        governanceBundle: {
          policyPath: '.rapidkit/nonexistent-policy.json',
          signaturePath: '.rapidkit/nonexistent-policy.sig',
          publicKeyPath: '.rapidkit/nonexistent-policy.pub',
        },
      },
      artifacts: [],
    });

    const result = await runMirrorLifecycle(workspaceRoot, {
      ciMode: true,
      offlineMode: false,
    });

    expect(
      result.checks.some((c) => c.id === 'governance.bundle.verify' && c.status === 'failed')
    ).toBe(true);
    expect(result.details.lockWritten).toBe(false);
  });

  it('prefetch succeeds after retry and records retry message', async () => {
    const workspaceRoot = await makeWorkspace('mirror-prefetch-retry-success');
    tempDirs.push(workspaceRoot);

    const payload = 'retry-success-artifact';
    const payloadSha = createHash('sha256').update(payload).digest('hex');
    let requestCount = 0;

    const server = createServer((_req, res) => {
      requestCount += 1;
      if (requestCount === 1) {
        res.statusCode = 503;
        res.end('temporary-failure');
        return;
      }
      res.statusCode = 200;
      res.end(payload);
    });

    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address() as AddressInfo;
      const artifactUrl = `http://127.0.0.1:${address.port}/artifact.bin`;

      await writeMirrorConfig(workspaceRoot, {
        enabled: true,
        mode: 'offline-first',
        prefetch: {
          retries: 1,
          backoffMs: 5,
        },
        artifacts: [
          {
            id: 'retry-artifact',
            url: artifactUrl,
            target: 'retry/artifact.bin',
            sha256: payloadSha,
            required: true,
          },
        ],
      });

      const result = await runMirrorLifecycle(workspaceRoot, {
        ciMode: true,
        offlineMode: false,
      });

      expect(requestCount).toBe(2);
      expect(result.details.syncedArtifacts).toBe(1);
      expect(
        result.checks.some(
          (c) =>
            c.id === 'mirror.prefetch.retry-artifact' &&
            c.status === 'passed' &&
            c.message.includes('after 2 attempts')
        )
      ).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  it('prefetch fails after retries and reports mirror sync failure for required artifact', async () => {
    const workspaceRoot = await makeWorkspace('mirror-prefetch-retry-failure');
    tempDirs.push(workspaceRoot);

    const server = createServer((_req, res) => {
      res.statusCode = 503;
      res.end('always-fail');
    });

    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address() as AddressInfo;
      const artifactUrl = `http://127.0.0.1:${address.port}/artifact.bin`;

      await writeMirrorConfig(workspaceRoot, {
        enabled: true,
        mode: 'offline-first',
        prefetch: {
          retries: 1,
          backoffMs: 5,
        },
        artifacts: [
          {
            id: 'retry-fail-artifact',
            url: artifactUrl,
            required: true,
          },
        ],
      });

      const result = await runMirrorLifecycle(workspaceRoot, {
        ciMode: true,
        offlineMode: false,
      });

      expect(
        result.checks.some(
          (c) =>
            c.id === 'mirror.prefetch.retry-fail-artifact' &&
            c.status === 'failed' &&
            c.message.includes('after 2 attempt(s)')
        )
      ).toBe(true);
      expect(result.details.syncedArtifacts).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});
