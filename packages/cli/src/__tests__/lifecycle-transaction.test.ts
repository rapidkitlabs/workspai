import os from 'node:os';
import path from 'node:path';
import fs, { open } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLifecycleTransaction,
  recoverActiveLifecycleTransactions,
} from '../utils/lifecycle-transaction.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-lifecycle-transaction-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeJournal(journalRoot: string, name: string, manifest: unknown): Promise<string> {
  const directory = path.join(journalRoot, `lifecycle-transaction-${name}`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  return directory;
}

function journalManifest(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'workspai.lifecycle-transaction',
    version: 1,
    ownerPid: 2_147_483_647,
    phase: 'active',
    operations: [],
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe('lifecycle transaction', () => {
  it('restores exact file bytes and mode and restores an absent file to absence', async () => {
    const root = await temporaryDirectory();
    const existing = path.join(root, 'existing.bin');
    const created = path.join(root, 'created.txt');
    const original = Buffer.from([0, 255, 1, 13, 10, 2]);
    await fs.writeFile(existing, original, { mode: 0o751 });
    await fs.chmod(existing, 0o751);

    const transaction = await createLifecycleTransaction();
    await transaction.captureFile(existing);
    await transaction.captureFile(created);
    await fs.writeFile(existing, 'changed');
    await fs.chmod(existing, 0o600);
    await fs.writeFile(created, 'new');

    await transaction.rollback();

    expect(await fs.readFile(existing)).toEqual(original);
    expect((await fs.stat(existing)).mode & 0o777).toBe(0o751);
    await expect(fs.access(created)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes a tree only when it was absent at capture', async () => {
    const root = await temporaryDirectory();
    const owned = path.join(root, 'owned');
    const existing = path.join(root, 'existing');
    await fs.mkdir(existing);

    const transaction = await createLifecycleTransaction();
    expect(await transaction.captureOwnedTree(owned)).toBe(true);
    expect(await transaction.captureOwnedTree(existing)).toBe(false);
    await fs.mkdir(owned);
    await fs.writeFile(path.join(owned, 'artifact.txt'), 'generated');
    await fs.writeFile(path.join(existing, 'kept.txt'), 'kept');

    await transaction.rollback();

    await expect(fs.access(owned)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(path.join(existing, 'kept.txt'), 'utf8')).toBe('kept');
  });

  it('fails closed for symlinks and non-regular file targets', async () => {
    const root = await temporaryDirectory();
    const regular = path.join(root, 'regular');
    const symlink = path.join(root, 'symlink');
    const directory = path.join(root, 'directory');
    await fs.writeFile(regular, 'content');
    await fs.symlink(regular, symlink);
    await fs.mkdir(directory);
    const transaction = await createLifecycleTransaction();

    await expect(transaction.captureFile(symlink)).rejects.toThrow(/regular files/);
    await expect(transaction.captureFile(directory)).rejects.toThrow(/regular files/);
    await expect(transaction.captureOwnedTree(symlink)).rejects.toThrow(/absent or a directory/);
  });

  it('runs compensations in reverse registration order', async () => {
    const order: number[] = [];
    const transaction = await createLifecycleTransaction();
    transaction.registerCompensation(() => order.push(1));
    transaction.registerCompensation(async () => {
      await Promise.resolve();
      order.push(2);
    });
    transaction.registerCompensation(() => order.push(3));

    await transaction.rollback();

    expect(order).toEqual([3, 2, 1]);
  });

  it('aggregates rollback errors and continues compensating', async () => {
    const order: string[] = [];
    const transaction = await createLifecycleTransaction();
    transaction.registerCompensation(() => {
      order.push('first');
      throw new Error('first failure');
    });
    transaction.registerCompensation(() => order.push('middle'));
    transaction.registerCompensation(() => {
      order.push('last');
      throw new Error('last failure');
    });

    let failure: unknown;
    try {
      await transaction.rollback();
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toHaveLength(2);
    expect(order).toEqual(['last', 'middle', 'first']);
  });

  it('makes rollback a no-op after commit', async () => {
    let compensated = false;
    const transaction = await createLifecycleTransaction();
    transaction.registerCompensation(() => {
      compensated = true;
    });

    await transaction.commit();
    await transaction.rollback();

    expect(compensated).toBe(false);
  });

  it('makes terminal operations idempotent and rejects new work after completion', async () => {
    const root = await temporaryDirectory();
    const committed = await createLifecycleTransaction();
    await committed.commit();
    await committed.commit();
    await committed.rollback();

    await expect(committed.captureFile(path.join(root, 'late.txt'))).rejects.toThrow(
      /no longer active/
    );
    await expect(committed.captureOwnedTree(path.join(root, 'late-tree'))).rejects.toThrow(
      /no longer active/
    );
    expect(() => committed.registerCompensation(() => undefined)).toThrow(/no longer active/);

    const rolledBack = await createLifecycleTransaction();
    await rolledBack.rollback();
    await rolledBack.rollback();
  });

  it('recovers exact file and tree preimages from an active durable journal', async () => {
    const root = await temporaryDirectory();
    const journals = path.join(root, 'journals');
    const existing = path.join(root, 'config.bin');
    const created = path.join(root, 'created.txt');
    const owned = path.join(root, 'generated');
    const original = Buffer.from([7, 0, 8, 255]);
    await fs.writeFile(existing, original, { mode: 0o740 });
    await fs.chmod(existing, 0o740);

    const transaction = await createLifecycleTransaction({ journalDirectory: journals });
    await transaction.captureFile(existing);
    await transaction.captureFile(created);
    await transaction.captureOwnedTree(owned);
    await fs.writeFile(existing, 'mutated');
    await fs.chmod(existing, 0o600);
    await fs.writeFile(created, 'created');
    await fs.mkdir(owned);
    await fs.writeFile(path.join(owned, 'output'), 'generated');

    const manifestPath = transaction.journalPath as string;
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
      ownerPid: number;
    };
    manifest.ownerPid = 2_147_483_647;
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const recovered = await recoverActiveLifecycleTransactions(journals);

    expect(recovered).toHaveLength(1);
    expect(await fs.readFile(existing)).toEqual(original);
    expect((await fs.stat(existing)).mode & 0o777).toBe(0o740);
    await expect(fs.access(created)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(owned)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not recover an active transaction owned by a live process', async () => {
    const root = await temporaryDirectory();
    const journals = path.join(root, 'journals');
    const existing = path.join(root, 'existing.txt');
    await fs.writeFile(existing, 'before');
    const transaction = await createLifecycleTransaction({ journalDirectory: journals });
    await transaction.captureFile(existing);
    await fs.writeFile(existing, 'during');

    expect(await recoverActiveLifecycleTransactions(journals)).toEqual([]);
    expect(await fs.readFile(existing, 'utf8')).toBe('during');
    await transaction.rollback();
  });

  it('tolerates Windows EPERM fsync failures while preserving journal semantics', async () => {
    const root = await temporaryDirectory();
    const journals = path.join(root, 'journals');
    const created = path.join(root, 'created.txt');
    const probe = path.join(root, 'probe.txt');
    await fs.writeFile(probe, 'probe');
    const probeHandle = await open(probe, 'r');
    const fileHandlePrototype = Object.getPrototypeOf(probeHandle) as {
      sync: () => Promise<void>;
    };
    await probeHandle.close();
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const syncSpy = vi
      .spyOn(fileHandlePrototype, 'sync')
      .mockRejectedValue(Object.assign(new Error('EPERM'), { code: 'EPERM' }));

    try {
      const transaction = await createLifecycleTransaction({ journalDirectory: journals });
      await transaction.captureFile(created);
      await fs.writeFile(created, 'created');
      await transaction.rollback();

      await expect(fs.access(created)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(syncSpy).toHaveBeenCalled();
    } finally {
      syncSpy.mockRestore();
      platformSpy.mockRestore();
    }
  });

  it('ignores a concurrently removed or not-yet-published journal directory', async () => {
    const root = await temporaryDirectory();
    const journals = path.join(root, 'journals');
    await fs.mkdir(path.join(journals, 'lifecycle-transaction-initializing'), {
      recursive: true,
    });

    await expect(recoverActiveLifecycleTransactions(journals)).resolves.toEqual([]);
  });

  it('removes committed journals and resumes an interrupted rollback', async () => {
    const root = await temporaryDirectory();
    const journals = path.join(root, 'journals');
    const committed = await writeJournal(
      journals,
      'committed',
      journalManifest({ phase: 'committed' })
    );
    const interrupted = await writeJournal(
      journals,
      'interrupted',
      journalManifest({ phase: 'rolling-back' })
    );
    await fs.writeFile(path.join(journals, 'unrelated.txt'), 'ignored');

    const recovered = await recoverActiveLifecycleTransactions(journals);

    expect(recovered).toEqual([interrupted]);
    await expect(fs.access(committed)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(interrupted)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(recoverActiveLifecycleTransactions(path.join(root, 'missing'))).resolves.toEqual(
      []
    );
  });

  it('treats an EPERM owner probe as a live transaction', async () => {
    const root = await temporaryDirectory();
    const journals = path.join(root, 'journals');
    const directory = await writeJournal(journals, 'protected', journalManifest());
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('protected'), { code: 'EPERM' });
    });

    try {
      await expect(recoverActiveLifecycleTransactions(journals)).resolves.toEqual([]);
      await expect(fs.access(directory)).resolves.toBeUndefined();
    } finally {
      killSpy.mockRestore();
    }
  });

  it('rejects malformed durable journals with all semantic validation failures aggregated', async () => {
    const root = await temporaryDirectory();
    const journals = path.join(root, 'journals');
    const absolute = path.join(root, 'target');
    const invalidManifests: unknown[] = [
      null,
      journalManifest({ kind: 'unknown' }),
      journalManifest({ ownerPid: 0 }),
      journalManifest({ phase: 'unknown' }),
      journalManifest({ operations: {} }),
      journalManifest({ operations: [null] }),
      journalManifest({ operations: [{ type: 'tree', path: 'relative' }] }),
      journalManifest({ operations: [{ type: 'unknown', path: absolute }] }),
      journalManifest({
        operations: [{ type: 'file', state: 'regular', path: absolute, mode: -1, backup: 'x' }],
      }),
      journalManifest({
        operations: [
          { type: 'file', state: 'regular', path: absolute, mode: 0o600, backup: '../escape' },
        ],
      }),
    ];
    await Promise.all(
      invalidManifests.map((manifest, index) =>
        writeJournal(journals, `invalid-${index}`, manifest)
      )
    );

    let failure: unknown;
    try {
      await recoverActiveLifecycleTransactions(journals);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toHaveLength(invalidManifests.length);
    expect((failure as Error).message).toMatch(/recovery failed/);
  });
});
