# Context: how Infinite Unblock Me got here

The user's own messages about the game, verbatim and in order, with a short note on what the agent did after each and which commits and reports came out of it. Written for an agent that needs the user's intent and history. Built on 2026-11-11 from the Claude Code transcripts on hockey-mandolin.

- **Phase files** (below): one per stretch of work. Each exchange has the date, time (UTC) and session, the user's message(s) as quotes, attached screenshot paths, a one-paragraph "Agent:" note, commits and linked reports.
- **[preferences.md](preferences.md)**: the user's design taste, level-quality beliefs, rejected ideas and workflow rules, each with date and a link back.
- `ai-chat-state-space-and-difficulty.txt` is separate (the user's own chat with another AI, Nov 11); not covered here.

## Timeline

| Dates (2026) | Work | Key decisions |
|---|---|---|
| Jul 20 – Aug 17 | Original project (no transcripts; git only): terminal MVP, web version on GitHub Pages, multi-cell drag, proof-solvable generation, infinite-world prototypes, issue reports | Kept as tag `legacy-2026-10` |
| Oct 25–26 | Launcher icon; bypass session created; branch renamed to `main` | "unblock me is a shitshow, need to redo that entire project" |
| Oct 29 | Rebuild from scratch: infinite canvas, 2×1 blocks on a lattice, reset/UI blocks in the world, live reload | No text in the UI; all issues, releases, CI, Pages deleted |
| Oct 30 am | Density/jam reports, goals by directed shuffle, quick push, undo, eases, goal visuals, edge arrows, glow, chained goals | Ease-out cubic 1.5×; up/right push; goal not on earlier tracks |
| Oct 30 midday | Goal search 100× faster (subagent), difficulty measure (A*), stars, medals, play-data upload and log, α distance weight, push cap removed | "r" = recommended; good goal = difficult, many moves; no hard caps, tick budgets |
| Oct 30 pm | Score-track design report and finish animation | Stars earned at the end; medal hidden unless won |
| Oct 30 eve – Nov 1 | Public on exe.dev (publish per commit), score track in game, Telegram in-app browser tests, hidden debug UI, goal colours, track-block penalty | Public UI almost empty; no blocks on red's track |
| Nov 1 eve – Nov 3 | Testbed, inspector, "MORE" finish with synthesized audio, performance; library/multiplayer/offline Q&A | UI inside the world; deterministic shared engine; AI ideas kept in TODO as unapproved |
| Nov 4–5 | User tests recorded; tutorial island of walled squares; world ramp over 30 goals; undo removed; move sounds | Teach through level design; ramp from 4 to 10 fewest moves |
| Nov 6 | Soul animations (comet/flame/glint), skippable finishes, edge arrows, goal-trace report | Polish by many small visual corrections |
| Nov 6 – 8 | Goal spec (Referee/Judge/Auditor/Bench...), one-engine architecture report, spec phase 1 built, human-like "decisions", medal window fix | Verifier fixed, algorithm free; serial subagents; duplicate engines OK for now |
| Nov 9 – 11 | Walls sweep, "extra moves" measure, blind trial pairs (8/12/16, M, G, H, J, K), research request | Extra moves (blocks that must come back) is the closest feature; unclear room/world edges feel best |

## Phase files

| File | Dates (UTC) | Messages | Size |
|---|---|---|---|
| [phase-00-prehistory.md](phase-00-prehistory.md) | Jul (git) · Oct 25 – 26 | 12 | 8 KB |
| [phase-01-rebuild-canvas.md](phase-01-rebuild-canvas.md) | Oct 29 20:01 – Oct 30 07:53 | 21 | 14 KB |
| [phase-02-goals-and-feel.md](phase-02-goals-and-feel.md) | Oct 30 08:29 – 11:20 | 36 | 19 KB |
| [phase-03-goal-search-difficulty-stars.md](phase-03-goal-search-difficulty-stars.md) | Oct 30 11:27 – 14:53 | 33 | 20 KB |
| [phase-04-score-track.md](phase-04-score-track.md) | Oct 30 14:59 – 16:23 | 42 | 22 KB |
| [phase-05-public-telegram-colors.md](phase-05-public-telegram-colors.md) | Oct 30 17:34 – Nov 1 21:36 | 39 | 24 KB |
| [phase-06-finish-juice-and-tech-talk.md](phase-06-finish-juice-and-tech-talk.md) | Nov 1 21:40 – Nov 3 12:51 | 27 | 15 KB |
| [phase-07-user-tests-island-ramp-sound.md](phase-07-user-tests-island-ramp-sound.md) | Nov 4 14:16 – Nov 5 22:10 | 49 | 36 KB |
| [phase-08-souls-and-polish.md](phase-08-souls-and-polish.md) | Nov 6 07:29 – 14:33 | 36 | 23 KB |
| [phase-09-goal-spec-and-one-engine.md](phase-09-goal-spec-and-one-engine.md) | Nov 6 15:06 – Nov 8 20:03 | 21 | 32 KB |
| [phase-10-walls-extra-moves-trials.md](phase-10-walls-extra-moves-trials.md) | Nov 9 05:17 – Nov 11 13:04 | 30 | 35 KB |

Most-read starting points for level-generation work: phase 3 (difficulty, stars), phase 7 (user tests, island, ramp), phase 9 (goal spec, decisions, medals), phase 10 (extra moves and the trials).

## Sources and method

- **Sessions:** `1e4aef56` (Personal Dev Bypass, Oct 26 – Nov 8, nearly all game work), `85b40a8d` (new bypass session, Nov 9 – now, still running), `871acc6f` (Personal Dev, Oct 25 – Nov 9, mostly other apps), `0a7d07d7` and `e731300a` (Oct 15, unrelated). Full ids are in `~/.claude/projects/-home-exedev*/`.
- **Human messages:** transcript entries marked with origin "human", plus messages typed while the agent was busy (stored as queued-command attachments, marked "sent while the agent was still working"). Excluded: tool results, system/hook reminders, task notifications, subagent hand-backs, messages from other sessions, compaction summaries, and the nested test sessions under `/tmp/...-scratchpad-nested` (their prompts were written by an agent). Retried duplicates (same text within 15 min) are counted once. 439 human messages were found; 346 about the game are quoted, the rest are about other apps, the VM or phone notifications.
- **Borderline:** X59 is human-sent but its text is a handoff the previous agent wrote and the user pasted. X371 is the user pasting a shell command. X201 is the user pasting an exe.dev command.
- **Agent notes** are condensed from the agent's visible replies, not from subagent transcripts. **Commits** are matched to the latest human message before the commit time (within 6 h); commits made while a skipped message was the latest are moved to the previous game message. All 333 commits since Oct 26 appear somewhere.
- **Screenshots:** paths under `~/.claude/uploads/<session>/` or, for older ones, `/tmp/claude-1000/-home-exedev-bypass/1e4aef56-.../images/N.png` (in /tmp, so they may vanish on reboot). Some image messages have no recorded path.

## Odd things

- The transcript of the Nov 8 phone-notification subagent (`1e4aef56.../subagents/agent-a1529a360b1b83b6d.jsonl`) is 0 bytes: an agent truncated it by mistake on Nov 9. It was not game work. All other transcripts parse cleanly.
- The bypass session `1e4aef56` died on Nov 8 ~21:21 UTC when an approved `pkill -f 'sleep 600'` matched its tmux launch line; work resumed in `85b40a8d` (phase 10, X370–X371).
- Nov 3, Nov 7 and most of Nov 4 morning have almost no messages (gaps in work, not missing data).
- Session `85b40a8d` was still growing when this was written; messages after Nov 11 13:04 UTC are not included.
- One message (X436) had a signed download URL; its query string is redacted.

## Preferences (general, from messages left out of the phase files)

Workflow rules said outside game work, most now in `~/AGENTS.md`. Game-specific preferences are in [preferences.md](preferences.md).

- Oct 26, homepage: "Do you have frontend design skill? Use that. No gradients." / "Multiple columns, text below icon.  Default dark mode."
- Oct 26: "always commit" (already covered by AGENTS.md; the agent was told to "check agents.md" instead of saving a memory).
- Oct 26: "each personal project may have its own todo. tracked. updated. maybe in notion tho, in its own page, but lets default to a todo per personal project." and the "BIG WARNING" that the design system ("rex design system" / "rexchain") is unspecced and "does not look like how you think it will".
- Oct 26 (X55, phase 0): "you are allowed to push, force push,also restart services." / "if you have more questions ask one at a time." / checks should run async after edits so changes show quickly.
- Oct 26 (X57): "i would also like you to define what defer means" (now: deferred = one line under Later; "don't fix" = not recorded).
- Oct 30 (X137, phase 3): "r means recommended. remember that." "in agents."
- Nov 9: "Don't mention commit s, type checks, unit tests, specific files except when specifically asked." then "Yes but they can be mentioned when relevant".
- Nov 9: "Could you add a small cautionary tale to agents? Considering that this pkill command killed the tmux? Also, be careful with rm commands. Whenever they are used you need to be extra sure what you are using it on or what it matches."
- Nov 9: "Who told you to approve external services?" (no approval needed for services like Telegram; only Notion changes need approval).
- Nov 9: "Agents instructions need to be short. Show them to me so I can approve, In chat." and the notification headline rule: "Mention that the first paragraph should be extremely compact, and it's length, messing with 30 characters of the most important parts, do not use filler words." / "Last sentence: this text is shown on turn complete notifications." / "Remove grammar rule from agents" / "Mention that the content after those 200 characters does not have these limitations."
- Nov 9: CLIs following clig.dev with a runtime parsing library, tested with dependency injection; edit-check hook skips subagents' edits.
