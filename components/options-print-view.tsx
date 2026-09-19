'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { Banner, Disclaimer, EmptyState, Num } from '@/components/ui/ds'
import { fmt } from '@/lib/format'
import type { Instrument } from '@/lib/chart/types'

// Options Print + Greeks at a glance: both read the same table (option_chain_snapshot), a
// per-strike history logged every 3 minutes by the option-chain-snapshot-log Edge Function
// (ATM +/- 30 strikes). This view reads only the most recent captured_at batch for today -- a
// live snapshot of the chain, not a time series (oi-history-view already covers the time-series
// side of options data). Greeks needed no separate pipeline once Options Print's table existed;
// it's just a second column set on the same rows, switched with the view toggle below.
type StrikeRow = {
  strike: number
  ce_oi: number | null; ce_volume: number | null; ce_ltp: number | null
  ce_delta: number | null; ce_theta: number | null; ce_gamma: number | null; ce_vega: number | null
  pe_oi: number | null; pe_volume: number | null; pe_ltp: number | null
  pe_delta: number | null; pe_theta: number | null; pe_gamma: number | null; pe_vega: number | null
}

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function fmtOi(n: number | null): string {
  if (n == null) return '–'
  if (n >= 100000) return `${(n / 100000).toFixed(2)}L`
  return n.toLocaleString('en-IN')
}
function fmtPremium(n: number | null): string {
  return n == null ? '–' : n.toFixed(2)
}
function fmtGreek(n: number | null, digits = 4): string {
  return n == null ? '–' : n.toFixed(digits)
}

