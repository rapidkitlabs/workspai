#!/usr/bin/env bash
set -euo pipefail

# End-user E2E: install npm CLI from an artifact (tarball) into isolated prefix,
# then run a realistic create workflow. Designed to mimic a user machine.
#
# Inputs:
#   Optional: RAPIDKIT_E2E_NPM_TARBALL=/abs/path/to/rapidkit-*.tgz
#     - If omitted, this script will build + pack the local repo npm package.
#   Optional: RAPIDKIT_E2E_ENGINE_SPEC=<pip spec or path>
#     - If omitted, defaults to the community distribution built at:
#         <repo-root>/dist-community/community
#       (build it via: make -C core community-dist-install)
#
# Optional:
#   RAPIDKIT_E2E_FULL=1   (run `rapidkit init` inside created project)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve monorepo root robustly (Front/rapidkit-npm may be a nested git repo).
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
GIT_ROOT=""
if command -v git >/dev/null 2>&1; then
  GIT_ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel 2>/dev/null || true)"
fi

ROOT="$MONOREPO_ROOT"
if [[ -n "$GIT_ROOT" ]] && [[ -d "$GIT_ROOT/core" ]] && [[ -d "$GIT_ROOT/Front/rapidkit-npm" ]]; then
  ROOT="$GIT_ROOT"
fi

TS="$(date +%s)"
BASE="/tmp/rapidkit-npm-e2e-user-$TS"
export HOME="$BASE/home"
export XDG_CACHE_HOME="$BASE/cache"
export npm_config_cache="$BASE/npm-cache"
export npm_config_prefix="$BASE/npm-prefix"
export PATH="$npm_config_prefix/bin:$PATH"

mkdir -p "$HOME" "$XDG_CACHE_HOME" "$npm_config_cache" "$npm_config_prefix"

step() {
  local name="$1"; shift
  local start end
  start="$(date +%s)"
  echo "E2E(user): >>> $name" >&2
  "$@"
  end="$(date +%s)"
  echo "E2E(user): <<< $name ($((end-start))s)" >&2
}

echo "E2E(user): base=$BASE"

NPM_BIN="$(command -v npm || true)"
if [[ -z "$NPM_BIN" ]]; then
  echo "E2E(user): npm not found on PATH. Install Node.js (with npm) first." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "E2E(user): node not found on PATH." >&2
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

PYTHON_WITH_VENV="$(select_python_with_venv || true)"
if [[ -z "$PYTHON_WITH_VENV" ]]; then
  echo "E2E(user): Python with venv support not found." >&2
  echo "Install Python 3.10+ with venv/ensurepip support, or set RAPIDKIT_BRIDGE_PYTHON." >&2
  exit 1
fi
export RAPIDKIT_BRIDGE_PYTHON="$PYTHON_WITH_VENV"

TARBALL="${RAPIDKIT_E2E_NPM_TARBALL:-}"

if [[ -z "$TARBALL" ]]; then
  NPM_DIR="$ROOT/Front/rapidkit-npm"
  if [[ ! -d "$NPM_DIR" ]]; then
    echo "E2E(user): rapidkit-npm directory not found: $NPM_DIR" >&2
    exit 1
  fi

  (
    cd "$NPM_DIR"

    # Ensure dependencies exist before build.
    if [[ ! -d node_modules ]]; then
      step "npm ci" "$NPM_BIN" ci
    fi

    step "build npm package" "$NPM_BIN" run -s build
    step "verify embeddings artifact" "$NPM_BIN" run -s test:prepare-embeddings
    step "verify package CLI" "$NPM_BIN" run -s verify:package-cli
    echo "E2E(user): >>> npm pack" >&2
    PACK_JSON="$(HUSKY=0 "$NPM_BIN" pack --ignore-scripts --json)"
    echo "E2E(user): <<< npm pack" >&2
    TARBALL_PATH="$(node -e "const raw=process.argv[1]; const start=raw.indexOf('['); const end=raw.lastIndexOf(']'); if (start < 0 || end < start) process.exit(1); const data=JSON.parse(raw.slice(start, end + 1)); console.log(data[0].filename)" "$PACK_JSON")"
    echo "$NPM_DIR/$TARBALL_PATH" > "$BASE/tarball_path"
  )

  TARBALL="$(cat "$BASE/tarball_path")"
fi

if [[ ! -f "$TARBALL" ]]; then
  echo "E2E(user): npm tarball not found: $TARBALL" >&2
  exit 1
fi

ENGINE_SPEC="${RAPIDKIT_E2E_ENGINE_SPEC:-}"
if [[ -z "$ENGINE_SPEC" ]]; then
  if [[ -d "$ROOT/dist-community/community" ]]; then
    ENGINE_SPEC="$ROOT/dist-community/community"
  fi
fi

if [[ -z "$ENGINE_SPEC" ]]; then
  echo "E2E(user): Missing engine spec." >&2
  echo "Build the community distribution first:" >&2
  echo "  make -C core community-dist-install" >&2
  echo "Or set RAPIDKIT_E2E_ENGINE_SPEC (pip spec/path)." >&2
  exit 1
fi
export RAPIDKIT_CORE_PYTHON_PACKAGE="$ENGINE_SPEC"

echo "E2E(user): using RAPIDKIT_CORE_PYTHON_PACKAGE=$RAPIDKIT_CORE_PYTHON_PACKAGE"

step "npm install -g (isolated)" "$NPM_BIN" install -g "$TARBALL" >/dev/null

if ! command -v rapidkit >/dev/null 2>&1; then
  echo "E2E(user): rapidkit CLI not found on PATH after install" >&2
  exit 1
fi

step "rapidkit --version" rapidkit --version >/dev/null
step "rapidkit version --json" rapidkit version --json > "$BASE/version.json"
node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));" "$BASE/version.json" >/dev/null

# Create a workspace (non-interactive)
WORKSPACES="$BASE/workspaces"
mkdir -p "$WORKSPACES"
step "create workspace" rapidkit create project fastapi.standard e2e-app --output "$WORKSPACES" --skip-essentials --force

PROJECT_DIR="$WORKSPACES/e2e-app"
if [[ ! -d "$PROJECT_DIR/.rapidkit" ]]; then
  echo "E2E(user): expected .rapidkit directory in created project" >&2
  exit 1
fi

if [[ "${RAPIDKIT_E2E_FULL:-}" == "1" ]]; then
  step "project init (full)" bash -c "cd '$PROJECT_DIR' && rapidkit init"
fi

# Community safety: ui must not exist.
set +e
rapidkit ui serve >/dev/null 2>"$BASE/ui.err"
CODE=$?
set -e
if [[ "$CODE" -ne 2 ]]; then
  echo "E2E(user): expected exit=2 for missing 'ui', got exit=$CODE" >&2
  sed -n '1,80p' "$BASE/ui.err" >&2
  exit 1
fi
if ! grep -q "No such command 'ui'" "$BASE/ui.err"; then
  echo "E2E(user): expected generic missing-command message for 'ui'" >&2
  sed -n '1,80p' "$BASE/ui.err" >&2
  exit 1
fi

echo "E2E(user): OK"
