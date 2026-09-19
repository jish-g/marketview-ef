import { createAuthClient } from '@/lib/supabase/auth-client'

// Client for the `admin-api` edge function (deployed to the market-data project, see
// supabase/functions/admin-api). It backs Changelog + Pipeline health. The Users section
// calls a *different* function deployed to the auth project instead -- see
// supabase/admin-users-function and callAdminUsersApi below -- because only that
// project's own auth.users table can answer who has an account.
const ADMIN_API_URL = 'https://vkcklvoizfpbnjdgaxai.supabase.co/functions/v1/admin-api'

async function getAccessToken(): Promise<string | null> {
  const supabase = createAuthClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function callAdminApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const accessToken = await getAccessToken()
  if (!accessToken) throw new Error('Not signed in')
  const res = await fetch(ADMIN_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      accessToken,
      authUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      authAnonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      ...payload,
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body as T
}

// Calls the separate admin-users function once it's deployed to the auth project (see
// supabase/admin-users-function/index.ts for the deploy step). Until then this throws,
// and the Users page shows that as a normal error state rather than crashing.
export async function callAdminUsersApi<T>(): Promise<T> {
  const accessToken = await getAccessToken()
  if (!accessToken) throw new Error('Not signed in')
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  const res = await fetch(`${base}/functions/v1/admin-users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body as T
}
