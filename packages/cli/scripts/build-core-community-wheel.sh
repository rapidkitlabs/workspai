#!/usr/bin/env bash
set -euo pipefail

# Builds a *community* wheel from the current monorepo Core using:
#   core/scripts/finalize_distribution.py
# Output: prints absolute wheel path to stdout.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prefer git root when available; fall back to deriving from script path.
if command -v git >/dev/null 2>&1; then
  ROOT="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel 2>/dev/null || true)"
else
  ROOT=""
fi

if [[ -n "$ROOT" && ! -d "$ROOT/core" && -d "$ROOT/../../core" ]]; then
  ROOT="$(cd "$ROOT/../.." && pwd)"
fi

if [[ -z "$ROOT" || ! -d "$ROOT/core" ]]; then
  # scripts/ -> packages/cli/scripts, then climb to the Rapid platform root.
  ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
  if [[ ! -d "$ROOT/core" && -d "$ROOT/../../core" ]]; then
    ROOT="$(cd "$ROOT/../.." && pwd)"
  fi
fi

CORE_SRC="$ROOT/core"
FINALIZER="$CORE_SRC/scripts/finalize_distribution.py"

if [[ ! -f "$FINALIZER" ]]; then
  echo "Core finalizer not found: $FINALIZER" >&2
  exit 1
fi

python_candidates() {
  local candidates=()
  local value

  for value in "${RAPIDKIT_BRIDGE_PYTHON:-}" "${RAPIDKIT_PYTHON_CMD:-}" "${POETRY_PYTHON:-}"; do
    [[ -n "$value" ]] && candidates+=("$value")
  done

  if [[ -x "$CORE_SRC/.venv/bin/python" ]]; then
    candidates+=("$CORE_SRC/.venv/bin/python")
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

PY="$(select_python_with_venv || true)"
if [[ -z "$PY" ]]; then
  echo "Python with venv support not found. Install Python 3.10+ with venv/ensurepip support." >&2
  exit 1
fi

TS="$(date +%s)"
BASE="/tmp/rapidkit-core-community-build-$TS"
TARGET="$BASE/community-src"
BUILDER_VENV="$BASE/builder-venv"

mkdir -p "$TARGET"

# Copy minimal inputs required to build a wheel, without dragging repo junk.
# Prefer rsync for speed; fall back to tar.
copy_core() {
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude='.git/' \
      --exclude='dist/' \
      --exclude='build/' \
      --exclude='.venv/' \
      --exclude='.tox/' \
      --exclude='__pycache__/' \
      --exclude='*.pyc' \
      "$CORE_SRC/" "$TARGET/"
    return
  fi

  (cd "$CORE_SRC" && tar -cf - \
    --exclude='./.git' \
    --exclude='./dist' \
    --exclude='./build' \
    --exclude='./.venv' \
    --exclude='./.tox' \
    --exclude='./**/__pycache__' \
    --exclude='./**/*.pyc' \
    .) | (cd "$TARGET" && tar -xf -)
}

copy_core

# Finalize the copied tree into a community distribution.
# Note: this prunes paid modules/kits and writes src/core/distribution.json.
"$PY" "$TARGET/scripts/finalize_distribution.py" --tier community --source "$CORE_SRC" --target "$TARGET" >/dev/null

# Build wheel from the finalized tree.
"$PY" -m venv "$BUILDER_VENV"
"$BUILDER_VENV/bin/python" -m pip -q install -U pip
"$BUILDER_VENV/bin/python" -m pip -q install build

(cd "$TARGET" && "$BUILDER_VENV/bin/python" -m build -w -q)

WHEEL="$(ls -1 "$TARGET/dist"/*.whl | tail -n 1)"
"$PY" -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$WHEEL"
