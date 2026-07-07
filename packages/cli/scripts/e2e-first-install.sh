#!/usr/bin/env bash
set -euo pipefail

# Dev E2E (repo-local): build/pack the npm CLI, install it into an isolated prefix,
# then run core-bridged commands.
# - Uses the already-built *community* engine distribution at dist-community/ (built via core/Makefile)
# - Installs the npm package into an isolated prefix (no system/global pollution)
# - Uses isolated HOME/XDG_CACHE_HOME/npm cache

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Resolve repository root robustly.
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
GIT_ROOT=""
if command -v git >/dev/null 2>&1; then
  GIT_ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel 2>/dev/null || true)"
fi

ROOT="$MONOREPO_ROOT"
if [[ -n "$GIT_ROOT" ]] && [[ -d "$GIT_ROOT/core" ]]; then
  ROOT="$GIT_ROOT"
elif [[ -n "$GIT_ROOT" ]] && [[ -d "$GIT_ROOT/../../core" ]]; then
  ROOT="$(cd "$GIT_ROOT/../.." && pwd)"
elif [[ -d "$MONOREPO_ROOT/../../core" ]]; then
  ROOT="$(cd "$MONOREPO_ROOT/../.." && pwd)"
fi

NPM_DIR="${RAPIDKIT_E2E_NPM_DIR:-$CLI_DIR}"

if [[ ! -d "$NPM_DIR" ]]; then
  echo "E2E: Workspai CLI package directory not found: $NPM_DIR" >&2
  exit 1
fi

# Workspace-local isolation
TS="$(date +%s)"
BASE="/tmp/workspai-cli-first-install-$TS"
export HOME="$BASE/home"
export XDG_CACHE_HOME="$BASE/cache"
export npm_config_cache="$BASE/npm-cache"
export npm_config_prefix="$BASE/npm-prefix"
export PATH="$npm_config_prefix/bin:$PATH"

NPM_BIN="$(command -v npm || true)"

if [[ -z "$NPM_BIN" ]]; then
  echo "E2E(first-install): npm not found on PATH. Install Node.js (with npm) first." >&2
  exit 1
fi

python_candidates() {
  local candidates=()
  local value

  for value in "${RAPIDKIT_BRIDGE_PYTHON:-}" "${RAPIDKIT_PYTHON_CMD:-}" "${POETRY_PYTHON:-}"; do
    [[ -n "$value" ]] && candidates+=("$value")
  done

  if [[ -x "$ROOT/core/.venv/bin/python" ]]; then
    candidates+=("$ROOT/core/.venv/bin/python")
  fi

  local minor
  for minor in 14 13 12 11 10; do
    candidates+=("python3.$minor")
  done
  candidates+=("python3" "python")

  printf '%s\n' "${candidates[@]}"
}

