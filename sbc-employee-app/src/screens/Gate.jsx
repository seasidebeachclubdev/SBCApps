// Gate check-in for gate-role staff - same flow as the admin dashboard's
// Gate screen: scan a pass (or search a member), verify against the
// database, enforce the 4-visit rule, admit, notify the member.
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
  const scannerRef = useRef(null)
  const facingRef = useRef('environment') // back camera first

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
    setScannerActive(true)
    const { Html5Qrcode } = await import('html5-qrcode')
    // the container renders with scannerActive; wait for it to exist
    for (let i = 0; i < 20 && !document.getElementById('qr-reader'); i++)
      await new Promise(r => setTimeout(r, 50))
    if (!document.getElementById('qr-reader')) { setScannerActive(false); return }
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner
    facingRef.current = mode
    try {
      await scanner.start(
        { facingMode: mode },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (scannerRef.current !== scanner) return // already stopping
          await stopScanner()
          await handleScan(decodedText)
        },
        () => {} // per-frame decode misses are normal
      )
    } catch {
      scannerRef.current = null
      setScannerActive(false)
      setToast('Could not start the camera — check camera permission')
      setTimeout(() => setToast(''), 4000)
    }
  }

  async function stopScanner() {
    const scanner = scannerRef.current
    scannerRef.current = null
    setScannerActive(false)
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
    const parts = text.split('|')
    if (parts[0] !== 'SBCRI' || parts.length < 5) {
      setToast('Invalid QR code')
      setTimeout(() => setToast(''), 3000)
      return
    }
    const [, guestId] = parts

    // identity comes from the database row, not the QR text
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
      const { error } = await supabase.from('guests')
        .update({ checked_in_by: employee.name, visit_date: today })
        .eq('id', scanResult.guestId)
      if (error) {
        setToast('Check-in failed — try again')
        setTimeout(() => setToast(''), 3000)
        return
      }
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
      ) : !scannerActive ? (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
          <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 14 }}>
            Point the camera at a guest pass QR code
          </div>
          <button className="btn-primary" onClick={() => startScanner()}>Start QR Scanner</button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div id="qr-reader" style={{ width: '100%' }} />
          <div style={{ padding: 12, display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ flex: 1, textAlign: 'center' }} onClick={flipCamera}>🔄 Flip Camera</button>
            <button className="btn-secondary" style={{ flex: 1, textAlign: 'center' }} onClick={stopScanner}>✕ Stop Camera</button>
          </div>
        </div>
      )}

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
