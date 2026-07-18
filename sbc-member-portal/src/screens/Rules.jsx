import { useState } from 'react'

const RULES = [
  { id: 'hours', title: 'Facilities & Hours', items: [
    { text: 'Season: June 20 – Labor Day' },
    { text: 'Lifeguards: 9:30 AM – 5:00 PM daily' },
    { text: 'Beach after 5:00 PM at your own risk' },
    { text: 'Snack bar hours vary by weather' },
    { text: 'Cabana decks reserved for cabana patrons only' },
    { text: 'No overnight sleeping · No cooking in cabanas' },
  ]},
  { id: 'guests', title: 'Guests', items: [
    { text: "All guests must be checked in under a member's name" },
    { text: 'Guests must check in immediately at the gate upon arrival — including guests in your vehicle', hi: true },
    { text: 'Failure to check in guests will result in revocation of membership', hi: true },
    { text: 'Same guest: max 4 visits/season across all members' },
    { text: 'Visitors from adjacent beaches must sign in and pay guest fees' },
    { text: 'Valid photo ID required for all guests' },
  ]},
  { id: 'beach', title: 'Beach Rules', items: [
    { text: 'No glass on the beach' },
    { text: 'No radios — headphones only' },
    { text: 'No surfboards 9 AM – 6 PM' },
    { text: 'Fins, masks, floats in designated areas only' },
    { text: 'Ball/Frisbee in designated areas only' },
    { text: 'No fireworks' },
    { text: 'No fire/grilling except designated area, 5–9 PM' },
    { text: 'No tents or pop-ups — umbrellas only' },
    { text: 'No dogs or pets' },
    { text: 'No picnicking on beach — outside food in picnic area only' },
    { text: 'No smoking on property' },
  ]},
  { id: 'parking', title: 'Parking & Stickers', items: [
    { text: 'Family: max 2 stickers · Single: 1 sticker' },
    { text: 'Stickers not transferable' },
    { text: 'Park where directed by attendants' },
    { text: 'Vehicles without a sticker will be charged the standard parking fee' },
    { text: 'Vehicles without a sticker will be charged $200 to park on July 3–5 and September 5–7', hi: true },
  ]},
  { id: 'membership', title: 'Membership', items: [
    { text: 'All fees due by May 1 or membership cancelled' },
    { text: 'All outstanding guest fees must be paid by the Sunday of Labor Day weekend — late fees applied to all remaining balances after that date' },
    { text: 'Memberships, cabanas, bathhouses not transferable' },
    { text: 'No sharing cabanas without management approval' },
    { text: "Children's parties after 6 PM require approval" },
    { text: 'Misrepresentation voids membership' },
    { text: 'Management may refuse or dismiss any member or guest' },
  ]},
]

export default function Rules() {
  // collapsed by default so the page reads as dropdowns; first section open
  const [open, setOpen] = useState({ [RULES[0].id]: true })
  const toggle = id => setOpen(o => ({ ...o, [id]: !o[id] }))

  return (
    <div className="screen">
      <div className="warn-box">
        ⚠️ All members and guests are responsible for knowing and following these rules.
      </div>
      {RULES.map(sec => {
        const isOpen = !!open[sec.id]
        return (
          <div key={sec.id} className="rule-section">
            <div className="rule-header" onClick={() => toggle(sec.id)}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{sec.title}</span>
              <span style={{ fontSize: 12, color: '#6b6b6b' }}>{isOpen ? '▲' : '▼'}</span>
            </div>
            <div className={`rule-body ${isOpen ? 'open' : ''}`}>
              {sec.items.map((item, i) => (
                <div key={i} className="rule-item">
                  <div className="rule-dot" style={{ background: item.hi ? '#a32d2d' : '#50a2ad' }} />
                  <div style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: item.hi ? '#a32d2d' : '#1a1a1a',
                    fontWeight: item.hi ? 500 : 400,
                  }}>
                    {item.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <div className="card" style={{ textAlign: 'center', fontSize: 12, color: '#6b6b6b' }}>
        Questions? 401-322-0201.
      </div>
    </div>
  )
}
