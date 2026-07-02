#!/usr/bin/env bash
# Builds all three apps; prints one status line each.
set -uo pipefail
source ~/.nvm/nvm.sh
cd "$(dirname "$0")/.."
fail=0
for app in sbc-member-portal sbc-employee-app sbc-admin-dashboard; do
  out=$(cd "$app" && npx vite build 2>&1 | tail -1)
  echo "$app: $out"
  [[ "$out" == *"built in"* ]] || fail=1
done
exit $fail
