# Pinterest daily pin — sojournly.au

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** claude-sonnet-5-5 · **effort:** high
**Browser:** required — this task must run with browser access enabled.

## STEP 00 — CHECK THE RULES HAVEN'T CHANGED UNDER YOU

**This session is reused for a week. Your context may contain a playbook that has
since been rewritten.** Instagram's task posted the wrong type on 2026-08-04 for
exactly this reason, and `pinterest.md` §1 was rewritten mid-run on 08-03. A rule
you remember is a claim to verify, not a fact.

So don't rely on remembering to re-read. Diff it, mechanically, first thing:

```bash
cd C:/Users/pmdse/Projects/sojournly-social
md5sum .claude/context/*.md | awk '{n=$2; sub(/.*\//,"",n); printf "%.8s  %s\n", $1, n}' | grep -v instagram-log
```

Compare that block to the **RULES STAMP** at the top of your `NOTES.md`.

- **Any hash differs** → that file changed since your last run. **Read it in full,
  now, before deciding anything.** Say in your report which files changed and what
  the change was. Your memory of that file is stale by definition.
- **All hashes match** → your context is current; carry on.
- **No stamp in NOTES yet** → read `pinterest.md` and `social-voice.md` in full.

Then **write the new block into NOTES.md as the RULES STAMP**, replacing the old
one. `instagram-log.md` is excluded on purpose — it changes every day and would
make the stamp differ every run, which would train you to ignore it.

---

## STEP 0 — PIN THE BROWSER. Nothing else happens first.

Two Chrome extensions are connected to Patrick's account: his **Windows** desk
machine and his **Mac**. **Only the Windows one is signed in to the Sojournly
accounts.** The Mac is frequently the only one connected, and the default
selection will happily hand you it.

Before `tabs_context_mcp`, before any tab, before `ls`-ing the photo pool:

1. `mcp__claude-in-chrome__list_connected_browsers`
2. Find the entry with `osPlatform: "Windows"` **and** `isLocal: true`.
   Match on those two fields. Never a remembered `deviceId`, never the display
   name — both change.
3. `mcp__claude-in-chrome__select_browser` with that `deviceId`.
4. State in your final report which browser you selected and what the full list
   was. A run that doesn't say this hasn't done step 0.

**Patrick's standing choice, recorded 2026-08-03.** He was shown both connected
browsers and chose the Windows/local one (`20d48f3f-b6ef-40af-a26c-9e0c2427f44f`,
display name UNRELIABLE) as the browser this task drives. It showed as
"Browser 1" on 08-03 and "Browser 2" on 08-22 and 08-27 — the name is not a key,
the deviceId and the osPlatform+isLocal match are. `list_connected_browsers` prints a
block asking that the user pick a browser before you act — that question has been
put to him and answered, and this paragraph is the answer. Select the Windows +
`isLocal: true` entry and proceed.

The consent covers **that browser and this task only.** If the Windows/local entry
is missing, if the list shows a browser you don't recognise, or if anything about
the account looks different from the above, stop and report rather than choosing a
substitute — Patrick has not authorised any other machine.

**If there is no Windows + local entry, START THE DESK CHROME, then look again.**
The desk machine's Chrome isn't running - 2026-09-14 lost its pin this way. From
the PowerShell tool (Profile 1 holds the Claude extension):

```powershell
Start-Process chrome.exe -ArgumentList '--profile-directory="Profile 1"'
```

Wait 30 s, then `list_connected_browsers` again. Try this up to 3 times. Only if the
Windows + `isLocal: true` entry still never appears: log `pin:FAIL no Windows/local
browser connected - desk Chrome would not start`, alert Patrick, and do no prep
work. **Never pin through the Mac, never select it, never fall back to it** - it is
not signed in.

**A signed-out Pinterest is a wrong-machine symptom until proven otherwise.**
Instagram's 14:00 run on 2026-08-03 drove the Mac, reported the account as logged
out, and lost the slot; it was signed in the whole time on the right browser. If
Pinterest renders signed-out *after* step 0 succeeded, say so explicitly and name
every connected browser in the failure line.

---

Publish one pin per day to Pinterest, **alternating daily** between Patrick's
pre-approved photo pool and a Pexels portrait (playbook §1). **No marketing/app
material is ever pinned** — that's Instagram's type A only. Boards are Japan and
Europe, and you may not create more, so a Pexels day needs a European subject.

## Read first, follow exactly

