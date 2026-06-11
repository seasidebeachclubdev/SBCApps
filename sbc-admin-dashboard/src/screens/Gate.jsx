import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// QR format: SBCRI|{guest_id}|{guest_name}|{visit_date}|{member_id}
// Counts via the security-definer RPC so name/email/phone matching follows
// the same rules as registration. Returns null when the check fails.
async function checkGuestVisits(guestName) {
  const { data: count, error } = await supabase.rpc('guest_visit_count', {
    p_name: guestName, p_email: '', p_phone: '',
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
  const scannerRef = useRef(null)

  const today = new Date().toISOString().slice(0, 10)

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

  async function startScanner() {
    setScannerActive(true)
    // Dynamically import html5-qrcode
    const { Html5QrcodeScanner } = await import('html5-qrcode')
    const scanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 250, height: 250 } })
    scannerRef.current = scanner
    scanner.render(
      async (decodedText) => {
        scanner.clear()
        setScannerActive(false)
        await handleScan(decodedText)
      },
      (err) => console.warn('QR scan error:', err)
    )
  }

  function stopScanner() {
    if (scannerRef.current) {
      try { scannerRef.current.clear() } catch {}
      scannerRef.current = null
    }
    setScannerActive(false)
  }

  async function handleScan(text) {
    // Parse SBCRI|{guest_id}|{guest_name}|{visit_date}|{member_id}
    const parts = text.split('|')
    if (parts[0] !== 'SBCRI' || parts.length < 5) {
      setToast('Invalid QR code')
      setTimeout(() => setToast(''), 3000)
      return
    }
    const [, guestId, guestName, visitDate, memberId] = parts

    // Check 4-visit rule. The scanned pass already exists as a row, so a
    // guest on their legitimate 4th visit counts 4 - block only beyond that.
    const visitCount = await checkGuestVisits(guestName)
    if (visitCount === null) {
      setToast('Could not verify visit count - try again')
      setTimeout(() => setToast(''), 3000)
      return
    }
    if (visitCount > 4) {
      setBlocked(true)
      setBlockedName(guestName)
      return
    }

    setScanResult({ type: 'guest', guestId, guestName, visitDate, memberId, visitCount })
  }

  async function selectMember(member) {
    setSearch('')
    setSearchResults([])
    setScanResult({ type: 'member', member })
  }

  async function admitGuest() {
    if (!scanResult) return
    if (scanResult.type === 'guest') {
      await supabase.from('guests')
        .update({ checked_in_by: admin.name })
        .eq('id', scanResult.guestId)
      // Trigger SMS to member via Edge Function
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
          <button className="btn-primary" onClick={startScanner}>Start QR Scanner</button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div id="qr-reader" style={{ width: '100%' }} />
          <div style={{ padding: 12 }}>
            <button className="btn-secondary" style={{ width: '100%', textAlign: 'center' }} onClick={stopScanner}>Cancel scan</button>
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
