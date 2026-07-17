// Deletes the calling member's login and contact details (Apple App Store
// guideline 5.1.1(v): apps with account creation must offer in-app deletion).
// Core roster records stay with the club as business records; the member can
// re-claim their account later if they return.
import { corsHeaders, json, adminClient, getCallerMember } from '../_shared/helpers.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const member = await getCallerMember(req)
  if (!member) return json({ error: 'unauthorized' }, 401)

  const db = adminClient()
  const { error } = await db.from('members')
    .update({ email: null, phone: null, auth_user_id: null, onboarded: false })
    .eq('member_id', member.member_id)
  if (error) return json({ error: 'could not detach account' }, 500)

  if (member.auth_user_id) {
    await db.auth.admin.deleteUser(member.auth_user_id)
  }

  return json({ ok: true })
})
