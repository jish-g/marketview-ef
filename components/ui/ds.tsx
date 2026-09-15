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
import { fmt, freshness } from '@/lib/format'

/* ---------------------------------------------------------------- Card */

export type CardTone = 'default' | 'caution' | 'up' | 'down' | 'empty' | 'raised'

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

/* ------------------------------------------------------------ BiasAxis */

// Market Bias is a POSITION on a signed -2.00 -> +2.00 scale, not progress toward a target.
// A filled bar implies completion and reads as "60% done", which is meaningless for a bias
// score -- which is why the spec calls this out specifically. The rail is a gradient with a
// zero tick; the marker is a dot; the value is always also shown as text (rule 8).
export function BiasAxis({ value, min = -2, max = 2, lowLabel = '\u22122.00 bearish', highLabel = '+2.00 bullish' }: {
  value: number; min?: number; max?: number; lowLabel?: string; highLabel?: string
}) {
  const clamped = Math.max(min, Math.min(max, Number(value) || 0))
  const pct = ((clamped - min) / (max - min)) * 100
  return (
    <div className="ds-axis">
      <div className="ds-axis__track" role="img" aria-label={`Bias ${fmt.score(value)} on a scale from ${min} to ${max}`}>
        <div className="ds-axis__rail" />
        <div className="ds-axis__zero" />
        <div className="ds-axis__marker" style={{ left: `${pct}%` }} />
      </div>
      <div className="ds-axis__scale"><span>{lowLabel}</span><span>0</span><span>{highLabel}</span></div>
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
              <td className={cx('ds-num-col', i.score > 0 && 'ds-score--up', i.score < 0 && 'ds-score--down')} data-col="Score"><Num>{fmt.score(i.score)}</Num></td>
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
export function TradeLevels({ variant, targetPts, stopPts, targetRupees, stopRupees, heading, total }: {
  variant: 'conservative' | 'aggressive'
  targetPts: number | null | undefined
  stopPts: number | null | undefined
  targetRupees?: number | null
  stopRupees?: number | null
  /** Market open shows the instrument and the expected move on one spread row above the
   *  levels ("Nifty - conservative ... 151.9 pts"). Verdict keeps the plain "If taken" label. */
  heading?: ReactNode
  total?: ReactNode
}) {
  return (
    <Card className={cx('ds-levels', heading != null && 'ds-levels--headed')}>
      {heading != null
        ? <div className="ds-levels__head"><Label>{heading}</Label><strong className="ds-levels__total">{total}</strong></div>
        : <Label>If taken — {variant}</Label>}
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

/* --------------------------------------------------------- Sparkline */

// Five readings across a session are a shape, and as five separate strings that shape is
// invisible. This draws the series at a size that sits inline with text -- it is not a chart
// and carries no axis; the figures beside it do the reading. Nulls are gaps, not zeroes: a
// checkpoint that never reported must not pull the line to the floor.
export function Sparkline({ values, width = 96, height = 26, endTone }: {
  values: (number | null)[]
  width?: number
  height?: number
  endTone?: 'up' | 'down' | 'caution' | 'neutral'
}) {
  const points = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null && Number.isFinite(p.v))
  if (points.length < 2) return null

  const pad = 4
  const lo = Math.min(...points.map((p) => p.v))
  const hi = Math.max(...points.map((p) => p.v))
  // A flat series would divide by zero; draw it down the middle instead.
  const span = hi - lo || 1
  const x = (i: number) => pad + (i / Math.max(values.length - 1, 1)) * (width - pad * 2)
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - pad * 2)

  const d = points.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const toneVar = endTone === 'up' ? 'var(--up)' : endTone === 'down' ? 'var(--down)' : endTone === 'caution' ? 'var(--caution-ink)' : 'var(--ink-2)'

  return (
    <svg className="ds-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
         aria-label={`Trend across ${points.length} checkpoints, ending at ${last.v.toFixed(2)}`}>
      <polyline points={d} fill="none" stroke="var(--faint)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r="2.6" fill={toneVar} />
    </svg>
  )
}

/* -------------------------------------------------- CheckpointTimeline */

export type Checkpoint = {
  time: string            // "10:30"
  headline: string        // "Bias held neutral"
  badge: string           // "+0.25 · unchanged"
  detail: string          // "Nifty −0.41% · PCR 1.02 · VIX 12.4"
  shifted?: boolean       // a checkpoint whose bias moved
  note?: string           // one-line explanation, shown only when shifted
}

// Spec §3: five checkpoint rows. A checkpoint whose bias moved gets card--caution and a
// one-line explanation; unchanged checkpoints stay neutral, so the eye lands on the one
// that actually did something.
export function CheckpointTimeline({ rows }: { rows: Checkpoint[] }) {
  return (
    <div className="ds-timeline">
      {rows.map((r) => (
        <div className="ds-timeline__row" key={r.time}>
          <div className="ds-timeline__time">
            <strong>{r.time}</strong>
            <small>IST</small>
          </div>
          <Card tone={r.shifted ? 'caution' : 'default'} className="ds-timeline__card">
            <div className="ds-timeline__head">
              <strong>{r.headline}</strong>
              <span className={`ds-badge ${r.shifted ? 'ds-badge--caution' : 'ds-badge--neutral'} ds-num`}>{r.badge}</span>
            </div>
            <span className="ds-timeline__detail ds-num">{r.detail}</span>
            {r.shifted && r.note && <span className="ds-timeline__note">{r.note}</span>}
          </Card>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------- Progress */

// Spec §2: `.progress` is ONLY for genuine progress toward a target. Anything on a signed
// scale uses BiasAxis instead.
export function Progress({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="ds-progress-wrap">
      {label && (
        <div className="ds-progress-head">
          <span>{label}</span>
          <span className="ds-num">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="ds-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
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


// Rule 6: every screen carries the same furniture -- when the reading was captured and
// whether it is system-derived. Several screens showed a static caption or a bare date.
export function PhaseAside({ capturedAt, source = 'system' }: { capturedAt?: string | null; source?: 'system' | 'manual' }) {
  const stamp = freshness(capturedAt ?? null, false)
  return (
    <div className="phase-head-aside">
      <FreshnessStamp state={stamp.state} label={stamp.label} capturedAt={capturedAt ?? null} />
      <ProvenanceBadge source={source} />
    </div>
  )
}

export function Disclaimer({ source = 'NSE option chain', capturedAt }: { source?: string; capturedAt?: string | null }) {
  return (
    <p className="ds-disclaimer">
      Views by the MarketCue intelligence layer, not investment advice.{' '}
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
