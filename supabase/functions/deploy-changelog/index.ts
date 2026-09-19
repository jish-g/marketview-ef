// Auto-populates changelog_entries from Vercel's production-deployment webhook, so a
// changelog entry appears every time a merge to main actually ships -- no manual admin
// entry needed (see app/admin/changelog/page.tsx, which is read-only).
//
// One-time setup (both steps are outside what this project's Supabase access can do):
//   1. Vercel dashboard -> Project -> Settings -> Webhooks -> Add Webhook
//        URL: https://vkcklvoizfpbnjdgaxai.supabase.co/functions/v1/deploy-changelog
//        Events: Deployment Succeeded
//      Vercel will hand you a signing secret when you save it.
//   2. Set that same secret on this project:
//        supabase secrets set DEPLOY_WEBHOOK_SECRET=<the secret from step 1> --project-ref vkcklvoizfpbnjdgaxai
import { createClient } from 'jsr:@supabase/supabase-js@2'

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifySignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(hex, signature)
}

// A merge-commit subject is just "Merge pull request #193 from owner/branch" -- the actual
// PR title is the next non-empty line. Falls back to the raw first line for a direct push
// (no merge commit at all), so a hotfix deploy still gets a sensible title.
function titleAndBodyFromCommitMessage(message: string): { title: string; body: string } {
  const lines = message.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return { title: 'Production deploy', body: 'No commit message was provided.' }
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
  const rawBody = await req.text()
  if (!secret || !(await verifySignature(rawBody, req.headers.get('x-vercel-signature'), secret))) {
    return json({ error: 'Invalid signature' }, 401)
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (event.type !== 'deployment.succeeded') return json({ ignored: true, reason: 'not a deployment.succeeded event' })

  const payload = (event.payload ?? {}) as Record<string, unknown>
  const deployment = (payload.deployment ?? {}) as Record<string, unknown>
  const target = (payload.target as string | undefined) ?? (deployment.target as string | undefined)
  if (target !== 'production') return json({ ignored: true, reason: 'not a production deployment' })

  const meta = (deployment.meta ?? {}) as Record<string, unknown>
  const commitMessage = (meta.githubCommitMessage as string | undefined) ?? (deployment.name as string | undefined) ?? 'Production deploy'
  const { title, body } = titleAndBodyFromCommitMessage(commitMessage)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const entry_date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

  const { data, error } = await admin
    .from('changelog_entries')
    .insert({ entry_date, kind: 'feature', title, body })
    .select('id, entry_date, kind, title, body')
    .single()
  if (error) return json({ error: error.message }, 500)
  return json({ entry: data })
})
