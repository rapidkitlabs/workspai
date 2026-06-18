export type CliLogFormat = 'text' | 'json';

const LOG_FORMAT_ENV = 'RAPIDKIT_LOG_FORMAT';

export function resolveCliLogFormat(argv: readonly string[] = process.argv): CliLogFormat {
  const envValue = process.env[LOG_FORMAT_ENV]?.trim().toLowerCase();
  if (envValue === 'json') {
    return 'json';
  }
  if (envValue === 'text') {
    return 'text';
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--log-json') {
      return 'json';
    }
    if (token === '--log-format') {
      const next = argv[index + 1]?.trim().toLowerCase();
      if (next === 'json') {
        return 'json';
      }
      if (next === 'text') {
        return 'text';
      }
    }
    if (token?.startsWith('--log-format=')) {
      const value = token.slice('--log-format='.length).trim().toLowerCase();
      if (value === 'json') {
        return 'json';
      }
      if (value === 'text') {
        return 'text';
      }
    }
  }

  return 'text';
}

export function isCliJsonLogFormat(argv: readonly string[] = process.argv): boolean {
  return resolveCliLogFormat(argv) === 'json';
}
