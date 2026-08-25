'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { CheckCircle2, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Row = Record<string, string | number | boolean | null>
type Instrument = 'NIFTY' | 'SENSEX'
type ExitReason = 'stop_conservative' | 'target_conservative' | 'target_aggressive' | 'eod_unresolved' | 'eod_at_or_above_conservative'
type TradeSource = 'system' | 'manual'
type Trade = Row & {
  id: string
  trade_date: string
  instrument: Instrument
  outcome: 'open' | 'target' | 'stop'
  state: 'running' | 'locked_conservative' | 'closed' | null
  source: TradeSource | null
  strategy: string | null
  exit_reason: ExitReason | null
  exit_premium: number | null
  entry_premium: number | null
  qty: number | null
}
type JournalEntry = { id: string; trade_date: string; entry_text: string; created_at: string; updated_at: string | null }

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function formatDateLabel(dateStr: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${dateStr}T00:00:00`))
}

// Mirrors tradePnl() in components/trade-view.tsx exactly -- real signed P&L from entry vs
// exit premium, sign-flipped for net sellers (Credit Spread, Iron Condor), times lot size.
// Duplicated locally rather than imported since trade-view.tsx doesn't export it; keep the
// two in sync if the P&L formula ever changes.
function tradePnl(trade: Trade): number | null {
  if (trade.entry_premium == null || trade.exit_premium == null) return null
  const qty = Number(trade.qty) || 0
  const isNetSeller = trade.strategy === 'Credit Spread' || trade.strategy === 'Iron Condor'
  const directionSign = isNetSeller ? -1 : 1
  return (Number(trade.exit_premium) - Number(trade.entry_premium)) * directionSign * qty
}

function outcomeLabel(trade: Trade) {
  switch (trade.exit_reason) {
    case 'stop_conservative': return 'Stop-loss hit'
    case 'target_conservative': return 'Target hit (conservative)'
    case 'target_aggressive': return 'Target hit (aggressive)'
    case 'eod_unresolved': return 'Closed at market close'
    case 'eod_at_or_above_conservative': return 'Closed at market close'
    default: return trade.outcome === 'open' ? 'Open' : trade.outcome === 'target' ? 'Target hit' : trade.outcome === 'stop' ? 'Stop-loss hit' : 'Open'
  }
}

function TradeChip({ trade }: { trade: Trade }) {
  const pnl = tradePnl(trade)
  const tone = pnl == null ? 'neutral' : pnl >= 0 ? 'positive' : 'negative'
  return <span className={`journal-trade-chip journal-chip-${tone}`}>
    {trade.instrument} {String(trade.strategy ?? '—')} {outcomeLabel(trade)}
    {pnl != null && ` ${pnl >= 0 ? '+' : '−'}₹${Math.abs(pnl).toFixed(0)}`}
    <span className={`source-badge source-${trade.source ?? 'system'}`}>{trade.source === 'manual' ? 'Manual' : 'System'}</span>
  </span>
}

function TradeDayCards({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return <span className="journal-trade-chip journal-chip-neutral">No trade</span>
  return <div className="journal-trade-cards">
    {trades.map((trade) => {
      const pnl = tradePnl(trade)
      const isOpen = trade.outcome === 'open'
      return <div className="field-card" key={String(trade.id)}>
        <span>{trade.instrument} <span className={`source-badge source-${trade.source ?? 'system'}`}>{trade.source === 'manual' ? 'Manual' : 'System'}</span></span>
        <strong>{String(trade.strategy ?? '—')}<em className="breadth-flag">{outcomeLabel(trade)}</em>{pnl != null && <em className={`breadth-flag ${pnl >= 0 ? 'positive' : 'negative'}`}>{pnl >= 0 ? '+' : '−'}₹{Math.abs(pnl).toFixed(0)}</em>}{isOpen && <em className="breadth-flag">Still open — check the Trade page</em>}</strong>
      </div>
    })}
  </div>
}

export function JournalView() {
  const supabase = useMemo(() => createClient(), [])
  const tradeDate = todayIST()
  // editingDate tracks which day's entry the textarea currently represents -- defaults to
  // today. Clicking "Edit" on any past log row loads that day's text into the same form and
  // switches editingDate to it, so Save always upserts onto journal_entries_trade_date_unique
  // rather than ever creating a second row for the same day.
  const [editingDate, setEditingDate] = useState(tradeDate)
  const [noteText, setNoteText] = useState('')
  const [noteDirty, setNoteDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data, error, mutate } = useSWR(['journal-page'], async () => {
    const [{ data: trades, error: tradeError }, { data: entries, error: entryError }] = await Promise.all([
      supabase.from('auto_trades').select('*').order('trade_date', { ascending: false }),
      supabase.from('journal_entries').select('*').order('trade_date', { ascending: false }),
    ])
    if (tradeError) throw tradeError
    if (entryError) throw entryError
    return { trades: (trades ?? []) as Trade[], entries: (entries ?? []) as JournalEntry[] }
  }, { revalidateOnFocus: false })

  const trades = data?.trades ?? []
  const entries = data?.entries ?? []
  const todayTrades = trades.filter((trade) => trade.trade_date === tradeDate)
  const existingEntryForEditingDate = entries.find((entry) => entry.trade_date === editingDate)

  // Prefill the textarea from the entry on record for whichever date is being edited --
  // one entry per day now (journal_entries_trade_date_unique), so this is either today's
  // existing note (to continue/replace it) or a past day's note when "Edit" was clicked.
  // Only runs when not mid-edit (noteDirty false) so it doesn't clobber unsaved typing.
  useMemo(() => {
    if (!noteDirty) setNoteText(existingEntryForEditingDate?.entry_text ?? '')
  }, [existingEntryForEditingDate, editingDate, noteDirty])

  // Group past entries' trade context by date so the log shows each entry alongside that
  // day's trades, without re-fetching per row -- trades are read fresh from auto_trades at
  // render time (not stored on the journal row), so if a trade's outcome changes after the
  // note was written, the log reflects the trade's current state rather than a stale copy.
  const tradesByDate = useMemo(() => {
    const map: Record<string, Trade[]> = {}
    for (const trade of trades) {
      const key = trade.trade_date
      if (!map[key]) map[key] = []
      map[key].push(trade)
    }
    return map
  }, [trades])

  const submitEntry = async () => {
    if (!noteText.trim()) return
    setSaving(true)
    setSaveError(null)
    // Upsert on trade_date (journal_entries_trade_date_unique) -- one entry per day, so
    // saving again for the same date replaces it in place instead of adding a new row.
    const { error: upsertError } = await supabase
      .from('journal_entries')
      .upsert({ trade_date: editingDate, entry_text: noteText.trim(), updated_at: new Date().toISOString() }, { onConflict: 'trade_date' })
    setSaving(false)
    if (upsertError) { setSaveError(upsertError.message); return }
    setNoteDirty(false)
    if (editingDate !== tradeDate) setEditingDate(tradeDate)
    void mutate()
  }

  const startEdit = (date: string) => {
    setEditingDate(date)
    setNoteDirty(false)
  }
  const cancelEdit = () => {
    setEditingDate(tradeDate)
    setNoteDirty(false)
  }

  return <section className="phase-view journal-view">
    <div className="review-section-head"><div><p className="eyebrow">End of day</p><h2>Journal</h2></div><span>{tradeDate}</span></div>
    {error && <p className="history-empty">Unable to load journal data right now.</p>}

    <p className="eyebrow">Today&apos;s trades</p>
    <TradeDayCards trades={todayTrades} />

    <div className="position-calculator journal-notes-card">
      <div className="position-head">
        <div>
          <p className="eyebrow">{editingDate === tradeDate ? 'Your notes' : `Editing ${formatDateLabel(editingDate)}`}</p>
          <strong>{editingDate === tradeDate ? 'What happened today, and what to remember next time' : 'Update this day\'s note'}</strong>
        </div>
      </div>
      <textarea
        className="journal-textarea"
        rows={4}
        value={noteText}
        onChange={(e) => { setNoteText(e.target.value); setNoteDirty(true) }}
        placeholder="e.g. Took the system's Iron Condor on NIFTY, held through midday chop, conservative target hit around 1pm. Should have trusted the lock instead of watching it fall back near close."
        aria-label="Journal entry text"
      />
      {saveError && <p className="history-empty">Could not save: {saveError}</p>}
      <div className="trade-confirmation">
        <button type="button" className="action-button action-button-success" onClick={submitEntry} disabled={saving || !noteText.trim()}>
          <CheckCircle2 size={14} /> {saving ? 'Saving...' : existingEntryForEditingDate ? 'Save changes' : 'Save entry'}
        </button>
        {editingDate !== tradeDate && <button type="button" className="action-button" onClick={cancelEdit} disabled={saving}>Cancel</button>}
      </div>
    </div>

    <section className="trade-log journal-log">
      <div className="review-section-head"><div><p className="eyebrow">All saved notes</p><h2>Journal log</h2></div></div>
      {entries.length === 0 ? <p className="history-empty">No journal entries yet — write your first note above.</p> : <div className="history-list">
        {entries.map((entry) => <article className={`journal-log-entry ${entry.trade_date === editingDate ? 'journal-log-entry-active' : ''}`} key={entry.id}>
          <div className="journal-log-head">
            <span className="journal-log-date">{formatDateLabel(entry.trade_date)}{entry.updated_at && entry.updated_at !== entry.created_at && <em className="journal-log-edited"> · edited</em>}</span>
            <button type="button" className="action-button journal-edit-button" onClick={() => startEdit(entry.trade_date)}><RotateCcw size={12} /> Edit</button>
          </div>
          <div className="journal-trade-cards journal-trade-cards-compact">
            {(tradesByDate[entry.trade_date] ?? []).length === 0
              ? <span className="journal-trade-chip journal-chip-neutral">No trade</span>
              : (tradesByDate[entry.trade_date] ?? []).map((trade) => <TradeChip key={String(trade.id)} trade={trade} />)}
          </div>
          <p className="journal-log-text">{entry.entry_text}</p>
        </article>)}
      </div>}
    </section>
  </section>
}
