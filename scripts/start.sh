#!/usr/bin/env bash
# Start all services for ai-text-opt-1024.
# Run from the project root: bash scripts/start.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "── ai-text-opt-1024 startup ──────────────────────────────────"

# 1. Chroma local server (only needed if CHROMA_MODE=local)
CHROMA_MODE="${CHROMA_MODE:-local}"
if [ "$CHROMA_MODE" = "local" ]; then
  echo "[1/3] Starting ChromaDB local server on :8000..."
  mkdir -p chroma_db
  chroma run --path chroma_db --port 8000 &
  CHROMA_PID=$!
  echo "      PID=$CHROMA_PID"
  sleep 2
else
  echo "[1/3] CHROMA_MODE=cloud — skipping local server"
fi

# 2. Embed service
echo "[2/3] Starting embed service on 127.0.0.1:8001..."
uvicorn embed_service:app --host 127.0.0.1 --port 8001 --log-level warning &
EMBED_PID=$!
echo "      PID=$EMBED_PID"
sleep 3

# 3. Next.js backend
echo "[3/3] Starting Next.js backend on :3001..."
cd backend && npm run dev &
BACKEND_PID=$!
echo "      PID=$BACKEND_PID"
cd "$ROOT"

echo ""
echo "── Services ready ─────────────────────────────────────────────"
echo "  ChromaDB  : http://localhost:8000 (local mode)"
echo "  Embed svc : http://127.0.0.1:8001/health"
echo "  Backend   : http://localhost:3001/api/health"
echo ""
echo "Start frontend separately: cd frontend && npm run dev"
echo "Press Ctrl+C to stop all services."

# Wait and propagate Ctrl+C to all children
trap "kill $CHROMA_PID $EMBED_PID $BACKEND_PID 2>/dev/null; exit 0" INT TERM
wait
