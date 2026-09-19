'use client'

import useSWR from 'swr'
import { callAdminApi } from '@/lib/admin-api'

type Check = { table: string; label: string; latest: string | null; error: string | null }

// How stale is too stale before flagging a source, in hours. Loose on purpose -- this
// isn't a per-pipeline SLA, just a quick "does anything look dead" signal for the admin.
const STALE_HOURS = 30

function fmtLatest(latest: string | null): string {
  if (!latest) return 'No data'
  // Health sources mix full timestamps (updated_at) and plain dates (trade_date) -- render
  // whichever the column actually is instead of forcing both through the same time format.
  const asDate = new Date(latest)
  if (Number.isNaN(asDate.getTime())) return latest
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(latest)
  return isDateOnly
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(asDate)
    : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(asDate) + ' IST'
}

function isStale(latest: string | null): boolean {
  if (!latest) return true
  const asDate = new Date(latest)
  if (Number.isNaN(asDate.getTime())) return false
  return Date.now() - asDate.getTime() > STALE_HOURS * 60 * 60 * 1000
}

export default function AdminHealthPage() {
  const { data, error, isLoading } = useSWR<{ checks: Check[] }>('admin-health', () => callAdminApi<{ checks: Check[] }>('health'), { refreshInterval: 60_000 })

  return (
    <>
      <div className="content-head"><div><h1>Admin</h1><h2>Pipeline health</h2></div></div>
      <p className="doc-intro">Last write time per data source, flagged when it's gone quiet for more than {STALE_HOURS} hours. This is a freshness check, not a full error log.</p>
      {isLoading && <div className="state-card">Checking pipelines…</div>}
      {error && <div className="state-card error">{error.message}</div>}
      {data && (
        <table className="doc-table">
          <thead><tr><th>Source</th><th>Last write</th><th>Status</th></tr></thead>
          <tbody>
            {data.checks.map((c) => (
              <tr key={c.table}>
                <th>{c.label}</th>
                <td>{c.error ? c.error : fmtLatest(c.latest)}</td>
                <td style={{ color: c.error || isStale(c.latest) ? 'var(--caution)' : 'var(--up)' }}>
                  {c.error ? 'Error' : isStale(c.latest) ? 'Stale' : 'Healthy'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
