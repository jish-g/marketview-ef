'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Filter,
  LayoutDashboard,
  LineChart,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  SlidersHorizontal,
  Sun,
  Zap,
} from 'lucide-react'
type DashboardRow = Record<string, unknown>
type View = 'today' | 'history' | 'logic' | 'post'

const navItems = [
  { id: 'today' as View, label: 'Today', icon: LayoutDashboard },
  { id: 'history' as View, label: 'History', icon: CalendarDays },
  { id: 'logic' as View, label: 'Logic', icon: SlidersHorizontal },
  { id: 'post' as View, label: 'Post Market', icon: Clock3 },
]

const sectionData = [
  { title: 'Overview', rows: ['Market Status', 'Gift Nifty', 'SGX Nifty', 'India VIX', 'Nifty PCR'], values: ['—', '—', '—', '—', '—'], tone: 'neutral' },
  { title: 'Levels', rows: ['Nifty 50', 'Sensex', 'Nifty Support', 'Nifty Resistance', 'Previous Close'], values: ['—', '—', '—', '—', '—'], tone: 'neutral' },
  { title: 'Options', rows: ['Max Pain', 'Call OI', 'Put OI', 'Call Writing', 'Put Writing'], values: ['—', '—', '—', '—', '—'], tone: 'neutral' },
  { title: 'Open Interest', rows: ['Highest Call OI', 'Highest Put OI', 'Change in Call OI', 'Change in Put OI', 'PCR Change'], values: ['—', '—', '—', '—', '—'], tone: 'neutral' },
]

