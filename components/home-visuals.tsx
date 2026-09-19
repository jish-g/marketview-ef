// Decorative visuals for the homepage's feature cards. Every one is stylised from fixed,
// representative shapes -- never a live read -- the same way an icon is decorative rather
// than data. Anything that carries a number is labelled "Illustrative" where it renders.
// Pure presentation: no props reach into app state, no fetching, no hooks.

type TpoRow = { px: string; pct: number; poc?: boolean }

const TPO_ROWS: TpoRow[] = [
  { px: '25,220', pct: 18 },
  { px: '25,180', pct: 34 },
  { px: '25,140', pct: 58 },
  { px: '25,100', pct: 92, poc: true },
  { px: '25,060', pct: 71 },
  { px: '25,020', pct: 40 },
  { px: '24,980', pct: 15 },
]

const VP_ROWS: TpoRow[] = [
  { px: '25,180', pct: 30 },
  { px: '25,120', pct: 88, poc: true },
  { px: '25,060', pct: 52 },
]

function ProfileRows({ rows }: { rows: TpoRow[] }) {
  return (
    <div className="tpo-rows">
      {rows.map((row) => (
        <div className={`tpo-row${row.poc ? ' is-poc' : ''}`} key={row.px}>
          <span className="tpo-row-px">{row.px}</span>
          <span className="tpo-row-bar" style={{ width: `${row.pct}%` }} />
        </div>
      ))}
    </div>
  )
}

export function TpoProfileVisual() {
  return (
    <div className="chart-feature-visual chart-feature-visual-tpo">
      <ProfileRows rows={TPO_ROWS} />
      <div className="tpo-side">
        <div className="tpo-stat">
          <span>Point of control</span>
          <strong className="tpo-stat-poc">25,100</strong>
        </div>
        <div className="tpo-stat">
          <span>Value area</span>
          <strong>25,040&ndash;25,160</strong>
        </div>
      </div>
    </div>
  )
}

export function VolumeProfileVisual() {
  return (
    <div className="chart-feature-visual">
      <ProfileRows rows={VP_ROWS} />
    </div>
  )
}

export function SparkVisual({ tone, points, flagAt }: { tone: 'brand' | 'info'; points: string; flagAt?: [number, number] }) {
  return (
    <svg className={`chart-feature-visual chart-feature-spark spark-${tone}`} viewBox="0 0 240 40" preserveAspectRatio="none" aria-hidden="true">
      {/* pathLength=1 lets the CSS draw-in animate 0..1 regardless of the polyline's real length */}
      <polyline points={points} pathLength={1} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {flagAt && <circle cx={flagAt[0]} cy={flagAt[1]} r="3.5" className="spark-flag" />}
    </svg>
  )
}

export function PulseGaugeVisual() {
  return (
    <div className="chart-feature-visual chart-feature-gauge">
      <svg width="52" height="32" viewBox="0 0 52 32" aria-hidden="true">
        <path d="M4 28 A22 22 0 0 1 48 28" fill="none" className="gauge-track" strokeWidth="5" />
        <path d="M4 28 A22 22 0 0 1 35 8" pathLength={1} fill="none" className="gauge-fill" strokeWidth="5" strokeLinecap="round" />
        <circle cx="35" cy="8" r="3" className="gauge-dot" />
      </svg>
      <span>Trending, CVD agrees</span>
    </div>
  )
}

export function PositioningBarsVisual() {
  const bars = [40, 65, 30, 85, 50]
  return (
    <div className="chart-feature-visual chart-feature-bars" aria-hidden="true">
      {bars.map((h, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i} style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

type LevelTone = 'res' | 'piv' | 'sup'

export function LevelRowsVisual({ rows }: { rows: Array<{ tone: LevelTone; label: string; price: string }> }) {
  return (
    <div className="chart-feature-visual level-rows">
      {rows.map((row) => (
        <div className={`level-row level-row-${row.tone}`} key={row.label}>
          <span className="level-dot" aria-hidden="true" />
          <span className="level-label">{row.label}</span>
          <span className="level-bar" aria-hidden="true" />
          <span className="level-price">{row.price}</span>
        </div>
      ))}
    </div>
  )
}

export function VolumeBarsVisual() {
  const bars: Array<{ h: number; dir?: 'up' | 'down' }> = [
    { h: 35 }, { h: 55, dir: 'up' }, { h: 30 }, { h: 70, dir: 'down' },
    { h: 45 }, { h: 90, dir: 'up' }, { h: 38 }, { h: 60, dir: 'down' },
  ]
  return (
    <div className="chart-feature-visual volume-bars" aria-hidden="true">
      {bars.map((b, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i} className={b.dir} style={{ height: `${b.h}%` }} />
      ))}
    </div>
  )
}

export function FlowBarsVisual() {
  return (
    <div className="chart-feature-visual flow-bars">
      <div className="flow-col">
        <div className="flow-track flow-track-fii"><i /></div>
        <span>FII net sell</span>
      </div>
      <div className="flow-col">
        <div className="flow-track flow-track-dii"><i /></div>
        <span>DII net buy</span>
      </div>
    </div>
  )
}

// Gamma exposure by strike: negative (short gamma) around and below the flip, positive above.
export function GexStrikeBarsVisual() {
  const bars: Array<{ h: number; sign: 'pos' | 'neg'; flip?: boolean }> = [
    { h: 20, sign: 'pos' }, { h: 35, sign: 'pos' }, { h: 15, sign: 'neg' }, { h: 40, sign: 'neg' },
    { h: 8, sign: 'neg', flip: true }, { h: 60, sign: 'neg' }, { h: 85, sign: 'neg' }, { h: 45, sign: 'neg' },
    { h: 25, sign: 'pos' }, { h: 50, sign: 'pos' }, { h: 90, sign: 'pos' }, { h: 55, sign: 'pos' }, { h: 30, sign: 'pos' },
  ]
  return (
    <div className="gex-bars" aria-hidden="true">
      {bars.map((b, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div className={`gex-bar${b.flip ? ' is-flip' : ''}`} key={i}>
          <span className={`gex-fill gex-fill-${b.sign}`} style={{ height: `${b.h}%` }} />
        </div>
      ))}
    </div>
  )
}

export function TransmissionVisual({ global, india, strength }: { global: string; india: string; strength: string }) {
  return (
    <div className="transmission">
      <div className="transmission-node"><span>Global</span><strong>{global}</strong></div>
      <div className="transmission-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        <span>{strength}</span>
      </div>
      <div className="transmission-node"><span>India</span><strong>{india}</strong></div>
    </div>
  )
}
