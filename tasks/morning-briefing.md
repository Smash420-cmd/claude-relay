# Interlinked: morning briefing

**cwd:** `C:/Users/pmdse/Projects/sojournly-v1` · **model:** sonnet · **effort:** high

One card to Patrick's phone every morning: what landed overnight, what's on
today, how Sojournly did.

Read `~/.relay/context/<this task id>/NOTES.md` first — it holds the run log,
the last card id, and open questions. Update it at the end of every run.

## 1. Email — Gmail MCP

Query `is:unread in:inbox newer_than:1d` via `search_threads`.

The inbox is heavily spammed: Mixcloud upload notifications (Patrick subscribes
to many DJ/radio channels), retail newsletters, SEEK/LinkedIn job alerts. That
is noise — report the count, don't list it. Flag only non-promo items: receipts,
security alerts, bills, anything needing a decision.

## 2. Calendar — Google Calendar MCP

`list_events`, startTime = today 00:00, endTime = tomorrow+1 00:00,
timeZone `Australia/Sydney`. An empty response body (calendar metadata, no
`items` key) means **zero events, not an error**.

## 3. Sojournly numbers — Supabase MCP, project `qiwxsetlndsqnypmxgcu`

```sql
SELECT
  (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '24 hours') AS new_users,
  (SELECT count(*) FROM purchases WHERE created_at > now() - interval '24 hours') AS sales_count,
  (SELECT coalesce(sum(amount_total),0)/100.0 FROM purchases WHERE created_at > now() - interval '24 hours') AS sales_sum_aud,
  (SELECT count(*) FROM error_logs WHERE created_at > now() - interval '24 hours') AS errors;
```

`amount_total` is integer cents — the `/100.0` is the corrected AUD division,
keep it. If `execute_sql` is unavailable, see the fallbacks in
`~/.relay/context/shared/NOTES.md` under "Tooling gotchas".

## 4. Send exactly one card

```bash
node C:/Users/pmdse/Projects/relay/scripts/interlinked.js send \
  --type morning-briefing --title "..." --body "..."
```

`--type morning-briefing`, not `dev-update` — the phone colours the frame by type.

CARD STYLE: archaic-hybrid (`~/.claude/skills/archaic-hybrid/SKILL.md`) —
verdict-first title ≤8 words, ≤10 bullets / ≤120 words, one fact per bullet,
keep every number/name/date/amount, no process narration, a single
`NEEDS YOU:` bullet last if Patrick must act. Walls of text are bugs.

One card, then stop. Read-only on email — never reply, archive, delete or label.