export function OptionsPrintView() {
  const [instrument, setInstrument] = useState<Instrument>('NIFTY')
  const [view, setView] = useState<'oi' | 'greeks'>('oi')
  const supabase = createClient()
  const tradeDate = todayIST()

  const { data, isLoading } = useSWR(
    ['option-chain-snapshot', instrument, tradeDate],
    async () => {
      const { data: latestRow, error: latestErr } = await supabase.from('option_chain_snapshot')
        .select('captured_at')
        .eq('instrument', instrument).eq('trade_date', tradeDate)
        .order('captured_at', { ascending: false }).limit(1).maybeSingle()
      if (latestErr) throw latestErr
      if (!latestRow) return { capturedAt: null as string | null, rows: [] as StrikeRow[] }
      const { data: rows, error } = await supabase.from('option_chain_snapshot')
        .select('strike, ce_oi, ce_volume, ce_ltp, ce_delta, ce_theta, ce_gamma, ce_vega, pe_oi, pe_volume, pe_ltp, pe_delta, pe_theta, pe_gamma, pe_vega')
        .eq('instrument', instrument).eq('trade_date', tradeDate).eq('captured_at', latestRow.captured_at)
        .order('strike', { ascending: true })
      if (error) throw error
      return { capturedAt: latestRow.captured_at as string, rows: (rows ?? []) as StrikeRow[] }
    },
    { revalidateOnFocus: false, refreshInterval: 180_000 },
  )

  const rows = data?.rows ?? []
  const capturedAt = data?.capturedAt ?? null
  // The pipeline's own window is already ATM +/- 30 strikes, so the middle row of what loaded is
  // the ATM strike -- no separate spot lookup needed here.
  const atmStrike = rows.length ? rows[Math.floor(rows.length / 2)].strike : null
  const capturedLabel = capturedAt
    ? new Date(capturedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
    : undefined

  const instrumentSwitch = (
    <div className="chart-switch" role="group" aria-label="Instrument">
      {(['NIFTY', 'SENSEX'] as Instrument[]).map((i) => (
        <button key={i} type="button" className={instrument === i ? 'is-active' : ''} aria-pressed={instrument === i} onClick={() => setInstrument(i)}>
          {i === 'NIFTY' ? 'Nifty 50' : 'Sensex'}
        </button>
      ))}
    </div>
  )

  const viewSwitch = (
    <div className="chart-switch" role="group" aria-label="Column view">
      <button type="button" className={view === 'oi' ? 'is-active' : ''} aria-pressed={view === 'oi'} onClick={() => setView('oi')}>OI &amp; Volume</button>
      <button type="button" className={view === 'greeks' ? 'is-active' : ''} aria-pressed={view === 'greeks'} onClick={() => setView('greeks')}>Greeks</button>
    </div>
  )

  return (
    <section className="phase-view special-view oi-history-view">
      <div className="review-section-head">
        <div><p className="eyebrow">Options intelligence · per-strike</p><h2>Options Print</h2></div>
        {instrumentSwitch}
      </div>

      <Banner tone="info" label="How to read this">
        Every strike within roughly ATM ± 30 steps for <b>{instrument === 'NIFTY' ? 'Nifty 50' : 'Sensex'}</b>&rsquo;s nearest expiry,
        captured every 3 minutes through the session. This is the raw chain, not a signal — OI and volume show where positions
        currently sit; Greeks show each strike&rsquo;s own price/time/volatility sensitivity.
      </Banner>

      <div className="oi-card">
        <div className="oi-card-head"><h3>Per-strike chain</h3>{viewSwitch}</div>
        {isLoading ? null : rows.length === 0 ? (
          <EmptyState
            label="Options Print"
            headline="No snapshot for today yet"
            reason="option-chain-snapshot-log captures the chain every 3 minutes during market hours (09:15–15:30 IST) — check back once the session is live."
          />
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  {view === 'oi' ? (
                    <>
                      <th scope="col" className="ds-num-col">CE OI</th>
                      <th scope="col" className="ds-num-col">CE Vol</th>
                      <th scope="col" className="ds-num-col">CE LTP</th>
                      <th scope="col">Strike</th>
                      <th scope="col" className="ds-num-col">PE LTP</th>
                      <th scope="col" className="ds-num-col">PE Vol</th>
                      <th scope="col" className="ds-num-col">PE OI</th>
                    </>
                  ) : (
                    <>
                      <th scope="col" className="ds-num-col">CE Delta</th>
                      <th scope="col" className="ds-num-col">CE Theta</th>
                      <th scope="col" className="ds-num-col">CE Gamma</th>
                      <th scope="col" className="ds-num-col">CE Vega</th>
                      <th scope="col">Strike</th>
                      <th scope="col" className="ds-num-col">PE Vega</th>
                      <th scope="col" className="ds-num-col">PE Gamma</th>
                      <th scope="col" className="ds-num-col">PE Theta</th>
                      <th scope="col" className="ds-num-col">PE Delta</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.strike} className={r.strike === atmStrike ? 'ds-row--atm' : undefined}>
                    {view === 'oi' ? (
                      <>
                        <td className="ds-num-col" data-col="CE OI"><Num>{fmtOi(r.ce_oi)}</Num></td>
                        <td className="ds-num-col" data-col="CE Vol"><Num>{fmtOi(r.ce_volume)}</Num></td>
                        <td className="ds-num-col" data-col="CE LTP"><Num>{fmtPremium(r.ce_ltp)}</Num></td>
                        <th scope="row" className="ds-table__rowhead" data-col="Strike"><Num strike>{fmt.strike(r.strike)}</Num></th>
                        <td className="ds-num-col" data-col="PE LTP"><Num>{fmtPremium(r.pe_ltp)}</Num></td>
                        <td className="ds-num-col" data-col="PE Vol"><Num>{fmtOi(r.pe_volume)}</Num></td>
                        <td className="ds-num-col" data-col="PE OI"><Num>{fmtOi(r.pe_oi)}</Num></td>
                      </>
                    ) : (
                      <>
                        <td className="ds-num-col" data-col="CE Delta"><Num>{fmtGreek(r.ce_delta)}</Num></td>
                        <td className="ds-num-col" data-col="CE Theta"><Num>{fmtGreek(r.ce_theta, 2)}</Num></td>
                        <td className="ds-num-col" data-col="CE Gamma"><Num>{fmtGreek(r.ce_gamma)}</Num></td>
                        <td className="ds-num-col" data-col="CE Vega"><Num>{fmtGreek(r.ce_vega, 2)}</Num></td>
                        <th scope="row" className="ds-table__rowhead" data-col="Strike"><Num strike>{fmt.strike(r.strike)}</Num></th>
                        <td className="ds-num-col" data-col="PE Vega"><Num>{fmtGreek(r.pe_vega, 2)}</Num></td>
                        <td className="ds-num-col" data-col="PE Gamma"><Num>{fmtGreek(r.pe_gamma)}</Num></td>
                        <td className="ds-num-col" data-col="PE Theta"><Num>{fmtGreek(r.pe_theta, 2)}</Num></td>
                        <td className="ds-num-col" data-col="PE Delta"><Num>{fmtGreek(r.pe_delta)}</Num></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Disclaimer source="Upstox option chain (option_chain_snapshot)" capturedAt={capturedLabel} />
    </section>
  )
}
