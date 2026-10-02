# Pinterest daily pin (Codex) — sojournly.au

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** gpt-6.1-sol · **effort:** high
**Notes:** `C:/Users/pmdse/.relay/context/mscncplgu3sys7/NOTES.md` (shared with the Claude task;
read it first, update it at the end).

The Codex twin of `pinterest-daily.md`. Everything about **what** to pin is unchanged and
lives in the playbooks; this file only replaces **how the browser is driven**, because Codex
can't use the Claude-in-Chrome extension. Route proven by the CODEX-TEST pin on 2026-10-02
(https://au.pinterest.com/pin/1135329387347613624/, 6.6 min to verified pin). Routine
runs do **not** write `CODEX-TEST` in the log line.

## STEP 00 — CHECK THE RULES HAVEN'T CHANGED UNDER YOU

Same as `pinterest-daily.md` STEP 00: run

```bash
cd C:/Users/pmdse/Projects/sojournly-social
md5sum .claude/context/*.md | awk '{n=$2; sub(/.*\//,"",n); printf "%.8s  %s\n", $1, n}' | grep -v instagram-log
```

compare against the RULES STAMP in NOTES.md, read every changed file in full, say which
changed, write the new stamp. No stamp yet → read `pinterest.md` and `social-voice.md` in full.

**Read files as UTF-8**, one at a time. Batched reads truncated on 2026-10-02.

## What to pin — unchanged

Read `C:/Users/pmdse/Projects/relay/tasks/pinterest-daily.md` once and follow its content
rules: the daily own-frame / Pexels alternation (from the last successful `P` line), list
`D:/2026/pinterest-ready/lr-export/` fresh, portrait lane only, `pin:` repeat greps, look at
the image, research before writing, Japan/Europe boards only, no marketing assets, the
"lane is empty" and "Never" rules, one `P` log line, last five descriptions in NOTES.
`.claude/context/pinterest.md` is authoritative. Also read `brand.md` and
`feature-problems.md`, and load the unslop skill before drafting. If today already has a
verified `P` line, stop without pinning.

**Ignore every browser mechanic in that file and in the playbook**: STEP 0 (pin the browser /
`list_connected_browsers` / start desk Chrome), §3's extension steps, "never chrome-devtools",
and the `find`/`computer`/`file_upload` instructions. This file replaces them.

## Browser — sojournly-browser MCP, nothing else

Codex has it via `~/.codex/config.toml`:

```toml
[mcp_servers.sojournly-browser]
command = "npx"
args = ["-y", "chrome-devtools-mcp@latest", "--userDataDir", "C:/Users/pmdse/.sojournly-agent-browser"]
```

Relay's normal `codex exec … --dangerously-bypass-approvals-and-sandbox -` picks it up; no
extra flag. It drives a **dedicated Chrome profile** that Patrick signed in to Pinterest.
Not his Profile 1, no extension, no mouse takeover. Tools are `mcp__sojournly_browser__*`.

**Preconditions — stop and report, never work around:**
- **Tools absent** (search for the exact prefix `mcp__sojournly_browser__` first) →
  `pin:FAIL BROWSER_UNAVAILABLE`.
- **Profile already open elsewhere** and the tools fail to launch → report the conflict.
  Never kill Chrome, switch profile or copy cookies.
- **Signed out** → `pin:FAIL signed out`. Never sign in or enter credentials.

## Pinning — the sequence that worked

1. `list_pages` first; record and preserve pre-existing pages.
2. `new_page` → the destination board (e.g. https://au.pinterest.com/Sojournly/europe/),
   confirm the account is Sojournly and check the board's titles and thumbnails for a
   duplicate subject.
3. **Stage the image in OS temp:** copy it to
   `C:/Users/pmdse/AppData/Local/Temp/sojournly-social-YYYY-MM-DD/`. The MCP rejects paths
   outside its roots, and that includes `D:/` and the repo.
4. `navigate_page` to https://au.pinterest.com/pin-builder/. Direct navigation works on this
   route (the old notes say it's inert; that was the extension). Dismiss notices (the
   media-library popup) with the snapshot's **OK** uid.
5. `upload_file` on the snapshot's **file input / "File upload" uid** with the temp path.
   No OS dialog opens.
6. **Fields:** `fill_form` for title and link (`https://sojournly.au/?utm_source=pinterest`);
   **`click` + `type_text` for the description** (contenteditable). For **alt text**, `fill`
   reported success but the field kept its placeholder: use `click`, `press_key Control+A`,
   `type_text`, `press_key Tab`. A paragraph break adds one extra newline in the editor
   (400 → 401), so leave headroom under 500.
7. **Verify every field** with a fresh snapshot or screenshot. A value-only DOM read is not
   enough on React inputs. Read only the named visible fields; one broad query picked up
   a hidden security/challenge textarea, so leave that alone.
8. **Set the board explicitly.** The composer opened on **Japan** while starting from Europe;
   the playbook's "defaults to Europe" is unreliable. The picker shows a loading-only
   snapshot at first, so re-snapshot. Board rows contain nested Publish buttons: click the
   **row** to select it, then confirm the board.
9. Check image preview, copy, alt text and board, then press the main **Publish** once.
10. **A toast timeout is not a failure.** `wait_for` "Your Pin has been published" timed out
    after 20 s while the pin was live. Never press Publish again; go to the board, count
    tiles (the "N Pins" counter is stale) and open the new pin.
11. Verify the live pin: photo, title, full description, board, credit, motto, alt text,
    Visit-site link. Fetching the public pin HTML (HTTP 200) confirms the copy and board slug.
12. **`close_page` your page immediately**, before log/notes/report; `list_pages` again
    to confirm only pre-existing pages remain.

### Pitfalls the test hit

- Screenshots return a **file path**: open it with `view_image`. Full-page shots at the
  large viewport make form text tiny, so use snapshots or focused DOM reads for exact text.
- Pexels: read the key at runtime from `travel-blog/.env.local`, never print it. Python
  `urllib` got HTTP 403; `requests`/`curl` with the same key returned 200.
- For older pins, `og:description` returns generic text; read the description from the
  page JSON when filling the last-five list.
- PowerShell stdin mangled an em dash in a heading match; use Python with `\u2014` escapes
  when editing NOTES.md by script.

## Log, cleanup, failure

- `P` line exactly per `pinterest.md` §4, plus `browser: sojournly-browser MCP` and
  `tabs: opened N, closed N` (or `ORPHANED PAGE: <url> - close it by hand`).
- Failure: fail loudly once, per `pinterest-daily.md`. Before logging a failure after
  Publish was pressed, check the board: if the pin exists, verify it instead of retrying.
  Never post a substitute image after an uncertain publish.
