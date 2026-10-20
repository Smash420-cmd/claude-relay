# Instagram — post today's folder on R2

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** claude-sonnet-5-5 · **effort:** medium · **Browser:** R2 (`r2-browser` MCP, profile `social`)

From Thursday 22 Oct 2026. You upload one prepared post. You write nothing and judge nothing. Read only what this file names.
## The folder
`social-assets/queue/<today>/instagram/` with `<today>` the machine's local date (`date +%F`). It holds `manifest.json`
(`platform`, `date`, `type`, `slides` or `reel`, `crop`, `approved`, `status`), `caption.txt` and the slide files.

## Stop rules: post nothing, send ONE line, end
- No folder, no manifest, `status` not `ready`, or `approved` empty →
  `python scripts/tg.py send "Instagram: nothing queued for <today>, nothing posted."`
- `browser_open` fails or the profile shows no **Edit profile** → `browser_signin` with `site: "instagram"`, `profile: "social"`
  once; anything but signed-in → `python scripts/tg.py send "Instagram: signed out on R2, nothing posted."`
- A step refused, or the dialog goes wrong → close the dialog (its X, then Discard), `browser_stop`,
  `python scripts/tg.py send "Instagram: <what failed>, nothing posted."`. Never press Escape, never retry the Share.

## Post (job `daily-post` on every click)
1. `browser_open` `https://www.instagram.com/sojournly.au/` with `profile: "social"`; `browser_read`; note the post count.
   **Already posted?** Open the newest post. If its caption begins with the first line of `caption.txt`, a run before this
   one posted it: skip to Record with that URL, post nothing (a crash between Share and Record must not post twice).
2. `browser_click` **Create** (New post), then **Post**.
3. `browser_upload` with the dialog's file-input ref, `files` = the manifest's slides (or the reel) in order, full paths.
4. Crop: the expand icon → the manifest's `crop` (**4:5** or **Original**); `browser_screenshot`: nothing cut.
5. **Next**, **Next**, reading after each so the header shows the new step.
6. `browser_type` the whole of `caption.txt` into the caption field, unchanged.
7. `browser_screenshot` with `fullPage`: slides in order, crop, caption.
8. `browser_click` **Share**. Read until "Your post has been shared"; click **Done**.
9. `browser_open` the profile again: count up by one, newest post first; open it, read the URL and check the slide order
   and the caption. Different order or missing text → send the line `Instagram: posted but <what differs>: <url>`.
10. `browser_stop`.

## Record
- `manifest.json`: `"status": "posted"`, `"posted_url"`, `"posted_at"` (ISO, local).
- Append `log-line.txt` to `.claude/context/instagram-log.md` with `<url>` filled in.
- Append to `.claude/context/photo-approvals.md`: `<today> | POSTED | instagram | <slides> | <url> | <folder>`.
- `python scripts/tg.py send "Instagram posted: <url>"`.

Never type a password or a code, touch `ANTHROPIC_API_KEY`, change the caption, or post from any other folder.
