#!/usr/bin/env bash
# Deploys all three apps to Vercel. Run from WSL:
#   VERCEL_TOKEN=xxx ./deploy-vercel.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"

if [ -z "${VERCEL_TOKEN:-}" ] && [ -f tools/.env ]; then
  VERCEL_TOKEN=$(grep '^VERCEL_TOKEN=' tools/.env | cut -d= -f2)
fi
if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "VERCEL_TOKEN is not set" >&2
  exit 1
fi

SUPABASE_URL_VALUE="https://epqvclktovtssfafgdgj.supabase.co"
SUPABASE_ANON_VALUE="sb_publishable_Y4jS2hje1D-j0MkysN2HfA_HJGf_RuA"

for app in sbc-member-portal sbc-employee-app sbc-admin-dashboard; do
  echo "=== $app ==="
  cd "$app"

  npx --yes vercel link --yes --project "$app" --token "$VERCEL_TOKEN" > /dev/null

  for envname in production preview; do
    printf '%s' "$SUPABASE_URL_VALUE"  | npx vercel env add VITE_SUPABASE_URL "$envname" --token "$VERCEL_TOKEN" 2>/dev/null || true
    printf '%s' "$SUPABASE_ANON_VALUE" | npx vercel env add VITE_SUPABASE_ANON_KEY "$envname" --token "$VERCEL_TOKEN" 2>/dev/null || true
  done

  npx vercel deploy --prod --yes --token "$VERCEL_TOKEN" 2>&1 | tail -2
  cd ..
done
