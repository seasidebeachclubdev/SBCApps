const S = {
  wrap: { maxWidth: 640, margin: '0 auto', padding: '32px 20px 60px', fontSize: 14, lineHeight: 1.7, color: '#1a1a1a' },
  h1: { fontSize: 22, fontWeight: 700, color: '#2f6e78', marginBottom: 4 },
  h2: { fontSize: 16, fontWeight: 600, marginTop: 26, marginBottom: 6 },
  muted: { color: '#6b6b6b', fontSize: 12 },
}

export default function Privacy() {
  return (
    <div style={S.wrap}>
      <div style={S.h1}>Privacy Policy</div>
      <div style={S.muted}>Seaside Beach Club · Effective July 2026</div>

      <h2 style={S.h2}>Who we are</h2>
      <p>
        Seaside Beach Club ("the Club") operates the member portal at members.sbcri.com, the
        Seaside Beach Club mobile app, and related staff applications. This policy describes how
        member information is collected and used across those services.
      </p>

      <h2 style={S.h2}>Information we collect</h2>
      <p>
        <strong>Membership records:</strong> your name, membership type, household member names,
        and vehicle license plates, maintained as part of the Club's membership roster.<br />
        <strong>Contact details:</strong> the email address and phone number you provide when
        activating your account or updating your profile.<br />
        <strong>Guest information:</strong> names and optional contact details of guests you
        register, visit dates, and guest fee status.<br />
        <strong>Operational records:</strong> gate check-ins, reported facility issues, and (for
        Club staff) schedules and time-clock records.
      </p>

      <h2 style={S.h2}>How we use it</h2>
      <p>
        Solely to operate the Club: verifying membership at the gate, managing guest passes and
        the guest visit limit, collecting guest fees, sending you service notifications (such as
        guest check-in alerts and account emails), posting Club notices, and scheduling staff. We
        do not sell personal information or use it for third-party advertising.
      </p>

      <h2 style={S.h2}>Service providers</h2>
      <p>
        Data is stored and processed in the United States by the infrastructure providers the Club
        uses to run these services: Supabase (database and authentication), Vercel (web hosting),
        Resend (email delivery), and Twilio (text-message delivery). Each receives only what is
        needed to provide its service.
      </p>

      <h2 style={S.h2}>Retention</h2>
      <p>
        Membership and fee records are retained while your membership is active and as required
        for the Club's business records. Guest records are retained for the season's operations.
      </p>

      <h2 style={S.h2}>Your choices</h2>
      <p>
        You can update your contact details in the portal. You can delete your account (your
        login and contact details) at any time from the portal home screen; core membership
        roster records are retained by the Club as business records. For corrections or
        questions, contact the Club office.
      </p>

      <h2 style={S.h2}>Children</h2>
      <p>
        Portal accounts are for adult members. Household member names may include family members
        of any age as part of the membership record; children do not have accounts.
      </p>

      <h2 style={S.h2}>Changes</h2>
      <p>Updates to this policy will be posted at this address.</p>

      <h2 style={S.h2}>Contact</h2>
      <p>
        Seaside Beach Club · 651 Atlantic Ave, Misquamicut, RI 02891 · 401-322-0201
      </p>
    </div>
  )
}
