# Interlinked: ops digest

**cwd:** `C:/Users/pmdse/Projects/sojournly-v1` · **model:** sonnet · **effort:** high

Nightly Sojournly metrics card. Read `~/.relay/context/<this task id>/NOTES.md`
first — schema facts, run log, and watch items live there. Update it at the end.

## Metrics — Supabase MCP, project `qiwxsetlndsqnypmxgcu`

One combined `SELECT` with scalar subqueries; one round-trip.

| Source | Report |
|--------|--------|
| `auth.users` | signups, last 24h |
| `purchases` | count + `sum(amount_total)/100.0` AUD, last 24h. `amount_total` is integer cents; `provider` ∈ stripe/paypal/play |
| `token_usage` | `sum(input_tokens + output_tokens)` as "model tokens", row count as "sessions". There is no user-spend column |
| `error_logs` | count, last 24h — **split real errors from `timing_linter_warn` rows** (linter output, not app failures) and from venue warnings (`error_type`/message ilike `%venue%`) |
| `venue_api_calls` | columns are only (`month` text 'YYYY-MM', `calls` int) — no timestamps, so report the **current-month total**, and the delta vs the last run in NOTES |

Try `execute_sql` first — it has worked directly since 2026-07-26. Fallbacks are
in `~/.relay/context/shared/NOTES.md` under "Tooling gotchas".

## Send exactly one card

```bash
node C:/Users/pmdse/Projects/relay/scripts/interlinked.js send \
  --type ops-digest --title "..." --body "..."
```

CARD STYLE: archaic-hybrid (`~/.claude/skills/archaic-hybrid/SKILL.md`) —
verdict-first title ≤8 words, ≤10 bullets / ≤120 words, keep every number,
no process narration, one `NEEDS YOU:` bullet max.

## Watch items

- `venue_not_found` on "Check-in, Security & Departure" is a known false
  positive (airport process block, not a venue). Don't re-flag it as new; if it
  recurs, suggest a process-block skip-list for the venue guard.
- Error counts have been low and sporadic (07-06=5, 07-26=1, 07-27=0). Only
  raise it with Patrick if it trends up across consecutive days.

One card, then stop.
