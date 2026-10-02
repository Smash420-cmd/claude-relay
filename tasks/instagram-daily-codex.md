# Instagram daily post (Codex) — @sojournly.au

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** gpt-6.1-sol · **effort:** high
**Notes:** `C:/Users/pmdse/.relay/context/mscncpjn6ero0e/NOTES.md` (shared with the Claude task; read it
first, update it at the end).

The Codex twin of `instagram-daily.md`. Everything about **what** to post is unchanged and
lives in the playbooks; this file only replaces **how the browser is driven**, because Codex
can't use the Claude-in-Chrome extension. Route proven by the CODEX-TEST carousel on
2026-10-02 (https://www.instagram.com/p/Dd_ShlUiQvo/, log line `CODEX-TEST`, 10 min to
verified post). Routine runs do **not** write `CODEX-TEST` in the log line.

## STEP 00 — CHECK THE RULES HAVEN'T CHANGED UNDER YOU

Same as `instagram-daily.md` STEP 00, word for word: run

```bash
cd C:/Users/pmdse/Projects/sojournly-social
md5sum .claude/context/*.md | awk '{n=$2; sub(/.*\//,"",n); printf "%.8s  %s\n", $1, n}' | grep -v instagram-log
```

compare against the RULES STAMP in NOTES.md, read every changed file in full, say which
changed, write the new stamp. No stamp yet → read `instagram.md` and `social-voice.md` in full.

**Read files as UTF-8** (`Get-Content -Encoding utf8` or Python). Default PowerShell reads
show mojibake for country names and credits. Read playbook, log and notes one at a time:
batching them in one command truncated the output on 2026-10-02.

## What to post — unchanged

Read `C:/Users/pmdse/Projects/relay/tasks/instagram-daily.md` once for the content rules and
follow them: Instagram only, never pin anything, image → research → write, `social-voice.md`
governs the words, the playbook `.claude/context/instagram.md` is authoritative. Also read
`brand.md` and `feature-problems.md`, and load the unslop skill
(`C:/Users/pmdse/.claude/skills/unslop/SKILL.md` plus its references) before drafting.
Use the playbook's §1 chooser for the type; never force a type.

**Ignore every browser mechanic in that file and in the playbooks**: STEP 0 (pin the
browser / `list_connected_browsers` / start desk Chrome), §0 "Browser route", the
`find`/`computer`/`file_upload`/`javascript_tool` steps in §5, the `file_upload` 10 MB cap,
`os_drop_file.ps1` / `os_pick_file.ps1`, mouse-takeover heads-up cards, and "never use
chrome-devtools". This file replaces all of them. Everything else (critic passes, crops,
credits, no-repeat greps, log format, §6 failure counting) still applies.

## Browser — sojournly-browser MCP, nothing else

Codex has it via `~/.codex/config.toml`:

```toml
[mcp_servers.sojournly-browser]
command = "npx"
args = ["-y", "chrome-devtools-mcp@latest", "--userDataDir", "C:/Users/pmdse/.sojournly-agent-browser"]
```

Relay's normal `codex exec … --dangerously-bypass-approvals-and-sandbox -` picks it up; no
extra flag. It drives a **dedicated Chrome profile** (`C:/Users/pmdse/.sojournly-agent-browser`)
that Patrick signed in to @sojournly.au. Not his Profile 1, no extension, no mouse takeover.

Tools are named `mcp__sojournly_browser__*` (underscore, not hyphen): `list_pages`,
`new_page`, `navigate_page`, `take_snapshot`, `click`, `fill`, `fill_form`, `type_text`,
`press_key`, `upload_file`, `drag`, `wait_for`, `take_screenshot`, `evaluate_script`,
`close_page`.

**Preconditions — stop and report, never work around:**
- **Tools absent:** a broad tool search missed them on 2026-10-02; search for the exact
  prefix `mcp__sojournly_browser__` before deciding. Still absent → log `FAIL n | BROWSER_UNAVAILABLE`.
- **Profile already open** (Patrick left the sign-in window open) and the tools fail to
  launch → log the conflict and stop. Never kill Chrome, never switch profile, never copy cookies.
