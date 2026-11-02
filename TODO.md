# Unblock Me TODO

## Later

- Lock the next red block (darker, immovable until the current goal is reached), chosen among blocks the current solution doesn't touch and locked where it stands when the current goal is made, so it can't strand the current goal; waits on you picking it.
- Walls in generated boards (dead ends to plan around); waits on a difficulty measure to tune them against.
- Density × walls report graph; waits on walls in generated boards.
- Pins pointing the same way can overlap (red wins the tap); waits on seeing it bother you in play.
- Faster `Window.lower` (half the measure's time: array scans, allocations per call); waits on tournament levels 2-3 being too slow in play.
- Difficulty's branching counts slides, not blocks (choices a move now counts chain blocks, but the score doesn't); waits on playtesting whether the score tracks felt hardness.
- A* cap per density (95% finds the fewest moves): a background agent is tuning it; when it reports, review, test, push and update the report's "Being tuned" line.
- Remove the dead `RANGE`/`starsFor`/old `starsEarned` in difficulty.ts; waits on the cap agent finishing with that file.
- Log each goal's proof and measured difficulty, and page hides; widen the measure window (goal #37: 8 in the window, player did 6); waits on you picking it.
- Score track instead of stars (reports/score-track.html: one cell per move, gaps where a star or the medal is lost, ends at about 2x fewest); waits on your review of the design.
- Undo a reached goal: rewind to where its moves started counting and replay it for a better score; waits on the score track.
- Undo during a goal (or undoing the goal) loses the medal (shown faded) and is stored with the goal; waits on the score track.
- Hovering a reached goal highlights the blocks its solution needed, and differently those moved without need; waits on you picking it.
- Progress is lost when moving from Telegram’s in-app browser to the phone’s browser (separate storage); waits on the Telegram check’s reports, then maybe carry the save in the "Open in browser" link.
- A way to make goals hard without blocks on the red block's track (since the penalty, goals made ahead need about 11 fewest moves instead of 17, reports/blocks-on-track.html); waits on you picking it.

## AI generated ideas

These have been suggested by AI (Claude, in conversation) and are not necessarily high value or approved. Tags: **Recommended** (AI's pick), **Suggested** (an option), **Not chosen** (considered, turned down), **Done**.

### Finish, animation and game feel
- **Done**: landing hit, star bursts, medal blast, confetti, word, gather arcs, shine, stars in from the edges, streaks, fireworks, zoom punch, soul to the next red block with the camera following, slow motion and hit-stop, grid shock waves with hopping blocks, orbiting stars, +1s, giant rays, star rain, letterbox and speed lines, lightning, giant medal, glitch, stamp, dance party, emoji.
- **Recommended**: scale the finish with the result (full show for medals and perfect solves, short for ordinary goals) and let a tap skip or speed it up; a ~10 s finish every goal will tire.
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
- **Recommended** (your design): start on a server home island, cut off; after some progress and only while online, stamp it next to the continent (a rectangle overriding generation: bounding box of touched blocks plus a margin); offline after that, finish the current goal (rewards kept, world rolled back where it conflicts) and continue on a separate offline island (other seed, never merged); back online the next goal returns; switch automatically, with an in-world arrow as status or a manual choice.
- **Recommended**: anonymous device key pair (WebCrypto, non-extractable, IndexedDB), signed and numbered move batches (works offline); link devices later with a passkey, Telegram login or a QR transfer.
