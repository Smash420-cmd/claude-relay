# Spec: extended-usage (over-100%) second-colour segment in the usage bar

> Scheduled via Relay (2026-06-22) to be implemented at the next session reset, when there's free
> capacity. Self-contained so a fresh session can build it from this file (ground truth, not chat memory).

## Context / the observation
Patrick noticed Relay's **Session** bar "went off the rails": it read **99% then dropped to 96%**,
while claude.ai's Usage page showed **100%** for the current session. Investigating the live
`~/.relay/usage.json` at the time found:

```
five_hour: used_percentage = 106   resets_at = 12:20
seven_day: used_percentage = 48
```

**Two real findings (verified against the live statusLine payload):**
1. **`used_percentage` exceeds 100 when you're into extended/credit usage** (it was 106% = 6% past the
   free limit). The current bar just shows "106%" with the fill overflowing — the overage isn't visually
   distinct from the free usage.
2. **It can decrease over time** (99 → 96): the 5-hour window is rolling, so heavy usage from the start
   of the window ages out, dropping the %, even as you keep working. This is expected rolling-window
   behaviour, NOT a bug — but it looks alarming and should be handled gracefully.
3. The payload only carries `used_percentage` + `resets_at` — **no $ credit-spend field**. So "extended
   usage" we can show = `used_percentage − 100` (the % into credits). We cannot show the A$ credit spend
   (that's only on claude.ai's Usage page, not in the statusLine payload).

## The feature
Make the session (and weekly) bar a **two-segment stacked bar** when `used_percentage > 100`:
- **Free segment:** `min(pct, 100)%` in the normal colour (keep the existing ok/warn/high green→amber→red
  ramp as it approaches 100).
- **Extended segment:** the `pct − 100` portion in a **distinct colour** (e.g. a purple/violet "credit"
  colour — pick something clearly different from the red "high" state), appended after the free segment.
- **Label:** show both, e.g. `106%` with a `· 6% extended` suffix in the extended colour. When ≤100%,
  render exactly as today (no extended segment, no suffix).
- The extended segment should be visible within the same bar width (the free segment fills to 100%, the
  extended segment is a thin overlay/extension — decide the cleanest visual; a small inset second bar or a
  distinct-coloured cap both work. Keep the bar a fixed height; don't let it overflow the container).

## Rolling-window decrease (the 99→96)
Don't try to "fix" it — it's correct. But make it not look broken:
- Optionally track a session **peak %** in the renderer (reset when `resets_at` changes) and show a faint
  peak marker, OR just add a tiny tooltip/caption note that the 5-hour window is rolling so the % can ease
  down as older usage ages out. Lowest-effort acceptable: just the honest two-colour bar; the peak marker
  is a nice-to-have.

## Files
- `src/tracker.js` — live branch of `snapshot()`: stop implicitly capping; expose both `pct` (can be >100)
  and an `overPct` (= max(0, pct−100)) for session + weekly so the renderer can split them. (Currently
  `pct: Math.round(used_percentage)` — keep that, add `overPct`.)
- `renderer/app.js` — `gaugeHtml()`: render the free segment (min(pct,100)) + the extended segment
  (overPct) and the `· N% extended` label.
- `renderer/styles.css` — add `.bar-fill.over` (the extended colour) and whatever stacked-bar markup needs.

## Acceptance
- With `used_percentage > 100` (you can fake it by editing `~/.relay/usage.json`), the bar shows a full
  free segment + a distinct-coloured extended segment, and the label reads e.g. `106% · 6% extended`.
- With `≤100%`, identical to today.
- `npm run check` clean; boot clean; commit to the relay repo with a clear message.
