import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { localDateStr } from '../lib/dates'

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
  const [blocked, setBlocked] = useState(false)
  const [blockedName, setBlockedName] = useState('')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [recentCheckins, setRecentCheckins] = useState([])
  const [toast, setToast] = useState('')
  const [scannerActive, setScannerActive] = useState(false)
  const [camStatus, setCamStatus] = useState('idle') // idle | starting | live
  const [camError, setCamError] = useState('')
  const scannerRef = useRef(null)
  const facingRef = useRef('environment') // back camera first
  const startSeq = useRef(0) // invalidates an in-flight start when Stop is hit

  const today = localDateStr()

  useEffect(() => {
    fetchRecentCheckins()
    return () => stopScanner()
  }, [])

  useEffect(() => {
    if (search.length > 1) searchMembers()
    else setSearchResults([])
  }, [search])

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

  // Direct camera control (no Html5QrcodeScanner widget: it remembers the
  // first camera choice in localStorage and auto-starts with it forever).
  async function startScanner(mode = 'environment') {
    const seq = ++startSeq.current
    setScannerActive(true)
    setCamStatus('starting')
    setCamError('')
    // ask for the camera synchronously inside the tap gesture; some
    // browsers refuse permission prompts that come after awaits
    const warmup = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } })
      : Promise.reject(Object.assign(new Error('This browser has no camera support'), { name: 'NotFoundError' }))
    warmup.catch(() => {}) // failure is handled at the await below
    const { Html5Qrcode } = await import('html5-qrcode')
    // the container renders with scannerActive; wait for it to exist
    for (let i = 0; i < 20 && !document.getElementById('qr-reader'); i++)
      await new Promise(r => setTimeout(r, 50))
    try {
      const stream = await warmup
      stream.getTracks().forEach(t => t.stop()) // permission secured; html5-qrcode opens its own
      if (seq !== startSeq.current || !document.getElementById('qr-reader')) return
      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner
      facingRef.current = mode
      const config = { fps: 10, qrbox: { width: 250, height: 250 } }
      const onScan = async (decodedText) => {
        if (scannerRef.current !== scanner) return // already stopping
        await stopScanner()
        await handleScan(decodedText)
      }
      try {
        await scanner.start({ facingMode: mode }, config, onScan, () => {})
      } catch {
        // some devices reject facingMode constraints; use any camera
        const cams = await Html5Qrcode.getCameras()
        if (!cams?.length) throw Object.assign(new Error('No camera found'), { name: 'NotFoundError' })
        await scanner.start(cams[0].id, config, onScan, () => {})
      }
      if (seq !== startSeq.current) { try { await scanner.stop() } catch {}; return }
      setCamStatus('live')
    } catch (e) {
      if (seq !== startSeq.current) return
      scannerRef.current = null
      setScannerActive(false)
      setCamStatus('idle')
      const name = e?.name || ''
      setCamError(
        name === 'NotAllowedError'
          ? 'Camera access is blocked for this site. Allow the camera in your browser settings, then try again.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : `Could not start the camera (${name || e?.message || 'unknown error'}).`
      )
    }
  }

  async function stopScanner() {
    startSeq.current++ // cancel any start still in flight
    const scanner = scannerRef.current
    scannerRef.current = null
    setScannerActive(false)
    setCamStatus('idle')
    if (scanner) {
      try { await scanner.stop() } catch {}
      try { scanner.clear() } catch {}
    }
  }

  async function flipCamera() {
    const next = facingRef.current === 'environment' ? 'user' : 'environment'
    await stopScanner()
    await startScanner(next)
  }

  async function handleScan(text) {
    // Parse SBCRI|{guest_id}|{guest_name}|{visit_date}|{member_id}
    const parts = text.split('|')
    if (parts[0] !== 'SBCRI' || parts.length < 5) {
      setToast('Invalid QR code')
      setTimeout(() => setToast(''), 3000)
      return
    }
    const [, guestId] = parts

    // The pass must exist as a registered guest row - everything else on the
    // QR is display text and can be forged. Identity comes from the database.
    const { data: guest } = await supabase
      .from('guests')
      .select('id, guest_name, email, phone, visit_date, member_id')
      .eq('id', guestId)
      .maybeSingle()
    if (!guest) {
      setToast('Pass not found - verify the guest at the desk')
      setTimeout(() => setToast(''), 4000)
      return
    }

    // Check 4-visit rule using the registered identity (name + email + phone).
    // The scanned pass already exists as a row, so a guest on their legitimate
    // 4th visit counts 4 - block only beyond that.
    const visitCount = await checkGuestVisits(guest.guest_name, guest.email, guest.phone)
    if (visitCount === null) {
      setToast('Could not verify visit count - try again')
      setTimeout(() => setToast(''), 3000)
      return
    }
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

  async function selectMember(member) {
    setSearch('')
    setSearchResults([])
    setScanResult({ type: 'member', member })
  }

  async function admitGuest() {
    if (!scanResult) return
    if (scanResult.type === 'guest') {
      // record the actual visit day so today's stats and check-in lists match
      const { error } = await supabase.from('guests')
        .update({ checked_in_by: admin.name, visit_date: today })
        .eq('id', scanResult.guestId)
      if (error) {
        setToast('Check-in failed — try again')
        setTimeout(() => setToast(''), 3000)
        return
      }
      // Notify the member via Edge Function (SMS with email fallback)
      await supabase.functions.invoke('send-checkin-sms', {
        body: { guest_name: scanResult.guestName, member_id: scanResult.memberId }
      })
    }
    setScanResult(null)
    setToast('Check-in recorded — member notified')
    fetchRecentCheckins()
    setTimeout(() => setToast(''), 3000)
  }

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

      {camError && (
        <div className="error-box">
          <strong>📷 Camera problem</strong><br />
          {camError}
          <br /><br />
          <button className="btn-secondary" onClick={() => setCamError('')}>Dismiss</button>
        </div>
      )}

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
            <button className="btn-green" style={{ flex: 1 }} onClick={admitGuest}>Admit</button>
            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setScanResult(null)}>Cancel</button>
          </div>
        </div>
      ) : !scannerActive ? (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div className="qr-box">📷</div>
          <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 14 }}>
            Point iPad camera at member or guest QR code
          </div>
          <button className="btn-primary" onClick={() => startScanner()}>Start QR Scanner</button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div id="qr-reader" style={{ width: '100%' }} />
          {camStatus === 'starting' && (
            <div style={{ textAlign: 'center', padding: '20px 12px', fontSize: 13, color: '#6b6b6b' }}>
              Starting camera… allow access if prompted.
            </div>
          )}
          <div style={{ padding: 12, display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ flex: 1, textAlign: 'center' }} onClick={flipCamera}>🔄 Flip Camera</button>
            <button className="btn-secondary" style={{ flex: 1, textAlign: 'center' }} onClick={stopScanner}>✕ Stop Camera</button>
          </div>
        </div>
      )}

      {/* Manual search */}
      <div className="section-label">Manual search</div>
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
            <div key={m.member_id} className="list-item">
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{m.first_name} {m.last_name}</div>
                <div style={{ fontSize: 11, color: '#6b6b6b' }}>{m.member_id} · {m.membership_type}</div>
              </div>
              <button className="btn-teal" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => selectMember(m)}>Select</button>
            </div>
          ))}
        </div>
      )}

      {/* Recent check-ins */}
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
    </div>
  )
}
