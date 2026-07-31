# Instagram daily post — @sojournly.au

**cwd:** `C:/Users/pmdse/Projects/sojournly-social` · **model:** opus · **effort:** high

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

**The caption starts from the photograph**, per `social-voice.md` §"Write from
the frame": open on something literally visible in the image, pick a fact the
picture earns, and log a `frame:` token recording what you opened on. Observe,
don't infer — no weather, season or time of day unless the picture states it.

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

## Retry

Playbook §4b owns the retry rule: fail 1 and 2 self-schedule +60m, fail 3 →
`ABANDONED` line + urgent Interlinked alert, nothing further that day.
