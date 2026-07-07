export function readWorkspaiEnv(name: string): string | undefined {
  const workspaiName = name.startsWith('WORKSPAI_')
    ? name
    : `WORKSPAI_${name.replace(/^RAPIDKIT_/, '')}`;
  const legacyName = name.startsWith('RAPIDKIT_')
    ? name
    : `RAPIDKIT_${name.replace(/^WORKSPAI_/, '')}`;

  const current = process.env[workspaiName]?.trim();
  if (current) {
    return current;
  }

  const legacy = process.env[legacyName]?.trim();
  return legacy || undefined;
}

export function isWorkspaiEnvEnabled(name: string): boolean {
  const value = readWorkspaiEnv(name);
  return value === '1' || value?.toLowerCase() === 'true';
}