function MetricTable({ title, rows, values, tone }: { title: string; rows: string[]; values: string[]; tone: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">{title}</h2>
        <button className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground" aria-label={`Configure ${title}`}>
          <Settings2 className="size-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-[1.5fr_1fr_1fr] text-[11px]">
        <div className="border-b border-border bg-muted/35 px-4 py-2 text-muted-foreground">Metric</div>
        <div className="border-b border-l border-border bg-muted/35 px-3 py-2 text-right text-muted-foreground">Nifty</div>
        <div className="border-b border-l border-border bg-muted/35 px-3 py-2 text-right text-muted-foreground">Sensex</div>
        {rows.map((row, index) => (
          <div key={row} className="contents">
            <div className="border-b border-border px-4 py-2.5 text-muted-foreground">{row}</div>
            <div className={`border-b border-l border-border px-3 py-2.5 text-right font-mono tabular-nums ${tone === 'positive' ? 'text-emerald-400' : tone === 'negative' ? 'text-rose-400' : 'text-foreground'}`}>{values[index]}</div>
            <div className="border-b border-l border-border px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{values[index]}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function EmptyChart({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-start justify-between">
        <div><h3 className="text-xs font-semibold text-foreground">{title}</h3><p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p></div>
        <LineChart className="size-4 text-muted-foreground" />
      </div>
      <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-center">
        <div><Database className="mx-auto mb-2 size-5 text-muted-foreground" /><p className="text-xs text-muted-foreground">No data available</p><p className="mt-1 text-[10px] text-muted-foreground/70">Connect a premarket_dashboard feed to populate this chart.</p></div>
      </div>
    </section>
  )
}

function Header({ onMenu, theme, onTheme }: { onMenu: () => void; theme: 'dark' | 'light'; onTheme: () => void }) {
  return <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
    <div className="flex items-center gap-3"><button onClick={onMenu} className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden" aria-label="Open navigation"><Menu className="size-4" /></button><div className="flex items-center gap-2"><div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><BarChart3 className="size-4" /></div><span className="text-sm font-semibold tracking-tight">MarketView</span><span className="hidden border-l border-border pl-3 text-[11px] text-muted-foreground sm:inline">Trading Dashboard</span></div></div>
    <div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground lg:flex"><span className="size-1.5 rounded-full bg-amber-400" />Feed status: waiting for data</div><button onClick={onTheme} className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Toggle theme">{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}</button><button className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Help"><CircleHelp className="size-4" /></button></div>
  </header>
}

function Sidebar({ view, setView, collapsed, onCollapse, mobileOpen }: { view: View; setView: (view: View) => void; collapsed: boolean; onCollapse: () => void; mobileOpen: boolean }) {
  return <aside className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'md:w-[68px]' : 'md:w-56'} fixed inset-y-14 left-0 z-20 flex w-64 flex-col border-r border-border bg-card transition-all duration-200 md:static md:inset-auto md:translate-x-0`}>
    <div className="flex items-center justify-between border-b border-border p-3"><span className={`${collapsed ? 'md:hidden' : ''} px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground`}>Workspace</span><button onClick={onCollapse} className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:block" aria-label="Collapse sidebar">{collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button></div>
    <nav className="flex-1 space-y-1 p-3">{navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setView(id)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs transition ${view === id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}><Icon className="size-4 shrink-0" /><span className={collapsed ? 'md:hidden' : ''}>{label}</span>{id === 'today' && <span className={`${collapsed ? 'md:hidden' : ''} ml-auto size-1.5 rounded-full bg-amber-400`} />}</button>)}</nav>
    <div className={`${collapsed ? 'md:items-center' : ''} flex items-center gap-3 border-t border-border p-3 text-muted-foreground`}><div className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">MV</div><div className={collapsed ? 'md:hidden' : ''}><p className="text-[11px] font-medium text-foreground">MarketView</p><p className="text-[10px]">Read-only workspace</p></div></div>
  </aside>
}

function App() {
  const [view, setView] = useState<View>('today')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [rows, setRows] = useState<DashboardRow[]>([])
  const [feedError, setFeedError] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState('')

  useEffect(() => { const saved = window.localStorage.getItem('marketview-theme') as 'dark' | 'light' | null; const next = saved || 'dark'; setTheme(next); document.documentElement.classList.toggle('dark', next === 'dark'); document.documentElement.classList.toggle('light', next === 'light') }, [])
  useEffect(() => { const load = async () => { try { const supabase = createClient(); const { data, error } = await supabase.from('premarket_dashboard').select('*').order('trade_date', { ascending: false }); if (error) throw error; setRows(data || []) } catch (error) { setFeedError(error instanceof Error ? error.message : 'Unable to read the connected feed.') } }; load() }, [])
  const filteredRows = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(historyFilter.toLowerCase())), [rows, historyFilter])
  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); window.localStorage.setItem('marketview-theme', next); document.documentElement.classList.toggle('dark', next === 'dark'); document.documentElement.classList.toggle('light', next === 'light') }
  const currentLabel = navItems.find((item) => item.id === view)?.label || 'Today'
  return <div className="min-h-screen bg-background font-sans text-foreground"><Header onMenu={() => setMobileOpen(!mobileOpen)} theme={theme} onTheme={toggleTheme} /><div className="flex min-h-[calc(100vh-3.5rem)]"><Sidebar view={view} setView={(next) => { setView(next); setMobileOpen(false) }} collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} mobileOpen={mobileOpen} /><main className="min-w-0 flex-1 px-4 py-5 md:px-6 lg:px-8"><div className="mx-auto max-w-[1440px]">
    <div className="mb-6 flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"><span>Workspace</span><ChevronRight className="size-3" /><span className="text-foreground">{currentLabel}</span></div><h1 className="text-2xl font-semibold tracking-tight">{currentLabel === 'Today' ? 'Premarket Dashboard' : currentLabel}</h1><p className="mt-1 text-xs text-muted-foreground">{view === 'today' ? 'Indian equity market overview before the opening bell.' : view === 'history' ? 'Review historical premarket snapshots and market context.' : 'This module is reserved for the next release.'}</p></div><div className="flex items-center gap-2"><div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground"><CalendarDays className="size-3.5" />{rows[0]?.trade_date ? String(rows[0].trade_date) : 'No latest date'}<ChevronDown className="size-3" /></div><button className="rounded-md border border-border bg-card p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Filter dashboard"><Filter className="size-3.5" /></button></div></div>
    {feedError && <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs"><Database className="mt-0.5 size-4 shrink-0 text-amber-400" /><div><p className="font-medium text-foreground">Premarket data feed unavailable</p><p className="mt-1 text-muted-foreground">The connected Supabase project does not currently expose a readable <span className="font-mono text-foreground">premarket_dashboard</span> table. Dashboard values will appear once the feed is connected.</p></div></div>}
    {view === 'today' && <><div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg border border-border bg-card p-4"><div className="mb-3 flex items-center justify-between"><span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Market status</span><Activity className="size-4 text-muted-foreground" /></div><p className="text-lg font-semibold text-muted-foreground">Waiting</p><p className="mt-1 text-[11px] text-muted-foreground">Feed has no observations</p></div><div className="rounded-lg border border-border bg-card p-4"><div className="mb-3 flex items-center justify-between"><span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Latest snapshot</span><Zap className="size-4 text-muted-foreground" /></div><p className="font-mono text-lg font-semibold tabular-nums">—</p><p className="mt-1 text-[11px] text-muted-foreground">No trade date available</p></div><div className="rounded-lg border border-border bg-card p-4"><div className="mb-3 flex items-center justify-between"><span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Data points</span><BarChart3 className="size-4 text-muted-foreground" /></div><p className="font-mono text-lg font-semibold tabular-nums">{rows.length}</p><p className="mt-1 text-[11px] text-muted-foreground">Rows returned from Supabase</p></div><div className="rounded-lg border border-border bg-card p-4"><div className="mb-3 flex items-center justify-between"><span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Last refresh</span><Clock3 className="size-4 text-muted-foreground" /></div><p className="font-mono text-lg font-semibold tabular-nums">—</p><p className="mt-1 text-[11px] text-muted-foreground">Awaiting source data</p></div></div><div className="grid gap-4 xl:grid-cols-2">{sectionData.map((section) => <MetricTable key={section.title} {...section} />)}</div><div className="mt-4 grid gap-4 lg:grid-cols-2"><EmptyChart title="India VIX" subtitle="Volatility trend across recent sessions" /><EmptyChart title="30-day Nifty PCR" subtitle="Put-call ratio over the last 30 trading days" /></div></>}
    {view === 'history' && <div className="space-y-4"><div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center"><div><h2 className="text-xs font-semibold">Historical snapshots</h2><p className="mt-1 text-[11px] text-muted-foreground">{filteredRows.length} rows available in the connected feed.</p></div><div className="flex items-center gap-2 rounded-md border border-border px-3 py-2"><Search className="size-3.5 text-muted-foreground" /><input value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} placeholder="Filter records" className="w-40 bg-transparent text-xs outline-none placeholder:text-muted-foreground" /></div></div><div className="overflow-x-auto rounded-lg border border-border bg-card"><table className="w-full min-w-[680px] text-left text-[11px]"><thead className="bg-muted/35 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Trade date</th><th className="px-4 py-3 font-medium">Market</th><th className="px-4 py-3 font-medium">VIX</th><th className="px-4 py-3 font-medium">PCR</th><th className="px-4 py-3 font-medium">Nifty</th><th className="px-4 py-3 font-medium">Source fields</th></tr></thead><tbody>{filteredRows.length === 0 ? <tr><td colSpan={6} className="px-4 py-14 text-center text-muted-foreground">No historical data available.</td></tr> : filteredRows.map((row, index) => <tr key={index} className="border-t border-border"><td className="px-4 py-3 font-mono">{String(row.trade_date || '—')}</td><td className="px-4 py-3">{String(row.market_status || '—')}</td><td className="px-4 py-3 font-mono">{String(row.india_vix || '—')}</td><td className="px-4 py-3 font-mono">{String(row.nifty_pcr || '—')}</td><td className="px-4 py-3 font-mono">{String(row.nifty || '—')}</td><td className="px-4 py-3 text-muted-foreground">{Object.keys(row).length} fields</td></tr>)}</tbody></table></div></div>}
    {(view === 'logic' || view === 'post') && <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-border bg-card/40"><div className="max-w-sm text-center"><SlidersHorizontal className="mx-auto mb-4 size-7 text-muted-foreground" /><h2 className="text-sm font-semibold">Module in preparation</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">This workspace is ready for the {currentLabel.toLowerCase()} workflow. The read-only premarket feed will be shared across modules.</p></div></div>}
  </div></main></div></div>
}

export default function Home() { return <App /> }
