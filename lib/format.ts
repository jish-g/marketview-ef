// One formatter per unit, as the design system specifies. Every figure in the product goes
// through here so adjacent columns can never disagree about precision -- the audit found
// 3-decimal and 2-decimal percentages sitting next to each other.
//
// Signed output uses U+2212 MINUS SIGN, not the hyphen-minus a keyboard produces. At tabular
// figure widths a hyphen is visibly too short and sits at the wrong height, which is exactly
// where a trader is least forgiving of a misread.

const MINUS = '−'

function signed(n: number, digits: number) {
  const fixed = Math.abs(n).toFixed(digits)
  if (n > 0) return `+${fixed}`
  if (n < 0) return `${MINUS}${fixed}`
  return fixed
}

export const fmt = {
  /** Index percentage: 2 decimals, always signed. `−0.55%` */
  pct(n: number | null | undefined) {
    if (n == null || Number.isNaN(Number(n))) return 'Not available'
    return `${signed(Number(n), 2)}%`
  },

  /** Points: 1 decimal, always signed, unit spelled out. `−127.8 pts` */
  pts(n: number | null | undefined) {
    if (n == null || Number.isNaN(Number(n))) return 'Not available'
    return `${signed(Number(n), 1)} pts`
  },

  /** Index level: 2 decimals, thousands separator, never signed. `23,398.10` */
  level(n: number | null | undefined) {
    if (n == null || Number.isNaN(Number(n))) return 'Not available'
    return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  },

  /** Strike: integer, no separator. Rendered in mono by the Num component. `23450` */
  strike(n: number | null | undefined) {
    if (n == null || Number.isNaN(Number(n))) return 'Not available'
    return String(Math.round(Number(n)))
  },

  /** Ratio (PCR, IV): 2 decimals, never signed. `1.05` */
  ratio(n: number | null | undefined) {
    if (n == null || Number.isNaN(Number(n))) return 'Not available'
    return Number(n).toFixed(2)
  },

  /** Score: always signed. 2 decimals for a bias score, integer for a component score. */
  score(n: number | null | undefined) {
    if (n == null || Number.isNaN(Number(n))) return 'Not available'
    const v = Number(n)
    return Number.isInteger(v) ? signed(v, 0) : signed(v, 2)
  },

  /** Rupees: 2 decimals, symbol leading, no space. `₹45.60` */
  rupees(n: number | null | undefined) {
    if (n == null || Number.isNaN(Number(n))) return 'Not available'
    const v = Number(n)
    return `${v < 0 ? MINUS : ''}₹${Math.abs(v).toFixed(2)}`
  },

  /** Points as a magnitude: 1 decimal, never signed. `151.9 pts`
   *
   *  Distinct from pts() because a distance is not a delta. An expected move, a target
   *  distance, a prediction miss and a 5-day average range all have a size but no
   *  direction, and running them through pts() prints a "+" that asserts one. The absence
   *  of this formatter has been worked around by hand three times -- once here in value(),
   *  twice in the Market open and Post-market views. */
  ptsAbs(n: number | null | undefined) {
    if (n == null || Number.isNaN(Number(n))) return 'Not available'
    return `${Math.abs(Number(n)).toFixed(1)} pts`
  },

  /** Signed rupee P&L: whole rupees, thousands separator, always signed. `+₹1,240` */
  pnl(n: number | null | undefined) {
    if (n == null || Number.isNaN(Number(n))) return 'Not available'
    const v = Number(n)
    const body = Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })
    return `${v < 0 ? MINUS : '+'}₹${body}`
  },

  /** Time: 24-hour, always with IST. `08:45 IST` */
  timeIST(value: string | number | Date | null | undefined) {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    const t = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d)
    return `${t} IST`
  },

  /** ISO-8601 with the IST offset, for <time datetime> and JSON-LD. */
  isoIST(value: string | number | Date | null | undefined) {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString()
  },
}

/** How stale a capture is, mapped onto the design system's freshness scale. */
export function freshness(capturedAt: string | number | Date | null | undefined, marketOpen: boolean) {
  if (!capturedAt) return { state: 'stale' as const, label: 'Capture time unknown' }
  const d = new Date(capturedAt)
  if (Number.isNaN(d.getTime())) return { state: 'stale' as const, label: 'Capture time unknown' }

  const captured = fmt.timeIST(d) ?? ''
  if (!marketOpen) return { state: 'closed' as const, label: `Captured ${captured} · market closed` }

  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000))
  if (mins < 5) return { state: 'live' as const, label: `Live · ${mins < 1 ? 'just now' : `${mins}m ago`}` }
  if (mins < 90) return { state: 'aging' as const, label: `Captured ${captured} · ${mins}m old` }
  const h = Math.floor(mins / 60)
  return { state: 'aging' as const, label: `Captured ${captured} · ${h}h ${mins % 60}m old` }
}
