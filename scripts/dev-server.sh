#!/usr/bin/env bash
# One tmux server per physical worktree and port; never signal processes by name.
set -euo pipefail

usage() {
  echo "Usage: bash scripts/dev-server.sh {start|status|stop} [port (default: 4600)]" >&2
  exit 2
}

action=${1:-}
port=${2:-4600}
[[ $# -ge 1 && $# -le 2 ]] || usage
[[ "$action" == start || "$action" == status || "$action" == stop ]] || usage
[[ "$port" =~ ^[1-9][0-9]{0,4}$ ]] || usage
((port <= 65535)) || usage

for tool in git node tmux; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing development tool: $tool" >&2
    exit 1
  fi
done

workspace=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
workspace=$(cd "$workspace" && pwd -P)
workspace_id=$(node -e 'console.log(require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex").slice(0, 20))' "$workspace")
socket="vikes-clock-$workspace_id-$port"
log="$workspace/.dev-server/$port.log"

# A dedicated socket also prevents another port from inheriting an older tmux
# server's environment (for example VITE_USE_EMULATOR). Ignore user tmux hooks.
# tmux owns the process lifecycle; the reported PID is diagnostic only. Never
# read or signal a cached PID, which could have been reused by another process.
owned_tmux() {
  tmux -L "$socket" -f /dev/null "$@"
}

running() {
  owned_tmux has-session -t '=vite' 2>/dev/null
}

report() {
  echo "Workspace: $workspace"
  echo "Port: $port"
  echo "URL: http://localhost:$port/"
  echo "Log: $log"
  echo "Handle: tmux -L $socket (session vite)"
}

case "$action" in
  status)
    report
    if running; then
      echo "Running; PID: $(owned_tmux list-panes -s -t '=vite' -F '#{pane_pid}')"
    else
      echo "Stopped"
      exit 1
    fi
    ;;
  stop)
    if running; then
      owned_tmux kill-session -t '=vite'
      echo "Stopped workspace server on port $port. Log retained: $log"
    else
      echo "No workspace server on port $port."
    fi
    ;;
  start)
    report
    if running; then
      echo "Already running. Stop this workspace/port explicitly before restarting."
      exit 0
    fi
    vite="$workspace/clock/node_modules/vite/bin/vite.js"
    if [[ ! -f "$vite" ]]; then
      echo "Vite is missing. Install clock dependencies with pnpm first." >&2
      exit 1
    fi
    mkdir -p "$workspace/.dev-server"
    launch_id=$(node -e 'console.log(require("node:crypto").randomUUID())')
    printf -v launch 'printf "Launch: %%s\\n" %q > %q; exec env PORT=%q NO_COLOR=1 %q %q --host 0.0.0.0 --port %q --strictPort --clearScreen false >> %q 2>&1' \
      "$launch_id" "$log" "$port" "$(command -v node)" "$vite" "$port" "$log"
    owned_tmux new-session -d -s vite -c "$workspace/clock" bash -c "$launch"
    startup_deadline=$((SECONDS + 15))
    while ((SECONDS < startup_deadline)); do
      if ! running; then
        echo "Vite exited. Inspect $log; no other server was stopped." >&2
        exit 1
      fi
      if [[ -f "$log" ]] && grep -q "^Launch: $launch_id$" "$log" && grep -q 'Local:.*http' "$log"; then
        echo "Vite reports a listening URL. HTTP shell and application verification are still required."
        exit 0
      fi
      sleep 0.1
    done
    echo "Startup not confirmed after 15s. Inspect $log; the session remains available." >&2
    echo "Stop with: bash scripts/dev-server.sh stop $port (in $workspace)" >&2
    exit 1
    ;;
esac
