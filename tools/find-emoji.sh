#!/usr/bin/env bash
# Lists every emoji still hard-coded in app source, with where it appears.
cd "$(dirname "$0")/.."
PATTERN='[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{2190}-\x{21FF}]'
echo "--- counts ---"
grep -rhoP "$PATTERN" --include='*.jsx' --include='*.ts' --include='*.html' \
  --exclude-dir=node_modules --exclude-dir=dist . | sort | uniq -c | sort -rn
echo
echo "--- files ---"
grep -rlP "$PATTERN" --include='*.jsx' --include='*.ts' --include='*.html' \
  --exclude-dir=node_modules --exclude-dir=dist . | sort