- **Signed out** (no **Edit profile** on https://www.instagram.com/sojournly.au/) → stop and
  report. Never sign in, never type a password.

## Posting — the sequence that worked

1. `list_pages` first; record the pre-existing pages (usually one `about:blank`). Never
   close or touch them.
2. `new_page` (no `isolatedContext`) → https://www.instagram.com/sojournly.au/. `wait_for`
   "Edit profile" before reading anything: right after a load the DOM has no posts yet.
   Note the post count.
3. **Stage the files in OS temp.** The MCP rejects any path outside its roots
   ("Access denied, path is not within any configured workspace roots"), repo and `D:/`
   included. Copy the final slides to
   `C:/Users/pmdse/AppData/Local/Temp/sojournly-social-YYYY-MM-DD/` with order-prefixed
   names (`01-….jpg` … `04-app.png`). Screenshots go there too; copy evidence back to the
   asset folder afterwards.
4. Create → Post via snapshot uids. On the upload step, `take_snapshot` and call
   `upload_file` on the **"Select from computer" button uid (or the dialog's file input)**
   with **all slide paths in ONE call**, in order. No OS dialog opens; no 10 MB cap
   applies (2 MB carousel tested).
5. **Take a fresh snapshot.** The one returned by `upload_file` still shows the upload
   screen; Crop appears a few seconds later. Success text is not proof the composer moved on.
6. **Crop:** Instagram defaults to 1:1 even for 1080×1350 files and clips the overlay.
   Open the crop selector, choose **4:5** (or **Original**), then step through every slide
   with the arrow, screenshot each, and confirm full framing and the exact order (app slide
   last). Reorder in the gallery if needed.
7. Next → Next (no filter). Re-snapshot after each click; the modal animates.
8. **Caption: `click` the caption textbox uid, then `type_text`.** Do **not** use `fill`
   here: on 2026-10-02 it reported "Successfully filled" while the box stayed empty
   (counter 0/2,200, innerText one newline). Afterwards verify with read-only
   `evaluate_script` (the caption element's `innerText` and length) and the counter.
   Never Escape (opens "Discard post?").
9. Share once. `wait_for` "Your post has been shared" → Done.
10. Reload the profile, `wait_for` "Edit profile", confirm the count went up by one and
    take the new permalink.
11. Open the live post and check every slide: the carousel's Next is the button **inside
    `article`**; the outer Next jumps to another post. Check `img_index` on each step;
    the last slide has no inner Next.
12. **`close_page` your page immediately**, before log/notes/report. `list_pages` again
    and confirm only the pre-existing pages remain.

**Type A (weekly reel) is untested on Codex.** Use the same route: `upload_file` the mp4
from OS temp (CDP sets the file directly, so the extension's 10 MB limit and the
drag-drop script don't apply), crop **9:16**, and set the cover with the `drag` tool
(a plain click on the cover strip does nothing). If any of that fails, fail per §6;
don't improvise an OS-level route.

### Pitfalls the test hit

- Screenshots return a **file path**, not an image: open it with `view_image`. Target
  the dialog/media uid; full-viewport shots are large and hard to read.
- Instagram's auto alt text and Pexels' alt text both misidentified places (Charles
  Bridge as "Bran Castle"). Judge the photo itself plus your sources.
- The renderer wraps long overlays; keep them to one physical line (six to eight words)
  and re-measure after rewording.
- PowerShell quoting broke one inline Python measure command; keep CLI args simple or
  write a small script file.
- Pexels key: read it at runtime from `travel-blog/.env.local`, never print or copy it.
  If Python `urllib` gets HTTP 403, use `requests`/`curl` with the same key (Pinterest
  test, 2026-10-02).

## Log, cleanup, failure

- Log line exactly per playbook §7, plus `browser: sojournly-browser MCP` and
  `tabs: opened N, closed N` (or `ORPHANED PAGE: <url> - close it by hand`).
- **Before any retry, decide published vs unpublished**: reload the profile and compare
  the count. A post that went live but wasn't verified is not a failure to retry.
- §6 retry, Codex version (no `--chrome`; name the notes file and what's built):

```bash
node C:/Users/pmdse/Projects/relay/scripts/relay.js schedule \
  --model gpt-6.1-sol --effort high --at +60m --session-policy ephemeral \
  --cwd "C:/Users/pmdse/Projects/sojournly-social" \
  --title "Instagram retry (Codex) - sojournly.au" \
  --prompt "Read C:/Users/pmdse/Projects/relay/tasks/instagram-daily-codex.md and follow it exactly. FIRST read C:/Users/pmdse/.relay/context/mscncpjn6ero0e/NOTES.md. <what is already built and where>."
```

- Third failure → `ABANDONED` + urgent card, per §6.
