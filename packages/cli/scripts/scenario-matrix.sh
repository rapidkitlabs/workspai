#!/usr/bin/env bash
set -euo pipefail

# Practical end-to-end scenario matrix for Workspai CLI (npm)
# Runs in Docker to simulate environments:
#   A) Node only (no Python)
#   B) Node + Python (bridge bootstraps cached venv, installs core from local repo)
#   C) Node + Python + system-installed core (bridge should use system python, not venv)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NPM_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MONOREPO_ROOT="$(cd "$NPM_ROOT/../.." && pwd)"

# Platform root: directory that contains the `core/` checkout (sibling-repo layout).
REPO_ROOT="${RAPIDKIT_PLATFORM_ROOT:-}"
if [[ -z "$REPO_ROOT" ]]; then
  for candidate in \
    "$(cd "$MONOREPO_ROOT/.." 2>/dev/null && pwd)" \
    "$(cd "$MONOREPO_ROOT/../.." 2>/dev/null && pwd)" \
    "$MONOREPO_ROOT"; do
    if [[ -n "$candidate" && -d "$candidate/core" ]]; then
      REPO_ROOT="$candidate"
      break
    fi
  done
fi
if [[ -z "$REPO_ROOT" ]]; then
  REPO_ROOT="$MONOREPO_ROOT"
fi
COMMUNITY_DIST_DIR="$REPO_ROOT/dist-community/community"

if [[ ! -d "$COMMUNITY_DIST_DIR" ]]; then
  echo "❌ community distribution not found at: $COMMUNITY_DIST_DIR" >&2
  echo "Run: make -C core community-dist-install" >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker not found. Install Docker to run scenario tests." >&2
  exit 2
fi

log() {
  printf "\n==> %s\n" "$*"
}

# Build npm package tarball
log "Packing Workspai CLI npm package"
pushd "$NPM_ROOT" >/dev/null
npm run -s build
TARBALL="$(npm pack --silent)"
TARBALL_PATH="$NPM_ROOT/$TARBALL"
popd >/dev/null

if [[ ! -f "$TARBALL_PATH" ]]; then
  echo "❌ npm pack did not produce tarball at: $TARBALL_PATH" >&2
  exit 2
fi

do_build_image() {
  local tag="$1"
  local with_python="$2"

  if [[ "$with_python" == "yes" ]]; then
    docker build -t "$tag" -f - "$REPO_ROOT" >/dev/null <<'DOCKERFILE'
FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends bash ca-certificates python3 python3-venv python3-pip git \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /work
DOCKERFILE
  else
    docker build -t "$tag" -f - "$REPO_ROOT" >/dev/null <<'DOCKERFILE'
FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends bash ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /work
DOCKERFILE
  fi
}

IMG_NODE_ONLY="workspai-scenario-node-only"
IMG_NODE_PY="workspai-scenario-node-python"

log "Building Docker images (cached)"
do_build_image "$IMG_NODE_ONLY" "no"
do_build_image "$IMG_NODE_PY" "yes"

do_run() {
  local image="$1"
  shift
  docker run --rm \
    -v "$TARBALL_PATH:/tmp/workspai-cli.tgz:ro" \
    -v "$COMMUNITY_DIST_DIR:/repo/community:ro" \
    "$image" \
    bash -lc "$*"
}

# A) No Python
log "Scenario A: Node only (no Python installed)"
set +e
OUT_A="$(do_run "$IMG_NODE_ONLY" "npm i -g /tmp/workspai-cli.tgz >/dev/null && workspai list --json" 2>&1)"
CODE_A=$?
set -e

if [[ $CODE_A -eq 0 ]]; then
  echo "❌ Expected failure when Python is missing, but command succeeded" >&2
  exit 1
fi

if ! echo "$OUT_A" | grep -qi "python"; then
  echo "❌ Expected error mentioning Python; got:" >&2
  echo "$OUT_A" >&2
  exit 1
fi

echo "✅ Scenario A passed (fails gracefully with Python missing)"

# B) Python exists, engine not installed system-wide: bridge should bootstrap venv and install from built community distribution
log "Scenario B: Node + Python (bridge bootstraps venv, installs engine from community dist)"
OUT_B="$(do_run "$IMG_NODE_PY" \
  "export XDG_CACHE_HOME=/tmp/cache && export RAPIDKIT_CORE_PYTHON_PACKAGE=/repo/community && npm i -g /tmp/workspai-cli.tgz >/dev/null && workspai list --json | head -c 200" \
  2>&1)"

if ! echo "$OUT_B" | grep -q "schema_version"; then
  echo "❌ Expected JSON output from workspai list --json; got:" >&2
  echo "$OUT_B" >&2
  exit 1
fi

echo "✅ Scenario B passed (bridge can bootstrap and list kits)"

# C) Python exists and engine is installed system-wide: bridge should prefer system python (no venv created)
log "Scenario C: Node + Python + system-installed engine (prefer system python)"
OUT_C="$(do_run "$IMG_NODE_PY" \
  "export XDG_CACHE_HOME=/tmp/cache && python3 -m pip install /repo/community >/dev/null && npm i -g /tmp/workspai-cli.tgz >/dev/null && workspai version --json && test ! -e /tmp/cache/rapidkit/npm-bridge/venv && echo 'NO_VENV_OK'" \
  2>&1)"

if ! echo "$OUT_C" | grep -q "NO_VENV_OK"; then
  echo "❌ Expected bridge to use system python (no venv created). Output:" >&2
  echo "$OUT_C" >&2
  exit 1
fi

echo "✅ Scenario C passed (system core is preferred)"

log "All scenario tests passed"
