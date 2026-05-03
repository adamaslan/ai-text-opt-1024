#!/usr/bin/env bash
# Start trader-chat.
# Prereqs: ai-text-opt-1024 embed service already running on :8001,
#          ChromaDB already running on :8000 (or CHROMA_MODE=cloud).
# Run from project root: bash start.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Prefer monorepo root .env; fall back to local .env for standalone use.
ROOT_ENV="$(cd "$ROOT/../.." && pwd)/.env"
LOCAL_ENV="$ROOT/.env"
if [ -f "$ROOT_ENV" ]; then
  ENV_FILE="$ROOT_ENV"
elif [ -f "$LOCAL_ENV" ]; then
  ENV_FILE="$LOCAL_ENV"
else
  echo "No .env found — add one at ai-text-opt-1024/.env or apps/trader-chat/.env"
  exit 1
fi
echo "Using env: $ENV_FILE"

echo "── trader-chat startup ───────────────────────────────────────"
echo "Backend + frontend: http://localhost:3002"
echo ""
npm run dev
