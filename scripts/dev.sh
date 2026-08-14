#!/usr/bin/env bash
# Launch backend + worker + redis + frontend for local dev (no Docker).
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from template — edit it before running again."
    exit 1
fi

# Redis (assumes installed; on macOS: brew install redis)
if ! pgrep -x redis-server > /dev/null; then
    redis-server --daemonize yes
fi

# Backend venv
cd backend
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt

# Run uvicorn + celery in background
(uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
BACK_PID=$!

(celery -A app.core.celery_app.celery_app worker --loglevel=info --concurrency=2) &
WORKER_PID=$!

# Frontend
cd ../frontend
[ -d node_modules ] || npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev &
FRONT_PID=$!

trap "kill $BACK_PID $WORKER_PID $FRONT_PID 2>/dev/null" EXIT
echo "Backend: http://localhost:8000  |  Frontend: http://localhost:3000"
wait
