/**
 * Shared scaffold vs release-blocker semantics for empty workspaces (0 registered projects).
 * Used by verify, explain, and governance surfaces so minimal/polyglot Day-0 shells stay
 * actionable without masquerading as release incidents.
 */

export function isScaffoldBlockerReason(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('stale') ||
    lower.includes('missing evidence') ||
    lower.includes('no projects') ||
    lower.includes('projects.empty') ||
    lower.includes('projects discovered') ||
    lower.includes('projects.missing') ||
    lower.includes('not yet run') ||
    lower.includes('doctor-last-run') ||
    lower.includes('doctor-project-last-run') ||
    lower.includes('doctor-remediation-plan-last-run') ||
    lower.includes('doctor-fix-result-last-run') ||
    lower.includes('pipeline-last-run') ||
    lower.includes('release-readiness') ||
    lower.includes('analyze-last-run') ||
    lower.includes('analyze reported') ||
    lower.includes('analyze verdict') ||
    lower.includes('analyze needs attention') ||
    lower.includes('toolchain.lock') ||
    lower.includes('not pinned') ||
    lower.includes('readiness:') ||
    lower.includes('env:') ||
    lower.includes('workspace-run-last') ||
    lower.includes('pre-project') ||
    lower.includes('before adding projects') ||
    lower.includes('workspace.projects.missing') ||
    lower.includes('no backend projects') ||
    lower.includes('index.json') ||
    lower.includes('workspace-intelligence-history') ||
    lower.includes('validation warning') ||
    lower.includes('workspace model validation') ||
    lower.includes('workspace.marker') ||
    lower.includes('no project roots') ||
    lower.includes('no infrastructure services') ||
    lower.includes('infra/overrides') ||
    lower.includes('infra dependencies') ||
    lower.includes('contract verify') ||
    lower.includes('contract inspect') ||
    lower.includes('publish verify evidence')
  );
}

export function areScaffoldOnlyBlockerReasons(reasons: string[]): boolean {
  return reasons.length === 0 || reasons.every((reason) => isScaffoldBlockerReason(reason));
}

export function filterScaffoldBlockerReasons(reasons: string[]): string[] {
  return reasons.filter((reason) => !isScaffoldBlockerReason(reason));
}

export function looksLikeDiffArtifactRef(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized.endsWith('.json') ||
    normalized.includes('workspace-model-diff') ||
    normalized.startsWith('.rapidkit/') ||
    normalized.includes('/.rapidkit/')
  );
}

export type ScaffoldVerifyVerdict = 'ready' | 'needs-attention' | 'blocked';

export function softenEmptyWorkspaceVerifyVerdict(input: {
  projectCount: number;
  verdict: ScaffoldVerifyVerdict;
  exitCode: 0 | 1 | 2;
  blockingReasons: string[];
  policyErrorCount: number;
}): { verdict: ScaffoldVerifyVerdict; exitCode: 0 | 1 | 2 } {
  if (input.projectCount > 0 || input.policyErrorCount > 0) {
    return { verdict: input.verdict, exitCode: input.exitCode };
  }
  if (input.verdict === 'blocked' && areScaffoldOnlyBlockerReasons(input.blockingReasons)) {
    return { verdict: 'needs-attention', exitCode: 1 };
  }
  return { verdict: input.verdict, exitCode: input.exitCode };
}

export function summarizeEmptyWorkspaceExplain(
  blockingReasonCount: number,
  verifyVerdict?: string
): string {
  const verdictHint =
    verifyVerdict && verifyVerdict !== 'ready' ? ` (${verifyVerdict.replace(/-/g, ' ')})` : '';
  if (blockingReasonCount === 0) {
    return `Workspace scaffold ready${verdictHint} — add your first project to continue.`;
  }
  return `Workspace scaffold${verdictHint}: ${blockingReasonCount} pre-project signal(s) — add your first project to continue.`;
}
