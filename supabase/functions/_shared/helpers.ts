import { createClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Escape user-supplied text before interpolating into email HTML.
export function esc(v: unknown) {
  return String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export async function getCallerUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!token) return null
  const { data } = await adminClient().auth.getUser(token)
  return data?.user ?? null
}

export async function getCallerEmployee(req: Request) {
  const user = await getCallerUser(req)
  if (!user) return null
  const { data } = await adminClient()
    .from('employees')
    .select('*')
    .eq('active', true)
    .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
    .limit(1)
    .maybeSingle()
  return data
}

export async function getCallerMember(req: Request) {
  const user = await getCallerUser(req)
  if (!user) return null
  const { data } = await adminClient()
    .from('members')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return data
}

const FROM = () => Deno.env.get('RESEND_FROM') ?? 'Seaside Beach Club <noreply@sbcri.com>'

export type Attachment = { filename: string; content: string }

export async function sendEmail(opts: {
  to: string | string[]
  subject: string
  html: string
  attachments?: Attachment[]
}) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) {
    console.log(`[email skipped - RESEND_API_KEY not set] to=${opts.to} subject=${opts.subject}`)
    return { skipped: true }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), ...opts }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) console.error('resend error', res.status, JSON.stringify(body))
  return { ok: res.ok, body }
}

// max 100 messages per Resend batch call
export async function sendEmailBatch(messages: { to: string; subject: string; html: string }[]) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) {
    console.log(`[batch email skipped - RESEND_API_KEY not set] count=${messages.length}`)
    return { skipped: true, count: 0 }
  }
  let sent = 0
  let failed = 0
  for (let i = 0; i < messages.length; i += 100) {
    // Resend allows 2 requests/second - space out consecutive batch calls
    if (i > 0) await new Promise((r) => setTimeout(r, 600))
    const chunk = messages.slice(i, i + 100).map(m => ({ from: FROM(), ...m }))
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    })
    if (res.ok) sent += chunk.length
    else {
      failed += chunk.length
      console.error('resend batch error', res.status, await res.text())
    }
  }
  return { ok: failed === 0, count: sent, failed }
}

export async function sendSms(to: string, body: string) {
  const account = Deno.env.get('TWILIO_ACCOUNT_SID')
  const keySid = Deno.env.get('TWILIO_API_KEY_SID')
  const keySecret = Deno.env.get('TWILIO_API_KEY_SECRET')
  const tok = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from = Deno.env.get('TWILIO_PHONE_NUMBER')
  const msgSvc = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID')

  // auth: API key pair preferred, account auth token as fallback
  const basicUser = keySid && keySecret ? keySid : account
  const basicPass = keySid && keySecret ? keySecret : tok
  if (!account || !basicPass || (!from && !msgSvc)) {
    console.log(`[sms skipped - Twilio not configured] to=${to}`)
    return { skipped: true }
  }

  // A2P 10DLC: prefer the Messaging Service (it selects the sender and applies
  // the registered campaign); fall back to a direct From number if no MG SID.
  const params: Record<string, string> = { To: to, Body: body }
  if (msgSvc) params.MessagingServiceSid = msgSvc
  else params.From = from!
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${basicUser}:${basicPass}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  })
  const resBody = await res.json().catch(() => null)
  if (!res.ok) console.error('twilio error', res.status, JSON.stringify(resBody))
  return { ok: res.ok, body: resBody }
}

export function emailShell(title: string, inner: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f1f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px">
    <div style="background:#50a2ad;color:#fff;border-radius:12px 12px 0 0;padding:18px 22px">
      <div style="font-size:12px;opacity:.85">Seaside Beach Club</div>
      <div style="font-size:19px;font-weight:600">${esc(title)}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:22px;font-size:14px;line-height:1.6;color:#1a1a1a">
      ${inner}
    </div>
    <div style="text-align:center;font-size:11px;color:#9a9aa2;padding:14px">
      Seaside Beach Club · 651 Atlantic Ave, Misquamicut, RI 02891 · 401-322-0201
    </div>
  </div>
</body></html>`
}
