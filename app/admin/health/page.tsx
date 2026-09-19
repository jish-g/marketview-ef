'use client'

import useSWR from 'swr'
import { callAdminApi } from '@/lib/admin-api'

type Check = { function: string; table: string; label: string; latest: string | null; status: 'healthy' | 'stale' | 'error'; comment: string | null }

function fmtLatest(latest: string | null): string {
  if (!latest) return 'No data'
  const asDate = new Date(latest)
  if (Number.isNaN(asDate.getTime())) return latest
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(latest)
  return isDateOnly
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(asDate)
    : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(asDate) + ' IST'
}

const STATUS_COLOR: Record<Check['status'], string> = { healthy: 'var(--up)', stale: 'var(--caution)', error: 'var(--down)' }
const STATUS_LABEL: Record<Check['status'], string> = { healthy: 'Healthy', stale: 'Stale', error: 'Error' }

export default function AdminHealthPage() {
  const { data, error, isLoading } = useSWR<{ checks: Check[] }>('admin-health', () => callAdminApi<{ checks: Check[] }>('health'), { refreshInterval: 60_000 })

  return (
    <>
      <div className="content-head"><div><h1>Admin</h1><h2>Pipeline health</h2></div></div>
      <p className="doc-intro">
        One row per edge function. Most sources only ever record success — a failed run just doesn&apos;t write, so their
        Comment is a &quot;no write since&quot; staleness note rather than a real cause. GIFT Nifty fetch is the one source
        that records its own failure reason, so its Comment can say why.
      </p>
      {isLoading && <div className="state-card">Checking pipelines…</div>}
      {error && <div className="state-card error">{error.message}</div>}
      {data && (
        <table className="doc-table">
          <thead><tr><th>Edge function</th><th>Source</th><th>Last write</th><th>Status</th><th>Comment</th></tr></thead>
          <tbody>
            {data.checks.map((c) => (
              <tr key={c.table}>
                <th>{c.function}</th>
                <td>{c.label}</td>
                <td>{fmtLatest(c.latest)}</td>
                <td style={{ color: STATUS_COLOR[c.status] }}>{STATUS_LABEL[c.status]}</td>
                <td>{c.comment ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
