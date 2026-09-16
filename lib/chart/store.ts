import type { Settings } from './types'
import { INDICATORS, STARTER_TEMPLATES } from './registry'

// What the chart remembers per browser: which indicators are on, which are hidden, each one's
// settings, the user's templates and which template is selected, and whether the legend is
// collapsed. One key, one JSON object, read after mount so hydration stays clean.
export const STORE_KEY = 'marketcue.chart.v2'

export type Template = { ids: string[]; settings?: Record<string, Settings> }

export type ChartState = {
  active: string[]
  hidden: string[]
  settings: Record<string, Settings>
  templates: Record<string, Template>
  template: string
  legendCollapsed: boolean
}

export function defaultState(): ChartState {
  const templates: Record<string, Template> = {}
  for (const [name, ids] of Object.entries(STARTER_TEMPLATES)) templates[name] = { ids }
  return {
    active: [...STARTER_TEMPLATES['Open']],
    hidden: [],
    settings: Object.fromEntries(INDICATORS.map((d) => [d.id, { ...d.defaults }])),
    templates,
    template: 'Open',
    legendCollapsed: false,
  }
}

export function loadState(): ChartState {
  const base = defaultState()
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<ChartState>
    const known = new Set(INDICATORS.map((d) => d.id))
    const settings: Record<string, Settings> = { ...base.settings }
    for (const [id, s] of Object.entries(saved.settings ?? {})) if (known.has(id) && s && typeof s === 'object') settings[id] = { ...base.settings[id], ...s }
    const templates = { ...base.templates }
    for (const [name, t] of Object.entries(saved.templates ?? {})) if (t && Array.isArray(t.ids)) templates[name] = { ids: t.ids.filter((id) => known.has(id)), settings: t.settings }
    return {
      active: (saved.active ?? base.active).filter((id) => known.has(id)),
      hidden: (saved.hidden ?? []).filter((id) => known.has(id)),
      settings,
      templates,
      template: saved.template && templates[saved.template] ? saved.template : base.template,
      legendCollapsed: Boolean(saved.legendCollapsed),
    }
  } catch { return base }
}

export function saveState(state: ChartState) {
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch { /* private mode */ }
}
