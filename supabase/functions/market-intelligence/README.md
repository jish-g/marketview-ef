# market-intelligence

The agent layer. Reads what `market-data-sync` already stored, adds context, asks the model for a judgement inside a hard fence, writes `agent_calls`.

## Deploy

```bash
supabase db push                                   # creates agent_calls (supabase/migrations/20260915120000_agent_calls.sql)
supabase functions deploy market-intelligence      # same vault secrets as market-data-sync: edge_function_cron_secret, anthropic_api_key
```

Then run the `cron.schedule(...)` block at the bottom of the migration in the SQL editor (fill in the project ref).

## Try it on a past day

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/market-intelligence \
  -H "x-cron-secret: $CRON_SECRET" -H "content-type: application/json" \
  -d '{"phase":"open","trade_date":"2026-09-12"}'
```

`trade_date` is an override for backfilling; omit it in cron. Run `premarket` → `open` → `mid` (with `checkpoint`) → `post-close` in that order for a day, because each phase reads the earlier ones' rows.

## Scoreboard

```sql
select instrument,
       count(*) filter (where phase = 'post-close')                          as graded,
       count(*) filter (where grade = 'right')                              as agent_right,
       count(*) filter (where grade = 'wrong')                              as agent_wrong,
       count(*) filter (where phase = 'open' and agrees_with_rules = false) as disagreed_with_rules,
       count(*) filter (where guardrail_applied is not null and phase = 'open') as fenced
from agent_calls
where trade_date >= current_date - 30
group by instrument;
```

## Fence (enforced in TypeScript after the model answers)

VIX > 22 → no premium buying. DTE ≤ 1 → no naked options. Those are the only two overrides — bias, readiness, structure and direction are the agent's own call, formed from the raw data with the rule engine's logic given to it as a playbook. The engine's answer is never shown to the model; it is stored beside the agent's for scoring. Unknown strategy string → No Trade. Model down → rule engine answer, `guardrail_applied = model_unavailable`.
