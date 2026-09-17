'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChartView } from '@/components/chart-view'
import { visualRow } from '../page'
import type { Instrument, Row } from '@/lib/chart/types'
import { TIMEFRAMES, type Timeframe } from '@/lib/chart/series'

// The standalone chart tab: opened from the "open in new tab" button on the embedded Chart
// screen, or bookmarked/shared directly. It renders nothing from the dashboard shell -- no
// sidebar, no other phases -- just ChartView in its 'full' layout, which supplies its own nav bar
// and fills the viewport. It needs its own copy of the one thing the dashboard would otherwise
// hand down as a prop: the current premarket_dashboard row that the OI-wall and pivot indicators
// read levels from.
export default function ChartTabPage() {
  const [row, setRow] = useState<Row>(visualRow)

  // instrument/timeframe/session read once from the URL the "open in new tab" button (or a
  // shared link) set, exactly the way the dashboard already reads `session` and `phase` on
  // mount -- so this only ever seeds ChartView's own initial state, never re-runs.
  const [initialInstrument] = useState<Instrument>(() => {
    if (typeof window === 'undefined') return 'NIFTY'
    return new URLSearchParams(window.location.search).get('instrument') === 'SENSEX' ? 'SENSEX' : 'NIFTY'
  })
  const [initialTimeframe] = useState<Timeframe>(() => {
    if (typeof window === 'undefined') return '5m'
    const v = new URLSearchParams(window.location.search).get('tf')
    return (TIMEFRAMES.some((t) => t.key === v) ? v : '5m') as Timeframe
  })

  useEffect(() => {
    const supabase = createClient()
    const session = new URLSearchParams(window.location.search).get('session')
    const base = supabase.from('premarket_dashboard').select('*')
    const query = session && /^\d{4}-\d{2}-\d{2}$/.test(session)
      ? base.eq('trade_date', session).maybeSingle()
      : base.order('trade_date', { ascending: false }).limit(1).maybeSingle()
    query.then(({ data }) => { if (data) setRow(data as Row) })
  }, [])

  return <ChartView row={row} layout="full" initialInstrument={initialInstrument} initialTimeframe={initialTimeframe} />
}
