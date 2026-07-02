#!/usr/bin/env bash
# Runs all verification suites against the live backend.
set -uo pipefail
source ~/.nvm/nvm.sh
cd "$(dirname "$0")"
overall=0
echo "--- RLS suite ---"
node verify-rls.mjs || overall=1
echo "--- function suite ---"
node test-functions.mjs | tail -3 || overall=1
echo "--- hardening triggers ---"
node verify-hardening.mjs || overall=1
exit $overall
