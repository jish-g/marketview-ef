'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Filter,
  Gauge,
  LayoutDashboard,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'

type DashboardRow = Record<string, unknown>
type View = 'today' | 'history' | 'logic' | 'post'
type Theme = 'dark' | 'light'

const navItems = [
  { id: 'today' as View, label: 'Today', icon: LayoutDashboard },
  { id: 'history' as View, label: 'Research', icon: CalendarDays },
  { id: 'logic' as View, label: 'How to read', icon: BookOpen },
  { id: 'post' as View, label: 'Market open', icon: Clock3 },
]

// Raw value lookup — returns '—' for null/undefined/empty so the layout
// never breaks on missing fields from the externally-managed source.
const raw = (row: DashboardRow | undefined, key: string): string | null => {
  const value = row?.[key]
  if (value === undefined || value === null || value === '') return null
  return String(value)
}

const field = (row: DashboardRow | undefined, key: string) => raw(row, key) ?? '—'

// Formats a numeric field with an optional unit/suffix, preserving '—' for nulls.
const fmt = (row: DashboardRow | undefined, key: string, suffix = '') => {
  const value = raw(row, key)
  if (value === null) return '—'
  const num = Number(value)
  if (Number.isNaN(num)) return `${value}${suffix}`
  const formatted = Number.isInteger(num) ? num.toLocaleString('en-IN') : num.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  return `${formatted}${suffix}`
}

const signedFmt = (row: DashboardRow | undefined, key: string, suffix = '') => {
  const value = raw(row, key)
  if (value === null) return '—'
  const num = Number(value)
  if (Number.isNaN(num)) return `${value}${suffix}`
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`
}

const toneFromSign = (row: DashboardRow | undefined, key: string): 'positive' | 'negative' | 'neutral' => {
  const value = raw(row, key)
  if (value === null) return 'neutral'
  const num = Number(value)
  if (Number.isNaN(num) || num === 0) return 'neutral'
  return num > 0 ? 'positive' : 'negative'
}

function Header({ onMenu, theme, onTheme, live }: { onMenu: () => void; theme: Theme; onTheme: () => void; live: boolean }) {
  return <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl md:px-7">
    <div className="flex items-center gap-3"><button onClick={onMenu} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden" aria-label="Open navigation"><Menu className="size-4" /></button><div className="flex items-center gap-2.5"><div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><BarChart3 className="size-4" /></div><div><span className="text-sm font-semibold tracking-tight">MarketView</span><p className="hidden text-[10px] text-muted-foreground sm:block">Decision support for the open</p></div></div></div>
    <div className="flex items-center gap-2"><div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] lg:flex ${live ? 'border-teal-400/25 text-teal-300' : 'border-amber-400/25 text-amber-300'}`}><span className={`size-1.5 rounded-full ${live ? 'bg-teal-400' : 'bg-amber-400'}`} />{live ? 'Read-only feed · connected' : 'Read-only feed · awaiting source'}</div><button onClick={onTheme} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Toggle theme">{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}</button><button className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Help"><CircleHelp className="size-4" /></button></div>
  </header>
}

