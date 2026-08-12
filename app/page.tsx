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
  { id: 'post' as View, label: 'Post market', icon: Clock3 },
]

const field = (row: DashboardRow | undefined, ...keys: string[]) => {
  for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && row[key] !== '') return String(row[key])
  return '—'
}

function Header({ onMenu, theme, onTheme }: { onMenu: () => void; theme: Theme; onTheme: () => void }) {
  return <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl md:px-7">
    <div className="flex items-center gap-3"><button onClick={onMenu} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden" aria-label="Open navigation"><Menu className="size-4" /></button><div className="flex items-center gap-2.5"><div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><BarChart3 className="size-4" /></div><div><span className="text-sm font-semibold tracking-tight">MarketView</span><p className="hidden text-[10px] text-muted-foreground sm:block">Decision support for the open</p></div></div></div>
    <div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-full border border-border/80 px-3 py-1.5 text-[10px] text-muted-foreground lg:flex"><span className="size-1.5 rounded-full bg-amber-400" />Read-only feed · awaiting source</div><button onClick={onTheme} className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Toggle theme">{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}</button><button className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Help"><CircleHelp className="size-4" /></button></div>
  </header>
}

function Sidebar({ view, setView, collapsed, onCollapse, mobileOpen }: { view: View; setView: (view: View) => void; collapsed: boolean; onCollapse: () => void; mobileOpen: boolean }) {
  return <aside className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'md:w-[72px]' : 'md:w-60'} fixed inset-y-16 left-0 z-20 flex w-64 flex-col border-r border-border/70 bg-card transition-all duration-200 md:static md:inset-auto md:translate-x-0`}>
    <div className="flex items-center justify-between border-b border-border/70 p-4"><span className={`${collapsed ? 'md:hidden' : ''} px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground`}>Workspace</span><button onClick={onCollapse} className="hidden rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:block" aria-label="Collapse sidebar">{collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button></div>
    <nav className="flex-1 space-y-1 p-3">{navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setView(id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-xs transition ${view === id ? 'bg-accent font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}><Icon className="size-4 shrink-0" /><span className={collapsed ? 'md:hidden' : ''}>{label}</span>{id === 'today' && <span className={`${collapsed ? 'md:hidden' : ''} ml-auto size-1.5 rounded-full bg-amber-400`} />}</button>)}</nav>
    <div className={`${collapsed ? 'md:items-center' : ''} flex items-center gap-3 border-t border-border/70 p-4 text-muted-foreground`}><div className="flex size-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">MV</div><div className={collapsed ? 'md:hidden' : ''}><p className="text-[11px] font-medium text-foreground">MarketView</p><p className="text-[10px]">Read-only workspace</p></div></div>
  </aside>
}

function EmptyState({ compact = false }: { compact?: boolean }) {
  return <div className={`flex ${compact ? 'min-h-24' : 'min-h-44'} items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/10 px-5 text-center`}><div><Database className="mx-auto mb-2 size-5 text-muted-foreground/70" /><p className="text-xs font-medium text-muted-foreground">Awaiting market feed</p><p className="mt-1 max-w-xs text-[10px] leading-4 text-muted-foreground/70">Connect the premarket_dashboard source to turn this panel into a live analysis.</p></div></div>
}

function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: string }) {
  return <div className="mb-4 flex items-end justify-between gap-3"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p><h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2></div>{action && <span className="text-[10px] text-muted-foreground">{action}</span>}</div>
}

function SignalCard({ label, value, note, icon: Icon, tone = 'neutral' }: { label: string; value: string; note: string; icon: typeof Activity; tone?: 'neutral' | 'positive' | 'negative' }) {
  return <div className="rounded-xl border border-border/70 bg-card p-4"><div className="mb-4 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{label}</span><Icon className={`size-4 ${tone === 'positive' ? 'text-teal-400' : tone === 'negative' ? 'text-rose-400' : 'text-muted-foreground'}`} /></div><p className="font-mono text-xl font-semibold tabular-nums text-foreground">{value}</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</p></div>
}

function PulsePanel({ row }: { row?: DashboardRow }) {
  const hasData = Boolean(row)
  return <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_12px_40px_-28px_rgba(0,0,0,.45)]"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="max-w-xl"><div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"><Sparkles className="size-3.5 text-teal-400" />Market pulse</div><h2 className="text-2xl font-semibold tracking-tight text-foreground">{hasData ? 'A market view is forming' : 'Your pre-open read starts here'}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{hasData ? 'The latest snapshot is ready to be interpreted across breadth, volatility, and positioning.' : 'MarketView brings the evidence together so you can understand the regime before looking at individual trades.'}</p></div><div className="flex shrink-0 items-center gap-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3"><div className="flex size-10 items-center justify-center rounded-full border border-amber-400/30 text-amber-400"><Gauge className="size-5" /></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-amber-300/80">Current read</p><p className="mt-1 text-sm font-semibold text-foreground">{hasData ? 'Needs interpretation' : 'Awaiting feed'}</p></div></div></div><div className="mt-5 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-3"><div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">What matters</p><p className="mt-1 text-xs text-foreground">Volatility, direction, positioning</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Confidence</p><p className="mt-1 text-xs text-foreground">{hasData ? 'Calculated from available fields' : 'No evidence yet'}</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Next step</p><p className="mt-1 text-xs text-foreground">Check levels before sizing</p></div></div></section>
}

function ScenarioCard({ title, description, condition, icon: Icon, tone }: { title: string; description: string; condition: string; icon: typeof TrendingUp; tone: 'positive' | 'neutral' | 'negative' }) {
  return <div className="rounded-xl border border-border/70 bg-card p-4"><div className="flex items-center justify-between"><div className={`flex size-8 items-center justify-center rounded-lg ${tone === 'positive' ? 'bg-teal-400/10 text-teal-400' : tone === 'negative' ? 'bg-rose-400/10 text-rose-400' : 'bg-muted text-muted-foreground'}`}><Icon className="size-4" /></div><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{condition}</span></div><h3 className="mt-4 text-sm font-semibold">{title}</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p></div>
}

function PositioningPanel({ row }: { row?: DashboardRow }) {
  const call = field(row, 'call_oi', 'highest_call_oi')
  const put = field(row, 'put_oi', 'highest_put_oi')
  return <section className="rounded-xl border border-border/70 bg-card p-5"><SectionHeading eyebrow="Options context" title="Positioning at a glance" action="Read the imbalance, not just the ratio" />{row ? <div className="space-y-4"><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Call interest</span><span className="font-mono text-rose-300">{call}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/2 bg-rose-400/70" /></div><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Put interest</span><span className="font-mono text-teal-300">{put}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/2 bg-teal-400/70" /></div><div className="rounded-lg bg-muted/35 p-3 text-[11px] leading-5 text-muted-foreground">OI becomes useful when paired with price and volatility. A ratio alone is not a trade signal.</div></div> : <EmptyState compact />}</section>
}

function LevelsPanel({ row }: { row?: DashboardRow }) {
  return <section className="rounded-xl border border-border/70 bg-card p-5"><SectionHeading eyebrow="Market structure" title="Levels that frame the open" action="Support · spot · resistance" />{row ? <div className="space-y-5"><div className="relative pt-6"><div className="h-1 rounded-full bg-muted"><div className="absolute left-1/3 right-1/4 h-1 rounded-full bg-teal-400/70" /></div><div className="absolute left-1/3 top-2 -translate-x-1/2 text-[10px] text-teal-300">Support</div><div className="absolute left-1/2 top-2 -translate-x-1/2 text-[10px] text-foreground">Spot</div><div className="absolute right-1/4 top-2 translate-x-1/2 text-[10px] text-rose-300">Resistance</div></div><div className="grid grid-cols-3 gap-2 text-center text-[10px] text-muted-foreground"><div><p className="font-mono text-xs text-foreground">{field(row, 'nifty_support')}</p><p className="mt-1">Support</p></div><div><p className="font-mono text-xs text-foreground">{field(row, 'nifty')}</p><p className="mt-1">Nifty</p></div><div><p className="font-mono text-xs text-foreground">{field(row, 'nifty_resistance')}</p><p className="mt-1">Resistance</p></div></div></div> : <EmptyState compact />}</section>
}

function ContextRail({ row }: { row?: DashboardRow }) {
  return <div className="space-y-4"><section className="rounded-xl border border-border/70 bg-card p-5"><div className="mb-4 flex items-center gap-2"><Target className="size-4 text-teal-400" /><h2 className="text-sm font-semibold">How to use this read</h2></div><ol className="space-y-4">{['Start with regime, not a single number.', 'Use levels to define where the view is wrong.', 'Use options to understand positioning and risk.'].map((text, index) => <li key={text} className="flex gap-3 text-[11px] leading-5 text-muted-foreground"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] text-foreground">{index + 1}</span>{text}</li>)}</ol></section><section className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-5"><div className="mb-3 flex items-center gap-2"><ShieldAlert className="size-4 text-rose-300" /><h2 className="text-sm font-semibold">Invalidates the view</h2></div><p className="text-[11px] leading-5 text-muted-foreground">A premarket view is a starting hypothesis. Reassess when price rejects the key level, volatility expands unexpectedly, or breadth disagrees with index direction.</p></section></div>
}

function DataDetails({ row }: { row?: DashboardRow }) {
  const groups = [{ label: 'Overview', keys: [['Market status', 'market_status'], ['Gift Nifty', 'gift_nifty'], ['India VIX', 'india_vix'], ['Nifty PCR', 'nifty_pcr']] }, { label: 'Levels', keys: [['Nifty 50', 'nifty'], ['Support', 'nifty_support'], ['Resistance', 'nifty_resistance'], ['Previous close', 'previous_close']] }, { label: 'Options', keys: [['Max pain', 'max_pain'], ['Call OI', 'call_oi'], ['Put OI', 'put_oi'], ['PCR change', 'pcr_change']] }]
  return <section className="rounded-xl border border-border/70 bg-card p-5"><SectionHeading eyebrow="Evidence" title="Source values" action="Read-only · exact fields" />{row ? <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">{groups.map((group) => <div key={group.label}><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{group.label}</p><div className="space-y-2">{group.keys.map(([label, key]) => <div key={key} className="flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">{label}</span><span className="font-mono tabular-nums text-foreground">{field(row, key)}</span></div>)}</div></div>)}</div> : <EmptyState compact />}</section>
}

function MiniTrend({ title, value, caption, tone }: { title: string; value: string; caption: string; tone: 'teal' | 'rose' }) {
  return <div className="rounded-xl border border-border/70 bg-card p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{title}</span><span className={`font-mono text-sm ${tone === 'teal' ? 'text-teal-300' : 'text-rose-300'}`}>{value}</span></div><div className="mt-4 flex h-12 items-end gap-1">{[28, 34, 24, 38, 31, 43, 37, 48, 40, 46].map((height, index) => <span key={index} className={`flex-1 rounded-t-sm ${tone === 'teal' ? 'bg-teal-400/50' : 'bg-rose-400/50'}`} style={{ height: `${height}%` }} />)}</div><p className="mt-3 text-[11px] leading-4 text-muted-foreground">{caption}</p></div>
}

function LogicView() {
  return <div className="space-y-8"><div className="max-w-2xl"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Interpretation guide</p><h2 className="text-3xl font-semibold tracking-tight">Turn market data into a view.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">No single metric predicts the open. Professional analysis combines direction, volatility, structure, and positioning into a scenario with clear invalidation.</p></div><div className="grid gap-4 md:grid-cols-2">{[{ title: 'Volatility', text: 'VIX is the cost of uncertainty. Rising VIX can make breakouts less reliable and expands the range of outcomes.', icon: Activity }, { title: 'Positioning', text: 'PCR and OI show where participants are concentrated. Read them alongside price, because positioning can be trapped.', icon: SlidersHorizontal }, { title: 'Structure', text: 'Support and resistance give the view a boundary. A level is useful because it tells you where the thesis changes.', icon: Target }, { title: 'Confirmation', text: 'The best read is one where index direction, breadth, and options positioning tell a compatible story.', icon: Check }].map(({ title, text, icon: Icon }) => <section key={title} className="rounded-xl border border-border/70 bg-card p-5"><Icon className="size-5 text-teal-400" /><h3 className="mt-5 text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p></section>)}</div><div className="rounded-xl border border-border/70 bg-card p-5"><p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">A simple operating sequence</p><div className="grid gap-4 md:grid-cols-4">{['Establish regime', 'Locate levels', 'Read positioning', 'Define invalidation'].map((step, index) => <div key={step} className="flex gap-3"><span className="font-mono text-xs text-teal-300">0{index + 1}</span><span className="text-xs font-medium">{step}</span></div>)}</div></div></div>
}

function App() {
  const [view, setView] = useState<View>('today')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>('dark')
  const [rows, setRows] = useState<DashboardRow[]>([])
  const [feedError, setFeedError] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState('')

  useEffect(() => { const saved = window.localStorage.getItem('marketview-theme') as Theme | null; const next = saved || 'dark'; setTheme(next); document.documentElement.classList.toggle('dark', next === 'dark') }, [])
  useEffect(() => { const load = async () => { try { const supabase = createClient(); const { data, error } = await supabase.from('premarket_dashboard').select('*').order('trade_date', { ascending: false }); if (error) throw error; setRows(data || []) } catch (error) { setFeedError(error instanceof Error ? error.message : 'Unable to read the connected feed.') } }; load() }, [])
  const latest = rows[0]
  const filteredRows = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(historyFilter.toLowerCase())), [rows, historyFilter])
  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); window.localStorage.setItem('marketview-theme', next); document.documentElement.classList.toggle('dark', next === 'dark') }
  const currentLabel = navItems.find((item) => item.id === view)?.label || 'Today'

  return <div className="min-h-screen bg-background font-sans text-foreground"><Header onMenu={() => setMobileOpen(!mobileOpen)} theme={theme} onTheme={toggleTheme} /><div className="flex min-h-[calc(100vh-4rem)]"><Sidebar view={view} setView={(next) => { setView(next); setMobileOpen(false) }} collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} mobileOpen={mobileOpen} /><main className="min-w-0 flex-1 px-4 py-7 md:px-7 lg:px-10"><div className="mx-auto max-w-[1500px]">
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"><span>Workspace</span><ChevronRight className="size-3" /><span className="text-foreground">{currentLabel}</span></div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{view === 'today' ? 'Premarket command center' : currentLabel}</h1><p className="mt-2 max-w-xl text-sm leading-5 text-muted-foreground">{view === 'today' ? 'Build a clear market hypothesis before the opening bell.' : view === 'history' ? 'Study past snapshots to improve how you frame the open.' : view === 'logic' ? 'A practical framework for reading volatility, structure, and positioning.' : 'Review the session after the hypothesis meets price.'}</p></div><div className="flex items-center gap-2"><div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-[11px] text-muted-foreground"><CalendarDays className="size-3.5" />{field(latest, 'trade_date')}</div><button className="rounded-lg border border-border/70 bg-card p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Filter dashboard"><Filter className="size-3.5" /></button></div></div>
    {feedError && <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs"><Database className="mt-0.5 size-4 shrink-0 text-amber-400" /><div><p className="font-medium text-foreground">Premarket source is not available</p><p className="mt-1 text-muted-foreground">No readable <span className="font-mono text-foreground">premarket_dashboard</span> table is exposed by the connected Supabase project. Values and interpretations remain intentionally blank.</p></div></div>}
    {view === 'today' && <div className="space-y-8"><PulsePanel row={latest} /><div><SectionHeading eyebrow="The evidence" title="Market factors" action="Start broad, then go specific" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SignalCard label="Index bias" value={field(latest, 'nifty', 'market_status')} note="Direction needs price confirmation" icon={TrendingUp} /><SignalCard label="India VIX" value={field(latest, 'india_vix')} note="Uncertainty around the open" icon={Activity} /><SignalCard label="Nifty PCR" value={field(latest, 'nifty_pcr')} note="Positioning, not a standalone signal" icon={SlidersHorizontal} /><SignalCard label="Gift Nifty" value={field(latest, 'gift_nifty')} note="Overnight directional cue" icon={Zap} /></div></div><div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.75fr)]"><div className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><LevelsPanel row={latest} /><PositioningPanel row={latest} /></div><div><SectionHeading eyebrow="Scenario map" title="What could happen next" action="A hypothesis, not a prediction" /><div className="grid gap-3 md:grid-cols-3"><ScenarioCard title="Trend continuation" condition="Bull case" description="Price holds above the opening range and positioning confirms participation." icon={ArrowUpRight} tone="positive" /><ScenarioCard title="Two-way open" condition="Base case" description="Mixed signals keep price inside the known range until breadth improves." icon={Target} tone="neutral" /><ScenarioCard title="Failed direction" condition="Risk case" description="A rejection at resistance or support changes the opening hypothesis." icon={ArrowDownRight} tone="negative" /></div></div><DataDetails row={latest} /></div><ContextRail row={latest} /></div><div><SectionHeading eyebrow="Context over time" title="Trend monitors" action="Charts activate when history is available" /><div className="grid gap-3 md:grid-cols-2"><MiniTrend title="India VIX" value={field(latest, 'india_vix')} caption="Watch whether volatility is compressing or expanding into the open." tone="rose" /><MiniTrend title="Nifty PCR" value={field(latest, 'nifty_pcr')} caption="Use changes in positioning to validate, not lead, the price view." tone="teal" /></div></div></div>}
    {view === 'history' && <div className="space-y-5"><section className="rounded-xl border border-border/70 bg-card p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Research log</p><h2 className="text-base font-semibold">Historical snapshots</h2><p className="mt-1 text-xs text-muted-foreground">Compare the evidence behind previous premarket views.</p></div><div className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2"><Search className="size-3.5 text-muted-foreground" /><input value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} placeholder="Filter records" className="w-40 bg-transparent text-xs outline-none placeholder:text-muted-foreground" /></div></div></section><div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)]"><div className="overflow-x-auto rounded-xl border border-border/70 bg-card"><table className="w-full min-w-[680px] text-left text-[11px]"><thead className="bg-muted/35 text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Trade date</th><th className="px-5 py-3 font-medium">Market</th><th className="px-5 py-3 font-medium">VIX</th><th className="px-5 py-3 font-medium">PCR</th><th className="px-5 py-3 font-medium">Nifty</th><th className="px-5 py-3 font-medium">Fields</th></tr></thead><tbody>{filteredRows.length === 0 ? <tr><td colSpan={6} className="px-5 py-16 text-center"><EmptyState compact /></td></tr> : filteredRows.map((row, index) => <tr key={index} className="border-t border-border/70 hover:bg-accent/30"><td className="px-5 py-3 font-mono">{field(row, 'trade_date')}</td><td className="px-5 py-3">{field(row, 'market_status')}</td><td className="px-5 py-3 font-mono">{field(row, 'india_vix')}</td><td className="px-5 py-3 font-mono">{field(row, 'nifty_pcr')}</td><td className="px-5 py-3 font-mono">{field(row, 'nifty')}</td><td className="px-5 py-3 text-muted-foreground">{Object.keys(row).length}</td></tr>)}</tbody></table></div><section className="rounded-xl border border-border/70 bg-card p-5"><SectionHeading eyebrow="Research lens" title="Patterns to look for" /><div className="space-y-4 text-[11px] leading-5 text-muted-foreground"><p><span className="font-medium text-foreground">Regime shifts:</span> Did volatility change before price direction?</p><p><span className="font-medium text-foreground">Confirmation:</span> Did options positioning agree with the index?</p><p><span className="font-medium text-foreground">Invalidation:</span> Which level made the premarket thesis wrong?</p></div></section></div></div>}
    {view === 'logic' && <LogicView />}
    {view === 'post' && <div className="flex min-h-[460px] items-center justify-center rounded-2xl border border-dashed border-border bg-card/40"><div className="max-w-md text-center"><Clock3 className="mx-auto mb-4 size-7 text-muted-foreground" /><h2 className="text-lg font-semibold">Post-market review is next</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Capture what the market actually did, compare it with the premarket hypothesis, and build a feedback loop for better decisions.</p><button onClick={() => setView('logic')} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-medium hover:bg-accent">Learn the framework <ChevronRight className="size-3.5" /></button></div></div>}
  </div></main></div></div>
}

export default function Home() { return <App /> }
