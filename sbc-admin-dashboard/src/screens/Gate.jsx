import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { localDateStr } from '../lib/dates'
import { feeBreakdown } from '../lib/fees'
import Icon from '../components/Icon'

// QR format: SBCRI|{guest_id}|{guest_name}|{visit_date}|{member_id}
// Counts via the security-definer RPC so name/email/phone matching follows
// the same rules as registration. Returns null when the check fails.
async function checkGuestVisits(guestName, email, phone) {
  const { data: count, error } = await supabase.rpc('guest_visit_count', {
    p_name: guestName, p_email: email || '', p_phone: phone || '',
  })
  if (error) return null
  return count ?? 0
}

export default function Gate() {
  const { admin } = useAuth()
  const [scanResult, setScanResult] = useState(null)
  const [blocked, setBlocked] = useState(null) // { name, reason }
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [recentCheckins, setRecentCheckins] = useState([])
  const [toast, setToast] = useState('')
  const [scannerActive, setScannerActive] = useState(false)
  const [member, setMember] = useState(null)      // member opened from search
  const [memberGuests, setMemberGuests] = useState([])
  const [memberVehicles, setMemberVehicles] = useState([])
  const [memberHousehold, setMemberHousehold] = useState([])
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
  //
  // Camera start-up is fussy here, and both of the library's stock modes are
  // broken in their own way:
  //   rememberLastUsedCamera:false wipes its stored permission flag, so every
  //     scan needs "Request Camera Permissions" first - that opens the camera,
  //     releases it, then opens it again to scan, and the second open is what
  //     fails on iOS (the camera indicator switches on then straight off).
  //   rememberLastUsedCamera:true auto-starts from the saved camera, and this
  //     version races itself there: it builds the preview then immediately
  //     removes it ("play() request was interrupted because the media was
  //     removed from the document"). That is why it worked the first time and
  //     never again - the first run had no saved camera to auto-start from.
  // So: keep the remembered permission, but drop the remembered camera. The
  // picker is shown, the camera opens once when it is tapped, and front/back
  // is selectable every time.
  async function startScanner() {
    setScannerActive(true)
    const { Html5QrcodeScanner } = await import('html5-qrcode')
    try {
      const saved = JSON.parse(localStorage.getItem('HTML5_QRCODE_DATA') || '{}')
      localStorage.setItem('HTML5_QRCODE_DATA', JSON.stringify({ ...saved, lastUsedCameraId: null }))
    } catch {}
    for (let i = 0; i < 20 && !document.getElementById('qr-reader'); i++)
      await new Promise(r => setTimeout(r, 50))
    if (!document.getElementById('qr-reader')) { setScannerActive(false); return }
    // No qrbox: the whole frame is scannable, which avoids the library's
    // cropping overlay entirely and is more forgiving to aim at the gate.
    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 10,
      rememberLastUsedCamera: true, // keeps the permission flag; camera id is cleared above
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
    // Attributes only: calling play() here races the library's own start and
    // can make it drop the preview.
    clearInterval(patchRef.current)
    const started = Date.now()
    patchRef.current = setInterval(() => {
      const v = document.querySelector('#qr-reader video')
      if (v) {
        v.setAttribute('playsinline', 'true')
        v.setAttribute('webkit-playsinline', 'true')
        v.setAttribute('muted', 'true')
        v.muted = true
      }
      if (Date.now() - started > 20000) clearInterval(patchRef.current)
    }, 300)
  }

  // Order matters: the library has to tear its own nodes down while
  // #qr-reader is still mounted. Hiding the container first makes its
  // clear() throw "removeChild ... is not an instance of Node".
  async function stopScanner() {
    clearInterval(patchRef.current)
    const scanner = scannerRef.current
    scannerRef.current = null
    if (scanner) { try { await scanner.clear() } catch {} }
    releaseCamera()
    setScannerActive(false)
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
    await verifyGuest(guestId)
  }

  // Shared by the scanner and by picking a pass from the member's list.
  // Always re-reads the pass: a list on screen can be seconds out of date,
  // and another gate device may have used it in the meantime.
  async function verifyGuest(guestId) {
    const { data: guest } = await supabase
      .from('guests')
      .select('id, guest_name, email, phone, visit_date, member_id, checked_in_by, fee, paid, age_group, own_car, paid_by')
      .eq('id', guestId)
      .maybeSingle()
    if (!guest) return flash('Pass not found - verify the guest at the desk', 4000)
    // a pass is single-use: checked_in_by is stamped the first time it is used
    if (guest.checked_in_by) {
      setBlocked({ name: guest.guest_name, reason: `already used this pass — checked in by ${guest.checked_in_by}.` })
      return
    }
    const visitCount = await checkGuestVisits(guest.guest_name, guest.email, guest.phone)
    if (visitCount === null) return flash('Could not verify visit count - try again')
    if (visitCount > 4) {
      setBlocked({ name: guest.guest_name, reason: 'has reached the 4-visit season limit and may not be admitted.' })
      return
    }
    setScanResult({
      type: 'guest',
      guestId: guest.id,
      guestName: guest.guest_name,
      visitDate: guest.visit_date,
      memberId: guest.member_id,
      visitCount,
      fee: guest.fee,
      paid: guest.paid,
      paidBy: guest.paid_by,
      breakdown: feeBreakdown(guest),
    })
  }

  // ---------- member lookup ----------
  async function openMember(m) {
    setSearch('')
    setSearchResults([])
    setMember(m)
    setLoadingGuests(true)
    const [{ data }, { data: cars }, { data: house }] = await Promise.all([
      supabase.from('guests')
        .select('id, guest_name, email, phone, visit_date, fee, paid, checked_in_by, member_id, age_group, own_car, paid_by')
        .eq('member_id', m.member_id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('vehicles').select('id, make, model, color, license_plate').eq('member_id', m.member_id),
      supabase.from('household_members').select('id, full_name').eq('member_id', m.member_id),
    ])
    setMemberGuests(data || [])
    setMemberVehicles(cars || [])
    setMemberHousehold(house || [])
    setLoadingGuests(false)
  }

  function closeMember() {
    setMember(null)
    setMemberGuests([])
    setMemberVehicles([])
    setMemberHousehold([])
  }

  async function admitGuest() {
    if (!scanResult) return
    if (scanResult.type === 'guest') {
      // record the actual visit day so today's stats and check-in lists match.
      // .is('checked_in_by', null) makes this a claim: if another device got
      // there first, no row comes back and the pass is not reused
      const { data: claimed, error } = await supabase.from('guests')
        .update({ checked_in_by: admin.name, visit_date: today })
        .eq('id', scanResult.guestId)
        .is('checked_in_by', null)
        .select('id')
      if (error) return flash('Check-in failed — try again')
      if (!claimed?.length) {
        setScanResult(null)
        setBlocked({ name: scanResult.guestName, reason: 'was already checked in — that pass is used.' })
        return
      }
      // Notify the member via Edge Function (SMS with email fallback)
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
          <strong style={{ display: "flex", alignItems: "center", gap: 7 }}><Icon name="ban" size={17} /> Check-in blocked</strong><br />
          <strong>{blocked.name}</strong> {blocked.reason}
          <br /><br />
          <button className="btn-secondary" onClick={() => setBlocked(null)}>Dismiss</button>
        </div>
      )}

      {toast && <div className="success-box"><Icon name="check" size={15} />{toast}</div>}

      {scanResult ? (
        <div className="card" style={{ textAlign: 'center', border: '1px solid #5dcaa5' }}>
          <div style={{ fontSize: 12, color: '#0f6e56', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon name="checkCircle" size={15} /> Verified</div>
          {scanResult.type === 'guest' ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{scanResult.guestName}</div>
              <div style={{ fontSize: 12, color: '#6b6b6b' }}>Guest · Member {scanResult.memberId}</div>
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#f2f2f7', borderRadius: 8 }}>
                {scanResult.paid ? (
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f6e56' }}>Already paid — collect nothing</div>
                ) : (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>Collect ${scanResult.fee}</div>
                    {scanResult.breakdown && <div style={{ fontSize: 11, color: '#6b6b6b' }}>{scanResult.breakdown}</div>}
                    <div style={{ fontSize: 12, fontWeight: 600, color: scanResult.paidBy === 'guest' ? '#185fa5' : '#854f0b' }}>
                      {scanResult.paidBy === 'guest' ? 'from the guest' : "on the member's account"}
                    </div>
                  </>
                )}
              </div>
              {scanResult.visitCount >= 3 && (
                <div style={{ fontSize: 12, color: '#854f0b', marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon name="alertTriangle" size={14} /> {scanResult.visitCount} of 4 visits used this season</div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{scanResult.member.first_name} {scanResult.member.last_name}</div>
              <div style={{ fontSize: 12, color: '#6b6b6b' }}>{scanResult.member.member_id} · {scanResult.member.membership_type}</div>
            </>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn-green" style={{ flex: 1 }} onClick={admitGuest}>Admit</button>
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

          <div className="section-label">Vehicles on file</div>
          {memberVehicles.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', fontSize: 13, color: '#6b6b6b', padding: 16 }}>
              No vehicles registered.
            </div>
          ) : (
            <div className="list-card">
              {memberVehicles.map(v => (
                <div key={v.id} className="list-item">
                  <Icon name="car" size={20} style={{ color: 'var(--teal)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.5 }}>{v.license_plate || 'No plate'}</div>
                    <div style={{ fontSize: 11, color: '#6b6b6b' }}>
                      {[v.color, v.make, v.model].filter(Boolean).join(' ') || 'No details'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {memberHousehold.length > 0 && (
            <>
              <div className="section-label">Household ({memberHousehold.length})</div>
              <div className="list-card">
                {memberHousehold.map(h => (
                  <div key={h.id} className="list-item">
                    <div style={{ flex: 1, fontSize: 13 }}>{h.full_name}</div>
                  </div>
                ))}
              </div>
            </>
          )}

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
                      {fmtDate(g.visit_date)} · ${g.fee}{feeBreakdown(g) ? ` (${feeBreakdown(g)})` : ''}{' '}
                      <span className={`badge ${g.paid ? 'badge-green' : 'badge-amber'}`} style={{ marginLeft: 4 }}>
                        {g.paid ? 'Paid' : g.paid_by === 'guest' ? 'Guest pays' : 'Member pays'}
                      </span>
                    </div>
                  </div>
                  <button className="btn-teal" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => verifyGuest(g.id)}>
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
          <div className="qr-box"><Icon name="camera" size={38} strokeWidth={1.4} /></div>
          <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 14 }}>
            Point iPad camera at a guest pass QR code, or find the member by name below
          </div>
          <button className="btn-primary" onClick={startScanner}>Start QR Scanner</button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div id="qr-reader" style={{ width: '100%' }} />
          <div style={{ padding: 12 }}>
            <button className="btn-secondary" style={{ width: '100%', textAlign: 'center' }} onClick={stopScanner}>
              Close Camera
            </button>
          </div>
        </div>
      )}

      {/* Manual search */}
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

      {/* Recent check-ins */}
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
