# Instagram daily post — @sojournly.au

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** claude-sonnet-5-5 · **effort:** high

## STEP 00 — CHECK THE RULES HAVEN'T CHANGED UNDER YOU

**This session is reused for a week. Your context may contain a playbook that has
since been rewritten.** That is not hypothetical: on 2026-08-04 this task posted the
wrong type because it worked from a §1 it had read the previous day, hours before
that section was replaced. A rule you remember is a claim to verify, not a fact.

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
- **No stamp in NOTES yet** → read `instagram.md` and `social-voice.md` in full.

Then **write the new block into NOTES.md as the RULES STAMP**, replacing the old
one. `instagram-log.md` is excluded on purpose — it changes every day and would
make the stamp differ every run, which would train you to ignore it.

This is a cheap mechanical check that does not depend on you noticing anything. It
is the only thing standing between a week-old session and a week-old rule.

---

## STEP 0 — PIN THE BROWSER. Nothing else happens first.

Two Chrome extensions are connected to Patrick's account: his **Windows** desk
machine and his **Mac**. **Only the Windows one is signed in to @sojournly.au.**
The Mac is frequently the only one connected, and the default selection will
happily hand you it.

Before `tabs_context_mcp`, before any tab, before reading the photo pool:

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
substitute — Patrick has not authorised any other machine, and driving the wrong
one is the exact failure of 2026-08-03 14:00.

**If there is no Windows + local entry, START THE DESK CHROME, then look again.**
The desk machine's Chrome isn't running - 2026-09-12, 13 and 14 all lost their post
this way. From the PowerShell tool (Profile 1 holds the Claude extension):

```powershell
Start-Process chrome.exe -ArgumentList '--profile-directory="Profile 1"'
```

Wait 30 s, then `list_connected_browsers` again. Try this up to 3 times. Only if the
Windows + `isLocal: true` entry still never appears: log `FAIL n | no Windows/local
browser connected - desk Chrome would not start`, alert Patrick, and do no prep
work. **Never post through the Mac, never select it, never fall back to it** - it
is not signed in, and attempting it wastes the day and produces a false
"logged out" report.

**A signed-out Instagram is a wrong-machine symptom until proven otherwise**
(2026-08-03: the 14:00 run reported a logged-out account, alerted Patrick, and
lost the slot; the account was signed in the whole time on the browser it should
have been driving). If the profile renders signed-out *after* step 0 succeeded,
say so explicitly, and name every connected browser in the failure line.

---

Post one image to the @sojournly.au Instagram account. **Instagram only.**

**Do not pin anything.** Pinterest was decoupled on 2026-07-31 and has its own
daily task (`pinterest-daily.md`) that picks its own frame. This brief used to
say "after a successful post, mirror it as a pin per `pinterest.md`, but only
while its Status says ACTIVE" — that Status now reads ACTIVE, so following it
would pin twice a day and hand Pinterest whatever Instagram happened to choose.
Nothing in this run touches Pinterest.

Authoritative playbook: `C:/Users/pmdse/Projects/sojournly-social/.claude/context/instagram.md`
— read it in full before doing anything, plus `.claude/context/social-voice.md`
for caption voice. If this brief and the playbook disagree, follow the playbook.

**Order is image → research → write.** Look at the photograph, run a few searches
on the subject, then write. Never research to justify a draft you've already
written. If web search isn't available, log `research:unavailable` and keep the
caption to what needs no source rather than writing from memory.

`social-voice.md` is short and governs the writing. Follow it; nothing about the
words is repeated here.

## Browser — the only supported route

Drive Instagram through the **Claude in Chrome extension**, in Claude's own tab
group, against Patrick's real logged-in Chrome profile:

`mcp__claude-in-chrome__tabs_context_mcp` → `tabs_create_mcp` → `navigate` →
`find` / `computer` / `file_upload` → `tabs_close_mcp`.

**Never use the `chrome-devtools` MCP for this task.** It attaches over a
DevTools debug port to the default profile; when Patrick's Chrome already holds
that profile it can neither attach nor relaunch, and any profile it *can* open
is logged out of Instagram. It cannot post. Do not launch Chrome with
`--remote-debugging-port`, do not use a scratch `--user-data-dir`, do not quit
Patrick's Chrome.

If the `mcp__claude-in-chrome__*` tools are not available in the session, or the
extension can't reach instagram.com, that is a **precondition failure**: log
`FAIL n` per playbook §4b, alert Patrick, and stop. Do not substitute a
different browser route.

## Cleanup - close what you opened, and say what you could not

`tabs_close_mcp` and `tabs_context_mcp` only see **this session's** tab group. A
tab from a run that died before cleanup, or from before an extension reconnect
(2026-09-07: `navigate` returned "not connected", the reconnect got a fresh group
and the first tab was orphaned), is invisible to you and to every later run. So
"`tabs_context_mcp` reports no group" proves nothing about Patrick's Chrome - it
proves your current group is empty. Leftover groups pile up in his browser
exactly this way.

Rules:

1. **One tab per run.** Open it once with `tabs_create_mcp`; navigate it, never
   open a second. If you must reconnect (`select_browser` again), reuse the same
   tab id if `tabs_context_mcp` still lists it.
2. **Close the tab the moment the live post is verified** - before the log line,
   before NOTES.md, before the report. The long tail after posting is where a
   limit or timeout kills the run and strands the tab.
3. On failure, close the tab before logging the FAIL line, same reason.
4. **Report the count, not the check:** the final report says `tabs: opened N,
   closed N`. If a tab went out of reach (reconnect, tool error on close), say
   `ORPHANED TAB: <url> - close it by hand` in the report and in the log line.
   Never write "closed" for a tab you did not see close.

Only a tab Patrick explicitly asked to keep open survives this step.

## Retry

Playbook §4b owns the retry rule: fail 1 and 2 self-schedule +60m, fail 3 →
`ABANDONED` line + urgent Interlinked alert, nothing further that day.
