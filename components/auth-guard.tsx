'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/use-session'

// Client-side guard for any route segment that requires an active session.
// Wrap the layout of a protected route (see app/dashboard/layout.tsx,
// app/rules/layout.tsx) with this component. Renders nothing while the
// session is unresolved or missing, so protected content never flashes
// before the redirect to /login completes.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !session) router.replace('/login')
  }, [loading, session, router])

  if (loading || !session) return null

  return <>{children}</>
}
