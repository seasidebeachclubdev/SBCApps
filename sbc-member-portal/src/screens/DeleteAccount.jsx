// Public account-deletion request page. Required by the App Store and by
// Google Play's Data Safety form as a URL anyone can reach without signing
// in. Mirrors Privacy.jsx / Support.jsx styling.
const S = {
  wrap: { maxWidth: 640, margin: '0 auto', padding: '32px 20px 60px', fontSize: 14, lineHeight: 1.7, color: '#1a1a1a' },
  h1: { fontSize: 22, fontWeight: 700, color: '#2f6e78', marginBottom: 4 },
  muted: { color: '#6b6b6b', fontSize: 12 },
  h2: { fontSize: 16, fontWeight: 600, marginTop: 26, marginBottom: 6 },
  a: { color: '#2f6e78' },
  btn: {
    display: 'inline-block', marginTop: 6, padding: '12px 20px', background: '#2f6e78',
    color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 600, textDecoration: 'none',
  },
  card: {
    marginTop: 14, padding: '14px 16px', background: '#f4f7f7',
    border: '1px solid #dbe6e6', borderRadius: 10, fontSize: 13.5, lineHeight: 1.7,
  },
  steps: { margin: '6px 0 0', paddingLeft: 20 },
}

const MAILTO =
  'mailto:seasidebeachclub@gmail.com' +
  '?subject=' + encodeURIComponent('Account deletion request') +
  '&body=' + encodeURIComponent(
    'Please delete my Seaside Beach Club app account and associated personal data.\n\n' +
    'Name on account:\n' +
    'Email on account:\n' +
    'Phone on account (if any):\n'
  )

export default function DeleteAccount() {
  return (
    <div style={S.wrap}>
      <div style={S.h1}>Delete Your Account</div>
      <div style={S.muted}>Seaside Beach Club App &middot; Misquamicut, Rhode Island</div>

      <p style={{ marginTop: 16 }}>
        You can request deletion of your Seaside Beach Club app account and the personal data
        associated with it at any time. There are two ways to do it.
      </p>

      <h2 style={S.h2}>Option 1: In the app (fastest)</h2>
      <ol style={S.steps}>
        <li>Open the Seaside Beach Club app and sign in.</li>
        <li>Go to the <strong>Home</strong> screen and scroll to the bottom.</li>
        <li>Tap <strong>Delete my account</strong>, then confirm.</li>
      </ol>
      <p>Your login and contact details are removed immediately.</p>

      <h2 style={S.h2}>Option 2: Request it from the club</h2>
      <p>
        If you cannot sign in, email the club and we will process your request. Please send it from,
        or clearly name, the email address on your account so we can find it.
      </p>
      <a style={S.btn} href={MAILTO}>Email a deletion request</a>
      <p style={{ marginTop: 12 }}>
        Or call the club office at <a style={S.a} href="tel:4013220201">401-322-0201</a>. Requests are
        processed within 30 days.
      </p>

      <h2 style={S.h2}>What is deleted</h2>
      <p>
        Your app login (email and password) and the contact details you provided in the app (email
        and phone number) are deleted.
      </p>

      <h2 style={S.h2}>What the club keeps</h2>
      <p>
        Core membership roster records that the club maintains as business records are retained:
        your name, membership type, household member names, vehicle license plates, and guest and
        fee history. These are kept while your membership is active and as required for the club's
        records, separate from your app login. Deleting your app account does not cancel your club
        membership. To end your membership itself, contact the club office. See our{' '}
        <a style={S.a} href="/privacy">Privacy Policy</a>.
      </p>

      <h2 style={S.h2}>Contact</h2>
      <div style={S.card}>
        <strong>Seaside Beach Club</strong><br />
        651 Atlantic Ave, Misquamicut, RI 02891<br />
        Phone: <a style={S.a} href="tel:4013220201">401-322-0201</a><br />
        Email: <a style={S.a} href="mailto:seasidebeachclub@gmail.com">seasidebeachclub@gmail.com</a>
      </div>
    </div>
  )
}
