'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { fmt, freshness } from '@/lib/format'
import { Card, Disclaimer, EmptyState, FreshnessStamp, Label, Metric, Num, PhaseHeader } from '@/components/ui/ds'

// Nifty Gamma Exposure (GEX): presentation only. The marketcue-gex-worker Railway process reads
// live Kite ticks, computes IV/gamma/GEX itself, and writes the single current row to
// nifty_gex_current (own isolated table, own Supabase writer) every 5s during market hours. This
// view only reads and renders that row -- no computation happens here.

type GexRow = {
  expiry: string
  spot: number
  atm_strike: number
  coverage: number
  net_gex: number
  flip_strike: number | null
  call_wall_strike: number | null
  put_wall_strike: number | null
  peak_gamma_strike: number | null
  updated_at: string
}

// Net GEX's sign is a market regime, not a gain/loss -- long gamma isn't "good" and short gamma
// isn't "bad" -- so this deliberately does not reuse DeltaValue/Band's up/down colouring (see the
// rule at the top of ds.tsx). It gets its own neutral-toned badge instead.
function RegimeBadge({ netGex }: { netGex: number }) {
  const long = netGex >= 0
  return (
    <span className="ds-badge ds-badge--neutral">
      {long ? 'Long gamma · range-bound bias' : 'Short gamma · trending bias'}
    </span>
  )
}

export function GexView() {
  const supabase = useMemo(() => createClient(), [])

  const { data, error, isLoading } = useSWR('nifty-gex-current', async () => {
    const { data, error } = await supabase.from('nifty_gex_current').select('*').eq('id', true).maybeSingle()
    if (error) throw error
    return (data as GexRow | null) ?? null
  }, { revalidateOnFocus: true, refreshInterval: 5_000 })

  const stamp = freshness(data?.updated_at ?? null, true)
  const coveragePct = data ? Math.round(data.coverage * 100) : null
  const lowCoverage = coveragePct != null && coveragePct < 60

  return (
    <div className="ds-phase">
      <PhaseHeader
        eyebrow="Nifty options"
        title="Gamma Exposure"
        aside={data && <FreshnessStamp state={stamp.state} label={stamp.label} capturedAt={data.updated_at} />}
      />

      {error && (
        <EmptyState label="GEX" headline="Unavailable" reason="Could not reach the GEX worker's data — try again shortly." />
      )}

      {!error && isLoading && !data && (
        <EmptyState label="GEX" headline="Loading" reason="Fetching the latest Gamma Exposure snapshot." />
      )}

      {!error && !isLoading && !data && (
        <EmptyState label="GEX" headline="No data yet" reason="The GEX worker only runs during market hours (09:10–15:35 IST, weekdays) — check back when the market is open." />
      )}

      {data && (
        <>
          <div className="ds-grid--3">
            <Metric label="Spot" value={fmt.level(data.spot)} weight="primary" />
            <Metric label="ATM strike" value={<Num>{fmt.strike(data.atm_strike)}</Num>} />
            <Metric label="Expiry" value={<Num>{data.expiry}</Num>} />
          </div>

          <Card className="ds-metric ds-metric--hero">
            <Label>Net GEX</Label>
            <strong className="ds-metric__value"><Num>{fmt.crores(data.net_gex)}</Num></strong>
            <span className="ds-metric__sub"><RegimeBadge netGex={data.net_gex} /></span>
          </Card>

          {lowCoverage && (
            <EmptyState
              label="Flip / walls / peak"
              headline="Withheld"
              reason={`Only ${coveragePct}% of strikes have a usable price right now (need 60%+) — thin data would make these levels unreliable.`}
            />
          )}

          {!lowCoverage && (
            <div className="ds-grid--3">
              <Metric label="Zero-gamma flip" value={<Num>{fmt.strike(data.flip_strike)}</Num>} sub="Regime pivot level" />
              <Metric label="Call wall" value={<Num>{fmt.strike(data.call_wall_strike)}</Num>} sub="Largest call-side gamma" />
              <Metric label="Put wall" value={<Num>{fmt.strike(data.put_wall_strike)}</Num>} sub="Largest put-side gamma" />
            </div>
          )}

          {!lowCoverage && (
            <Metric label="Peak gamma" value={<Num>{fmt.strike(data.peak_gamma_strike)}</Num>} sub="Single largest strike, either side" />
          )}

          <Disclaimer source="Nifty option chain (approximate GEX model)" capturedAt={fmt.timeIST(data.updated_at) ?? undefined} />
        </>
      )}
    </div>
  )
}
