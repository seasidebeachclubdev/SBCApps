#!/usr/bin/env bash
# Deploys all 5 Edge Functions. Run from WSL:
#   SUPABASE_ACCESS_TOKEN=sbp_xxx ./deploy-functions.sh
# Token: supabase.com/dashboard/account/tokens -> Generate new token
set -euo pipefail
cd "$(dirname "$0")/.."

# nvm-managed node; fall back to whatever is on PATH
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"

# token from env or tools/.env
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && [ -f tools/.env ]; then
  SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' tools/.env | cut -d= -f2- | tr -d '\r\n')
  export SUPABASE_ACCESS_TOKEN
fi
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "SUPABASE_ACCESS_TOKEN is not set" >&2
  exit 1
fi

REF=epqvclktovtssfafgdgj

for fn in send-guest-qr send-checkin-sms notify-onboarding send-issue-resolved-email send-member-email approve-claim; do
  echo "=== deploying $fn ==="
  npx --yes supabase functions deploy "$fn" --project-ref "$REF" || exit 1
done

# claim-account is called by signed-out users; JWT verification must be off
echo "=== deploying claim-account (public) ==="
npx --yes supabase functions deploy claim-account --no-verify-jwt --project-ref "$REF" || exit 1

echo
echo "All functions deployed. Set secrets when accounts are ready:"
echo "  npx supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM='Seaside Beach Club <noreply@sbcri.com>' --project-ref $REF"
echo "  npx supabase secrets set TWILIO_ACCOUNT_SID=ACxxx TWILIO_AUTH_TOKEN=xxx TWILIO_PHONE_NUMBER=+1401xxxxxxx --project-ref $REF"
