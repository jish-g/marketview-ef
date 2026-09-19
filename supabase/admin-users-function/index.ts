// Backs the Users section of /admin in the Next.js app.
//
// IMPORTANT: this does NOT belong in supabase/functions/ -- everything in that folder
// deploys to the "rolecamp" market-data project (see supabase/functions/admin-api,
// which powers the rest of the admin panel). This function needs a DIFFERENT project's
// data: the app's login lives in a separate, single-admin Supabase auth project
// (see lib/supabase/auth-client.ts), and only that project's `auth.users` table and
// service-role key can answer "who has an account and when did they last sign in".
//
// Deploy this file to that auth project specifically, e.g.:
//   supabase functions deploy admin-users --project-ref <auth-project-ref> --no-verify-jwt
// <auth-project-ref> is the subdomain of NEXT_PUBLIC_SUPABASE_URL
// (https://<ref>.supabase.co). No new secrets needed -- SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided automatically to every edge function by
// the project it's deployed to.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ADMIN_EMAIL = 'jishnu@ziovy.com'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const accessToken = body.accessToken
  if (typeof accessToken !== 'string' || !accessToken) return json({ error: 'Forbidden' }, 403)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Unlike admin-api (a different project), the caller's token IS this project's own
  // token here, so we can ask this project's own auth admin API to verify it directly.
  const { data: callerData, error: callerError } = await admin.auth.getUser(accessToken)
  if (callerError || callerData.user?.email !== ADMIN_EMAIL) return json({ error: 'Forbidden' }, 403)

  try {
    const perPage = 200
    let page = 1
    const users: { id: string; email: string | null; name: string | null; created_at: string; last_sign_in_at: string | null }[] = []
    // Paginate through every account -- a single-admin auth project will have very few
    // users, but this keeps working if that ever changes.
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
      if (error) throw error
      for (const u of data.users) {
        users.push({
          id: u.id,
          email: u.email ?? null,
          name: (u.user_metadata?.full_name as string | undefined) ?? (u.user_metadata?.name as string | undefined) ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
        })
      }
      if (data.users.length < perPage) break
      page += 1
    }
    users.sort((a, b) => (b.last_sign_in_at ?? '').localeCompare(a.last_sign_in_at ?? ''))
    return json({ users })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
