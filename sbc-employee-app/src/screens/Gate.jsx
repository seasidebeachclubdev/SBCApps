// Gate check-in for gate-role staff - same flow as the admin dashboard's
// Gate screen: scan a pass (or look the member up by name), verify against
// the database, enforce the 4-visit rule, admit, notify the member.
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { localDateStr } from '../lib/dates'

async function checkGuestVisits(guestName, email, phone) {
  const { data: count, error } = await supabase.rpc('guest_visit_count', {
    p_name: guestName, p_email: email || '', p_phone: phone || '',
  })
  if (error) return null
  return count ?? 0
}

export default function Gate() {
  const { employee } = useAuth()
  const [scanResult, setScanResult] = useState(null)
  const [blocked, setBlocked] = useState(false)
  const [blockedName, setBlockedName] = useState('')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [recentCheckins, setRecentCheckins] = useState([])
  const [toast, setToast] = useState('')
  const [scannerActive, setScannerActive] = useState(false)
  const [member, setMember] = useState(null)      // member opened from search
  const [memberGuests, setMemberGuests] = useState([])
  const [loadingGuests, setLoadingGuests] = useState(false)
  const scannerRef = useRef(null)
  const patchRef = useRef(null) // keeps the iOS inline-playback fix applied

  const today = localDateStr()

  useEffect(() => {
    fetchRecentCheckins()
    return () => { stopScanner() }
  }, [])

  useEffect(() => {
    if (search.length > 1) searchMembers()
    else setSearchResults([])
  }, [search])

  function flash(msg, ms = 3000) { setToast(msg); setTimeout(() => setToast(''), ms) }

  async function fetchRecentCheckins() {
    const { data } = await supabase
      .from('guests').select('guest_name, member_name, checked_in_by, created_at')
      .eq('visit_date', today).not('checked_in_by', 'is', null)
      .order('created_at', { ascending: false }).limit(6)
    setRecentCheckins(data || [])
  }

  async function searchMembers() {
    const { data } = await supabase
      .from('members').select('member_id, first_name, last_name, membership_type, onboarded')
      .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,member_id.ilike.%${search}%`)
      .limit(5)
    setSearchResults(data || [])
  }

  // ---------- scanner ----------
  // Html5QrcodeScanner renders its own camera picker and start/stop UI.
  // rememberLastUsedCamera:false (plus clearing the stored key) keeps the
  // front/back picker available on every scan instead of only the first.
  async function startScanner() {
    setScannerActive(true)
    const { Html5QrcodeScanner } = await import('html5-qrcode')
    try { localStorage.removeItem('HTML5_QRCODE_DATA') } catch {}
    for (let i = 0; i < 20 && !document.getElementById('qr-reader'); i++)
      await new Promise(r => setTimeout(r, 50))
    if (!document.getElementById('qr-reader')) { setScannerActive(false); return }
    // No qrbox: the whole frame is scannable, which avoids the library's
    // cropping overlay entirely and is more forgiving to aim at the gate.
    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 10,
      rememberLastUsedCamera: false,
    }, false)
    scannerRef.current = scanner
    scanner.render(
      async (decodedText) => {
        await stopScanner()
        await handleScan(decodedText)
      },
      () => {} // per-frame decode misses are normal
    )
    // iOS renders a black box instead of the camera unless the preview is
    // explicitly inline and muted. The video element only exists once the
    // camera starts, so keep applying this while the user gets there.
    clearInterval(patchRef.current)
    const started = Date.now()
    patchRef.current = setInterval(() => {
      const v = document.querySelector('#qr-reader video')
      if (v) {
        v.setAttribute('playsinline', 'true')
        v.setAttribute('webkit-playsinline', 'true')
        v.setAttribute('muted', 'true')
        v.muted = true
        if (v.paused) v.play().catch(() => {})
      }
      if (Date.now() - started > 20000) clearInterval(patchRef.current)
    }, 300)
  }

  async function stopScanner() {
    clearInterval(patchRef.current)
    const scanner = scannerRef.current
    scannerRef.current = null
    setScannerActive(false)
    if (scanner) { try { await scanner.clear() } catch {} }
    releaseCamera()
  }

  // Safety net: if teardown failed part way, a live track keeps the camera
  // busy and the next scan opens to a black preview until the app is killed.
  function releaseCamera() {
    document.querySelectorAll('#qr-reader video').forEach(v => {
      try {
        v.srcObject?.getTracks?.().forEach(t => t.stop())
        v.srcObject = null
      } catch {}
    })
  }

  async function handleScan(text) {
    const parts = text.split('|')
    if (parts[0] !== 'SBCRI' || parts.length < 5) return flash('Invalid QR code')
    const [, guestId] = parts

    // identity comes from the database row, not the QR text
    const { data: guest } = await supabase
      .from('guests')
      .select('id, guest_name, email, phone, visit_date, member_id')
      .eq('id', guestId)
      .maybeSingle()
    if (!guest) return flash('Pass not found - verify the guest at the desk', 4000)
    await verifyGuest(guest)
  }

  // shared by the scanner and by picking a pass from the member's list
  async function verifyGuest(guest) {
    const visitCount = await checkGuestVisits(guest.guest_name, guest.email, guest.phone)
    if (visitCount === null) return flash('Could not verify visit count - try again')
    if (visitCount > 4) {
      setBlocked(true)
      setBlockedName(guest.guest_name)
      return
    }
    setScanResult({
      type: 'guest',
      guestId: guest.id,
      guestName: guest.guest_name,
      visitDate: guest.visit_date,
      memberId: guest.member_id,
      visitCount,
    })
  }

  // ---------- member lookup ----------
  async function openMember(m) {
    setSearch('')
    setSearchResults([])
    setMember(m)
    setLoadingGuests(true)
    const { data } = await supabase
      .from('guests')
      .select('id, guest_name, email, phone, visit_date, fee, paid, checked_in_by, member_id')
      .eq('member_id', m.member_id)
      .order('created_at', { ascending: false })
      .limit(30)
    setMemberGuests(data || [])
    setLoadingGuests(false)
  }

  function closeMember() {
    setMember(null)
    setMemberGuests([])
  }

  async function admitGuest() {
    if (!scanResult) return
    if (scanResult.type === 'guest') {
      const { error } = await supabase.from('guests')
        .update({ checked_in_by: employee.name, visit_date: today })
        .eq('id', scanResult.guestId)
      if (error) return flash('Check-in failed — try again')
      await supabase.functions.invoke('send-checkin-sms', {
        body: { guest_name: scanResult.guestName, member_id: scanResult.memberId }
      })
    }
    setScanResult(null)
    closeMember()
    flash('Check-in recorded — member notified')
    fetchRecentCheckins()
  }

  const fmtDate = d => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'No date set'
  const unusedPasses = memberGuests.filter(g => !g.checked_in_by)
  const usedPasses = memberGuests.filter(g => g.checked_in_by)

  return (
    <div className="screen">
      {blocked && (
        <div className="error-box">
          <strong>⛔ Check-in blocked</strong><br />
          <strong>{blockedName}</strong> has reached the 4-visit season limit and may not be admitted.
          <br /><br />
          <button className="btn-secondary" onClick={() => { setBlocked(false); setBlockedName('') }}>Dismiss</button>
        </div>
      )}

      {toast && <div className="success-box">✓ {toast}</div>}

      {scanResult ? (
        <div className="card" style={{ textAlign: 'center', border: '1px solid #5dcaa5' }}>
          <div style={{ fontSize: 12, color: '#0f6e56', fontWeight: 500, marginBottom: 8 }}>✓ Verified</div>
          {scanResult.type === 'guest' ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{scanResult.guestName}</div>
              <div style={{ fontSize: 12, color: '#6b6b6b' }}>Guest · Member {scanResult.memberId}</div>
              {scanResult.visitCount >= 3 && (
                <div style={{ fontSize: 12, color: '#854f0b', marginTop: 4 }}>⚠️ {scanResult.visitCount} of 4 visits used this season</div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{scanResult.member.first_name} {scanResult.member.last_name}</div>
              <div style={{ fontSize: 12, color: '#6b6b6b' }}>{scanResult.member.member_id} · {scanResult.member.membership_type}</div>
            </>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={admitGuest}>Admit</button>
            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setScanResult(null)}>Cancel</button>
          </div>
        </div>
      ) : member ? (
        <>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn-secondary" style={{ padding: '6px 10px' }} onClick={closeMember}>‹ Back</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{member.first_name} {member.last_name}</div>
              <div style={{ fontSize: 11, color: '#6b6b6b' }}>{member.member_id} · {member.membership_type}</div>
            </div>
          </div>
          <div className="card">
            <button className="btn-primary" onClick={() => setScanResult({ type: 'member', member })}>
              Admit Member
            </button>
          </div>

          <div className="section-label">Guest passes</div>
          {loadingGuests ? (
            <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 16 }}>Loading…</div>
          ) : unusedPasses.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 16 }}>
              No unused guest passes for this member.
            </div>
          ) : (
            <div className="list-card">
              {unusedPasses.map(g => (
                <div key={g.id} className="list-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{g.guest_name}</div>
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>
                      {fmtDate(g.visit_date)} · ${g.fee ?? 35}{' '}
                      <span className={`badge ${g.paid ? 'badge-green' : 'badge-amber'}`} style={{ marginLeft: 4 }}>
                        {g.paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                  </div>
                  <button className="btn-teal" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => verifyGuest(g)}>
                    Check In
                  </button>
                </div>
              ))}
            </div>
          )}

          {usedPasses.length > 0 && (
            <>
              <div className="section-label">Already used</div>
              <div className="list-card">
                {usedPasses.slice(0, 5).map(g => (
                  <div key={g.id} className="list-item">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{g.guest_name}</div>
                      <div style={{ fontSize: 11, color: '#6b6b6b' }}>{fmtDate(g.visit_date)} · by {g.checked_in_by}</div>
                    </div>
                    <span className="badge badge-green">In</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : !scannerActive ? (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
          <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 14 }}>
            Scan a guest pass QR code, or find the member by name below
          </div>
          <button className="btn-primary" onClick={startScanner}>Start QR Scanner</button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div id="qr-reader" style={{ width: '100%' }} />
          <div style={{ padding: 12 }}>
            <button className="btn-secondary" style={{ width: '100%', textAlign: 'center' }} onClick={stopScanner}>
              ✕ Close Camera
            </button>
          </div>
        </div>
      )}

      {!member && !scanResult && (
        <>
          <div className="section-label">Find a member</div>
          <div style={{ padding: '0 16px' }}>
            <input
              type="text"
              placeholder="Member name or ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {searchResults.length > 0 && (
            <div className="list-card">
              {searchResults.map(m => (
                <div key={m.member_id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => openMember(m)}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{m.first_name} {m.last_name}</div>
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>{m.member_id} · {m.membership_type}</div>
                  </div>
                  <span style={{ fontSize: 12, color: '#6b6b6b' }}>Guest passes ›</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!member && !scanResult && (
        <>
          <div className="section-label">Recent today</div>
          {recentCheckins.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 16 }}>No check-ins yet.</div>
          ) : (
            <div className="list-card">
              {recentCheckins.map((c, i) => (
                <div key={i} className="list-item">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.guest_name}</div>
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>Guest of {c.member_name}</div>
                  </div>
                  <span className="badge badge-green">In</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
