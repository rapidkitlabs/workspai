#!/bin/bash
# Sync essential kits from Python Core to npm templates

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NPM_ROOT="$(dirname "$SCRIPT_DIR")"
CORE_ROOT="${NPM_ROOT}/../../core"

echo "🔄 Syncing kits from Python Core to npm templates..."

# Check if Python Core repo exists
if [ ! -d "$CORE_ROOT/src/kits" ]; then
  echo "⚠️  Python Core not found at: $CORE_ROOT"
  echo "Skipping kit sync (using existing templates)"
  echo ""
  echo "To sync kits before release:"
  echo "  1. Clone Python Core: git clone <repo> $CORE_ROOT"
  echo "  2. Run: npm run sync-kits"
  exit 0  # Exit with success so build doesn't fail
fi

# FastAPI Standard Kit
echo "📦 Syncing fastapi.standard..."
FASTAPI_SRC="$CORE_ROOT/src/kits/fastapi/standard/templates"
FASTAPI_DEST="$NPM_ROOT/templates/kits/fastapi-standard"
COMMON_ENV_SRC="$CORE_ROOT/src/kits/base/templates/common/env.example.j2"

if [ -d "$FASTAPI_SRC" ]; then
  rm -rf "$FASTAPI_DEST"
  mkdir -p "$FASTAPI_DEST"
  cp -r "$FASTAPI_SRC"/* "$FASTAPI_DEST/"
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
  rm -rf "$FASTAPI_DDD_DEST"
  mkdir -p "$FASTAPI_DDD_DEST"
  cp -r "$FASTAPI_DDD_SRC"/* "$FASTAPI_DDD_DEST/"
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
  rm -rf "$NESTJS_DEST"
  mkdir -p "$NESTJS_DEST"
  cp -r "$NESTJS_SRC"/* "$NESTJS_DEST/"
  echo "✅ NestJS kit synced"
else
  echo "ℹ️  NestJS kit not found in Python Core (keeping existing)"
fi

echo ""
echo "✨ Kit sync complete!"
echo "📊 Updated templates:"
du -sh "$NPM_ROOT/templates/kits"/*
