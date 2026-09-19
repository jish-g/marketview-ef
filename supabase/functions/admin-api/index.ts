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
  const res = await fetch(`${authUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${accessToken}`, apikey: authAnonKey },
  })
  if (!res.ok) return false
  const user = await res.json()
  return user?.email === ADMIN_EMAIL
}

// Tables this project owns, and the timestamp column that best answers "when did this last
// write". Used by the `health` action to flag pipelines that have gone quiet.
const HEALTH_SOURCES = [
  { table: 'premarket_dashboard', column: 'updated_at', label: 'Pre-market dashboard' },
  { table: 'midmarket_snapshot', column: 'updated_at', label: 'Mid-market snapshot' },
  { table: 'postmarket_summary', column: 'updated_at', label: 'Post-market summary' },
  { table: 'index_candles', column: 'updated_at', label: 'Index candle sync' },
  { table: 'market_news', column: 'trade_date', label: 'Market news' },
  { table: 'oi_snapshot_log', column: 'trade_date', label: 'OI snapshot log' },
  { table: 'changelog_entries', column: 'created_at', label: 'Changelog' },
] as const

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
      const checks = await Promise.all(HEALTH_SOURCES.map(async (source) => {
        const { data, error } = await admin
          .from(source.table)
          .select(source.column)
          .order(source.column, { ascending: false })
          .limit(1)
          .maybeSingle()
        return {
          table: source.table,
          label: source.label,
          latest: error ? null : ((data as Record<string, unknown> | null)?.[source.column] ?? null),
          error: error?.message ?? null,
        }
      }))
      return json({ checks })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
