// Backs the /admin panel (Changelog + Pipeline health sections) in the Next.js app.
// Changelog entries themselves are written by the deploy-changelog function instead,
// triggered by Vercel's production-deploy webhook -- this function only ever reads them.
//
// This project only holds market data, not the app's auth users -- the app's login lives
// in a separate, single-admin Supabase auth project (see lib/supabase/auth-client.ts).
// verify_jwt is off here on purpose: an incoming access token comes from that OTHER
// project, so this project's own JWT gateway can't validate it. Instead the caller sends
// its own public auth project URL/anon key (both are safe to expose, same values already
// shipped to the browser) alongside its access token, and we ask that auth project to
// verify the token and hand back the signed-in user -- trust comes from Supabase's own
// verification, not from anything the client asserts.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ADMIN_EMAIL = 'jishnu@ziovy.com'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function isAdminCaller(authUrl: unknown, authAnonKey: unknown, accessToken: unknown): Promise<boolean> {
  if (typeof authUrl !== 'string' || typeof authAnonKey !== 'string' || typeof accessToken !== 'string') return false
  if (!authUrl || !authAnonKey || !accessToken) return false
  try {
    const res = await fetch(`${authUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: authAnonKey },
    })
    if (!res.ok) return false
    const user = await res.json()
    return user?.email === ADMIN_EMAIL
  } catch {
    // A malformed authUrl (or the auth project being unreachable) is not an admin caller --
    // it isn't a server error either, so this must not throw and 500 the whole request.
    return false
  }
}

// Every scheduled edge function this project runs, the table it writes to, and the
// timestamp column that best answers "when did this last write". Used by the `health`
// action so /admin/health can show one row per function instead of just per table.
// A couple of functions (statusColumn/errorColumn set) log their own outcome per run --
// for the rest, "stale" is the only signal we have, since nothing else in the pipeline
// records a failure reason (see the code comment on the `health` handler below).
const HEALTH_SOURCES = [
  { function: 'market-data-sync', table: 'premarket_dashboard', column: 'updated_at', label: 'Pre-market dashboard' },
  { function: 'market-data-sync', table: 'midmarket_snapshot', column: 'updated_at', label: 'Mid-market snapshot' },
  { function: 'market-data-sync', table: 'postmarket_summary', column: 'updated_at', label: 'Post-market summary' },
  { function: 'index-candle-sync', table: 'index_candles', column: 'updated_at', label: 'Index candle sync' },
  { function: 'news-sync', table: 'market_news', column: 'trade_date', label: 'Market news' },
  { function: 'news-sync', table: 'news_articles', column: 'fetched_at', label: 'News articles' },
  { function: 'oi-snapshot-log', table: 'oi_snapshot_log', column: 'trade_date', label: 'OI snapshot log' },
  { function: 'option-chain-snapshot-log', table: 'option_chain_snapshot', column: 'captured_at', label: 'Option chain snapshot' },
  { function: 'global-cues-fetch', table: 'global_cues', column: 'fetched_at', label: 'Global cues' },
  { function: 'global-context-sync', table: 'global_context', column: 'calculated_at', label: 'Global context (AI)' },
  { function: 'gift-nifty-fetch', table: 'gift_nifty_staging', column: 'fetched_at', label: 'GIFT Nifty fetch', statusColumn: 'status', errorColumn: 'error_detail' },
  { function: 'kite-session-refresh', table: 'kite_session', column: 'updated_at', label: 'Kite session' },
  { function: 'market-intelligence', table: 'agent_calls', column: 'created_at', label: 'AI market intelligence (agent calls)' },
  { function: 'deploy-changelog', table: 'changelog_entries', column: 'created_at', label: 'Changelog' },
] as const

// Loose on purpose -- this isn't a per-source SLA, just a "does this look dead" signal.
const STALE_HOURS = 30

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isStale(latest: string | null): boolean {
  if (!latest) return true
  const at = new Date(isDateOnly(latest) ? `${latest}T00:00:00Z` : latest)
  if (Number.isNaN(at.getTime())) return false
  return Date.now() - at.getTime() > STALE_HOURS * 60 * 60 * 1000
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { action, authUrl, authAnonKey, accessToken } = body
  if (!(await isAdminCaller(authUrl, authAnonKey, accessToken))) return json({ error: 'Forbidden' }, 403)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    if (action === 'changelog_list') {
      const { data, error } = await admin
        .from('changelog_entries')
        .select('id, entry_date, kind, title, body, created_at')
        .order('entry_date', { ascending: false })
        .order('id', { ascending: false })
        .limit(200)
      if (error) throw error
      return json({ entries: data ?? [] })
    }

    if (action === 'health') {
      // "Comment" (the failure reason) is only ever as good as what the pipeline itself
      // records. gift-nifty-fetch writes its own status + error_detail per run, so that
      // row can show a real reason. Nothing else in this pipeline logs why a run failed --
      // a failed run there just... doesn't write a row -- so the honest comment for those
      // is "no successful write since X", not a guessed cause.
      const checks = await Promise.all(HEALTH_SOURCES.map(async (source) => {
        const columns = [source.column, source.statusColumn, source.errorColumn].filter(Boolean).join(', ')
        const { data, error } = await admin
          .from(source.table)
          .select(columns)
          .order(source.column, { ascending: false })
          .limit(1)
          .maybeSingle()

        const row = data as Record<string, unknown> | null
        const latest = (row?.[source.column] as string | undefined) ?? null

        if (error) {
          return { function: source.function, table: source.table, label: source.label, latest: null, status: 'error', comment: error.message }
        }
        if (source.statusColumn && row) {
          const runStatus = row[source.statusColumn] as string | undefined
          if (runStatus && runStatus.toLowerCase() !== 'ok') {
            const detail = (source.errorColumn ? (row[source.errorColumn] as string | undefined) : null) ?? 'Reported a failure with no detail'
            return { function: source.function, table: source.table, label: source.label, latest, status: 'error', comment: detail }
          }
        }
        if (!latest) {
          return { function: source.function, table: source.table, label: source.label, latest: null, status: 'error', comment: 'No data has ever been written' }
        }
        if (isStale(latest)) {
          return { function: source.function, table: source.table, label: source.label, latest, status: 'stale', comment: `No successful write since ${latest}` }
        }
        return { function: source.function, table: source.table, label: source.label, latest, status: 'healthy', comment: null }
      }))
      return json({ checks })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
