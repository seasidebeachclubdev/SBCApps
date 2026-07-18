#!/usr/bin/env bash
# Regenerates member-app native icons + splash from tools/ sources.
set -euo pipefail
source ~/.nvm/nvm.sh
cd "$(dirname "$0")"
node gen-native.mjs
cd ../sbc-member-portal
npx --yes @capacitor/assets generate --ios --android \
  --iconBackgroundColor '#50a2ad' --iconBackgroundColorDark '#50a2ad' \
  --splashBackgroundColor '#50a2ad' --splashBackgroundColorDark '#50a2ad' \
  2>&1 | tail -3
