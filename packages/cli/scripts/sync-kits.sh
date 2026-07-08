#!/bin/bash
# Sync essential kits from Python Core to npm templates

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NPM_ROOT="$(dirname "$SCRIPT_DIR")"

resolve_core_root() {
  local candidates=()

  if [ -n "${RAPIDKIT_CORE_ROOT:-}" ]; then
    candidates+=("$RAPIDKIT_CORE_ROOT")
  fi

  candidates+=(
    "${NPM_ROOT}/../../core"
    "${NPM_ROOT}/../../../core"
    "${NPM_ROOT}/../../../../core"
  )

  for candidate in "${candidates[@]}"; do
    if [ -d "$candidate/src/kits" ]; then
      cd "$candidate" && pwd
      return 0
    fi
  done

  printf '%s\n' "${candidates[0]}"
  return 1
}

CORE_ROOT="$(resolve_core_root || true)"

echo "🔄 Syncing kits from Python Core to npm templates..."

copy_template_tree() {
  local source_dir="$1"
  local target_dir="$2"

  rm -rf "$target_dir"
  mkdir -p "$target_dir"
  cp -a "$source_dir"/. "$target_dir/"
}

# Check if Python Core repo exists
if [ ! -d "$CORE_ROOT/src/kits" ]; then
  echo "⚠️  Python Core not found at: $CORE_ROOT"
  echo "Skipping kit sync (using existing templates)"
  echo ""
  echo "To sync kits before release:"
  echo "  1. Set RAPIDKIT_CORE_ROOT=/path/to/rapidkit-core or clone Python Core next to this monorepo"
  echo "  2. Run: npm run sync-kits"
  exit 0  # Exit with success so build doesn't fail
fi

# FastAPI Standard Kit
echo "📦 Syncing fastapi.standard..."
FASTAPI_SRC="$CORE_ROOT/src/kits/fastapi/standard/templates"
FASTAPI_DEST="$NPM_ROOT/templates/kits/fastapi-standard"
COMMON_ENV_SRC="$CORE_ROOT/src/kits/base/templates/common/env.example.j2"

if [ -d "$FASTAPI_SRC" ]; then
  copy_template_tree "$FASTAPI_SRC" "$FASTAPI_DEST"
  if [ -f "$COMMON_ENV_SRC" ]; then
    mkdir -p "$FASTAPI_DEST/common"
    cp "$COMMON_ENV_SRC" "$FASTAPI_DEST/common/env.example.j2"
  fi
  echo "✅ FastAPI Standard kit synced"
else
  echo "⚠️  FastAPI Standard kit not found in Python Core"
fi

# FastAPI DDD Kit
echo "📦 Syncing fastapi.ddd..."
FASTAPI_DDD_SRC="$CORE_ROOT/src/kits/fastapi/ddd/templates"
FASTAPI_DDD_DEST="$NPM_ROOT/templates/kits/fastapi-ddd"

if [ -d "$FASTAPI_DDD_SRC" ]; then
  copy_template_tree "$FASTAPI_DDD_SRC" "$FASTAPI_DDD_DEST"
  if [ -f "$COMMON_ENV_SRC" ]; then
    mkdir -p "$FASTAPI_DDD_DEST/common"
    cp "$COMMON_ENV_SRC" "$FASTAPI_DDD_DEST/common/env.example.j2"
  fi
  echo "✅ FastAPI DDD kit synced"
else
  echo "⚠️  FastAPI DDD kit not found in Python Core"
fi

# NestJS Standard Kit (if exists in Python Core)
echo "📦 Syncing nestjs.standard..."
NESTJS_SRC="$CORE_ROOT/src/kits/nestjs/standard/templates"
NESTJS_DEST="$NPM_ROOT/templates/kits/nestjs-standard"

if [ -d "$NESTJS_SRC" ]; then
  copy_template_tree "$NESTJS_SRC" "$NESTJS_DEST"
  echo "✅ NestJS kit synced"
else
  echo "ℹ️  NestJS kit not found in Python Core (keeping existing)"
fi

echo ""
echo "✨ Kit sync complete!"
echo "📊 Updated templates:"
du -sh "$NPM_ROOT/templates/kits"/*
