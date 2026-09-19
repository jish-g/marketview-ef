import { createAuthClient } from '@/lib/supabase/auth-client'

// Client for the `admin-api` edge function (see supabase/functions/admin-api), backing
// Changelog + Pipeline health. Users calls the separate `admin-users` function instead
// (see callAdminUsersApi below) since it needs a different privileged call shape
// (auth.users via the admin API, not a plain table read) -- both deploy to the same
// project, despite once being written as if they were on separate projects.
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
  // `||`, not `??`: an empty-string error from the function is exactly as useless to show
  // as a missing one, so both should fall back to the generic message.
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
  return body as T
}

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
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
  return body as T
}
