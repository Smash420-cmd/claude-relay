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

- **2026-10-03 Facebook dry run: use UTF-8 from the first read.** A plain PowerShell
  `Get-Content` rendered the runbook's punctuation as mojibake. Re-read with
  `-Encoding UTF8`; do not infer rule changes from an incorrectly decoded file.
- Printing all complete browser-tool descriptions alongside the existing findings
  produced truncated output. Discover the exact prefix first, print only the tool
  schemas needed next, and read long files separately with adequate output limits.
- Facebook showed a **Push notifications request** alert on first arrival and again
  after reload. Dismiss its fresh **Close** uid, leaving notification settings alone.
  `wait_for` can match the underlying feed while this alert still hides the group;
  inspect the fresh snapshot for modal alerts before interacting or taking evidence.
- The official Sagrada Família URL `/en/sagrada-familia` was inaccessible through web
  open. Search found the working official standard-ticket page at
  `https://sagradafamilia.org/en/web/guest/sagrada-familia-ticket`. Keep research on
  verified operator URLs rather than guessing a replacement or using reseller claims.
- The accessibility snapshot calls the group content "main", but the DOM node is
  `<div role="main" aria-label="Group content">`, not a `<main>` element.
  `main[aria-label="Group content"]` returned null twice; use
  `[role="main"][aria-label="Group content"]` for scoped feed reads.
- The first **Write something...** click reported success without opening the
  composer; a 15-second Create post wait timed out. A fresh snapshot/screenshot proved
  it stayed closed; a second composer click opened it. Never type until the actual
  Create post dialog and its textbox are present.
- The dialog's file input was hidden from even the verbose accessibility snapshot.
  A scoped read confirmed one `input[type="file"]` inside Create post. The supported
  `upload_file` call on that dialog's **Photo/video** uid selected this input and
  uploaded the temp file successfully. Do not use the separate page-level Choose
  Files input. Confirm the image and filename in the composer afterward.
- Typing the Pexels credit triggered **mention suggestions**, despite there being
  no hashtag or @ in the credit. Do not select a suggestion or press plain Enter or
  Escape. The exact read-back preserved the plain-text credit without a mention.
- **X does not necessarily offer Discard post.** In this profile on this run, X
  immediately closed Create post and reopening restored both text and photo. A
  second X behaved the same; no visible discard/draft controls or dialog existed.
  The More post options panel contained only attachment/post-type options, not
  Discard. For this expressly authorized dry run, cleared the editor using click,
  Control+A, Backspace, removed the attachment with its own Remove post attachment
  button, clicked X, reloaded, and reopened to confirm an empty composer with Post
  disabled. Never report this as a tested Discard click: that part of the requested
  dry run failed. Ordinary publication runs must keep the existing never-Discard rule.
- Facebook loads feed posts lazily: the baseline DOM had two post IDs, while the
  first reloaded DOM had one. Unequal loaded totals do not prove a new or missing
  publication. For the no-publication check, selected **New posts**, recorded the
  newest existing post ID and hook before/after, and verified the dry-run hook and
  example absent after reload. New posts sorting navigates to
  `?sorting_setting=CHRONOLOGICAL`; wait for the feed to render after navigation.
- Reopening the cleared composer initially exposed a transient dialog without a
  textbox; an immediate DOM read returned null. The next snapshot had the completed
  empty form and different dialog uids. A screenshot using the earlier dialog uid
  was rejected once. Re-snapshot and use the newest uid after composer re-rendering;
  do not reuse the loading dialog's uid.

- **2026-10-04 publication: file inputs clear after upload.** The dialog file input
  had an empty files list after a successful upload; the named attachment in the snapshot
  and the composer screenshot confirmed the photo. Do not treat an empty files list as
  failure when the attachment is visible.
- **Permalink title can update before the post finishes rendering.** The timestamp click
  opened the correct permalink immediately, but the first screenshot showed a loading
  skeleton. A subsequent focused DOM read confirmed the hook, credit and loaded image.
  Wait for the rendered post before taking final screenshot evidence.

- **PowerShell stdin also mangles accented letters.** On 2026-10-04, a Python
  here-string wrote `Fam?lia` to the log and notes despite UTF-8 file writes.
  Corrected to `Família` with `\u00ed` in the Python source and verified the files.
  Use Unicode escapes or direct apply_patch for all non-ASCII text, not just em dashes.

## Log, report, failure

- `G` line exactly per `facebook-group.md`, plus `browser: sojournly-browser MCP` and
  `tabs: opened N, closed N` (or `ORPHANED PAGE: <url> - close it by hand`).
- Report as in `fb-group-daily.md`, naming the sojournly-browser MCP as the browser.
- Failure: once, per `fb-group-daily.md` (close the page, `DATE | G-FAIL | <reason>`, one
  alert card, no retry loop). If Post was pressed and the outcome is uncertain, check the
  feed first: if the post exists, verify it instead of retrying.
- The run's **last line** is `RESULT: POSTED <permalink>` or `RESULT: G-FAIL <reason>`.
