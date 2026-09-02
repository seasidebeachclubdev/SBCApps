// Public support page, required by the App Store. Mirrors Privacy.jsx so the
// two static pages read as a set. Viewable without a login.
const S = {
  wrap: { maxWidth: 640, margin: '0 auto', padding: '32px 20px 60px', fontSize: 14, lineHeight: 1.7, color: '#1a1a1a' },
  h1: { fontSize: 22, fontWeight: 700, color: '#2f6e78', marginBottom: 4 },
  muted: { color: '#6b6b6b', fontSize: 12 },
  h2: { fontSize: 16, fontWeight: 600, marginTop: 26, marginBottom: 6 },
  q: { fontWeight: 600, color: '#1a1a1a' },
  card: {
    marginTop: 14, padding: '14px 16px', background: '#f4f7f7',
    border: '1px solid #dbe6e6', borderRadius: 10, fontSize: 13.5, lineHeight: 1.7,
  },
  a: { color: '#2f6e78' },
}

export default function Support() {
  return (
    <div style={S.wrap}>
      <div style={S.h1}>Support</div>
      <div style={S.muted}>Seaside Beach Club App &middot; Misquamicut, Rhode Island</div>

      <h2 style={S.h2}>Getting started</h2>
      <p>
        The Seaside Beach Club app is for current members of the club. To use it, you first
        activate your member account.
      </p>
      <p>
        <span style={S.q}>Claim your account.</span> On the sign-in screen, tap "Claim your
        account" and enter your last name, a vehicle license plate on your membership, and your
        email address. The club matches this against the membership roster, and a staff member
        approves the request. You will then receive an email to set your password. If your details
        do not match what is on file, contact the club office and we will help.
      </p>

      <h2 style={S.h2}>Signing in and passwords</h2>
      <p>
        Sign in with your email and password. If you forget your password, tap "Forgot password?"
        on the sign-in screen and we will email you a reset link.
      </p>

      <h2 style={S.h2}>Guest passes</h2>
      <p>
        From the Guests tab, register a guest with their name, an optional email or phone, the
        visit date, the guest's age band, whether they arrive in their own car, and who pays at the
        gate. The app emails a QR code pass to you and to your guest, and gate staff scan it on
        arrival. You see the fee before you send the pass. The same guest may visit up to four times
        per season across all members.
      </p>

      <h2 style={S.h2}>Fees</h2>
      <p>
        The Fees tab shows what you owe for guest visits and what has already been paid. Guest fees
        are $20 per guest 18 and over and $10 under 18, plus a car fee of $50 on weekdays or $100 on
        weekends when a guest arrives in their own vehicle. All fees are collected in person at the
        gate by cash or check. The app never asks for payment.
      </p>

      <h2 style={S.h2}>Your vehicles</h2>
      <p>
        From My Vehicles, add or update the license plates on your membership so the gate always
        recognizes your car. The number of vehicles you can register depends on your membership's
        stickers.
      </p>

      <h2 style={S.h2}>Beach and club information</h2>
      <p>
        The Home screen shows today's beach flag, tide times, and weather, along with the latest
        notices from the club. Rules and the season's important dates are under the Rules tab.
      </p>

      <h2 style={S.h2}>Report an issue</h2>
      <p>
        Use the Issues tab to send a facility problem to the club office, such as a maintenance item
        or a bathhouse that needs restocking. You are notified by email when the status changes.
      </p>

      <h2 style={S.h2}>Account and privacy</h2>
      <p>
        You can update your contact details in the app, and you can delete your account at any time
        from the Home screen. Deleting removes your login and contact details; the club retains core
        membership roster records as business records. See our{' '}
        <a style={S.a} href="/privacy">Privacy Policy</a>.
      </p>

      <h2 style={S.h2}>Common questions</h2>
      <p><span style={S.q}>I did not get the account email.</span> Check your spam folder. New
        accounts also need staff approval before the email is sent, so allow a little time. Still
        nothing? Contact the office.</p>
      <p><span style={S.q}>The app will not let me claim my account.</span> Your last name and
        license plate must match the membership roster. If they do not, contact the office and we
        will update your record or help you activate.</p>
      <p><span style={S.q}>The QR scanner is not on my screen.</span> Members show the QR pass that
        was emailed to them. The scanner is used by gate staff, not members.</p>
      <p><span style={S.q}>How do I change my email or phone?</span> Update your contact details in
        the app, or contact the office.</p>

      <h2 style={S.h2}>Contact us</h2>
      <div style={S.card}>
        <strong>Seaside Beach Club</strong><br />
        651 Atlantic Ave, Misquamicut, RI 02891<br />
        Phone: <a style={S.a} href="tel:4013220201">401-322-0201</a><br />
        Email: <a style={S.a} href="mailto:seasidebeachclub@gmail.com">seasidebeachclub@gmail.com</a><br />
        Season: June 20 to Labor Day. Lifeguards on duty 9:30 AM to 5:00 PM daily.
      </div>
    </div>
  )
}
