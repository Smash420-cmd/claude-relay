# Facebook group daily post: World Travel Planning (by Sojournly.au)

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** claude-sonnet-5 · **effort:** high

One post a day to the group, to give new members something to find and get existing
members talking. **Trip-planning advice and discussion prompts only. No brand, no app,
no advertising.** This job is not Instagram, Pinterest or the Facebook Page, and touches none of them.

## STEP 00: CHECK THE RULES HAVEN'T CHANGED UNDER YOU

This session is reused. A rule you remember is a claim to verify, not a fact.

```bash
cd C:/Users/pmdse/Projects/sojournly-social
md5sum .claude/context/*.md | awk '{n=$2; sub(/.*\//,"",n); printf "%.8s  %s\n", $1, n}' | grep -v instagram-log
```

Compare to the **RULES STAMP** at the top of this task's `NOTES.md`. Any hash differs →
read that file in full now and say in your report what changed. No stamp yet → read
`facebook-group.md`, `social-voice.md` and `facebook.md` in full. Then write the new block
into NOTES.md as the RULES STAMP.

## STEP 0: PIN THE BROWSER. Nothing else happens first.

`mcp__claude-in-chrome__list_connected_browsers` → select the entry with
`osPlatform: "Windows"` **and** `isLocal: true` (`select_browser` with its deviceId).
Patrick chose that browser for these jobs on 2026-08-03. Never the Mac, never a fallback.
If there's no Windows/local entry, start the desk Chrome from PowerShell
(`Start-Process chrome.exe -ArgumentList '--profile-directory="Profile 1"'`), wait 30 s,
list again, up to 3 tries; still missing → fail per the playbook. Name the selected
browser and the full list in your report.

## Read first, follow exactly

Authoritative playbook: `C:/Users/pmdse/Projects/sojournly-social/.claude/context/facebook-group.md`.
It holds the content rules, the weekly rhythm, the pillars, the posting mechanics, the
log format and the Never list. The words follow `social-voice.md` as that playbook
describes (not its four beats, not its Sojournly tie-in). If this brief and the
playbook disagree, follow the playbook.

## The run

1. **Pick today's slot** from the weekly rhythm (Mon / Wed / Fri fixed formats; other days
   an advice post). For an advice post, pick the pillar and topic after grepping the `G`
   lines in `instagram-log.md`: no pillar twice running, no topic within 60 days, no
   example country twice running.
2. **Research, then write.** Web-search the specifics before drafting, never after. If
   search is unavailable, log `research:unavailable` and write only what needs no source.
   Load the `unslop` skill before drafting.
3. **Pick the photo** per the playbook's photo rules (Pexels API or, for Japan, Patrick's
   own frames). View every candidate before choosing, no repeats across `G` lines, and
   add the Pexels credit line to the post.
4. **Be your own worst critic** (social-voice.md): numbered error-list passes until one
   finds nothing. Check especially: no Sojournly or app mention anywhere, no first-person
   travel story, the question at the end is specific, every fact has a source.
5. **Post it** per the playbook's mechanics (one tab, photo attached first, `shift+Enter`
   for line breaks, never Escape, read the text back before Post, verify in the reloaded
   feed that the post shows its photo, take the permalink).
6. **Close the tab** the moment the post is verified: before the log line, before NOTES.
7. **Log one `G` line** in `instagram-log.md` (format in the playbook).
8. **Keep the last seven posts** in this task's `NOTES.md`, newest first: day, slot,
   pillar, topic, example country, hook, sources. The next run reads it for rotation.

## Report

Browser selected and the full list; rules-stamp result; the post's slot, pillar and topic;
the final text; the review passes (numbered, ending with the clean pass); sources;
permalink; `tabs: opened N, closed N` (or `ORPHANED TAB: <url> - close it by hand`).

## Failure

Per the playbook: close the tab, `DATE | G-FAIL | <reason>`, one alert card, no retry loop:

    node C:/Users/pmdse/Projects/relay/scripts/interlinked.js send \
      --type alert --title "FB group post failed" \
      --body "<what broke>. Nothing was posted to the group today." --priority normal

## Never

- Mention Sojournly, the app, sojournly.au, or advertise anything.
- Comment, reply, approve/remove members, or DM. Posting only.
- Log in, boost, spend, or touch `ANTHROPIC_API_KEY`.
