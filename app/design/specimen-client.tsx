'use client'

import { useState } from 'react'

type Mode = 'dark' | 'light'

// The specimen renders the design system against app/tokens/ so the tokens can be reviewed in
// the real app, in both modes, before any view migrates onto them. Mode is a class on this
// page's own wrapper rather than on <html>, so previewing light here cannot flip the rest of
// the app -- the handoff wants each surface to pin its own mode.
export function SpecimenClient() {
  const [mode, setMode] = useState<Mode>('dark')

  return (
    <div className={`ds ${mode}`} style={{ minHeight: '100vh' }}>
      <div className="ds-topbar">
        <div className="row" style={{ gap: 10 }}>
          <strong style={{ fontSize: 15 }}>MarketCue design system</strong>
          <span className="badge badge--outline">Reference v1</span>
        </div>
        <div className="segmented" role="group" aria-label="Theme">
          <button type="button" aria-pressed={mode === 'dark'} onClick={() => setMode('dark')}>Dark · app</button>
          <button type="button" aria-pressed={mode === 'light'} onClick={() => setMode('light')}>Light · reads</button>
        </div>
      </div>

      <div className="ds-doc">
        <section>
          <span className="label">Reference implementation</span>
          <h1 style={{ fontSize: 'var(--text-display)', margin: 'var(--s-3) 0 var(--s-4)' }}>Tokens, primitives and one full screen</h1>
          <p className="lede">
            Everything visual in MarketCue comes from <code>app/tokens/</code>. Eight colours, one 4px spacing grid,
            three radii, two type families. The components below are the complete set the product needs; the screen at
            the end shows them composed. Switch modes with the toggle — dark is the app, light is the public reads.
          </p>
        </section>

        <section>
          <h2>The eight rules</h2>
          <p className="lede">These are why the system looks the way it does. Breaking one is a bug, not a style preference.</p>
          <div style={{ marginTop: 'var(--s-5)' }}>
            {EIGHT_RULES.map(([n, title, body]) => (
              <div className="rule" key={n}>
                <b>{n}</b>
                <div><strong>{title}</strong> <span style={{ color: 'var(--muted)' }}>{body}</span></div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>Colour</h2>
          <p className="lede">
            Eight semantic colours, two modes. There is no neutral ramp beyond the five listed — if a shade is missing,
            use <code>color-mix()</code> against <code>--ground</code> rather than adding a token.
          </p>
          <h3>Surfaces and ink</h3>
          <div className="row">
            {['--ground', '--surface', '--surface-2', '--border', '--ink', '--ink-2', '--muted', '--faint'].map((t) => (
              <div className="swatch" key={t}><i style={{ background: `var(${t})` }} /><code>{t}</code></div>
            ))}
          </div>
          <h3>Semantic</h3>
          <div className="row">
            {['--up', '--down', '--caution', '--info', '--brand', '--action'].map((t) => (
              <div className="swatch" key={t}><i style={{ background: `var(${t})` }} /><code>{t}</code></div>
            ))}
          </div>
          <h3>What each one is allowed to mean</h3>
          <div className="card card--flush ds-table-scroll" style={{ marginTop: 'var(--s-3)' }}>
            <table className="table">
              <thead><tr><th scope="col">Token</th><th scope="col">Means</th><th scope="col">Never</th></tr></thead>
              <tbody>
                {COLOUR_MEANINGS.map(([token, means, never]) => (
                  <tr key={token}><td><code>{token}</code></td><td>{means}</td><td className="muted">{never}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>Type</h2>
          <p className="lede">
            IBM Plex Sans for everything, IBM Plex Mono for strike prices and option symbols only. Plex Sans carries true
            tabular figures, which is why monospace is no longer needed for alignment. 12px is the floor and it is only
            for uppercase labels at full contrast.
          </p>
          <div className="card" style={{ marginTop: 'var(--s-5)', display: 'grid', gap: 'var(--s-4)' }}>
            <div><span className="label">--text-label · 12px / 600 / 0.08em</span><span className="label" style={{ marginTop: 6 }}>Market bias</span></div>
            <div><span className="label">--text-meta · 13px</span><p className="num" style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-2)' }}>−80.06 pts · normal gap down</p></div>
            <div><span className="label">--text-body · 15px / 1.6</span><p style={{ fontSize: 'var(--text-body)', maxWidth: 'var(--measure)' }}>Neutral bias with cheap IV — no edge to sell premium, no directional conviction to buy.</p></div>
            <div><span className="label">--text-value · 18px / 600 · tnum</span><p className="num" style={{ fontSize: 'var(--text-value)', fontWeight: 600 }}>23,450</p></div>
            <div><span className="label">--text-value-lg · 26px / 600 · tnum</span><p className="num" style={{ fontSize: 'var(--text-value-lg)', fontWeight: 600 }}>12.29</p></div>
            <div><span className="label">--text-h1 · 34px / 600 / -0.02em</span><h1 style={{ fontSize: 'var(--text-h1)' }}>No trade</h1></div>
            <div><span className="label">--font-mono · strikes only</span><p className="num-strike" style={{ fontSize: 'var(--text-value)' }}>NIFTY 23450 CE</p></div>
          </div>

          <h3>Number formatting — one rule per unit</h3>
          <div className="card card--flush ds-table-scroll" style={{ marginTop: 'var(--s-3)' }}>
            <table className="table">
              <thead><tr><th scope="col">Unit</th><th scope="col" className="num">Example</th><th scope="col">Rule</th></tr></thead>
              <tbody>
                {NUMBER_RULES.map(([unit, example, cls, rule]) => (
                  <tr key={unit}><td>{unit}</td><td className={cls}>{example}</td><td className="muted">{rule}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>Primitives</h2>

          <h3>Buttons</h3>
          <div className="row">
            <button className="btn btn--primary">Build a position</button>
            <button className="btn btn--secondary">Open the rules engine</button>
            <button className="btn btn--quiet">Dismiss</button>
            <button className="btn btn--danger">Close position</button>
            <button className="btn btn--secondary" disabled>Unavailable</button>
            <button className="btn btn--secondary btn--sm">Small</button>
          </div>

          <h3>Bands and badges</h3>
          <div className="row">
            <span className="badge badge--up">↑ Strong bullish</span>
            <span className="badge badge--up">↑ Bullish</span>
            <span className="badge badge--neutral">→ Neutral</span>
            <span className="badge badge--down">↓ Bearish</span>
            <span className="badge badge--down">↓ Strong bearish</span>
          </div>
          <div className="row" style={{ marginTop: 'var(--s-3)' }}>
            <span className="badge badge--up">Good to buy</span>
            <span className="badge badge--caution">Caution</span>
            <span className="badge badge--down">Avoid</span>
            <span className="badge badge--outline">System</span>
            <span className="badge badge--info">Manual</span>
          </div>

          <h3>Freshness stamps</h3>
          <div className="row">
            <span className="stamp stamp--live"><i className="dot" />Live · 12s ago</span>
            <span className="stamp stamp--aging">Captured 08:45 · 6h 41m old</span>
            <span className="stamp stamp--stale">Stale · last checkpoint missed</span>
            <span className="stamp stamp--closed">Market closed · reopens 09:15 IST</span>
          </div>

          <h3>Metric tiles — three weights</h3>
          <div className="grid grid--3">
            <div className="card metric metric--hero">
              <span className="label">Recommendation</span>
              <strong className="metric__value">No trade</strong>
              <span className="metric__sub">Neutral bias · cheap IV</span>
            </div>
            <div className="card metric metric--primary">
              <span className="label">Nifty gap</span>
              <strong className="metric__value delta delta--down">−0.55%</strong>
              <span className="metric__sub">−127.8 pts · normal gap down</span>
            </div>
            <div className="card metric">
              <span className="label">Max pain</span>
              <strong className="metric__value">23450</strong>
              <span className="metric__sub">Pinning likely · 0</span>
            </div>
          </div>

          <h3>Empty and loading states — always a reason, never an em dash</h3>
          <div className="grid grid--3">
            <div className="card card--empty metric">
              <span className="label">Advance / decline</span>
              <strong className="metric__value" style={{ fontSize: 'var(--text-value)', color: 'var(--ink-2)' }}>Not published</strong>
              <span className="metric__sub" style={{ color: 'var(--muted)' }}>NSE releases breadth after 09:20 IST.</span>
            </div>
            <div className="card card--empty metric">
              <span className="label">Event today</span>
              <strong className="metric__value" style={{ fontSize: 'var(--text-value)', color: 'var(--ink-2)' }}>None scheduled</strong>
              <span className="metric__sub" style={{ color: 'var(--muted)' }}>No RBI, inflation or earnings event.</span>
            </div>
            <div className="card metric">
              <span className="label">India VIX</span>
              <div className="skeleton" style={{ width: '60%', height: 26 }} />
              <div className="skeleton" style={{ width: '80%', height: 13 }} />
            </div>
          </div>

          <h3>Banners</h3>
          <div className="grid" style={{ gap: 'var(--s-3)' }}>
            <div className="banner">
              <div>
                <span className="label">Friday recap</span>
                <p className="banner__body" style={{ marginTop: 6 }}>
                  The market opened neutral with a small gap up of <span className="num">+0.06%</span> and stayed neutral
                  across all five checkpoints with no trades triggered. The day closed <span className="num delta delta--down">−0.341%</span>.
                </p>
              </div>
            </div>
            <div className="banner banner--caution">
              <div>
                <span className="label" style={{ color: 'var(--caution-ink)' }}>No trade recommended</span>
                <p className="banner__body" style={{ marginTop: 6 }}>
                  <strong>Neutral bias with cheap IV</strong> — no edge to sell premium and no directional conviction to
                  buy. You can still select a strategy manually below.
                </p>
              </div>
            </div>
            <div className="banner banner--blocking">
              <div>
                <span className="label" style={{ color: 'var(--down)' }}>Option buying blocked</span>
                <p className="banner__body" style={{ marginTop: 6 }}>
                  <strong>India VIX at 24.1</strong> — above the 22 threshold. Fresh premium-buying strategies are
                  unavailable; credit spreads and iron condors remain allowed.
                </p>
              </div>
            </div>
          </div>

          <h3>Score meters</h3>
          <div className="grid grid--3">
            <div className="card" style={{ display: 'grid', gap: 'var(--s-3)' }}>
              <div className="spread"><span className="label">Market bias</span><span className="num" style={{ fontWeight: 600 }}>+0.25</span></div>
              <strong style={{ fontSize: 'var(--text-h3)' }}>Neutral</strong>
              <div className="meter"><span /><span /><span data-on="" /><span /><span /></div>
              <span style={{ fontSize: 'var(--text-meta)', color: 'var(--muted)' }}>Strong bearish → strong bullish</span>
            </div>
            <div className="card" style={{ display: 'grid', gap: 'var(--s-3)' }}>
              <div className="spread"><span className="label">Market bias</span><span className="num" style={{ fontWeight: 600 }}>−1.40</span></div>
              <strong style={{ fontSize: 'var(--text-h3)', color: 'var(--down)' }}>Strong bearish</strong>
              <div className="meter"><span data-on="down" /><span /><span /><span /><span /></div>
              <span style={{ fontSize: 'var(--text-meta)', color: 'var(--muted)' }}>Strong bearish → strong bullish</span>
            </div>
            <div className="card" style={{ display: 'grid', gap: 'var(--s-3)' }}>
              <div className="spread"><span className="label">Option readiness</span><span className="num" style={{ fontWeight: 600 }}>3 / 6</span></div>
              <strong style={{ fontSize: 'var(--text-h3)', color: 'var(--caution-ink)' }}>Caution</strong>
              <div className="meter"><span data-on="caution" /><span data-on="caution" /><span data-on="caution" /><span /><span /><span /></div>
              <span style={{ fontSize: 'var(--text-meta)', color: 'var(--muted)' }}>VIX +2 · IV vs VIX +2 · DTE −1</span>
            </div>
          </div>

          <h3>Controls</h3>
          <div className="grid grid--3">
            <div className="field"><label className="label" htmlFor="f1">Lot size</label><input className="input num" id="f1" defaultValue="75" /></div>
            <div className="field"><label className="label" htmlFor="f2">Net premium</label><input className="input num" id="f2" placeholder="₹0.00" /></div>
            <div className="field">
              <label className="label" htmlFor="f3">Strategy</label>
              <select className="select" id="f3" defaultValue="No trade">
                <option>No trade</option><option>Call debit spread</option><option>Iron condor</option>
              </select>
            </div>
          </div>
          <div className="row" style={{ marginTop: 'var(--s-4)' }}>
            <SourceToggle />
            <span className="chip">Weekly expiry</span>
            <span className="chip">1 day to expiry</span>
            <span className="chip">ATM 23450</span>
          </div>

          <h3>Rules table</h3>
          <div className="card card--flush ds-table-scroll" style={{ marginTop: 'var(--s-3)' }}>
            <table className="table">
              <thead><tr><th scope="col">India VIX</th><th scope="col">Reading</th><th scope="col" className="num">Score</th></tr></thead>
              <tbody>
                {VIX_ROWS.map(([range, reading, score, colour]) => (
                  <tr key={range}>
                    <td className="num">{range}</td>
                    <td>{reading}</td>
                    <td className="num" style={colour ? { color: `var(${colour})` } : undefined}>{score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Session map</h3>
          <div className="card" style={{ maxWidth: 'var(--sidebar-w)', marginTop: 'var(--s-3)' }}>
            <span className="label" style={{ marginBottom: 'var(--s-3)' }}>Session map</span>
            <nav className="sessionmap">
              {SESSION_STAGES.map(([title, sub], i) => (
                <a href="#0" key={title} aria-current={i === 2 ? 'page' : undefined}>
                  <span><strong>{title}</strong><small>{sub}</small></span>
                </a>
              ))}
            </nav>
          </div>
        </section>

        <section>
          <h2>Composed — the Verdict screen</h2>
          <p className="lede">
            The answer at hero weight, its two scores beside it, the four weighted inputs as evidence, then the trade
            levels. Two values are signed, so two values are coloured.
          </p>

          <div className="card" style={{ marginTop: 'var(--s-5)', background: 'var(--ground)', padding: 'var(--s-6)', display: 'grid', gap: 'var(--s-5)' }}>
            <div className="spread" style={{ paddingBottom: 'var(--s-4)', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span className="label">Verdict · Nifty · 14 Sept 2026</span>
                <h2 style={{ marginTop: 6 }}>Strategy for this session</h2>
              </div>
              <div className="row">
                <span className="stamp stamp--aging">Captured 08:45 · 6h 41m old</span>
                <span className="badge badge--outline">System</span>
              </div>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', alignItems: 'start' }}>
              <div className="card card--caution metric metric--hero">
                <span className="label" style={{ color: 'var(--caution-ink)' }}>Recommendation</span>
                <strong className="metric__value">No trade</strong>
                <p style={{ fontSize: 'var(--text-body)', color: 'var(--ink-2)' }}>
                  Neutral bias with cheap IV — no edge to sell premium, no directional conviction to buy. You can still
                  build a position manually.
                </p>
              </div>
              <div className="grid" style={{ gap: 'var(--s-3)' }}>
                <div className="card" style={{ display: 'grid', gap: 'var(--s-2)' }}>
                  <div className="spread"><span className="label">Market bias</span><span className="num" style={{ fontWeight: 600 }}>+0.25</span></div>
                  <strong style={{ fontSize: 'var(--text-h3)' }}>Neutral</strong>
                  <div className="meter"><span /><span /><span data-on="" /><span /><span /></div>
                </div>
                <div className="card" style={{ display: 'grid', gap: 'var(--s-2)' }}>
                  <div className="spread"><span className="label">Option readiness</span><span className="num" style={{ fontWeight: 600 }}>3 / 6</span></div>
                  <strong style={{ fontSize: 'var(--text-h3)', color: 'var(--caution-ink)' }}>Caution</strong>
                  <span style={{ fontSize: 'var(--text-meta)', color: 'var(--muted)' }}>VIX +2 · IV vs VIX +2 · DTE −1</span>
                </div>
              </div>
            </div>

            <div>
              <div className="spread" style={{ padding: '0 2px var(--s-2)' }}>
                <span className="label">Evidence</span>
                <span style={{ fontSize: 'var(--text-meta)', color: 'var(--faint)' }}>Weights for 1 day to expiry</span>
              </div>
              <div className="card card--flush ds-table-scroll">
                <table className="table">
                  <thead><tr><th scope="col">Input</th><th scope="col" className="num">Value</th><th scope="col" className="num">Score</th><th scope="col" className="num">Weight</th></tr></thead>
                  <tbody>
                    <tr><td>Gap %</td><td className="num delta delta--down">−0.55%</td><td className="num">−1</td><td className="num muted">25%</td></tr>
                    <tr><td>OI structure</td><td className="num">23300 addition</td><td className="num">+1</td><td className="num muted">45%</td></tr>
                    <tr><td>PCR</td><td className="num">1.05</td><td className="num">0</td><td className="num muted">20%</td></tr>
                    <tr><td>Max pain</td><td className="num">23450</td><td className="num">+1</td><td className="num muted">10%</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid--3">
              <TradeLevels variant="conservative" target="91.1 pts" targetRupees="₹45.60" stop="45.6 pts" stopRupees="₹22.80" />
              <TradeLevels variant="aggressive" target="122.4 pts" targetRupees="₹61.20" stop="61.2 pts" stopRupees="₹30.60" />
              <div className="card card--empty metric">
                <span className="label">Advance / decline</span>
                <strong className="metric__value" style={{ fontSize: 'var(--text-value)', color: 'var(--ink-2)' }}>Not published</strong>
                <span className="metric__sub" style={{ color: 'var(--muted)' }}>NSE releases breadth after 09:20 IST.</span>
              </div>
            </div>

            <div className="row" style={{ paddingTop: 'var(--s-4)', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn--primary">Build a position manually</button>
              <button className="btn btn--secondary">Open the rules engine</button>
              <p className="disclaimer">Rules-based output, not investment advice. Derived from NSE option-chain data captured 08:45 IST.</p>
            </div>
          </div>
        </section>

        <section>
          <h2>Do and don&apos;t</h2>
          <div className="do-dont" style={{ marginTop: 'var(--s-5)' }}>
            <div className="card card--up">
              <span className="label" style={{ color: 'var(--up)' }}>Do</span>
              <ul style={{ margin: 'var(--s-3) 0 0', paddingLeft: '1.1em', color: 'var(--ink-2)', fontSize: 'var(--text-body)' }}>
                {DO.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
            <div className="card card--down">
              <span className="label" style={{ color: 'var(--down)' }}>Don&apos;t</span>
              <ul style={{ margin: 'var(--s-3) 0 0', paddingLeft: '1.1em', color: 'var(--ink-2)', fontSize: 'var(--text-body)' }}>
                {DONT.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function SourceToggle() {
  const [source, setSource] = useState<'system' | 'manual'>('system')
  return (
    <div className="segmented" role="group" aria-label="Data source">
      <button type="button" aria-pressed={source === 'system'} onClick={() => setSource('system')}>System</button>
      <button type="button" aria-pressed={source === 'manual'} onClick={() => setSource('manual')}>Manual</button>
    </div>
  )
}

function TradeLevels({ variant, target, targetRupees, stop, stopRupees }: { variant: string; target: string; targetRupees: string; stop: string; stopRupees: string }) {
  return (
    <div className="card" style={{ display: 'grid', gap: 'var(--s-3)' }}>
      <span className="label">If taken — {variant}</span>
      <div className="spread">
        <span style={{ color: 'var(--ink-2)' }}>↑ Target</span>
        <span className="num delta delta--up" style={{ fontSize: 'var(--text-value)' }}>{target} <span style={{ fontSize: 'var(--text-meta)', color: 'var(--muted)' }}>{targetRupees}</span></span>
      </div>
      <div className="spread">
        <span style={{ color: 'var(--ink-2)' }}>↓ Stop-loss</span>
        <span className="num delta delta--down" style={{ fontSize: 'var(--text-value)' }}>{stop} <span style={{ fontSize: 'var(--text-meta)', color: 'var(--muted)' }}>{stopRupees}</span></span>
      </div>
    </div>
  )
}

const EIGHT_RULES: [string, string, string][] = [
  ['01', 'Colour is reserved for money.', 'Green and red mean a signed change in value and nothing else. Green up, red down — NSE convention. Levels, counts, expiries and volatility read in ink.'],
  ['02', 'The action colour is not the brand colour.', 'Amber is identity — logo, links, marketing. In-app primary actions are high-contrast neutral, because green and red are spoken for.'],
  ['03', 'Numbers are the interface.', 'Tabular figures everywhere, numeric columns right-aligned, fixed precision per unit, deltas always signed. Hairline borders, no shadows, no card-on-card.'],
  ['04', 'Answer first, evidence under it.', 'Three metric weights — hero, primary, supporting. Never a wall of identical tiles. Density comes from spacing, never from type below 12px.'],
  ['05', 'Risk is heavier than reward.', 'A stop-loss is never shown without its target, never in lighter type. Blocking states get border and fill, not a grey footnote.'],
  ['06', 'Time and provenance are permanent furniture.', 'Every figure carries when it was captured and whether it was system-derived or manually entered, and visibly ages past its checkpoint.'],
  ['07', 'Nothing moves that a trader might click.', 'No layout animation, no count-ups. The only motion is a 120ms tint flash on update, and it respects reduced-motion.'],
  ['08', 'Colour is never the only signal.', 'Every up and down carries a sign and an arrow; every band carries its word.'],
]

const COLOUR_MEANINGS: [string, string, string][] = [
  ['--up', 'Positive signed change · target · support holding', 'A level, a count, an expiry, a VIX value'],
  ['--down', 'Negative signed change · stop-loss · breakdown risk', 'A destructive button fill, an error message'],
  ['--caution', 'Caution band · no-trade · stale data · manual override', 'Decoration, eyebrows, headings'],
  ['--info', 'Provenance (manually entered) · post-market marker', 'Any directional or outcome meaning'],
  ['--brand', 'Logo, links, marketing pages, OG cards', 'Inside a data view'],
  ['--action', 'Primary button, focused control', 'Any state meaning'],
]

const NUMBER_RULES: [string, string, string, string][] = [
  ['Index percentage', '−0.55%', 'num delta delta--down', '2 decimals, always signed, real minus sign (−)'],
  ['Points', '−127.8 pts', 'num delta delta--down', '1 decimal, always signed, unit spelled “pts”'],
  ['Index level', '23,398.10', 'num', '2 decimals, thousands separator, never signed, ink'],
  ['Strike', '23450', 'num-strike', 'Integer, no separator, mono'],
  ['Ratio (PCR, IV)', '1.05', 'num', '2 decimals, never signed'],
  ['Score', '+0.25', 'num', '2 decimals for bias, integer for component scores, always signed'],
  ['Rupees', '₹45.60', 'num', '2 decimals, symbol leading, no space'],
  ['Time', '08:45 IST', 'num', '24h, always with IST'],
]

const VIX_ROWS: [string, string, string, string | null][] = [
  ['11 – 14', 'Ideal, low-risk premium', '+2', '--up'],
  ['Below 11', 'Thin, theta-heavy premium', '+1', '--up'],
  ['14 – 18', 'Elevated premium', '0', null],
  ['18 – 22', 'High — IV crush risk', '−1', '--down'],
  ['Above 22', 'Blocks fresh option buying only', '−2', '--down'],
]

const SESSION_STAGES: [string, string][] = [
  ['Pre-market', 'Overnight setup'],
  ['Market open', 'Opening auction'],
  ['Verdict', 'Strategy selection'],
  ['Mid-market', 'Intraday read'],
  ['Post-market', 'Review & learn'],
]

const DO = [
  'Colour only signed changes.',
  'Right-align every numeric column.',
  'Pair every band with its word and arrow.',
  'State the reason in every empty tile.',
  'Show the stop-loss beside the target.',
  'Keep the capture time on screen.',
]

const DONT = [
  'Colour a level, expiry, VIX or average.',
  'Use the brand amber inside a data view.',
  'Render an em dash as an empty state.',
  'Set label type below 12px.',
  "Animate a value's position or count.",
  "Add a hex that isn't a token.",
]
