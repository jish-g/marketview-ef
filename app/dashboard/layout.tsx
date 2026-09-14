import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AuthGuard } from '@/components/auth-guard'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>
}
