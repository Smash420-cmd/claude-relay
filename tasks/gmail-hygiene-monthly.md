# Monthly Gmail hygiene — trim to a 4-week buffer

**cwd:** `C:/Users/pmdse/Projects/sidedoor` · **model:** sonnet · **effort:** high

Keep a rolling ~4-week buffer of marketing/junk mail by deleting anything of
that kind older than 4 weeks. Use the Gmail MCP tools (ToolSearch for 'gmail'
if not loaded) with `older_than:28d` in `search_threads` queries.

## Junk — delete

Combine `older_than:28d` with `category:promotions`, `category:social`, and
`from:` filters for these recurring low-value senders:

- retail promos — Amazon, Luxury Escapes, Qantas rewards, etc.
- job-alert digests — LinkedIn, Seek
- entertainment / loyalty marketing — PlayStation, Skyscanner
- mailing-list uploads — Mixcloud

Delete each matching thread via `apply_sensitive_thread_label` with
`labelOption TRASH`.

## Never touch — regardless of age

- `admin@sojournly.au`, `play@sojournly.au`
- any bank or financial sender (Westpac, PayPal, …)
- government or legal senders
- personal 1:1 correspondence

When in doubt, leave it.

## Send exactly one card

```bash
node C:/Users/pmdse/Projects/relay/scripts/interlinked.js send \
  --type dev-update --title "Monthly inbox hygiene done" \
  --body "<count trashed, breakdown by sender, anything skipped>" --priority low
```

Never touch or forward `ANTHROPIC_API_KEY`.
