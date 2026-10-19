#!/usr/bin/env bash
# Throwaway Postgres 16 for CI on the Mac mini runner (GitHub Actions `services:` needs Docker,
# which the runner does not have). Listens on 127.0.0.1 only, lives under $RUNNER_TEMP, and is
# deleted by `stop`. Usage: pg-ephemeral.sh start|stop. Needs Postgres 16 (Homebrew, or the Ubuntu hosted image's /usr/lib/postgresql/16).
set -euo pipefail

PORT="${PG_CI_PORT:-54329}"
ROOT="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/pg-ci"
DATA="$ROOT/data"

# Homebrew's launchd-started runner has no /opt/homebrew/bin on PATH; PG_BIN overrides for tests.
for dir in "${PG_BIN:-}" /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin /usr/lib/postgresql/16/bin; do
  if [ -n "$dir" ] && [ -x "$dir/pg_ctl" ]; then PATH="$dir:$PATH"; break; fi
done
command -v pg_ctl >/dev/null || { echo "postgresql@16 is not installed (brew install postgresql@16)" >&2; exit 1; }

# The launchd runner has no valid locale, and the postmaster refuses to start without one on macOS
# ("postmaster became multithreaded during startup"). C is always valid.
export LC_ALL=C LANG=C

case "${1:-}" in
  start)
    pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true
    rm -rf "$ROOT" && mkdir -p "$ROOT"
    printf 'ci-only-not-a-secret' >"$ROOT/pw"
    initdb -D "$DATA" -U iep -E UTF8 --locale=C --auth=scram-sha-256 --pwfile="$ROOT/pw" >/dev/null
    # No unix socket: macOS limits socket paths to ~100 characters and the runner's temp dir is
    # longer than that. TCP on 127.0.0.1 only.
    if ! pg_ctl -D "$DATA" -w -t 60 -l "$ROOT/log" \
      -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null; then
      echo "postgres failed to start; server log:" >&2
      cat "$ROOT/log" >&2 || true
      exit 1
    fi
    PGPASSWORD=ci-only-not-a-secret createdb -h 127.0.0.1 -p "$PORT" -U iep iep
    echo "postgres ready on 127.0.0.1:$PORT"
    ;;
  stop)
    pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true
    rm -rf "$ROOT"
    ;;
  *)
    echo "usage: $0 start|stop" >&2
    exit 2
    ;;
esac
