'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/use-session'
import { isAdminEmail } from '@/lib/is-admin'

// Like AuthGuard (components/auth-guard.tsx), but for the single admin account rather
// than any signed-in session: signed-out visitors go to /login, signed-in non-admins go
// back to the homepage, and nothing here renders until both checks have cleared.
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession()
  const router = useRouter()
  const isAdmin = isAdminEmail(session?.user?.email)

  useEffect(() => {
    if (loading) return
    if (!session) { router.replace('/login'); return }
    if (!isAdmin) router.replace('/')
  }, [loading, session, isAdmin, router])

  if (loading || !session || !isAdmin) return null

  return <>{children}</>
}
