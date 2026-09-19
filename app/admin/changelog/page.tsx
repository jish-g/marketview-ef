'use client'

import useSWR from 'swr'
import { callAdminApi } from '@/lib/admin-api'

type Entry = { id: number; entry_date: string; kind: 'feature' | 'daily'; title: string; body: string; created_at: string }

export default function AdminChangelogPage() {
  const { data, error, isLoading } = useSWR<{ entries: Entry[] }>('admin-changelog', () => callAdminApi<{ entries: Entry[] }>('changelog_list'))

  return (
    <>
      <div className="content-head"><div><h1>Admin</h1><h2>Changelog</h2></div></div>
      <p className="doc-intro">Entries are created automatically by the deploy-changelog function whenever a production deploy ships (see supabase/functions/deploy-changelog) — nothing to add by hand here.</p>

      {isLoading && <div className="state-card">Loading entries…</div>}
      {error && <div className="state-card error">{error.message}</div>}
      {data && data.entries.map((e) => (
        <div key={e.id} className="doc-note" style={{ marginTop: 0, marginBottom: 12, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span style={{ color: 'var(--muted)', fontSize: 'var(--text-label)' }}>{e.entry_date} · {e.kind === 'daily' ? 'Daily update' : 'Product update'}</span>
          <strong style={{ fontSize: 'var(--text-meta)' }}>{e.title}</strong>
          <span>{e.body}</span>
        </div>
      ))}
      {data && data.entries.length === 0 && <p className="doc-intro">No entries yet.</p>}
    </>
  )
}
