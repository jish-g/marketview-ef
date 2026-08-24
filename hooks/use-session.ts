'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createAuthClient } from '@/lib/supabase/auth-client'

// Minimal client-side session check for the single-admin auth account.
// `loading` is true only until the initial session lookup resolves, so
// callers can avoid gating UI on a still-unknown auth state.
// Client creation is guarded so a misconfigured Supabase env var never
// crashes the surrounding page — the user just appears signed out.
export function useSession() {
  const supabase = useMemo<SupabaseClient | null>(() => {
    try {
      return createAuthClient()
    } catch (error) {
      console.error('[v0] Failed to create Supabase auth client:', error)
      return null
    }
  }, [])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [supabase])

  const signOut = async () => {
    await supabase?.auth.signOut()
  }

  return { session, loading, signOut }
}
