#!/usr/bin/env bash
# Builds all three apps; prints one status line each.
set -uo pipefail
source ~/.nvm/nvm.sh
cd "$(dirname "$0")/.."
fail=0
for app in sbc-member-portal sbc-employee-app sbc-admin-dashboard; do
  # search the whole output, not just the last line: npm notices and
  # deprecation warnings land after vite's summary and hid real results
  full=$(cd "$app" && npx vite build 2>&1)
  if line=$(grep -m1 "built in" <<<"$full"); then
    echo "$app: $line"
  else
    echo "$app: BUILD FAILED"
    tail -20 <<<"$full"
    fail=1
  fi
done
exit $fail
