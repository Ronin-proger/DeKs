#!/usr/bin/env sh
cd "$(dirname "$0")/../server" || exit 1
exec python -m uvicorn main:app --host 0.0.0.0 --port 3001 --reload
