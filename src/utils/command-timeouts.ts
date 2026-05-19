function parseEnvInt(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
}

/**
 * Fast probe timeout for local command/version checks.
 */
export function getProbeTimeoutMs(): number {
  return parseEnvInt('RAPIDKIT_TIMEOUT_PROBE_MS') ?? 3000;
}

/**
 * Timeout for network-bound checks like npm metadata calls.
 */
export function getNetworkTimeoutMs(): number {
  return parseEnvInt('RAPIDKIT_TIMEOUT_NETWORK_MS') ?? 3000;
}

/**
 * Timeout for bridge invocations that may perform subprocess bootstrap work.
 */
export function getBridgeTimeoutMs(): number {
  return parseEnvInt('RAPIDKIT_TIMEOUT_BRIDGE_MS') ?? 8000;
}
