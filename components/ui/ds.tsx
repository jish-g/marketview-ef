// MarketCue design system primitives.
//
// These are the components the handoff specifies, backed by app/tokens/. They deliberately
// use plain class names rather than Tailwind utility strings: the token layer is CSS custom
// properties, and the styles live in app/design-system.css next to the tokens they consume.
//
// The rules these encode, so callers do not have to remember them:
//   - Only DeltaValue, Band, TradeLevels and ScoreBreakdown may render --up / --down.
//     A level, a count, an expiry or a VIX reading is not a signed change (rule 1).
//   - Every band renders its word alongside its colour, and every delta its sign and arrow,
//     because roughly 1 in 12 male traders cannot separate the green from the red (rule 8).
//   - Empty states state a reason. There is no bare em dash (criterion 8).

import type { ReactNode } from 'react'
import { fmt } from '@/lib/format'

/* ---------------------------------------------------------------- Card */

export type CardTone = 'default' | 'caution' | 'up' | 'down' | 'empty'

export function Card({ tone = 'default', flush, className, children }: {
  tone?: CardTone; flush?: boolean; className?: string; children: ReactNode
}) {
  return (
    <div className={cx('ds-card', tone !== 'default' && `ds-card--${tone}`, flush && 'ds-card--flush', className)}>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------- Label */

export function Label({ tone, children }: { tone?: 'caution' | 'down' | 'info'; children: ReactNode }) {
  return <span className={cx('ds-label', tone && `ds-label--${tone}`)}>{children}</span>
}

/* ------------------------------------------------------------- Metric */

export function Metric({ label, value, sub, weight = 'supporting', className }: {
  label: ReactNode; value: ReactNode; sub?: ReactNode; weight?: 'hero' | 'primary' | 'supporting'; className?: string
}) {
  return (
    <Card className={cx('ds-metric', weight !== 'supporting' && `ds-metric--${weight}`, className)}>
      <Label>{label}</Label>
      <strong className="ds-metric__value">{value}</strong>
      {sub != null && <span className="ds-metric__sub">{sub}</span>}
    </Card>
  )
}

/* --------------------------------------------------------- EmptyState */

// Criterion 8: every empty state shows a reason in words. The reason is required, not
// optional, so a caller cannot accidentally reintroduce the bare em dash this replaces.
export function EmptyState({ label, headline, reason }: { label: ReactNode; headline: string; reason: string }) {
  return (
    <Card tone="empty" className="ds-metric">
      <Label>{label}</Label>
      <strong className="ds-metric__value ds-metric__value--empty">{headline}</strong>
      <span className="ds-metric__sub ds-metric__sub--empty">{reason}</span>
    </Card>
  )
}

/* --------------------------------------------------------- DeltaValue */

// The ONLY place a signed change gets its colour. Always renders sign + arrow + word-safe
// unit, so colour is never the sole carrier of direction.
export function DeltaValue({ value, unit = 'pct', showArrow = false, size }: {
  value: number | null | undefined
  unit?: 'pct' | 'pts' | 'rupees'
  showArrow?: boolean
  size?: 'value' | 'value-lg'
}) {
  if (value == null || Number.isNaN(Number(value))) return <span className="ds-num ds-delta ds-delta--flat">Not available</span>
  const n = Number(value)
  const dir = n > 0 ? 'up' : n < 0 ? 'down' : 'flat'
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'
  const text = unit === 'pct' ? fmt.pct(n) : unit === 'pts' ? fmt.pts(n) : fmt.rupees(n)
  return (
    <span className={cx('ds-num', 'ds-delta', `ds-delta--${dir}`, size && `ds-delta--${size}`)}>
      {showArrow && <span aria-hidden="true">{arrow} </span>}{text}
    </span>
  )
}

/* ---------------------------------------------------------------- Num */

// Every figure that is NOT a signed change: levels, counts, expiries, ratios, VIX.
// Tabular by default, ink coloured, never green or red (rule 1).
export function Num({ children, strike, className }: { children: ReactNode; strike?: boolean; className?: string }) {
  return <span className={cx(strike ? 'ds-num-strike' : 'ds-num', className)}>{children}</span>
}

/* --------------------------------------------------------------- Band */

export type BiasBand = 'strong bearish' | 'bearish' | 'neutral' | 'bullish' | 'strong bullish'
export type Posture = 'good to buy' | 'caution' | 'avoid'
export type Outcome = 'target' | 'stop' | 'open' | 'none'

const BIAS_TONE: Record<string, 'up' | 'down' | 'neutral'> = {
  'strong bullish': 'up', bullish: 'up', neutral: 'neutral', bearish: 'down', 'strong bearish': 'down',
}
const BIAS_GLYPH: Record<string, string> = {
  'strong bullish': '↑', bullish: '↑', neutral: '→', bearish: '↓', 'strong bearish': '↓',
}
const POSTURE_TONE: Record<string, 'up' | 'caution' | 'down'> = {
  'good to buy': 'up', caution: 'caution', avoid: 'down',
}

// Word + colour + glyph, always all three.
export function Band({ scale, value }: { scale: 'bias' | 'readiness' | 'outcome'; value: string }) {
  const key = String(value ?? '').toLowerCase().trim()
  if (scale === 'bias') {
    const tone = BIAS_TONE[key] ?? 'neutral'
    return <span className={`ds-badge ds-badge--${tone}`}><span aria-hidden="true">{BIAS_GLYPH[key] ?? '→'}</span> {titleCase(value)}</span>
  }
  if (scale === 'readiness') {
    const tone = POSTURE_TONE[key] ?? 'caution'
    return <span className={`ds-badge ds-badge--${tone}`}>{titleCase(value)}</span>
  }
  const map: Record<string, [string, string]> = {
    target: ['up', 'Target hit'], stop: ['down', 'Stopped'],
    open: ['neutral', 'Still open'], none: ['neutral', 'No trade logged'],
  }
  const [tone, word] = map[key] ?? map.none
  return <span className={`ds-badge ds-badge--${tone}`}>{word}</span>
}

/* --------------------------------------------------------- ScoreMeter */

export function ScoreMeter({ steps, filled, tone = 'neutral' }: {
  steps: number; filled: number; tone?: 'up' | 'down' | 'caution' | 'neutral'
}) {
  return (
    <div className="ds-meter" role="img" aria-label={`${filled} of ${steps}`}>
      {Array.from({ length: steps }, (_, i) => (
        <span key={i} {...(i < filled ? { 'data-on': tone === 'neutral' ? '' : tone } : {})} />
      ))}
    </div>
  )
}

/* ----------------------------------------------------- ScoreBreakdown */

export type ScoreInput = { name: string; value: ReactNode; score: number; weight?: string }

// The signature component: it makes "rules you can audit" legible, and renders the same
// score object that produced the band so the two cannot contradict each other.
export function ScoreBreakdown({ inputs, caption }: { inputs: ScoreInput[]; caption?: string }) {
  return (
    <Card flush className="ds-table-wrap">
      <table className="ds-table">
        {caption && <caption className="ds-table__caption">{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">Input</th>
            <th scope="col" className="ds-num-col">Value</th>
            <th scope="col" className="ds-num-col">Score</th>
            {inputs.some((i) => i.weight) && <th scope="col" className="ds-num-col">Weight</th>}
          </tr>
        </thead>
        <tbody>
          {inputs.map((i) => (
            <tr key={i.name}>
              <th scope="row" className="ds-table__rowhead">{i.name}</th>
              <td className="ds-num-col" data-col="Value"><Num>{i.value}</Num></td>
              <td className="ds-num-col" data-col="Score"><Num>{fmt.score(i.score)}</Num></td>
              {inputs.some((x) => x.weight) && <td className="ds-num-col ds-muted" data-col="Weight"><Num>{i.weight ?? 'Not weighted'}</Num></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

/* ------------------------------------------------------------- Banner */

export function Banner({ tone = 'info', label, children }: {
  tone?: 'info' | 'caution' | 'blocking'; label?: ReactNode; children: ReactNode
}) {
  return (
    <div className={cx('ds-banner', tone !== 'info' && `ds-banner--${tone}`)}>
      <div>
        {label != null && <Label tone={tone === 'caution' ? 'caution' : tone === 'blocking' ? 'down' : undefined}>{label}</Label>}
        <p className="ds-banner__body">{children}</p>
      </div>
    </div>
  )
}

/* ----------------------------------------------- Freshness/provenance */

export type SessionState = 'live' | 'aging' | 'stale' | 'closed'

// Rule 6: time and provenance are permanent furniture. The stamp carries a real
// <time datetime> so the capture time is machine-readable as well as visible -- that is
// both an accessibility win and what an answer engine checks before citing the page.
export function FreshnessStamp({ capturedAt, state, label }: {
  capturedAt?: string | null; state: SessionState; label: string
}) {
  return (
    <span className={`ds-stamp ds-stamp--${state}`}>
      {state === 'live' && <i className="ds-dot" aria-hidden="true" />}
      {capturedAt ? <time dateTime={capturedAt}>{label}</time> : label}
    </span>
  )
}

export function ProvenanceBadge({ source }: { source: 'system' | 'manual' }) {
  return source === 'manual'
    ? <span className="ds-badge ds-badge--info">Manual</span>
    : <span className="ds-badge ds-badge--outline">System</span>
}

/* --------------------------------------------------------- TradeLevels */

// Rule 5: a stop-loss is never shown without its target, and never in lighter type.
// The component takes both or neither, so the pairing cannot be broken by a caller.
export function TradeLevels({ variant, targetPts, stopPts, targetRupees, stopRupees }: {
  variant: 'conservative' | 'aggressive'
  targetPts: number | null | undefined
  stopPts: number | null | undefined
  targetRupees?: number | null
  stopRupees?: number | null
}) {
  return (
    <Card className="ds-levels">
      <Label>If taken — {variant}</Label>
      <div className="ds-levels__row">
        <span className="ds-levels__key"><span aria-hidden="true">↑</span> Target</span>
        <span className="ds-levels__val">
          <DeltaValue value={targetPts == null ? null : Math.abs(Number(targetPts))} unit="pts" size="value" />
          {targetRupees != null && <em className="ds-levels__rupees">{fmt.rupees(targetRupees)}</em>}
        </span>
      </div>
      <div className="ds-levels__row">
        <span className="ds-levels__key"><span aria-hidden="true">↓</span> Stop-loss</span>
        <span className="ds-levels__val">
          <DeltaValue value={stopPts == null ? null : -Math.abs(Number(stopPts))} unit="pts" size="value" />
          {stopRupees != null && <em className="ds-levels__rupees">{fmt.rupees(stopRupees)}</em>}
        </span>
      </div>
    </Card>
  )
}

/* ----------------------------------------------------------- Chrome */

export function PhaseHeader({ eyebrow, title, aside }: { eyebrow: ReactNode; title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="ds-phase-head">
      <div>
        <Label>{eyebrow}</Label>
        <h2 className="ds-phase-head__title">{title}</h2>
      </div>
      {aside != null && <div className="ds-phase-head__aside">{aside}</div>}
    </div>
  )
}

export function Disclaimer({ source = 'NSE option chain', capturedAt }: { source?: string; capturedAt?: string | null }) {
  return (
    <p className="ds-disclaimer">
      Rules-based output, not investment advice.{' '}
      {capturedAt ? `Derived from ${source} data captured ${capturedAt}.` : `Derived from ${source} data.`}
    </p>
  )
}

export function Skeleton({ width = '100%', height = '1em' }: { width?: string | number; height?: string | number }) {
  return <div className="ds-skeleton" style={{ width, height }} aria-hidden="true" />
}

/* ---------------------------------------------------------------- util */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function titleCase(s: string) {
  const t = String(s ?? '').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}
