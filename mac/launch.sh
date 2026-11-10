#!/bin/bash
# Pocket Presenter.app's helper: starts or stops present.py (bundled next to this file) and opens the drop page.
#   launch.sh start   start the server if it isn't running, then open the browser on it
#   launch.sh stop    stop the server
HERE="$(cd "$(dirname "$0")" && pwd)"
STATE="$HOME/Library/Application Support/Pocket Presenter"
PIDF="$STATE/server.pid"; PORTF="$STATE/server.port"; LOG="$STATE/server.log"
mkdir -p "$STATE"

running() {   # our server is up: its process is alive and the port answers like pocket-presenter
  [ -f "$PIDF" ] && [ -f "$PORTF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null &&
    curl -s -m 2 "http://localhost:$(cat "$PORTF")/info" | grep -q '"remotes"'
}

find_python() {
  for p in /opt/homebrew/bin/python3 /usr/local/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3 /usr/bin/python3; do
    [ -x "$p" ] && "$p" -c 'import sys; sys.exit(sys.version_info < (3, 8))' 2>/dev/null && { echo "$p"; return; }
  done
}

case "$1" in
  stop)
    [ -f "$PIDF" ] && kill "$(cat "$PIDF")" 2>/dev/null
    rm -f "$PIDF" "$PORTF"; exit 0 ;;
  start)
    if running; then open "http://localhost:$(cat "$PORTF")/"; exit 0; fi
    PY="$(find_python)"
    [ -n "$PY" ] || { echo "Pocket Presenter needs Python 3.8 or newer. Install it from python.org, then open the app again." >&2; exit 1; }
    for port in $(seq 8000 8020); do
      "$PY" "$HERE/present.py" --port "$port" --no-open >"$LOG" 2>&1 </dev/null &
      pid=$!
      echo "$pid" >"$PIDF"; echo "$port" >"$PORTF"
      for _ in $(seq 1 30); do
        kill -0 "$pid" 2>/dev/null || break            # exited: port busy, try the next one
        if running; then open "http://localhost:$port/"; exit 0; fi
        sleep 0.1
      done
      kill "$pid" 2>/dev/null
    done
    rm -f "$PIDF" "$PORTF"
    echo "Pocket Presenter couldn't start its server. Details: $LOG" >&2; exit 1 ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
