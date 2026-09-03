import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SITE_URL = 'https://marketcue.in'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_URL || 'https://vkcklvoizfpbnjdgaxai.supabase.co'
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_PREMARKET_SUPABASE_KEY || 'sb_publishable_-am88LW21cvkYYA_H9vqWA_K42a7bXG'

type Phase = 'premarket' | 'postmarket'
type Post = { trade_date: string; phase: Phase; slug: string; title: string }
type Row = Record<string, any>

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function fmtPct(v: any) {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${v}%`
}

function fmtPts(v: any) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${v} pts`
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildMessage(post: Post, marketRow: Row | null): string {
  const url = `${SITE_URL}/nifty-sensex-today/${post.slug}`
  const lines: string[] = [`<b>${escapeHtml(post.title)}</b>`, '']

  if (post.phase === 'premarket') {
    const giftGap = fmtPct(marketRow?.gift_nifty_gap_pct)
    const giftPts = fmtPts(marketRow?.gift_nifty_gap_pts)
    lines.push(`📍 GIFT Nifty gap: ${giftGap}${giftPts ? ` (${giftPts})` : ''}`)
    if (marketRow?.india_vix != null) lines.push(`📊 India VIX: ${marketRow.india_vix}`)
    if (marketRow?.market_bias_nifty) lines.push(`🎯 Bias: ${marketRow.market_bias_nifty}`)
  } else {
    lines.push(`NIFTY: ${fmtPct(marketRow?.day_change_pct_nifty)}`)
    lines.push(`SENSEX: ${fmtPct(marketRow?.day_change_pct_sensex)}`)
  }

  lines.push('', `👉 Full read: ${url}`)
  return lines.join('\n')
}

async function getPost(phase: Phase, tradeDate: string): Promise<Post | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data } = await supabase
    .from('blog_posts')
    .select('trade_date, phase, slug, title')
    .eq('trade_date', tradeDate)
    .eq('phase', phase)
    .maybeSingle()
  return (data as Post | null) ?? null
}

async function getMarketRow(phase: Phase, tradeDate: string): Promise<Row | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const table = phase === 'premarket' ? 'premarket_dashboard' : 'postmarket_summary'
  const { data } = await supabase.from(table).select('*').eq('trade_date', tradeDate).maybeSingle()
  return (data as Row | null) ?? null
}

async function sendToTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHANNEL_ID
  if (!token || !chatId) throw new Error('Telegram bot token or channel id not configured')

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  const body = await res.json()
  if (!res.ok || !body.ok) throw new Error(`Telegram API error: ${JSON.stringify(body)}`)
  return body
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const phase = request.nextUrl.searchParams.get('phase')
  if (phase !== 'premarket' && phase !== 'postmarket') {
    return NextResponse.json({ error: 'phase must be "premarket" or "postmarket"' }, { status: 400 })
  }

  const tradeDate = todayIST()
  const post = await getPost(phase, tradeDate)
  if (!post) {
    return NextResponse.json({ skipped: true, reason: `No ${phase} post found for ${tradeDate} yet` })
  }

  const marketRow = await getMarketRow(phase, tradeDate)
  const text = buildMessage(post, marketRow)

  await sendToTelegram(text)

  return NextResponse.json({ ok: true, tradeDate, phase, slug: post.slug })
}
