import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execa } from 'execa';

import { detectRapidkitProject, getRapidkitCoreVersion } from '../core-bridge/pythonRapidkit';

vi.mock('execa');

const pythonCandidates =
  process.platform === 'win32'
    ? (['python', 'py', 'python3'] as const)
    : (['python3', 'python'] as const);
const withLauncherArgs = (cmd: string, args: string[]) => (cmd === 'py' ? ['-3', ...args] : args);

describe('core-bridge/pythonRapidkit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getRapidkitCoreVersion calls python -m rapidkit --version --json', async () => {
    vi.mocked(execa).mockResolvedValue({
      stdout: JSON.stringify({ schema_version: 1, version: '0.2.0' }),
      stderr: '',
      exitCode: 0,
      command: '',
      failed: false,
      killed: false,
      signal: undefined,
      signalDescription: undefined,
      cwd: '',
      durationMs: 0,
      isCanceled: false,
      escapedCommand: '',
      pipedFrom: [],
      all: undefined,
    } as any);

    const res = await getRapidkitCoreVersion({ cwd: '/tmp' });
    expect(res.ok).toBe(true);
    expect(res.data?.version).toBe('0.2.0');

    expect(vi.mocked(execa)).toHaveBeenCalledWith(
      pythonCandidates[0],
      withLauncherArgs(pythonCandidates[0], ['-m', 'rapidkit', '--version', '--json']),
      expect.objectContaining({ cwd: '/tmp', reject: false })
    );
  });

  it('falls back from python3 to python when python3 fails', async () => {
    vi.mocked(execa)
      .mockRejectedValueOnce(new Error('spawn python3 ENOENT'))
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ schema_version: 1, version: '0.2.0' }),
        stderr: '',
        exitCode: 0,
        command: '',
      } as any);

    const res = await getRapidkitCoreVersion();
    expect(res.ok).toBe(true);

    expect(vi.mocked(execa)).toHaveBeenNthCalledWith(
      1,
      pythonCandidates[0],
      withLauncherArgs(pythonCandidates[0], ['-m', 'rapidkit', '--version', '--json']),
      expect.any(Object)
    );
    expect(vi.mocked(execa)).toHaveBeenNthCalledWith(
      2,
      pythonCandidates[1],
      withLauncherArgs(pythonCandidates[1], ['-m', 'rapidkit', '--version', '--json']),
      expect.any(Object)
    );
  });

  it('detectRapidkitProject passes --path and returns parsed payload', async () => {
    vi.mocked(execa).mockResolvedValue({
      stdout: JSON.stringify({
        schema_version: 1,
        input: '/work',
        confidence: 'strong',
        isRapidkitProject: true,
        projectRoot: '/work',
        engine: 'python',
        markers: { hasProjectJson: true },
      }),
      stderr: '',
      exitCode: 0,
      command: '',
    } as any);

    const res = await detectRapidkitProject('/work', { cwd: '/work' });
    expect(res.ok).toBe(true);
    expect(res.data?.isRapidkitProject).toBe(true);
    expect(res.data?.projectRoot).toBe('/work');

    expect(vi.mocked(execa)).toHaveBeenCalledWith(
      pythonCandidates[0],
      withLauncherArgs(pythonCandidates[0], [
        '-m',
        'rapidkit',
        'project',
        'detect',
        '--path',
        '/work',
        '--json',
      ]),
      expect.objectContaining({ cwd: '/work', reject: false })
    );
  });
});
