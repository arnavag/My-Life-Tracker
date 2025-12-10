#!/usr/bin/env bash
# Simple runner for the My Life Tracker Flask app
# Usage: PORT=5005 ./run.sh

set -euo pipefail
PORT=${PORT:-5005}
APP="/Users/arnav/Desktop/ my life traker22/app.py"
PYTHON=${PYTHON:-/usr/local/bin/python3}
LOGFILE="flask.log"

echo "Checking for processes listening on port $PORT..."
PIDS=$(lsof -iTCP:${PORT} -sTCP:LISTEN -t || true)
if [[ -n "$PIDS" ]]; then
  echo "Killing PIDs: $PIDS"
  kill $PIDS || kill -9 $PIDS || true
  sleep 1
fi

echo "Starting app on port $PORT (nohup) -> $LOGFILE"
nohup "$PYTHON" "$APP" > "$LOGFILE" 2>&1 &
PID=$!
# detach
disown
sleep 1

# Minimal terminal output per user preference: only show the URLs and a short warning.
echo
echo "Application started (background PID: $PID)"
echo
echo "Open in your browser:"
echo "  http://localhost:${PORT}/"
echo "  http://127.0.0.1:${PORT}/"
echo "  http://[::1]:${PORT}/"
echo
echo "WARNING: This is a development server. Do not use it in a production deployment."
echo "To view logs: tail -f $LOGFILE"
echo "To stop: kill $PID or find process with: lsof -iTCP:${PORT} -sTCP:LISTEN -t"