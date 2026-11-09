# Unblock Me TODO

## Later

In approximate priority order, highest first; the middle ones are not ordered among themselves.

- In play, a goal the Referee rejects is asked for again once at another effort level (rejected again, none found); the spec asks the maker again with the next seed; waits on a maker that takes a seed.
- The Gate's time is measured on the VM, the spec's is on a mid phone; waits on timing the maker on a phone.
- The Reference is shallow (breadth first, about 5 moves at most), so it loses wherever a longer goal wins (ramp aims over 6, none); a deeper plain search; waits on the Tuner runs showing whether the records need it.
- Tuner runs: effort 0 is at quality worst 5% 0.3 to 0.4 (Gate 0.8; it misses goals only effort 2's wider search finds: aim off by one, track blocks, far reach), and effort 1 and 2 are untuned; the Bench's cases have no walls while the game now starts at 4%; waits on cases with walls.
- Medals on long goals: the measure stops at its board budget and the proof's length stands as the fewest, so a player who finds a shorter way wins a medal the game should not give (most medals in play, test/experiments/medals.ts); a deeper search, or shorter proofs; waits on you picking it.
- Island squares that teach tap-push and a half-way drag (a tap-push can't solve it; none turned up in a 5x5 search, a tap stops the red block on its target), and squares with several goals that are rated (the card scores only the last goal); subject a and b never learnt one or the other; waits on you playing the teaching squares.
- Goals with real extra moves in the world (reports/extra-gen.html: rooms with them, made ahead or by annealing in about 1 s, opened up into the world and still exact; the open world itself hardly holds any; reports/trial-features.html: of the numbers measured on the trials, extra moves track the verdicts best): a sealed patch overriding the world where a goal is placed, rooms from a shipped library, the Judge taking the patch's proved fewest; waits on you picking it.
- Taps that move a block when the player meant to pan (subject b): fast swipes as pans, or similar; the log now has the data; waits on you picking it.
- Playing far zoomed out (subject a, play data: phones at scale 0.2-0.6): cap the zoom, disable moves far out, or show it; waits on you picking it.
- Stars: many 1-star results (a zen mode, stars shown only after a while, or hidden at 1 star); waits on a brainstorm.
- "Why is it green?": rethink a moved block's colour (or tint every block slightly differently); waits on you picking it.
- Log each goal's proof and measured difficulty, and page hides; waits on you picking it.
- Undo a reached goal: rewind to where its moves started counting and replay it for a better score; waits on you picking it.
- Undo during a goal (or undoing the goal) loses the medal (shown faded) and is stored with the goal; waits on you picking it.
- Progress is lost when moving between browsers (Telegram's in-app one, phone, computer: separate storage); intended fix: on entry redirect to a URL with a temporary user id whose progress lives on the server, so the same link in another browser continues it, carried until a later login; waits on the server (and login).
- The multiplayer server, the home and offline islands (reports/one-engine.html); waits on the features settling.
- Group picture puzzles in Telegram (your idea): a picture made of 2x1 blocks, scrambled by legal moves, solved together by a group, everyone seeing each other; waits on the multiplayer server and a Telegram mini app.
- A block exactly on the goal rarer early on (subject b thought it impossible); mostly superseded by the teaching squares; waits on them.
- Hovering a reached goal highlights the blocks its solution needed, and differently those moved without need; waits on you picking it.
- Special goals styled as a flame or a glint that unlock those souls (src/main.ts SOUL_UNLOCK: for now they unlock after 7 world goals); waits on deciding how special goals look and are placed.
- Daily board: the same seed for everyone, ranked by moves, a Wordle-style share; waits on you picking it.
- Loose goals (your design): a goal on a cell that any block of the same orientation and lane satisfies, not a locked red block; the block that last finished it keeps a gold inner border or glow, which moves to whichever block satisfies it next; several loose goals can be linked, finished only when all are covered at once; a prerequisite for shapes (a shape is a set of cells that interchangeable blocks must fill together); waits on you picking it.

## User testing

Notes from play tests (not AI generated): issues, observations and ideas, many without a clear solution yet. **Done** marks the fixed ones.

### Subject a
- Needs a simple tutorial level that teaches how the game works without the huge map. **Started**: the island before the generated world: 10 walled squares growing from 4x4 to 6x6 (4 to 13 fewest moves, exact for all of a square's goals together), each won by its red block out into its bay; from level 7 every square also has goals inside (a block on the target, a reached block in the next goal's way); the last starts inside with its exit shut, which opens for the way out to the world; stars hidden on the first 3.
- **Done**: tapping the gradient (way cue) did something; disabled.
- **Done**: fullscreen didn't work in Telegram's browser.
- **Done**: Telegram's browser slid left and up, making most things hard.
- **Done**: a red block that had moved away from its goal ran past it instead of stopping on it.
- Played very zoomed out: blocks hard to see, hunched over the phone, easy misclicks. Ideas: limit max zoom out, or keep it but disable dragging/pushing blocks there, or show that you are too far out. Knows how to zoom but chooses to stay out.
- Progress resets when going from Telegram's browser to the real browser (also seen going computer to phone).
- First level: didn't know the red block should go to the red goal; moved lots of blocks out of the way before noticing the goal.
- Mostly used push. Idea: early puzzles that need a half-way move (forcing drag), then in-game guidance that a tap pushes, maybe an objective like "push 10 blocks" if they haven't pushed yet.
- Observation: "after a while the red block goes further and further away from the starting area, and the other goals".
- Start with shorter levels, along a difficulty curve.
- Got many 1-star results. Ideas: a zen mode without stars, show stars only after a while, or hide them at 1 star; needs a brainstorm, or keep as is.
- After the first goal was unsure about moving the yellow (reached) block off its goal, thinking it had to stay to progress. Idea: an early level that moves the yellow block off its goal while finishing a red goal. Intuitively knew a yellow block can move, so it may not need teaching, just using in an early handcrafted level.
- Seemed to have fun and feel mastery ("mestringsfølelse").
- Afterwards: best was learning new mechanics; hardest was getting an overview ("Vanskeligst var å se helheten"); worst was the Telegram problems.

### Subject b
- First level too difficult and way too long; after about 5 levels got the hang of it and the default difficulty felt right.
- First goal had a blue block exactly on it; didn't know it could be moved off and said "completing is impossible" (noticed after being nudged 3 times). Partly remedied by fewer blocks between the red block and the goal; maybe make a block exactly on the goal rarer.
- Sometimes tapped a block (moving it) when trying to pan; frustrating. Ideas: treat a fast swipe as a pan, or a swipe after many taps as a pan; careful, it may make block drags turn into pans.
- Never learnt tap to push; dragged all the time.
- **Done**: more dopamine on finish (stars from the sides of the screen).
- First level in Telegram's browser had no red block (maybe state left from earlier tests); then in Safari (also used for earlier tests) the first level had several blocks on the same track plus one on the goal. Question: reset on every change to world or block generation, on every update, or keep?
- First question after moving a block: "why is it green?". Maybe remove the colour change on move; experiment: tint every block slightly differently instead.

### Own observations
- **Done**: possibly the same starting seed on several devices. Checked: a new random seed on first visit and every reset, all 21 uploaded seeds differ; kept as is.

### Play data (uploads up to 2026-11-03)
- Phone newcomers often quit on the first goal: 4 of 8 phones that moved a block never reached one (12-102 moves, 20 s-4 min). First goals needed 25-50 fewest moves before the shorter-first-goal change, still 13-17 after; later goals need 4-15, so the curve starts at its hardest.
- Newcomers who finished used about 2-2.6x the fewest moves (mostly 1 star); experienced players about 1.1x at about 25 s a goal.
- Phone players zoom far out (camera scale 0.2-0.6), matching subject a.
- Undo is almost never used (15 undos in about 7000 moves).
- **Done**: the log now says whether a move was a drag or a tap-push (with press time, time since the last pan and zoom) and logs pans right after a tap's push, to measure push learning and misclicks.

## AI generated ideas

These have been suggested by AI (Claude, in conversation) and are not necessarily high value or approved. Tags: **Recommended** (AI's pick), **Suggested** (an option), **Not chosen** (considered, turned down), **Done**.

### Finish, animation and game feel
- **Done**: landing hit, star bursts, medal blast, confetti, word, gather arcs, shine, stars in from the edges, streaks, fireworks, zoom punch, soul to the next red block with the camera following, slow motion and hit-stop, grid shock waves with hopping blocks, orbiting stars, +1s, giant rays, star rain, letterbox and speed lines, lightning, giant medal, glitch, stamp, dance party, emoji.
- **Recommended**: scale the finish with the result (full show for medals and perfect solves, short for ordinary goals); a ~10 s finish every goal will tire. (**Done**: a tap skips it and the soul.)
- **Not chosen**: full-screen vignette in the slow motion (removed: too costly to draw).
- **Suggested**: haptics (navigator.vibrate, Android).
- **Recommended**: Tweakpane (or lil-gui) in the inspector to tune timings, counts, sizes, colours and volumes live.
- **Suggested**: GSAP timelines (labels, staggers, eases, GSDevTools scrubbing) if the finish gets retimed often; seekable directly, unlike Phaser.

### Sound
- **Done**: synthesized Web Audio sounds for every part of the finish.
- **Recommended**: recorded CC0 sounds (e.g. Kenney packs) through plain Web Audio, keeping synthesized ones where they work (riser, glitch).
- **Suggested**: Howler.js (sprites, volume/mute, iOS unlock) for recorded sounds; Tone.js for richer synthesis, music and beat-synced effects.

### Rendering and performance
- **Done**: perf harness (test/experiments/finish-perf.mjs, ?perf layer timing), sprites for text/emoji, batched particles, cheap full-screen layers, 2x pixel cap, adaptive resolution then detail (remembered per device), font warm-up, incremental inspector replay.
- **Recommended**: stay on Canvas 2D with the adaptive quality for now.
- **Suggested**: Pixi (WebGL) for the finish effects as a layer on top (real bloom, glow, shockwave filters, many particles), or for all drawing.
- **Not chosen**: Phaser (wants to own loop, input, camera and scenes; scrubbing is reset-and-step; particles and shake use unseeded Math.random; UI is in the world, so its scenes/menus don't help).
- **Not chosen**: SwiftShader GPU emulation for perf tests (seconds-long stalls; unusable).
- **Suggested**: draw in a worker with OffscreenCanvas so taps stay responsive; goal search in WebAssembly (Rust/Zig) for faster, harder goals.

### UI
- **Not chosen**: HTML UI libraries (Preact, Lit) and separate menu screens: the UI lives in the world.

### Code, types and testing
- **Recommended**: a shared game package (rules, layout, goal checking) with no framework imports, integer-only so every engine agrees (e.g. replace Math.hypot in goal-fast.ts).
- **Recommended**: Valibot or Zod at data boundaries (localStorage, worker messages, play data, ?board links).
- **Suggested**: Comlink for typed goal-worker calls.
- **Suggested**: visual snapshot tests of the finish (Playwright toHaveScreenshot).
- **Suggested**: Observable Plot or uPlot for reports.
- **Recommended**: deterministic simulation testing (fast-check model-based, with shrinking): the local-only game as reference vs client + server + cache + outbox on a seeded simulated network and virtual clock; one player must match exactly (also with the cache off, once settled); players who never meet each match their reference; players who meet: convergence, server state = replay of its log, every move confirmed or rolled back, no illegal move, no lost offline rewards; merges keep moves valid; soak runs; occasional real WebSocket and two-browser Playwright runs.

### Gameplay and progression
- **Recommended**: daily board (same seed for everyone, ranked by moves, Wordle-style share, Telegram).
- **Suggested**: difficulty curve from play data; streaks or combos across goals.
- **Recommended**: a short handcrafted first run (about 3-5 goals of 3-10 fewest moves, one needing a half-way drag, one with a block on the goal, one moving a yellow block off its goal) before the generated world, with the fewest moves then ramping up over the next goals.
- **Done**: log the input kind of each move (drag or tap-push) and taps that moved a block during a pan attempt, to measure push learning and misclicks.
- **Suggested**: no stars shown on the first goals; stars fade in once the player beats about 1.5x fewest.
- **Suggested**: gold blocks as a collection, achievements, unlockable block skins and finish styles.

### Multiplayer and MMO
- **Recommended** (your idea): sync inputs only; client and server run the same shared logic, the server replays moves; the seeded layout means no blocks are ever sent, only moves, received per area in view.
- **Recommended**: own Bun WebSocket server (pub/sub topic per area) with SQLite (move log + snapshots, area versions for catching up); one process until it needs splitting by area.
- **Suggested**: SpacetimeDB (transactions, filtered subscriptions, TS modules; but BSL 1.1 until 2031, reducers run one at a time, no offline in the TS SDK, its in-browser test datastore is an 8.4 MB test-only API).
- **Suggested**: Zero (Rocicorp, optimistic mutations built in, Postgres); Cloudflare Durable Objects + PartyServer (one object per area, global).
- **Suggested**: Nakama later, for accounts and leaderboards.
- **Not chosen**: Colyseus (built for separate rooms); Multisynq/Croquet (no server authority, own moves wait a round trip).
- **Not chosen**: soft ownership of blocks near a player's goal.
- **Suggested** (your idea): report chaotic players; a trust score moves them to their own area or a separate layer; undo their moves where nothing builds on them; tap a block to see who moved it.
- **Suggested**: show other players' active goals faintly.

### Offline, sync and sign-in
- **Recommended**: moves as a log with ids in an outbox; applied locally at once; on reconnect replayed (rebased) by the server, which must land each the same; mismatches rolled back and animated to the server's state; conflicts in one transaction where the backend allows.
- **Recommended**: service worker so the game loads and plays with no connection or server.
- **Recommended**: goals generated on the client, verified by the server (re-run later when idle).
- **Recommended** (your design): start on a server home island, cut off; after some progress and only while online, stamp it next to the continent (an area of any shape overriding generation: the touched blocks plus a margin); offline after that, finish the current goal (rewards kept, world rolled back where it conflicts) and continue on a separate offline island (other seed, never merged: a whole endless world, only on the device; at the switch the camera pans there as the blocks turn offline); back online the next goal returns; switch automatically, with an in-world arrow as status or a manual choice.
- **Recommended**: anonymous device key pair (WebCrypto, non-extractable, IndexedDB), signed and numbered move batches (works offline); link devices later with a passkey, Telegram login or a QR transfer.