probe_python_with_venv() {
  local cmd="$1"
  if [[ "$cmd" == */* ]]; then
    [[ -x "$cmd" ]] || return 1
  else
    command -v "$cmd" >/dev/null 2>&1 || return 1
  fi

  "$cmd" --version >/dev/null 2>&1 || return 1

  local probe_dir
  probe_dir="$(mktemp -d)"
  if "$cmd" -m venv "$probe_dir/venv" >/dev/null 2>&1; then
    rm -rf "$probe_dir"
    return 0
  fi
  rm -rf "$probe_dir"
  return 1
}

select_python_with_venv() {
  local seen="|"
  local candidate
  while IFS= read -r candidate; do
    [[ -z "$candidate" ]] && continue
    if [[ "$seen" == *"|$candidate|"* ]]; then
      continue
    fi
    seen="$seen$candidate|"
    if probe_python_with_venv "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done < <(python_candidates)
  return 1
}

mkdir -p "$HOME" "$XDG_CACHE_HOME" "$npm_config_cache" "$npm_config_prefix"

echo "E2E(first-install): base=$BASE"

step() {
  local name="$1"; shift
  local start end
  start="$(date +%s)"
  echo "E2E(first-install): >>> $name" >&2
  "$@"
  end="$(date +%s)"
  echo "E2E(first-install): <<< $name ($((end-start))s)" >&2
}

# Pre-flight: Python required for the real bridge path. It must be able to create venvs.
PYTHON_WITH_VENV="$(select_python_with_venv || true)"
if [[ -z "$PYTHON_WITH_VENV" ]]; then
  echo "E2E(first-install): Python with venv support not found." >&2
  echo "Install Python 3.10+ with venv/ensurepip support, or set RAPIDKIT_BRIDGE_PYTHON." >&2
  exit 1
fi
export RAPIDKIT_BRIDGE_PYTHON="$PYTHON_WITH_VENV"

# Build a local tarball for install (simulates a registry install, but offline).
TARBALL=""
(
  cd "$NPM_DIR"

  # Ensure dependencies are present. Keep output minimal.
  if [[ ! -d node_modules ]]; then
    step "npm ci" npm ci
  fi

  step "npm build" "$NPM_BIN" -s run build
  step "verify embeddings artifact" "$NPM_BIN" -s run test:prepare-embeddings
  step "verify package CLI" "$NPM_BIN" -s run verify:package-cli

  echo "E2E(first-install): >>> npm pack" >&2
  PACK_JSON="$(HUSKY=0 "$NPM_BIN" pack --ignore-scripts --json)"
  echo "E2E(first-install): <<< npm pack" >&2
  TARBALL="$(node -e "const raw=process.argv[1]; const start=raw.indexOf('['); const end=raw.lastIndexOf(']'); if (start < 0 || end < start) process.exit(1); const data=JSON.parse(raw.slice(start, end + 1)); console.log(data[0].filename)" "$PACK_JSON")"
  echo "$NPM_DIR/$TARBALL" > "$BASE/tarball_path"
)
TARBALL="$(cat "$BASE/tarball_path")"

if [[ ! -f "$TARBALL" ]]; then
  echo "E2E(first-install): tarball not found: $TARBALL" >&2
  exit 1
fi

RAPIDKIT_BIN="workspai"
step "npm install -g (isolated)" "$NPM_BIN" install -g "$TARBALL" >/dev/null

if ! command -v "$RAPIDKIT_BIN" >/dev/null 2>&1; then
  echo "E2E(first-install): Workspai CLI not found on PATH after npm install -g" >&2
  exit 1
fi

ENGINE_SPEC="${RAPIDKIT_E2E_ENGINE_SPEC:-}"

# Default to the community distribution built by:
#   make -C core community-dist-install
if [[ -z "${ENGINE_SPEC}" ]]; then
  if [[ -d "$ROOT/dist-community/community" ]]; then
    ENGINE_SPEC="$ROOT/dist-community/community"
  fi
fi

if [[ -z "${ENGINE_SPEC}" ]]; then
  echo "E2E(first-install): Missing engine spec. Build the community distribution first:" >&2
  echo "  make -C core community-dist-install" >&2
  echo "Or set RAPIDKIT_E2E_ENGINE_SPEC to a pip-installable spec/path." >&2
  exit 1
fi

if [[ -n "$ENGINE_SPEC" ]]; then
  export RAPIDKIT_CORE_PYTHON_PACKAGE="$ENGINE_SPEC"
  echo "E2E(first-install): using RAPIDKIT_CORE_PYTHON_PACKAGE=$RAPIDKIT_CORE_PYTHON_PACKAGE"
fi

# Verify CLI works and JSON commands produce parseable JSON.
step "workspai --version" "$RAPIDKIT_BIN" --version >/dev/null

"$RAPIDKIT_BIN" version --json > "$BASE/version.json"
step "parse version.json" node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));" "$BASE/version.json" >/dev/null

"$RAPIDKIT_BIN" list --json > "$BASE/list.json"
step "parse list.json" node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));" "$BASE/list.json" >/dev/null

# Project creation (real user workflow). This should not prompt.
WORKSPACES="$BASE/workspaces"
mkdir -p "$WORKSPACES"

# Prefer a stable, non-interactive create. Kit slugs are like fastapi.standard.
step "create project (fastapi.standard)" "$RAPIDKIT_BIN" create project fastapi.standard e2e-app --output "$WORKSPACES" --skip-essentials --force

PROJECT_DIR="$WORKSPACES/e2e-app"
if [[ ! -f "$PROJECT_DIR/.workspai/project.json" && ! -f "$PROJECT_DIR/.rapidkit/project.json" ]]; then
  echo "E2E(first-install): expected .workspai/project.json or legacy .rapidkit/project.json in created project" >&2
  echo "Project dir: $PROJECT_DIR" >&2
  ls -la "$PROJECT_DIR" || true
  exit 1
fi

if [[ "${RAPIDKIT_E2E_FULL:-}" == "1" ]]; then
  # Full scenario: bootstraps project prerequisites (can take time).
  step "project init (full)" bash -c "cd '$PROJECT_DIR' && '$RAPIDKIT_BIN' init"
fi

# Community safety: ui must not exist.
# We accept exit code 2 as 'no such command'. Any other success is a hard failure.
echo "E2E(first-install): workspai ui serve should be unavailable"
set +e
"$RAPIDKIT_BIN" ui serve >/dev/null 2>"$BASE/ui.err"
CODE=$?
set -e
if [[ "$CODE" -ne 2 ]]; then
  echo "E2E(first-install): expected exit=2 for missing 'ui', got exit=$CODE" >&2
  echo "stderr:" >&2
  sed -n '1,80p' "$BASE/ui.err" >&2
  exit 1
fi
if ! grep -q "No such command 'ui'" "$BASE/ui.err"; then
  echo "E2E(first-install): expected generic missing-command message for 'ui'" >&2
  echo "stderr:" >&2
  sed -n '1,80p' "$BASE/ui.err" >&2
  exit 1
fi

echo "E2E(first-install): OK"
