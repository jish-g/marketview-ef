'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandSymbol } from '@/components/brand-mark'
import { useSession } from '@/hooks/use-session'

// Reuses the dashboard's own shell classes (.app-shell/.topbar/.workspace/.sidebar/
// .phase-nav/.content, see app/globals.css ~line 609 on) so /admin looks like the rest
// of the product instead of introducing a second design language for one section.
const SECTIONS = [
  { href: '/admin', label: 'Users', subtitle: 'Accounts & last login' },
  { href: '/admin/changelog', label: 'Changelog', subtitle: 'Product updates' },
  { href: '/admin/health', label: 'Pipeline health', subtitle: 'Data freshness' },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { signOut } = useSession()

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><BrandSymbol size={30} /><div><strong>MarketCue</strong><span>Admin</span></div></div>
        <div className="topbar-meta">
          <Link href="/dashboard" className="topbar-toggle">Back to app</Link>
          <button type="button" className="topbar-toggle" onClick={() => signOut()}>Sign out</button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="side-label">ADMIN</div>
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className={`phase-nav ${pathname === s.href ? 'active' : ''}`}>
              <span><strong>{s.label}</strong><small>{s.subtitle}</small></span>
            </Link>
          ))}
        </aside>
        <div className="content">{children}</div>
      </div>
    </main>
  )
}