function Sidebar({ view, setView, collapsed, onCollapse, mobileOpen }: { view: View; setView: (view: View) => void; collapsed: boolean; onCollapse: () => void; mobileOpen: boolean }) {
  return <aside className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'md:w-[72px]' : 'md:w-60'} fixed inset-y-16 left-0 z-20 flex w-64 flex-col border-r border-border/70 bg-card transition-all duration-200 md:static md:inset-auto md:translate-x-0`}>
    <div className="flex items-center justify-between border-b border-border/70 p-4"><span className={`${collapsed ? 'md:hidden' : ''} px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground`}>Workspace</span><button onClick={onCollapse} className="hidden rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:block" aria-label="Collapse sidebar">{collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button></div>
    <nav className="flex-1 space-y-1 p-3">{navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setView(id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-xs transition ${view === id ? 'bg-accent font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}><Icon className="size-4 shrink-0" /><span className={collapsed ? 'md:hidden' : ''}>{label}</span></button>)}</nav>
    <div className={`${collapsed ? 'md:items-center' : ''} flex items-center gap-3 border-t border-border/70 p-4 text-muted-foreground`}><div className="flex size-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">MV</div><div className={collapsed ? 'md:hidden' : ''}><p className="text-[11px] font-medium text-foreground">MarketView</p><p className="text-[10px]">Read-only workspace</p></div></div>
  </aside>
}

function EmptyState({ compact = false }: { compact?: boolean }) {
  return <div className={`flex ${compact ? 'min-h-24' : 'min-h-44'} items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/10 px-5 text-center`}><div><Database className="mx-auto mb-2 size-5 text-muted-foreground/70" /><p className="text-xs font-medium text-muted-foreground">Awaiting market feed</p><p className="mt-1 max-w-xs text-[10px] leading-4 text-muted-foreground/70">The premarket_dashboard table has no rows yet for this view.</p></div></div>
}

function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: string }) {
  return <div className="mb-4 flex items-end justify-between gap-3"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p><h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2></div>{action && <span className="text-[10px] text-muted-foreground">{action}</span>}</div>
}

function SignalCard({ label, value, note, icon: Icon, tone = 'neutral' }: { label: string; value: string; note: string; icon: typeof Activity; tone?: 'neutral' | 'positive' | 'negative' }) {
  return <div className="rounded-xl border border-border/70 bg-card p-4"><div className="mb-4 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</span><Icon className={`size-4 ${tone === 'positive' ? 'text-teal-400' : tone === 'negative' ? 'text-rose-400' : 'text-muted-foreground'}`} /></div><p className={`font-mono text-xl font-semibold tabular-nums ${tone === 'positive' ? 'text-teal-400' : tone === 'negative' ? 'text-rose-400' : 'text-foreground'}`}>{value}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</p></div>
}

function PulsePanel({ row }: { row?: DashboardRow }) {
  const hasData = Boolean(row)
  const vixChange = toneFromSign(row, 'india_vix_change_pct')
  const event = field(row, 'event_today')
  return <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_12px_40px_-28px_rgba(0,0,0,.45)]">
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-xl">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"><Sparkles className="size-3.5 text-teal-400" />Market pulse · {field(row, 'day_name')}, {field(row, 'trade_date')}</div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{hasData ? `India VIX at ${fmt(row, 'india_vix')}, Gift Nifty gap ${signedFmt(row, 'gift_nifty_gap_pct', '%')}` : 'Your pre-open read starts here'}</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{hasData ? `Today's calendar: ${event === 'None' ? 'no scheduled macro event' : event}. Combine the gap, volatility, and options positioning below before forming a view.` : 'MarketView brings the evidence together so you can understand the regime before looking at individual trades.'}</p>
      </div>
      <div className={`flex shrink-0 items-center gap-4 rounded-xl border px-4 py-3 ${vixChange === 'positive' ? 'border-rose-400/20 bg-rose-400/5' : vixChange === 'negative' ? 'border-teal-400/20 bg-teal-400/5' : 'border-amber-400/20 bg-amber-400/5'}`}>
        <div className={`flex size-10 items-center justify-center rounded-full border ${vixChange === 'positive' ? 'border-rose-400/30 text-rose-400' : vixChange === 'negative' ? 'border-teal-400/30 text-teal-400' : 'border-amber-400/30 text-amber-400'}`}><Gauge className="size-5" /></div>
        <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">VIX change</p><p className="mt-1 text-sm font-semibold text-foreground">{signedFmt(row, 'india_vix_change_pct', '%')}</p></div>
      </div>
    </div>
    <div className="mt-5 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-3">
      <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Expiry (Nifty / Sensex)</p><p className="mt-1 text-xs text-foreground">{fmt(row, 'days_to_expiry_nifty', 'd')} · {fmt(row, 'days_to_expiry_sensex', 'd')}</p></div>
      <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">5-day avg move</p><p className="mt-1 text-xs text-foreground">Nifty {fmt(row, 'avg_move_5d_nifty', ' pts')} · Sensex {fmt(row, 'avg_move_5d_sensex', ' pts')}</p></div>
      <div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Skipped / notes</p><p className="mt-1 text-xs text-foreground">{field(row, 'skipped_notes')}</p></div>
    </div>
  </section>
}