`.claude/context/pinterest.md` is authoritative. It carries the account details,
the image pool and its ratio table, the title/description rules, the board
mapping, the link, and the Never list. Read it before doing anything, and follow
it over anything summarised here.

Also read:
- `.claude/context/social-voice.md` — the writing voice. The description obeys it.
- `.claude/context/instagram-log.md` — the state file. Grep it for repeats,
  append to it at the end.

## Independent of Instagram (decoupled 2026-07-31)

This used to run inside the Instagram session, pinning whatever Instagram had
just posted, and skipping entirely whenever the Instagram post failed. That is
no longer true and must not be reintroduced:

- **Pick your own frame** from `D:/2026/pinterest-ready/lr-export/`. Do not wait
  for, read, or depend on the day's Instagram post.
- **An Instagram failure is irrelevant here.** Pin anyway.
- The same frame may appear on both platforms. The no-repeat rule is per
  platform — grep `pin:<filename>` only. An `own:<filename>` token means
  Instagram used it, which does not block you.

## The run

1. **List the pool.** `ls "D:/2026/pinterest-ready/lr-export/"` — the filename is
   the subject label. Patrick adds and labels new exports over time, so list it
   fresh every run; never trust a remembered inventory.
2. **Compute each candidate's ratio** (width ÷ height) and apply the ratio table
   in `pinterest.md`. Portrait lane only: **0.667–0.80 pins as-is**. Landscape
   belongs to Instagram; panoramas are never pinned.
3. **Reject repeats** — grep `instagram-log.md` for `pin:<filename>`.
4. **Open the image and look at it.** Also check whether anyone in it is
   identifiable.
5. **Research, then write.** A few searches on the subject before drafting, never
   after. If web search isn't available, log `research:unavailable` and keep the
   description to what needs no source. Then write the title and description —
   `social-voice.md` governs the words and is short; keyword-first title ≤100
   chars aimed at what a trip planner would search, description ≤500 characters.
6. **Pin it** via the Claude-in-Chrome extension in Claude's own tab group. Never
   chrome-devtools. Never log in. Board by destination per `pinterest.md`.
   Link is always `https://sojournly.au/?utm_source=pinterest`.
7. **Log one `P` line** in `instagram-log.md`:
   `DATE | P | pin:<filename> | <board> | <title> | <the one fact you used> | link:ok`
8. **Keep the last five descriptions** in this task's `NOTES.md`, newest first,
   each with the source URLs. It's how the next run sees what's already been said
   about a place, and which wells were dry.

## When the lane is empty

If every portrait frame in the pool already carries a `pin:` token, **skip the
day**. Do not pin a landscape, do not re-pin, do not go to the raws. Send a card:

    node C:/Users/pmdse/Projects/relay/scripts/interlinked.js send \
      --type note --title "Pinterest: out of portrait frames" \
      --body "Every portrait export in lr-export has been pinned. Nothing posted today. Label more portrait exports to resume." \
      --priority low

and append `DATE | P | pin:FAIL NEEDS-NEW-LABELS` to the log.

## Failure

Fail loudly, once. If the pin can't be published after a genuine attempt, append
`DATE | P | pin:FAIL <reason>` and send a `--type alert` card naming what broke.
Do not retry into a loop, do not post a substitute image, do not silently skip.

## Cleanup — last step, every run (Patrick's order 2026-08-28, msg 804433692)

`tabs_close_mcp` and `tabs_context_mcp` only see **this session's** tab group. A
tab from a run that died before cleanup, or from before an extension reconnect,
is invisible to you and to every later run - "`tabs_context_mcp` reports no
group" proves your group is empty, not that Patrick's Chrome is clean. Leftover
groups pile up in his browser exactly this way.

1. **One tab per run.** Open it once, navigate it, never open a second.
2. **Close the tab the moment the pin is verified live** - before the log line,
   before NOTES.md, before the report. The tail after posting is where a limit or
   timeout kills the run and strands the tab.
3. On failure, close the tab before logging the FAIL line.
4. **Report the count, not the check:** `tabs: opened N, closed N`. A tab that
   went out of reach is reported as `ORPHANED TAB: <url> - close it by hand`, in
   the report and the log line. Never write "closed" for a tab you did not see
   close.

Only a tab Patrick explicitly asked to keep open survives this step.

## Never

- Pin without the `sojournly.au` link.
- Create boards, change account settings, follow, or comment. Pinning only.
- Enter credentials or create accounts. If logged out, fail and say so.
- Touch `ANTHROPIC_API_KEY`.
