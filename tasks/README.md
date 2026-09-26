# Relay task briefs

One file per recurring Relay task. The file is the prompt.

The scheduled task in Relay carries a one-line pointer, nothing else:

```
Read C:/Users/pmdse/Projects/relay/tasks/<slug>.md and follow it exactly.
It is authoritative — if this prompt and the file disagree, follow the file.
```

Why: prompts buried in `relay-data.json` can't be read, diffed, or fixed
without touching the store. Here they are editable, versioned, and a change
takes effect on the next run with no rescheduling.

## Rules

- **Never** write "as established in this conversation's history" in a brief.
  A brief must stand alone — a fresh session with no memory runs it.
- Absolute paths only. Repos get renamed (`claude_itinerary` → `sojournly-v1`,
  2026-07-27) and a relative assumption dies silently.
- Per-run state (last card id, baselines, what's already handled) does **not**
  live here. It lives in `~/.relay/context/<task-id>/NOTES.md`, which the run
  reads and updates. Briefs are the standing instructions; NOTES is the memory.
- Cross-task facts go in `~/.relay/context/shared/NOTES.md`.
- Changing schedule, model, effort or cwd still means editing the task in the
  Relay app (or cancel + re-schedule). Only the prompt lives here.

## Current briefs

| File | Task | Cadence |
|------|------|---------|
| `instagram-daily.md` | Instagram post — @sojournly.au | daily 14:00 |
| `pinterest-daily.md` | Pinterest pin — @sojournly.au | daily 15:00 |
| `fb-group-daily.md` | FB group community post (advice, no brand) | daily 18:00 |
| `morning-briefing.md` | Interlinked morning briefing | daily 07:00 |
| `ops-digest.md` | Interlinked ops digest | daily 21:00 |
| `weekly-review.md` | Interlinked weekly review | Sun 18:00 |
| `email-digest.md` | Daily email triage | daily 12:00 |
| `gmail-hygiene-monthly.md` | Gmail hygiene, 4-week buffer | every 4 weeks |
| `farflung-daily-stories.md` | Farflung AI story engine | daily 19:41 |
| `farflung-nightly-qa.md` | Farflung visual QA sweep | daily 21:50 |
| `farflung-roster-weekly.md` | Farflung writer pool | weekly |
| `farflung-story-of-week.md` | Farflung Story of the Week | weekly |
| `hidden-examiner-weekly.md` | Find-me-harness exam run | weekly |
