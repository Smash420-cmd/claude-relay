# Pinterest — pin today's folder on R2

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** claude-sonnet-5-5 · **effort:** medium · **Browser:** R2 (`r2-browser` MCP, profile `social`)

From Thursday 22 Oct 2026. You upload one prepared pin. You write nothing and judge nothing. Read only what this file names.
## The folder
`social-assets/queue/<today>/pinterest/` with `<today>` the machine's local date (`date +%F`). It holds `manifest.json`
(`platform`, `date`, `image`, `title`, `board`, `link`, `approved`, `status`) and `caption.txt` (the description).

## Stop rules: pin nothing, send ONE line, end
- No folder, no manifest, `status` not `ready`, or `approved` empty →
  `python scripts/tg.py send "Pinterest: nothing queued for <today>, nothing pinned."`
- The pin builder asks to log in → `python scripts/tg.py send "Pinterest: signed out on R2, nothing pinned."` (never log in).
- A step refused, or the page goes wrong → `browser_stop`, `python scripts/tg.py send "Pinterest: <what failed>, nothing pinned."`.

## Pin (job `daily-pin` on the Publish click)
1. **Already pinned?** `browser_open` `https://au.pinterest.com/Sojournly/<board>/` with `profile: "social"`; `browser_read`.
   If the first tile's title is the manifest's `title`, a run before this one pinned it: skip to Record with its URL.
   Otherwise `browser_open` `https://au.pinterest.com/pin-builder/`; `browser_read`.
2. `browser_upload` with the file-input ref, `files` = the manifest's `image`, full path. Read: the preview shows it.
3. `browser_click` the title field, `browser_type` the manifest's `title`.
4. `browser_click` the description field, `browser_type` the whole of `caption.txt`, unchanged.
5. `browser_click` the link field, `browser_type` the manifest's `link`.
6. Board: `browser_click` the board picker, then the board named in the manifest (it defaults to Europe; a Japan pin must
   change it). `browser_read`: the picker shows that board.
7. `browser_screenshot` with `fullPage`: image, title, description, link, board.
8. `browser_click` **Publish**. Read until "Your Pin has been published" (or "Publish complete").
9. `browser_open` `https://au.pinterest.com/Sojournly/<board>/`: the new pin is the first tile; open it, read the URL,
   check title and description. Anything different → send the line `Pinterest: pinned but <what differs>: <url>`.
10. `browser_stop`.

## Record
- `manifest.json`: `"status": "posted"`, `"posted_url"`, `"posted_at"` (ISO, local).
- Append `log-line.txt` to `.claude/context/instagram-log.md` with `<url>` filled in.
- Append to `.claude/context/photo-approvals.md`: `<today> | POSTED | pinterest | <image> | <url> | <folder>`.
- `python scripts/tg.py send "Pinterest pinned: <url>"`.

Never create a board, follow, comment, change settings, type a password, touch `ANTHROPIC_API_KEY`, or pin from any
other folder.
