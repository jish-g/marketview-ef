# SEO / AI-SEO keyword library

Source of truth for the terms MarketCue's daily pre-market and post-market blog
posts should organically reinforce, in support of the "AI-Agentic Option
Intelligence Platform for Indian Stock Market" positioning (see `app/page.tsx`,
`app/layout.tsx`).

This library isn't wired into any code in this repo -- the two blog-generation
prompts (pre-market and post-market) live in an external system, not here. This
file is the maintained reference both prompts should draw from; when the list
changes, re-paste the "Prompt injection block" below into both prompts.

## Tier 1 -- core positioning (use once per post, lightly)

Reflect the brand framing without literally forcing the phrase into a
data-reporting sentence -- e.g. describing the read as continuous, agentic, or
decision-focused rather than dropping "AI-Agentic Option Intelligence Platform"
verbatim into the middle of a GIFT Nifty sentence.

- AI-Agentic
- Option Intelligence Platform
- agentic read / agentic reasoning

## Tier 2 -- vertical / topic terms (rotate 1-2 per post)

- Indian stock market
- options market
- option chain
- Nifty options
- Sensex options
- intraday options trading
- options trading platform

## Tier 3 -- long-tail terms matching the evergreen pages (use only when genuinely relevant to that day's data)

Each maps to a live MarketCue page -- only reach for these when the day's
actual data makes them relevant, never forced:

| Term | Page |
|---|---|
| GIFT Nifty | `/gift-nifty-today` |
| India VIX | `/india-vix-today` |
| Nifty PCR / Put-Call Ratio | `/nifty-pcr-today` |
| Nifty Max Pain | `/nifty-max-pain-today` |
| support and resistance | `/nifty-support-resistance-today` |
| Sensex option chain | `/sensex-option-chain` |
| NSE option chain analysis | `/nse-option-chain-analysis` |
| FII DII data | `/fii-dii-data-today` |
| expiry week | (contextual, no dedicated page) |

## Rotation rule

Don't reach for the same Tier 2/3 combination two posts in a row. The
pre-market prompt already tracks `{dayName}`/`{tradeDate}` and instructs "vary
opening line, sentence rhythm, paragraph order each day" -- treat keyword
choice as part of that same variation, not a separate pass.

## Prompt injection block

Paste this as its own paragraph into both the pre-market and post-market
prompts (after the existing "no template feel" paragraph, before the "What you
can talk about" section). It does not change the required `HEADLINE:`/`BODY:`
output format -- it only guides word choice inside the existing prose.

```
Where it's genuinely natural given today's data (never forced, never at the
cost of accuracy), let 1-2 phrases from this list surface in the body: Indian
stock market, options market, option chain, Nifty options, Sensex options,
intraday options trading, options trading platform. Once per post, lightly
reflect that this is a continuous, AI-Agentic read -- an Option Intelligence
Platform reasoning over the session -- rather than naming the platform's
tagline verbatim mid-sentence. If today's data touches GIFT Nifty, India VIX,
PCR, Max Pain, support/resistance, or FII/DII flow, you may use those exact
terms since each maps to a live page readers can click through to. Don't reuse
the same combination of terms as recent posts -- rotate.
```