function ScenarioCard({ title, description, condition, icon: Icon, tone }: { title: string; description: string; condition: string; icon: typeof TrendingUp; tone: 'positive' | 'neutral' | 'negative' }) {
  return <div className="rounded-xl border border-border/70 bg-card p-4"><div className="flex items-center justify-between"><div className={`flex size-8 items-center justify-center rounded-lg ${tone === 'positive' ? 'bg-teal-400/10 text-teal-400' : tone === 'negative' ? 'bg-rose-400/10 text-rose-400' : 'bg-muted text-muted-foreground'}`}><Icon className="size-4" /></div><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{condition}</span></div><h3 className="mt-4 text-sm font-semibold">{title}</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p></div>
}

function LevelsPanel({ row }: { row?: DashboardRow }) {
  const indices = [
    { label: 'Nifty', support: 'chart_support_nifty', resistance: 'chart_resistance_nifty', oiSupport: 'oi_support_nifty', oiSupportChange: 'oi_change_support_nifty', oiResistance: 'oi_resistance_nifty', oiResistanceChange: 'oi_change_resistance_nifty' },
    { label: 'Sensex', support: 'chart_support_sensex', resistance: 'chart_resistance_sensex', oiSupport: 'oi_support_sensex', oiSupportChange: 'oi_change_support_sensex', oiResistance: 'oi_resistance_sensex', oiResistanceChange: 'oi_change_resistance_sensex' },
  ]
  return <section className="rounded-xl border border-border/70 bg-card p-5"><SectionHeading eyebrow="Market structure" title="Levels that frame the open" action="Chart + OI-based" />
    {row ? <div className="space-y-5">{indices.map((index) => <div key={index.label}><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{index.label}</p>
      <div className="grid grid-cols-2 gap-3 text-center text-[10px] text-muted-foreground">
        <div className="rounded-lg bg-teal-400/5 border border-teal-400/15 p-2"><p className="font-mono text-xs text-teal-300">{fmt(row, index.support)}</p><p className="mt-1">Chart support</p></div>
        <div className="rounded-lg bg-rose-400/5 border border-rose-400/15 p-2"><p className="font-mono text-xs text-rose-300">{fmt(row, index.resistance)}</p><p className="mt-1">Chart resistance</p></div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-center text-[10px] text-muted-foreground">
        <div className="p-2"><p className="font-mono text-xs text-foreground">{fmt(row, index.oiSupport)}</p><p className="mt-1">OI support · {field(row, index.oiSupportChange)}</p></div>
        <div className="p-2"><p className="font-mono text-xs text-foreground">{fmt(row, index.oiResistance)}</p><p className="mt-1">OI resistance · {field(row, index.oiResistanceChange)}</p></div>
      </div>
    </div>)}</div> : <EmptyState compact />}
  </section>
}

