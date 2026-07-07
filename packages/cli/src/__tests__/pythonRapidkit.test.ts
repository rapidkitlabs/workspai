import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runPythonRapidkitJson,
  getRapidkitCoreVersion,
  detectRapidkitProject,
} from '../core-bridge/pythonRapidkit';
import { execa } from 'execa';

vi.mock('execa');

const mockedExeca = vi.mocked(execa);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pythonRapidkit.ts', () => {
  it('tryRun returns ok=true when execa succeeds', async () => {
    mockedExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '{"schema_version":1,"version":"1.0.0"}',
      stderr: '',
    });

    const result = await runPythonRapidkitJson(['--version', '--json']);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ schema_version: 1, version: '1.0.0' });
  });

  it('runPythonRapidkitJson returns ok=false when execa fails', async () => {
    mockedExeca.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'error',
    });

    const result = await runPythonRapidkitJson(['--version', '--json']);
    expect(result.ok).toBe(false);
  });

  it('runPythonRapidkitJson returns ok=false for invalid JSON', async () => {
    mockedExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'not-json',
      stderr: '',
    });

    const result = await runPythonRapidkitJson(['--version', '--json']);
    expect(result.ok).toBe(false);
  });

  it('getRapidkitCoreVersion returns data on valid response', async () => {
    mockedExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '{"schema_version":1,"version":"1.0.0"}',
      stderr: '',
    });

    const result = await getRapidkitCoreVersion();
    expect(result.ok).toBe(true);
    expect(result.data?.version).toBe('1.0.0');
  });

  it('getRapidkitCoreVersion returns ok=false on invalid schema', async () => {
    mockedExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '{"schema_version":2,"version":"1.0.0"}',
      stderr: '',
    });

    const result = await getRapidkitCoreVersion();
    expect(result.ok).toBe(false);
  });

  it('detectRapidkitProject returns data on valid response', async () => {
    mockedExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout:
        '{"schema_version":1,"input":"abc","confidence":"strong","isRapidkitProject":true,"projectRoot":"/tmp","engine":"python","markers":{}}',
      stderr: '',
    });

    const result = await detectRapidkitProject('/tmp');
    expect(result.ok).toBe(true);
    expect(result.data?.isRapidkitProject).toBe(true);
  });

  it('detectRapidkitProject returns ok=false on invalid schema', async () => {
    mockedExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '{"schema_version":2,"input":"abc"}',
      stderr: '',
    });

    const result = await detectRapidkitProject('/tmp');
    expect(result.ok).toBe(false);
  });
});
