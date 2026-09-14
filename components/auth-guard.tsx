'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/use-session'

// Local-only escape hatch for previewing protected routes without a session -- set
// NEXT_PUBLIC_DEV_BYPASS_AUTH=true in .env.local when you need to eyeball the dashboard
// (responsive QA, layout work) on `next dev`.
//
// Both halves are evaluated at build time and inlined by the bundler, so a production
// build always folds this to `false` no matter what the environment says: NODE_ENV is
// 'production' for `next build`, which makes the flag unreachable in any deployed bundle.
// Never relax the NODE_ENV check -- NEXT_PUBLIC_* values ship to the browser, so without
// it a stray env var on the host would disable the guard for real users.
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'

// Client-side guard for any route segment that requires an active session.
// Wrap the layout of a protected route (see app/dashboard/layout.tsx,
// app/rules/layout.tsx) with this component. Renders nothing while the
// session is unresolved or missing, so protected content never flashes
// before the redirect to /login completes.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (DEV_BYPASS_AUTH) return
    if (!loading && !session) router.replace('/login')
  }, [loading, session, router])

  if (!DEV_BYPASS_AUTH && (loading || !session)) return null

  return <>{children}</>
}
