import path from 'node:path';
import os from 'node:os';

// Every Vitest worker and every CLI subprocess it launches gets an isolated
// registry root. Tests must never read or mutate the developer/runner HOME.
const worker = process.env.VITEST_WORKER_ID ?? 'main';
const isolatedHome = path.join(os.tmpdir(), `workspai-vitest-${process.pid}-${worker}`);
process.env.HOME = isolatedHome;
process.env.USERPROFILE = isolatedHome;
process.env.XDG_CONFIG_HOME = path.join(isolatedHome, '.config');
process.env.XDG_CACHE_HOME = path.join(isolatedHome, '.cache');
