'use client'

import useSWR from 'swr'
import { callAdminUsersApi } from '@/lib/admin-api'

type AdminUser = { id: string; email: string | null; name: string | null; created_at: string; last_sign_in_at: string | null }

function fmtDateTime(iso: string | null): string {
  if (!iso) return 'Never'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso)) + ' IST'
}

export default function AdminUsersPage() {
  const { data, error, isLoading } = useSWR<{ users: AdminUser[] }>('admin-users', () => callAdminUsersApi<{ users: AdminUser[] }>())

  return (
    <>
      <div className="content-head"><div><h1>Admin</h1><h2>Users</h2></div></div>
      {isLoading && <div className="state-card">Loading users…</div>}
      {error && (
        <div className="state-card error">
          {error.message === 'Failed to fetch' || error.message.includes('404')
            ? "The admin-users function isn't deployed yet — see supabase/admin-users-function/index.ts for the one-time deploy step."
            : error.message}
        </div>
      )}
      {data && (
        <table className="doc-table">
          <thead><tr><th>Name</th><th>Email</th><th>Last login</th><th>Joined</th></tr></thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id}>
                <th>{u.name ?? '—'}</th>
                <td>{u.email ?? '—'}</td>
                <td>{fmtDateTime(u.last_sign_in_at)}</td>
                <td>{fmtDateTime(u.created_at)}</td>
              </tr>
            ))}
            {data.users.length === 0 && <tr><td colSpan={4}>No users yet.</td></tr>}
          </tbody>
        </table>
      )}
    </>
  )
}
