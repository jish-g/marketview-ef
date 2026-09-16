'use client'

import useSWR from 'swr'
import { fmt } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import { fetchTicker, type TickerChip, type TickerData } from '@/lib/ticker'

// The strip under the landing top bar. Pure CSS marquee: the chip list is rendered twice
// and the track translates by half its width, so the loop is seamless at any chip count.
// The second copy is aria-hidden so a screen reader hears each instrument once. Under
// prefers-reduced-motion the track does not move and the duplicate is not drawn.

type Props = { tradeDate: string; initial: TickerData | null }

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function Chip({ chip, hidden }: { chip: TickerChip; hidden?: boolean }) {
  const dir = chip.changePts == null ? 'flat' : chip.changePts > 0 ? 'pos' : chip.changePts < 0 ? 'neg' : 'flat'
  const hasChange = chip.changePts != null || chip.changePct != null
  return (
    <div className={`ticker-chip is-${dir}${chip.tag ? " has-tag" : ""}`} aria-hidden={hidden || undefined}>
      <span className="ticker-chip-name">{chip.name}{chip.tag && <small>{chip.tag}</small>}</span>
      <span className="ticker-chip-last">{fmt.level(chip.last)}{chip.unit && <em>{chip.unit}</em>}</span>
      <span className="ticker-chip-chg">
        {hasChange ? (
          <>
            {dir === 'pos' && <i aria-label="up">▲</i>}
            {dir === 'neg' && <i aria-label="down">▼</i>}
            {chip.changePts != null && <b>{fmt.pts(chip.changePts)}</b>}
            {chip.changePct != null && <span>({fmt.pct(chip.changePct)})</span>}
          </>
        ) : <span>—</span>}
        {chip.changeNote && <small>{chip.changeNote}</small>}
      </span>
    </div>
  )
}

export default function MarketTicker({ tradeDate: initialTradeDate, initial }: Props) {
  // Re-keyed client-side so a tab left open across midnight IST rolls to the new session.
  const tradeDate = todayIST()
  const { data } = useSWR(
    ['home-ticker', tradeDate],
    () => fetchTicker(createClient(), tradeDate),
    { fallbackData: tradeDate === initialTradeDate ? initial ?? undefined : undefined, refreshInterval: 5 * 60_000, revalidateOnFocus: true }
  )
  const chips = data?.chips ?? []
  if (chips.length === 0) return null

  const asOf = data!.asOf === 'close' ? 'Close' : data!.asOf === 'pre-market' ? 'Pre-market' : `${data!.asOf} IST`
  return (
    <div className="ticker" aria-label="Market strip">
      <div className="ticker-stamp"><span className="landing-live-dot" aria-hidden="true" /><span className="ticker-stamp-label">As of</span><b>{asOf}</b></div>
      <div className="ticker-viewport">
        <div className="ticker-track" style={{ ['--ticker-n' as string]: chips.length }}>
          {chips.map(c => <Chip key={c.key} chip={c} />)}
          {chips.map(c => <Chip key={`${c.key}-dup`} chip={c} hidden />)}
        </div>
      </div>
    </div>
  )
}
