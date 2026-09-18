# marketview-ef

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_1gDLReqkwyPG2zlzPGG8FqAVoVGt)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Previewing protected routes locally

`/dashboard` and `/rules` sit behind `AuthGuard` and redirect to `/login` without a session.
For layout work (responsive QA in particular) you can render them signed-out by adding this to
`.env.local` and restarting `pnpm dev`:

```
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

This only works under `next dev`. `components/auth-guard.tsx` also requires `NODE_ENV === 'development'`,
which the bundler folds to `false` during `next build`, so the flag cannot weaken the guard in a deployed
build regardless of how the hosting environment is configured.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Nifty Gamma Exposure (GEX)

Estimated dealer gamma positioning for Nifty options, shown in its own tab (Chart → **GEX** →
Mid-market) and again below the existing content on the **Trade** tab. Presentation only here —
all computation happens in a separate, isolated worker.

**Architecture (three independently deployed pieces):**

| Piece | Where | What it does |
|---|---|---|
| Compute worker | [jish-g/marketcue-gex-worker](https://github.com/jish-g/marketcue-gex-worker) (Railway) | Holds a persistent Kite WebSocket connection (the one piece of this stack that needs a long-running process — Supabase Edge Functions and Vercel Functions are both request-scoped and can't hold a socket open for a 6-hour session). Solves implied volatility via Black-Scholes bisection, computes gamma/GEX per strike, derives the zero-gamma flip, call wall, put wall and peak-gamma levels. |
| Storage | Supabase, table `nifty_gex_current` | A single row (singleton, `id = true`, same pattern as `kite_session`), overwritten every 5s during market hours. Own migration, own RLS read policy (`anon`/`authenticated`) — no other function or table touches it. |
| Display | [`components/gex-view.tsx`](components/gex-view.tsx) | Polls `nifty_gex_current` via SWR every 5s and renders it, following `app/design-system.css`. No computation happens client-side. |

**Locked scope:** NIFTY 50 only, ±20 strikes around ATM on the nearest weekly expiry. Flip/wall/peak
levels are withheld below 60% strike coverage rather than publishing an unreliable level on thin
data.

**Why a separate repo:** everything else in this pipeline (`supabase/functions/*`) is a
cron-triggered Edge Function — request-scoped, no persistent process. GEX needed one, so it's the
only piece of MarketCue's stack that isn't Supabase Edge Functions or Vercel.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
