import { getCliRunId } from './cli-log-event.js';

const UNKNOWN_RUN_ID = 'unknown-run';

/**
 * Attach the active CLI `runId` to a persisted artifact so consumers can correlate
 * an on-disk report with the `cli-log-event.v1` stream emitted by the run that
 * produced it (roadmap item 1.5).
 *
 * Applied at write time only — never to the in-memory objects used for hashing or
 * diffing — so the deterministic `modelHash` / diff comparisons stay stable. When no
 * real run is active (e.g. library use in tests) the payload is returned untouched.
 */
export function attachRunCorrelation<T extends Record<string, unknown>>(payload: T): T {
  const runId = getCliRunId();
  if (!runId || runId === UNKNOWN_RUN_ID) {
    return payload;
  }
  return { ...payload, runId };
}
