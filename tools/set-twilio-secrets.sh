#!/usr/bin/env bash
# Pushes Twilio credentials from tools/.env to Supabase Edge Function secrets.
set -euo pipefail
cd "$(dirname "$0")"
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"

get() { grep "^$1=" .env | cut -d= -f2-; }
export SUPABASE_ACCESS_TOKEN="$(get SUPABASE_ACCESS_TOKEN)"
REF="$(get SUPABASE_PROJECT_REF)"

npx --yes supabase secrets set \
  "TWILIO_ACCOUNT_SID=$(get TWILIO_ACCOUNT_SID)" \
  "TWILIO_API_KEY_SID=$(get TWILIO_API_KEY_SID)" \
  "TWILIO_API_KEY_SECRET=$(get TWILIO_API_KEY_SECRET)" \
  "TWILIO_MESSAGING_SERVICE_SID=$(get TWILIO_MESSAGING_SERVICE_SID)" \
  --project-ref "$REF"
echo "twilio secrets set"
