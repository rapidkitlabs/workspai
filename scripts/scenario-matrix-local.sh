#!/usr/bin/env bash
set -euo pipefail

# Practical end-to-end scenario matrix for rapidkit (npm) WITHOUT Docker.
# This simulates multiple real user states by manipulating PATH and using temporary venvs.
#
# Scenarios:
#   A) User installs npm package, but has NO python in PATH
#   B) (optional) User has python, but does NOT have rapidkit installed -> bridge bootstraps cached venv
#   C) (optional) User has python with rapidkit already installed -> bridge uses system python (no bridge venv)
#   D) "Global" install (prefix) and project-local install via npx

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NPM_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$NPM_ROOT/../.." && pwd)"
COMMUNITY_DIST_DIR="$REPO_ROOT/dist-community/community"

log() { printf "\n==> %s\n" "$*"; }

NODE_BIN="$(dirname "$(command -v node)")"

python_candidates() {
  local candidates=()
  local value

  for value in "${RAPIDKIT_BRIDGE_PYTHON:-}" "${RAPIDKIT_PYTHON_CMD:-}" "${POETRY_PYTHON:-}"; do
    [[ -n "$value" ]] && candidates+=("$value")
  done

  if [[ -x "$REPO_ROOT/core/.venv/bin/python" ]]; then
    candidates+=("$REPO_ROOT/core/.venv/bin/python")
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

PYTHON3="$(select_python_with_venv || true)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export npm_config_cache="$TMP/npm-cache"
mkdir -p "$npm_config_cache"

log "Packing rapidkit npm package"
pushd "$NPM_ROOT" >/dev/null
npm run -s build
npm run -s test:prepare-embeddings
npm run -s verify:package-cli
PACK_JSON="$(HUSKY=0 npm pack --ignore-scripts --json)"
TARBALL="$(node -e "const raw=process.argv[1]; const start=raw.indexOf('['); const end=raw.lastIndexOf(']'); if (start < 0 || end < start) process.exit(1); const data=JSON.parse(raw.slice(start, end + 1)); console.log(data[0].filename)" "$PACK_JSON")"
TARBALL_PATH="$NPM_ROOT/$TARBALL"
popd >/dev/null

if [[ ! -f "$TARBALL_PATH" ]]; then
  echo "❌ npm pack did not produce tarball at: $TARBALL_PATH" >&2
  exit 2
fi

DIST_ENTRY="$NPM_ROOT/dist/index.js"
if [[ ! -f "$DIST_ENTRY" ]]; then
  echo "❌ dist/index.js not found; did build succeed?" >&2
  exit 2
fi

# Helper: run CLI via node entrypoint with a controlled PATH
run_cli() {
  local path_env="$1"
  shift
  PATH="$path_env" node "$DIST_ENTRY" "$@"
}

# A) No python in PATH
log "Scenario A: No Python in PATH"
export XDG_CACHE_HOME="$TMP/cache-a"
mkdir -p "$XDG_CACHE_HOME"
set +e
OUT_A="$(PATH="$NODE_BIN" node "$DIST_ENTRY" list --json 2>&1)"
CODE_A=$?
set -e
if [[ $CODE_A -eq 0 ]]; then
  echo "❌ Expected failure when Python is missing in PATH, but command succeeded" >&2
  exit 1
fi
if ! echo "$OUT_A" | grep -qi "python"; then
  echo "❌ Expected error mentioning Python; got:" >&2
  echo "$OUT_A" >&2
  exit 1
fi

echo "✅ Scenario A passed"

log "Scenario A.1: Offline fallback create (no Python)"
OUT_A1_DIR="$TMP/a1-out"
mkdir -p "$OUT_A1_DIR"
set +e
OUT_A1="$(PATH="$NODE_BIN" node "$DIST_ENTRY" create project fastapi.standard offline-api --output "$OUT_A1_DIR" --no-workspace --yes 2>&1)"
CODE_A1=$?
set -e
if [[ $CODE_A1 -ne 0 ]]; then
  echo "❌ Expected offline fallback create to succeed with no Python, but it failed:" >&2
  echo "$OUT_A1" >&2
  exit 1
fi
if [[ ! -f "$OUT_A1_DIR/offline-api/.rapidkit/project.json" ]]; then
  echo "❌ Expected fallback project to include .rapidkit/project.json" >&2
  exit 1
fi

echo "✅ Scenario A.1 passed"

log "Scenario A.2: Core command forwarding under no-Python"
# These are the core top-level commands that the npm wrapper should forward even
# on cold start (before command discovery cache exists).
# If forwarding breaks, you'll see Commander errors like "unknown command".
BOOTSTRAP_CORE_COMMANDS=(
  version
  project
  init
  dev
  start
  build
  test
  lint
  format
  add
  list
  info
  upgrade
  diff
  doctor
  license
  reconcile
  rollback
  uninstall
  checkpoint
  optimize
  snapshot
  frameworks
  modules
  merge
)

for cmd in "${BOOTSTRAP_CORE_COMMANDS[@]}"; do
  set +e
  OUT_CMD="$(PATH="$NODE_BIN" node "$DIST_ENTRY" "$cmd" --help 2>&1)"
  CODE_CMD=$?
  set -e
  if echo "$OUT_CMD" | grep -qi "unknown command"; then
    echo "❌ Wrapper did not forward core command '$cmd' (Commander rejected it):" >&2
    echo "$OUT_CMD" >&2
    exit 1
  fi
  if [[ -z "$OUT_CMD" ]]; then
    echo "❌ Expected actionable output for '$cmd --help'; got empty output" >&2
    echo "$OUT_CMD" >&2
    exit 1
  fi
done

# Also validate global core flags are forwarded.
set +e
OUT_TUI="$(PATH="$NODE_BIN" node "$DIST_ENTRY" --tui list 2>&1)"
CODE_TUI=$?
set -e
if [[ $CODE_TUI -eq 0 ]]; then
  echo "❌ Expected failure for '--tui list' when Python is missing, but it succeeded" >&2
  exit 1
fi
if ! echo "$OUT_TUI" | grep -qi "python"; then
  echo "❌ Expected error mentioning Python for '--tui list'; got:" >&2
  echo "$OUT_TUI" >&2
  exit 1
fi

echo "✅ Scenario A.2 passed"

# E) Optional: non-interactive workspace creation via --yes
if [[ "${RAPIDKIT_SCENARIO_WORKSPACE_CREATE:-}" == "1" ]]; then
  if [[ -z "$PYTHON3" ]]; then
    echo "❌ RAPIDKIT_SCENARIO_WORKSPACE_CREATE=1 but no Python 3.10+ with venv support is available." >&2
    exit 2
  fi

  log "Scenario E: Workspace creation with --yes (non-interactive)"
  export XDG_CACHE_HOME="$TMP/cache-e"
  mkdir -p "$XDG_CACHE_HOME"

  WS_DIR="$TMP/ws-e"
  mkdir -p "$WS_DIR"
  pushd "$WS_DIR" >/dev/null
  # Note: this may install Python deps depending on local environment.
  PATH="$NODE_BIN:$(dirname "$PYTHON3")" node "$DIST_ENTRY" ws-e --yes --skip-git --no-update-check
  popd >/dev/null

  if [[ ! -d "$WS_DIR/ws-e" ]]; then
    echo "❌ Expected workspace directory to be created at: $WS_DIR/ws-e" >&2
    exit 1
  fi
  if [[ ! -f "$WS_DIR/ws-e/README.md" ]]; then
    echo "❌ Expected workspace README.md to exist" >&2
    exit 1
  fi

  echo "✅ Scenario E passed"
else
  log "Scenario E skipped (set RAPIDKIT_SCENARIO_WORKSPACE_CREATE=1 to run)"
fi

# B) Python exists but has no rapidkit -> bridge bootstraps cached venv and installs engine from the built community distribution
if [[ "${RAPIDKIT_SCENARIO_FULL_BOOTSTRAP:-}" == "1" ]]; then
  if [[ -z "$PYTHON3" ]]; then
    echo "❌ RAPIDKIT_SCENARIO_FULL_BOOTSTRAP=1 but no Python 3.10+ with venv support is available." >&2
    exit 2
  fi
  log "Scenario B: Python present, rapidkit not installed (bridge bootstraps venv)"
  CLEAN_PY="$TMP/cleanpy"
  "$PYTHON3" -m venv "$CLEAN_PY"

  CACHE_B="$TMP/cache-b"
  mkdir -p "$CACHE_B"

  unset RAPIDKIT_BRIDGE_UPGRADE_PIP
  export XDG_CACHE_HOME="$CACHE_B"
  if [[ ! -d "$COMMUNITY_DIST_DIR" ]]; then
    echo "❌ Missing community distribution at: $COMMUNITY_DIST_DIR" >&2
    echo "Run: make -C core community-dist-install" >&2
    exit 2
  fi
  export RAPIDKIT_CORE_PYTHON_PACKAGE="$COMMUNITY_DIST_DIR"

  # This may take a while on first run (installs Python deps). Keep output visible.
  PATH="$NODE_BIN:$CLEAN_PY/bin" node "$DIST_ENTRY" list --json >"$TMP/b-out.json" 2>"$TMP/b-err.txt"

  if ! head -c 200 "$TMP/b-out.json" | grep -q "schema_version"; then
    echo "❌ Expected JSON output from rapidkit list --json; stderr:" >&2
    tail -n 200 "$TMP/b-err.txt" >&2
    exit 1
  fi

  if [[ ! -e "$CACHE_B/rapidkit/npm-bridge/venv" ]]; then
    echo "❌ Expected bridge venv to be created at $CACHE_B/rapidkit/npm-bridge/venv" >&2
    exit 1
  fi

  echo "✅ Scenario B passed"
else
  log "Scenario B skipped (set RAPIDKIT_SCENARIO_FULL_BOOTSTRAP=1 to run)"
fi

# C) Python already has rapidkit -> bridge should use system python and not create bridge venv
if [[ "${RAPIDKIT_SCENARIO_FULL_BOOTSTRAP:-}" == "1" ]]; then
  if [[ -z "$PYTHON3" ]]; then
    echo "❌ RAPIDKIT_SCENARIO_FULL_BOOTSTRAP=1 but python3/python is not available." >&2
    exit 2
  fi
  log "Scenario C: Python with rapidkit already installed (prefer system python)"
  CACHE_C="$TMP/cache-c"
  mkdir -p "$CACHE_C"

  # Prefer the repo's core venv if it exists (fast, no downloads).
  # Otherwise, create a throwaway venv and install core from the local repo to simulate
  # a "system python" that already has RapidKit installed.
  PY_WITH_CORE_BIN=""
  PY_WITH_CORE="$TMP/py-with-core"
  "$PYTHON3" -m venv "$PY_WITH_CORE"
  if [[ ! -d "$COMMUNITY_DIST_DIR" ]]; then
    echo "❌ Missing community distribution at: $COMMUNITY_DIST_DIR" >&2
    echo "Run: make -C core community-dist-install" >&2
    exit 2
  fi
  # Install community distribution into this venv to simulate a "system python" with RapidKit installed.
  "$PY_WITH_CORE/bin/python" -m pip install -U "$COMMUNITY_DIST_DIR" >/dev/null
  PY_WITH_CORE_BIN="$PY_WITH_CORE/bin"

  PATH="$NODE_BIN:$PY_WITH_CORE_BIN" XDG_CACHE_HOME="$CACHE_C" node "$DIST_ENTRY" version --json >/dev/null

  if [[ -e "$CACHE_C/rapidkit/npm-bridge/venv" ]]; then
    echo "❌ Expected NO bridge venv when system python already has rapidkit" >&2
    echo "   Found: $CACHE_C/rapidkit/npm-bridge/venv" >&2
    exit 1
  fi

  echo "✅ Scenario C passed"
else
  log "Scenario C skipped (set RAPIDKIT_SCENARIO_FULL_BOOTSTRAP=1 to run)"
fi

# D) Global install (prefix) + project-local install (npx)
log "Scenario D: Global (prefix) + project-local install"
SYS_PATH_BASE="/usr/bin:/bin"
GLOBAL_PREFIX="$TMP/npm-global"
mkdir -p "$GLOBAL_PREFIX"

npm i -g --prefix "$GLOBAL_PREFIX" "$TARBALL_PATH" >/dev/null
GLOBAL_BIN="$GLOBAL_PREFIX/bin"

# global-ish
OUT_D1="$(PATH="$GLOBAL_BIN:$NODE_BIN:$SYS_PATH_BASE" rapidkit --help 2>&1 | head -n 40)"
if [[ -z "$OUT_D1" ]]; then
  echo "❌ Expected rapidkit --help to print output" >&2
  exit 1
fi
if ! echo "$OUT_D1" | grep -q "Welcome to RapidKit NPM CLI"; then
  echo "❌ Expected npm wrapper help output (conflict/path issue?). Got:" >&2
  echo "$OUT_D1" >&2
  exit 1
fi

# project-local
PRJ="$TMP/proj"
mkdir -p "$PRJ"
pushd "$PRJ" >/dev/null
npm init -y >/dev/null
npm i "$TARBALL_PATH" >/dev/null
OUT_D2="$(PATH="$NODE_BIN:$SYS_PATH_BASE" ./node_modules/.bin/rapidkit --help 2>&1 | head -n 40)"

# project-local should also forward core commands (and fail gracefully without python)
CACHE_D="$TMP/cache-d"
mkdir -p "$CACHE_D"
set +e
OUT_D3="$(PATH="$NODE_BIN:$SYS_PATH_BASE" XDG_CACHE_HOME="$CACHE_D" ./node_modules/.bin/rapidkit list --json 2>&1)"
CODE_D3=$?
set -e
popd >/dev/null

if [[ -z "$OUT_D2" ]]; then
  echo "❌ Expected npx rapidkit --help to print output" >&2
  exit 1
fi
if ! echo "$OUT_D2" | grep -q "Welcome to RapidKit NPM CLI"; then
  echo "❌ Expected project-local npm wrapper help output. Got:" >&2
  echo "$OUT_D2" >&2
  exit 1
fi
if [[ $CODE_D3 -eq 0 ]]; then
  echo "❌ Expected failure for project-local 'list --json' when Python is missing, but it succeeded" >&2
  exit 1
fi
if ! echo "$OUT_D3" | grep -qi "python"; then
  echo "❌ Expected error mentioning Python for project-local 'list --json'; got:" >&2
  echo "$OUT_D3" >&2
  exit 1
fi

echo "✅ Scenario D passed"

log "All local scenario tests passed"
