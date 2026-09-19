// Auto-populates changelog_entries whenever a merge lands on main, so no manual admin
// entry is needed (see app/admin/changelog/page.tsx, which is read-only).
//
// Triggered by a GitHub Actions workflow on push to main (.github/workflows/changelog.yml)
// rather than a Vercel deployment webhook -- Vercel only offers deployment webhooks on its
// Pro plan. A push to main is a fine proxy for "this shipped": every merge in this repo's
// history is exactly that (see the PR-only workflow this project follows).
//
// One-time setup (outside what this project's Supabase access can do):
//   supabase secrets set DEPLOY_WEBHOOK_SECRET=<shared secret> --project-ref vkcklvoizfpbnjdgaxai
// The same value must also be set as the CHANGELOG_DEPLOY_SECRET repo secret in GitHub
// (Settings -> Secrets and variables -> Actions) -- the workflow sends it as a header.
import { createClient } from 'jsr:@supabase/supabase-js@2'

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// A merge-commit subject is just "Merge pull request #193 from owner/branch" -- the actual
// PR title is the next non-empty line. Falls back to the raw first line for a direct push
// (no merge commit at all), so a hotfix push still gets a sensible title.
function titleAndBodyFromCommitMessage(message: string): { title: string; body: string } {
  const lines = message.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return { title: 'Update', body: 'No commit message was provided.' }
  const mergeMatch = lines[0].match(/^Merge pull request (#\d+)/)
  if (mergeMatch && lines.length > 1) {
    return { title: `${mergeMatch[1]}: ${lines[1]}`, body: lines.slice(1).join('\n') }
  }
  return { title: lines[0], body: lines.slice(1).join('\n') || lines[0] }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const secret = Deno.env.get('DEPLOY_WEBHOOK_SECRET')
  const provided = req.headers.get('x-changelog-secret')
  if (!secret || !provided || !timingSafeEqual(provided, secret)) {
    return json({ error: 'Forbidden' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const commitMessage = typeof body.commitMessage === 'string' && body.commitMessage ? body.commitMessage : 'Update'
  const { title, body: entryBody } = titleAndBodyFromCommitMessage(commitMessage)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const entry_date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

  const { data, error } = await admin
    .from('changelog_entries')
    .insert({ entry_date, kind: 'feature', title, body: entryBody })
    .select('id, entry_date, kind, title, body')
    .single()
  if (error) return json({ error: error.message }, 500)
  return json({ entry: data })
})