function PositioningPanel({ row }: { row?: DashboardRow }) {
  const indices = [
    { label: 'Nifty', pcr: 'pcr_nifty', maxPain: 'max_pain_nifty', iv: 'atm_iv_nifty', delta: 'atm_straddle_delta_nifty', theta: 'atm_straddle_theta_nifty' },
    { label: 'Sensex', pcr: 'pcr_sensex', maxPain: 'max_pain_sensex', iv: 'atm_iv_sensex', delta: 'atm_straddle_delta_sensex', theta: 'atm_straddle_theta_sensex' },
  ]
  return <section className="rounded-xl border border-border/70 bg-card p-5"><SectionHeading eyebrow="Options context" title="Positioning at a glance" action="PCR · max pain · Greeks" />
    {row ? <div className="space-y-4">{indices.map((index) => <div key={index.label} className="space-y-2"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{index.label} PCR</span><span className="font-mono text-foreground">{fmt(row, index.pcr)}</span></div><div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground"><div><p className="font-mono text-xs text-foreground">{fmt(row, index.maxPain)}</p><p className="mt-1">Max pain</p></div><div><p className="font-mono text-xs text-foreground">{fmt(row, index.delta)}</p><p className="mt-1">Straddle delta</p></div><div><p className="font-mono text-xs text-foreground">{fmt(row, index.theta)}</p><p className="mt-1">Straddle theta</p></div></div></div>)}<div className="rounded-lg bg-muted/35 p-3 text-[11px] leading-5 text-muted-foreground">PCR becomes useful when paired with price and volatility. A ratio alone is not a trade signal.</div></div> : <EmptyState compact />}
  </section>
}

function ContextRail({ row }: { row?: DashboardRow }) {
  return <div className="space-y-4"><section className="rounded-xl border border-border/70 bg-card p-5"><div className="mb-4 flex items-center gap-2"><Target className="size-4 text-teal-400" /><h2 className="text-sm font-semibold">How to use this read</h2></div><ol className="space-y-4">{['Start with regime, not a single number.', 'Use chart and OI levels to define where the view is wrong.', 'Use PCR, max pain, and straddle Greeks to understand positioning and risk.'].map((text, index) => <li key={text} className="flex gap-3 text-[11px] leading-5 text-muted-foreground"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] text-foreground">{index + 1}</span>{text}</li>)}</ol></section><section className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-5"><div className="mb-3 flex items-center gap-2"><ShieldAlert className="size-4 text-rose-300" /><h2 className="text-sm font-semibold">Invalidates the view</h2></div><p className="text-[11px] leading-5 text-muted-foreground">A premarket view is a starting hypothesis. Reassess when price rejects the chart or OI level, India VIX moves sharply, or the Gift Nifty gap disagrees with the cash open.</p></section></div>
}

function DataDetails({ row }: { row?: DashboardRow }) {
  const groups: { label: string; keys: [string, string][] }[] = [
    { label: 'Meta', keys: [['Trade date', 'trade_date'], ['Day', 'day_name'], ['Event today', 'event_today'], ['Notes', 'skipped_notes']] },
    { label: 'Pre-market', keys: [['India VIX', 'india_vix'], ['VIX change %', 'india_vix_change_pct'], ['Gift Nifty gap %', 'gift_nifty_gap_pct'], ['Nifty expiry (days)', 'days_to_expiry_nifty']] },
    { label: 'Nifty levels', keys: [['Chart support', 'chart_support_nifty'], ['Chart resistance', 'chart_resistance_nifty'], ['OI support', 'oi_support_nifty'], ['OI resistance', 'oi_resistance_nifty']] },
    { label: 'Sensex levels', keys: [['Chart support', 'chart_support_sensex'], ['Chart resistance', 'chart_resistance_sensex'], ['OI support', 'oi_support_sensex'], ['OI resistance', 'oi_resistance_sensex']] },
    { label: 'Nifty options', keys: [['PCR', 'pcr_nifty'], ['Max pain', 'max_pain_nifty'], ['ATM IV', 'atm_iv_nifty'], ['Straddle price', 'atm_straddle_price_nifty']] },
    { label: 'Sensex options', keys: [['PCR', 'pcr_sensex'], ['Max pain', 'max_pain_sensex'], ['ATM IV', 'atm_iv_sensex'], ['Straddle price', 'atm_straddle_price_sensex']] },
  ]
  return <section className="rounded-xl border border-border/70 bg-card p-5"><SectionHeading eyebrow="Evidence" title="Source values" action="Read-only · exact fields" />{row ? <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">{groups.map((group) => <div key={group.label}><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{group.label}</p><div className="space-y-2">{group.keys.map(([label, key]) => <div key={key} className="flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">{label}</span><span className="font-mono tabular-nums text-foreground">{field(row, key)}</span></div>)}</div></div>)}</div> : <EmptyState compact />}</section>
}

function MiniTrend({ title, value, caption, tone }: { title: string; value: string; caption: string; tone: 'teal' | 'rose' }) {
  return <div className="rounded-xl border border-border/70 bg-card p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{title}</span><span className={`font-mono text-sm ${tone === 'teal' ? 'text-teal-300' : 'text-rose-300'}`}>{value}</span></div><div className="mt-4 flex h-12 items-end gap-1">{[28, 34, 24, 38, 31, 43, 37, 48, 40, 46].map((height, index) => <span key={index} className={`flex-1 rounded-t-sm ${tone === 'teal' ? 'bg-teal-400/50' : 'bg-rose-400/50'}`} style={{ height: `${height}%` }} />)}</div><p className="mt-3 text-[11px] leading-4 text-muted-foreground">{caption}</p></div>
}

function LogicView() {
  return <div className="space-y-8"><div className="max-w-2xl"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Interpretation guide</p><h2 className="text-3xl font-semibold tracking-tight">Turn market data into a view.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">No single metric predicts the open. Professional analysis combines direction, volatility, structure, and positioning into a scenario with clear invalidation.</p></div><div className="grid gap-4 md:grid-cols-2">{[{ title: 'Volatility', text: 'India VIX is the cost of uncertainty. A rising VIX can make breakouts less reliable and widens the range of likely outcomes.', icon: Activity }, { title: 'Positioning', text: 'PCR, max pain, and OI shifts show where participants are concentrated. Read them alongside price, because positioning can be trapped.', icon: SlidersHorizontal }, { title: 'Structure', text: 'Chart and OI-based support/resistance give the view a boundary. A level is useful because it tells you where the thesis changes.', icon: Target }, { title: 'Confirmation', text: 'The best read is one where the Gift Nifty gap, breadth, and options positioning tell a compatible story.', icon: Check }].map(({ title, text, icon: Icon }) => <section key={title} className="rounded-xl border border-border/70 bg-card p-5"><Icon className="size-5 text-teal-400" /><h3 className="mt-5 text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p></section>)}</div><div className="rounded-xl border border-border/70 bg-card p-5"><p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">A simple operating sequence</p><div className="grid gap-4 md:grid-cols-4">{['Establish regime', 'Locate levels', 'Read positioning', 'Define invalidation'].map((step, index) => <div key={step} className="flex gap-3"><span className="font-mono text-xs text-teal-300">0{index + 1}</span><span className="text-xs font-medium">{step}</span></div>)}</div></div></div>
}

function MarketOpenView({ row }: { row?: DashboardRow }) {
  if (!row) return <div className="flex min-h-[460px] items-center justify-center rounded-2xl border border-dashed border-border bg-card/40"><div className="max-w-md text-center"><Clock3 className="mx-auto mb-4 size-7 text-muted-foreground" /><h2 className="text-lg font-semibold">Market-open data is not in yet</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Live fields populate around 9:01 AM IST once the second automation runs.</p></div></div>
  return <div className="space-y-6">
    <section className="rounded-xl border border-border/70 bg-card p-5"><SectionHeading eyebrow="At the open" title="Breadth and opening move" action={field(row, 'trade_date')} />
      <div className="grid gap-3 sm:grid-cols-3">
        <SignalCard label="Nifty opening move" value={signedFmt(row, 'nifty_opening_points', ' pts')} note="Points moved from previous close" icon={TrendingUp} tone={toneFromSign(row, 'nifty_opening_points')} />
        <SignalCard label="Advance / decline" value={field(row, 'advance_decline_ratio')} note="Market breadth at the open" icon={Activity} />
        <SignalCard label="Gap (Nifty / Sensex)" value={`${signedFmt(row, 'gap_points_nifty', ' pts')} · ${signedFmt(row, 'gap_points_sensex', ' pts')}`} note="Gap vs. previous close" icon={Zap} />
      </div>
    </section>
    <div className="grid gap-4 md:grid-cols-2">
      {[{ label: 'Nifty', prevClose: 'prev_close_nifty', iv: 'atm_iv_nifty', price: 'atm_straddle_price_nifty', delta: 'atm_straddle_delta_nifty', theta: 'atm_straddle_theta_nifty', pcr: 'pcr_nifty', maxPain: 'max_pain_nifty' }, { label: 'Sensex', prevClose: 'prev_close_sensex', iv: 'atm_iv_sensex', price: 'atm_straddle_price_sensex', delta: 'atm_straddle_delta_sensex', theta: 'atm_straddle_theta_sensex', pcr: 'pcr_sensex', maxPain: 'max_pain_sensex' }].map((index) => <section key={index.label} className="rounded-xl border border-border/70 bg-card p-5"><SectionHeading eyebrow={index.label} title="ATM straddle & positioning" /><div className="grid grid-cols-2 gap-3 text-[11px]"><div><span className="text-muted-foreground">Prev close</span><p className="font-mono text-sm text-foreground">{fmt(row, index.prevClose)}</p></div><div><span className="text-muted-foreground">ATM IV</span><p className="font-mono text-sm text-foreground">{fmt(row, index.iv, '%')}</p></div><div><span className="text-muted-foreground">Straddle price</span><p className="font-mono text-sm text-foreground">{fmt(row, index.price)}</p></div><div><span className="text-muted-foreground">Delta / theta</span><p className="font-mono text-sm text-foreground">{fmt(row, index.delta)} / {fmt(row, index.theta)}</p></div><div><span className="text-muted-foreground">PCR</span><p className="font-mono text-sm text-foreground">{fmt(row, index.pcr)}</p></div><div><span className="text-muted-foreground">Max pain</span><p className="font-mono text-sm text-foreground">{fmt(row, index.maxPain)}</p></div></div></section>)}
    </div>
  </div>
}

function App() {
  const [view, setView] = useState<View>('today')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>('dark')
  const [rows, setRows] = useState<DashboardRow[]>([])
  const [feedError, setFeedError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [historyFilter, setHistoryFilter] = useState('')

  useEffect(() => {
    const saved = window.localStorage.getItem('marketview-theme') as Theme | null
    const next = saved || 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('premarket_dashboard')
          .select('*')
          .order('trade_date', { ascending: false })
        if (error) throw error
        setRows(data || [])
      } catch (error) {
        setFeedError(error instanceof Error ? error.message : 'Unable to read the connected feed.')
      } finally {
        setLoaded(true)
      }
    }
    load()
  }, [])

  const latest = rows[0]
  const filteredRows = useMemo(
    () => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(historyFilter.toLowerCase())),
    [rows, historyFilter],
  )
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    window.localStorage.setItem('marketview-theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }
  const currentLabel = navItems.find((item) => item.id === view)?.label || 'Today'
  const isLive = loaded && !feedError && Boolean(latest)

  return <div className="min-h-screen bg-background font-sans text-foreground">
    <Header onMenu={() => setMobileOpen(!mobileOpen)} theme={theme} onTheme={toggleTheme} live={isLive} />
    <div className="flex min-h-[calc(100vh-4rem)]">
      <Sidebar view={view} setView={(next) => { setView(next); setMobileOpen(false) }} collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} mobileOpen={mobileOpen} />
      <main className="min-w-0 flex-1 px-4 py-7 md:px-7 lg:px-10"><div className="mx-auto max-w-[1500px]">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"><span>Workspace</span><ChevronRight className="size-3" /><span className="text-foreground">{currentLabel}</span></div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{view === 'today' ? 'Premarket command center' : currentLabel}</h1>
            <p className="mt-2 max-w-xl text-sm leading-5 text-muted-foreground">{view === 'today' ? 'Build a clear market hypothesis before the opening bell.' : view === 'history' ? 'Study past snapshots to improve how you frame the open.' : view === 'logic' ? 'A practical framework for reading volatility, structure, and positioning.' : 'Live breadth, gap, and positioning once the market opens.'}</p>
          </div>
          <div className="flex items-center gap-2"><div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-[11px] text-muted-foreground"><CalendarDays className="size-3.5" />{field(latest, 'trade_date')}</div><button className="rounded-lg border border-border/70 bg-card p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Filter dashboard"><Filter className="size-3.5" /></button></div>
        </div>

        {feedError && <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs"><Database className="mt-0.5 size-4 shrink-0 text-amber-400" /><div><p className="font-medium text-foreground">Premarket source is not available</p><p className="mt-1 text-muted-foreground">{feedError}</p></div></div>}
        {!feedError && loaded && rows.length === 0 && <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs"><Database className="mt-0.5 size-4 shrink-0 text-amber-400" /><div><p className="font-medium text-foreground">No rows in premarket_dashboard yet</p><p className="mt-1 text-muted-foreground">The connected feed is reachable but the table is currently empty.</p></div></div>}

        {view === 'today' && <div className="space-y-8">
          <PulsePanel row={latest} />
          <div>
            <SectionHeading eyebrow="The evidence" title="Market factors" action="Start broad, then go specific" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SignalCard label="India VIX" value={fmt(latest, 'india_vix')} note={`${signedFmt(latest, 'india_vix_change_pct', '%')} vs. previous session`} icon={Activity} tone={toneFromSign(latest, 'india_vix_change_pct') === 'positive' ? 'negative' : toneFromSign(latest, 'india_vix_change_pct') === 'negative' ? 'positive' : 'neutral'} />
              <SignalCard label="Gift Nifty gap" value={signedFmt(latest, 'gift_nifty_gap_pct', '%')} note="Overnight directional cue" icon={Zap} tone={toneFromSign(latest, 'gift_nifty_gap_pct')} />
              <SignalCard label="Nifty PCR" value={fmt(latest, 'pcr_nifty')} note="Positioning, not a standalone signal" icon={SlidersHorizontal} />
              <SignalCard label="Prev-day change" value={`${signedFmt(latest, 'prev_day_change_pct_nifty', '%')}`} note="Nifty, previous session" icon={TrendingUp} tone={toneFromSign(latest, 'prev_day_change_pct_nifty')} />
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.75fr)]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2"><LevelsPanel row={latest} /><PositioningPanel row={latest} /></div>
              <div>
                <SectionHeading eyebrow="Scenario map" title="What could happen next" action="A hypothesis, not a prediction" />
                <div className="grid gap-3 md:grid-cols-3">
                  <ScenarioCard title="Trend continuation" condition="Bull case" description="Price holds above chart/OI support and positioning confirms participation." icon={ArrowUpRight} tone="positive" />
                  <ScenarioCard title="Two-way open" condition="Base case" description="Mixed signals keep price between support and resistance until breadth improves." icon={Target} tone="neutral" />
                  <ScenarioCard title="Failed direction" condition="Risk case" description="A rejection at resistance or support changes the opening hypothesis." icon={ArrowDownRight} tone="negative" />
                </div>
              </div>
              <DataDetails row={latest} />
            </div>
            <ContextRail row={latest} />
          </div>
          <div>
            <SectionHeading eyebrow="Context over time" title="Trend monitors" action="India VIX & Nifty PCR" />
            <div className="grid gap-3 md:grid-cols-2">
              <MiniTrend title="India VIX" value={fmt(latest, 'india_vix')} caption="Rising VIX widens the range of likely outcomes for the session." tone="rose" />
              <MiniTrend title="Nifty PCR" value={fmt(latest, 'pcr_nifty')} caption="Extreme readings can mark crowded positioning rather than direction." tone="teal" />
            </div>
          </div>
        </div>}

        {view === 'history' && <div className="space-y-5">
          <section className="rounded-xl border border-border/70 bg-card p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Research log</p><h2 className="text-base font-semibold">Historical snapshots</h2><p className="mt-1 text-xs text-muted-foreground">Compare the evidence behind previous premarket views.</p></div>
              <div className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2"><Search className="size-3.5 text-muted-foreground" /><input value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} placeholder="Filter records" className="w-40 bg-transparent text-xs outline-none placeholder:text-muted-foreground" /></div>
            </div>
          </section>
          <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
            <table className="w-full min-w-[820px] text-left text-[11px]">
              <thead className="bg-muted/35 text-muted-foreground">
                <tr><th className="px-5 py-3 font-medium">Trade date</th><th className="px-5 py-3 font-medium">Day</th><th className="px-5 py-3 font-medium">Event</th><th className="px-5 py-3 font-medium">VIX</th><th className="px-5 py-3 font-medium">Gift gap %</th><th className="px-5 py-3 font-medium">Nifty PCR</th><th className="px-5 py-3 font-medium">Max pain</th></tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? <tr><td colSpan={7} className="px-5 py-16 text-center"><EmptyState compact /></td></tr> : filteredRows.map((row, index) => <tr key={index} className="border-t border-border/70 hover:bg-accent/30">
                  <td className="px-5 py-3 font-mono">{field(row, 'trade_date')}</td>
                  <td className="px-5 py-3">{field(row, 'day_name')}</td>
                  <td className="px-5 py-3">{field(row, 'event_today')}</td>
                  <td className="px-5 py-3 font-mono">{fmt(row, 'india_vix')}</td>
                  <td className="px-5 py-3 font-mono">{signedFmt(row, 'gift_nifty_gap_pct', '%')}</td>
                  <td className="px-5 py-3 font-mono">{fmt(row, 'pcr_nifty')}</td>
                  <td className="px-5 py-3 font-mono">{fmt(row, 'max_pain_nifty')}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>}

        {view === 'logic' && <LogicView />}
        {view === 'post' && <MarketOpenView row={latest} />}
      </div></main>
    </div>
  </div>
}

export default function Home() {
  return <App />
}
