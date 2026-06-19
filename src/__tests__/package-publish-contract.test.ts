import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('npm publish contract', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
  ) as {
    bin?: Record<string, string>;
    description?: string;
    files?: string[];
    keywords?: string[];
    repository?: {
      url?: string;
    };
    scripts?: Record<string, string>;
  };

  function isPublishedByFiles(assetPath: string): boolean {
    return (packageJson.files ?? []).some((entry) => {
      if (entry === assetPath) {
        return true;
      }
      return assetPath.startsWith(`${entry.replace(/\/$/, '')}/`);
    });
  }

  it('publishes the canonical rapidkit bin and an explicit npm alias', () => {
    expect(packageJson.bin?.rapidkit).toBe('dist/index.js');
    expect(packageJson.bin?.['rapidkit-npm']).toBe('dist/index.js');
  });

  it('keeps npm package metadata aligned with Workspace Intelligence positioning', () => {
    expect(packageJson.description).toBe(
      'Open-source workspace intelligence CLI for software systems: create, adopt, govern, verify, and align polyglot workspaces for humans, CI, IDEs, and AI agents.'
    );
    expect(packageJson.description?.length).toBeLessThanOrEqual(160);
    expect(packageJson.keywords).toEqual(
      expect.arrayContaining(['workspace-intelligence', 'governance', 'workspai'])
    );
  });

  it('builds and verifies dist before npm pack or publish', () => {
    expect(packageJson.scripts?.prepack).toContain('npm run build');
    expect(packageJson.scripts?.prepack).toContain('npm run test:prepare-embeddings');
    expect(packageJson.scripts?.prepack).toContain('npm run verify:package-cli');
  });

  it('ships and runs a Windows CLI resolution guard on install', () => {
    expect(packageJson.files).toContain('scripts/check-cli-resolution.cjs');
    expect(packageJson.scripts?.postinstall).toBe('node scripts/check-cli-resolution.cjs');
  });

  it('publishes README image assets referenced from npm-safe raw GitHub URLs', () => {
    const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
    const rawImageUrls = [
      ...readme.matchAll(/!\[[^\]]+\]\((https:\/\/raw\.githubusercontent\.com\/[^)]+)\)/g),
    ].map((match) => match[1]);

    expect(rawImageUrls).toContain(
      'https://raw.githubusercontent.com/rapidkitlabs/rapidkit-npm/main/docs/From%20Code%20to%20Shared%20Understanding.png'
    );
    expect(packageJson.repository?.url).toBe(
      'git+https://github.com/rapidkitlabs/rapidkit-npm.git'
    );

    for (const imageUrl of rawImageUrls) {
      const pathname = new URL(imageUrl).pathname;
      const match = pathname.match(/^\/rapidkitlabs\/rapidkit-npm\/main\/(.+)$/);
      expect(match, imageUrl).not.toBeNull();

      const encodedAssetPath = match?.[1] ?? '';
      expect(encodedAssetPath, imageUrl).toContain('%20');
      const assetPath = decodeURIComponent(encodedAssetPath);

      expect(fs.existsSync(path.join(process.cwd(), assetPath)), assetPath).toBe(true);
      expect(isPublishedByFiles(assetPath), assetPath).toBe(true);
    }
  });

  it('publishes local documentation linked from the npm README', () => {
    const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf8');
    const localDocLinks = [...readme.matchAll(/\[[^\]]+\]\((docs\/[^)#]+)(?:#[^)]+)?\)/g)].map(
      (match) => match[1]
    );

    expect(localDocLinks.length).toBeGreaterThan(5);

    for (const link of localDocLinks) {
      expect(fs.existsSync(path.join(process.cwd(), link)), link).toBe(true);
      expect(isPublishedByFiles(link), link).toBe(true);
    }
  });
});
