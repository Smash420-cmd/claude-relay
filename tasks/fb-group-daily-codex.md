# Facebook group daily post (Codex): World Travel Planning

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** gpt-6.1-sol · **effort:** high
**Notes:** `C:/Users/pmdse/.relay/context/muhq6y7quiumu6/NOTES.md` (shared with the Claude task;
read it first, update it at the end).

The Codex twin of `fb-group-daily.md`. Everything about **what** to post is unchanged and
lives in that brief and the playbook; this file only replaces **how the browser is driven**,
because Codex can't use the Claude-in-Chrome extension. Browser route copied from the proven
Pinterest/Instagram Codex runs (2026-10-02); the Facebook steps were first exercised by a
dry run on 2026-10-03. Add every new pitfall to "Pitfalls" below.

## STEP 00: CHECK THE RULES HAVEN'T CHANGED UNDER YOU

Same as `fb-group-daily.md` STEP 00 (md5 stamp vs the RULES STAMP in NOTES.md; no stamp →
read `facebook-group.md`, `social-voice.md`, `facebook.md` in full).

**Read files as UTF-8**, one at a time. Batched reads truncated on 2026-10-02.

## What to post: unchanged

Read `C:/Users/pmdse/Projects/relay/tasks/fb-group-daily.md` once and follow its content
rules: run steps 1–4 (slot from the weekly rhythm, pillar/topic rotation from the `G` lines,
research before writing, unslop, photo rules with Pexels credit, numbered critic passes),
then 7–8 (one `G` line, last seven posts in NOTES). `.claude/context/facebook-group.md` is
authoritative. **One post a day:** if `instagram-log.md` already has a `G` line for today,
stop without posting.

**Ignore every browser mechanic in that brief and the playbook**: STEP 0 (pin the browser /
`list_connected_browsers` / start desk Chrome) and the `find`/`navigate`/`file_upload`
extension steps. This file replaces them. The playbook's behavioural rules still apply:
author stays Patrick's profile, never "Anonymous post", line breaks with `shift+Enter`
(plain Enter can submit), **never Escape** (it opens "Discard post?"), dismiss hashtag
typeaheads by typing on.

## Browser: sojournly-browser MCP, nothing else

Codex has it via `~/.codex/config.toml` (`[mcp_servers.sojournly-browser]`, chrome-devtools-mcp
on the dedicated profile `C:/Users/pmdse/.sojournly-agent-browser`). Relay's normal
`codex exec … --dangerously-bypass-approvals-and-sandbox -` picks it up. Tools are
`mcp__sojournly_browser__*`. That profile is signed in to Facebook as Patrick.

**Preconditions: stop and report, never work around:**
- **Tools absent** (search for the exact prefix `mcp__sojournly_browser__` first) →
  `G-FAIL BROWSER_UNAVAILABLE`.
- **Profile already open elsewhere** and the tools fail to launch → report the conflict.
  Never kill Chrome, switch profile or copy cookies.
- **Signed out / checkpoint / "confirm it's you"** → `G-FAIL signed out`. Never sign in or
  enter credentials.

## Posting: the sequence

1. `list_pages` first; record and preserve pre-existing pages.
2. `new_page` → https://www.facebook.com/groups/1493003239332336 . Snapshot: confirm you're on
   World Travel Planning as admin (the "Manage" / admin tools sidebar shows).
3. **Stage the photo in OS temp:** copy it to
   `C:/Users/pmdse/AppData/Local/Temp/sojournly-social-YYYY-MM-DD/`. The MCP rejects paths
   outside its roots, including `D:/` and the repo.
4. `click` the "Write something..." composer (snapshot uid). A "Create post" dialog opens.
   Check the author is Patrick's profile and "Anonymous post" is off.
5. In the dialog click **Photo/video**, then `upload_file` on the file input **inside the
   Create post dialog** with the temp path. Re-snapshot / screenshot to confirm the photo
   shows in the dialog.
6. `click` the dialog's text area, then `type_text` the post one paragraph at a time with
   `press_key Shift+Enter` between lines. Never `fill` the contenteditable (React editors
   keep the placeholder; see the Pinterest alt-text pitfall).
7. **Read it back**: `evaluate_script` returning the `innerText` of the dialog's
   contenteditable, compare to the final draft character for character (a dropped
   character happened on 2026-09-24). Fix by selecting the bad span and retyping.
8. Click **Post** once. Wait ~5 s, `navigate_page` to the group (reload), find the post in the
   feed by its first sentence, confirm the photo shows, and take its permalink (the
   timestamp link). No post in the feed means no post. A missing toast is not a failure:
   check the feed before ever pressing Post again.
9. **`close_page` your page immediately**, before log/notes/report; `list_pages` again to
   confirm only pre-existing pages remain.

### Pitfalls (from the Pinterest/Instagram Codex runs)

- Screenshots return a **file path**: open it with `view_image`. Use snapshots or focused DOM
  reads for exact text; full-page shots make it tiny.
- Pexels: read the key at runtime from `travel-blog/.env.local`, never print it. Python
  `urllib` got HTTP 403; `requests`/`curl` with the same key returned 200.
- PowerShell stdin mangles em dashes; use Python with `\u2014` escapes when editing NOTES.md
  by script.

## Log, report, failure

- `G` line exactly per `facebook-group.md`, plus `browser: sojournly-browser MCP` and
  `tabs: opened N, closed N` (or `ORPHANED PAGE: <url> - close it by hand`).
- Report as in `fb-group-daily.md`, naming the sojournly-browser MCP as the browser.
- Failure: once, per `fb-group-daily.md` (close the page, `DATE | G-FAIL | <reason>`, one
  alert card, no retry loop). If Post was pressed and the outcome is uncertain, check the
  feed first: if the post exists, verify it instead of retrying.
- The run's **last line** is `RESULT: POSTED <permalink>` or `RESULT: G-FAIL <reason>`.
