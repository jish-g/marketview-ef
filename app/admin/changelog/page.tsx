'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { callAdminApi } from '@/lib/admin-api'

type Entry = { id: number; entry_date: string; kind: 'feature' | 'daily'; title: string; body: string; created_at: string }

function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

export default function AdminChangelogPage() {
  const { data, error, isLoading, mutate } = useSWR<{ entries: Entry[] }>('admin-changelog', () => callAdminApi<{ entries: Entry[] }>('changelog_list'))
  const [entryDate, setEntryDate] = useState(todayIST())
  const [kind, setKind] = useState<'feature' | 'daily'>('feature')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      await callAdminApi('changelog_insert', { entry_date: entryDate, kind, title, body })
      setTitle('')
      setBody('')
      await mutate()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save entry')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="content-head"><div><h1>Admin</h1><h2>Changelog</h2></div></div>

      <form onSubmit={onSubmit} className="doc-note" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginTop: 0, marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
          <select value={kind} onChange={(e) => setKind(e.target.value as 'feature' | 'daily')}>
            <option value="feature">Feature</option>
            <option value="daily">Daily</option>
          </select>
        </div>
        <input type="text" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea placeholder="What changed" value={body} onChange={(e) => setBody(e.target.value)} rows={3} required />
        <div>
          <button type="submit" className="action-button" disabled={submitting}>{submitting ? 'Saving…' : 'Add entry'}</button>
        </div>
        {submitError && <span style={{ color: 'var(--caution)' }}>{submitError}</span>}
      </form>

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
