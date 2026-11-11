# The user's preferences and decisions about the game

Distilled from the phase files; each line gives the date (2026) and the message number (X…) in the linked phase file, where the exact words are. Quotes are verbatim. Later lines override earlier ones where they conflict. P0…P10 = phase-00 … phase-10 files:
[P0](phase-00-prehistory.md) [P1](phase-01-rebuild-canvas.md) [P2](phase-02-goals-and-feel.md) [P3](phase-03-goal-search-difficulty-stars.md) [P4](phase-04-score-track.md) [P5](phase-05-public-telegram-colors.md) [P6](phase-06-finish-juice-and-tech-talk.md) [P7](phase-07-user-tests-island-ramp-sound.md) [P8](phase-08-souls-and-polish.md) [P9](phase-09-goal-spec-and-one-engine.md) [P10](phase-10-walls-extra-moves-trials.md)

## The actual aim

- The goal is a good game; specifically "a nice algorithm which creates good infinite levels, and do it performantly". Architecture, unit tests, features and getting players are not the main goal. The user doesn't fully know the goal yet and wants it worked out from his messages. (Nov 11, X436, P10)
- He is close to the only player (a few friends in user tests). Keep controlled tests with him (few levels, his preferences) separate from data gathered in the game; when gathering data, build test levels into the game and analyse logged play instead of chat round-trips. (Nov 11, X436–X437, P10)
- Things he must decide or understand go into one simple document, walked through one item at a time; explain only what truly matters, at his level. Dense AI reports (e.g. play analysis) "do not go in". (Nov 11, X438, P10)
- Specs, reports and features (goal spec, one-engine, stars, judge, difficulty measures) may be changed or removed; AI-written analyses rest on few data points and are not hard rules. (Nov 11, X436, P10)

## What makes a good level (his beliefs, evolving)

- A good goal is a difficult one: "solvable in a lot of moves", or with many branches; then the goal need not be far away. (Oct 30, X121, P3)
- Balance distance and difficulty, "dont just cap it". No arbitrary caps; limit work with algorithm ticks. (Oct 30, X131, X152, P3)
- Short goals are fine "as long as they are difficult and require many moves". (Nov 8, X364, P9)
- "Choices" must match how a human decides: follow the chain of blockers from the red block, depth first, stop at cycles and at the first way that works; the old count was "way too high". (Nov 7–8, X350, X364, P9)
- Dislikes several blocks on the red block's own track between it and the goal (having to push blocks ahead and past the goal). (Oct 30, X206; Nov 1, X229, P5)
- Goals should not overlap earlier goals or share their tracks. (Oct 30, X111, X118, P2)
- Medals came too easily from a too-narrow fewest-moves search; fix the search, wants fewer medals. Search only the blocks that block red and those blocking them, wherever they are. (Nov 8, X365, X367, P9)
- Gut feeling: the wanted quality is like cyclomatic complexity; proxy = blocks that must move twice or more; walls should make it more common. (Nov 9, X400, P10)
- "Goals with a block moved 2+ times is the closest we have gotten"; a block moved 3 times is better than twice; collapse to one number (now "extra moves" = Σ(moves per block − 1)); red's own moves count. (Nov 9, X405, X422, P10)
- Liked 12A: "i was not able to use my learned algorithm ... i lost track of which blocks i had moved or not ... these are signs of good levels". A followable dependency chain is easy (16A). (Nov 9, X421, P10)
- Closed-looking rooms read as simple: a visible ring of stuck edge blocks is bad (G trials). Best boards: unsure which blocks belong to the puzzle vs the world, world blocks interfering, red free to leave (H3A/H3B, J1B, K2A "very good level"). (Nov 9–11, X424–X427, X431, X433, X435, P10)
- Idea: insert world blocks into a finished room so they must be moved out first. Ideas for generation: open up rooms (jagged borders, no outer walls), or build boards block by block to create cycles; fall back to random placement when too slow. (Nov 9–10, X423, X433, P10)
- Use his move counts and time per trial as a difficulty signal, not only verdicts. (Nov 10, X431, P10)
- The state space matters: whether players can get stuck in a wrong part of it, not just the shortest solution; use reduction techniques when too slow. (Nov 11, X436, P10)

## Difficulty curve and tutorial

- Teach by level design, no text: a tutorial island of walled square rooms with an Unblock-Me-style exit bay, rooms in a strip, bay of the last room opens to the world. (Nov 4–5, X264, X275, X283, P7)
- Ramp slowly: island levels 6→13 fewest moves; first teaching rooms small (4×4, 5×5); multi-goal rooms after bay-only ones, then all later rooms multi-goal; world goals ramp over ~30 goals toward today's difficulty, start at 4. (Nov 4–5, X268–X269, X290–X292, X299, X301, P7)
- Consecutive levels should not have similar solutions. (Nov 4, X271, P7)
- From user tests: first level was too long/hard; newcomers got many 1-stars; players zoom far out; some never learned tap-to-push; Telegram's in-app browser was the worst part; a moved block turning green confused one tester. (Nov 4, X261, P7)

## Interaction and feel

- No text in the UI; keep it simple. UI lives inside the world as blocks; no HTML UI library, no menu screens. (Oct 29, X64, P1; Nov 2, X254, P6)
- Public UI almost empty: fullscreen only where supported; reset and everything else in a hidden debug section unlocked by a deliberate sequence. Undo removed (almost never used). (Oct 31 – Nov 1, X216–X219, P5; Nov 4, X270, P7)
- Tap pushes a block to the end of its lane; the red block goes toward its goal and stops on it; a reached block cycles off/past/back onto its goal. A drag ending one cell on a free goal snaps in. Dragging a block stuck at both ends pans. (Oct 30 – Nov 6, X85, X102, X115, X230, X270, X319)
- Animation must land before the reward shows; camera shows the finish (move camera, then push); smooth ease-in-out camera; snappy edge arrows without overshoot or zoom. (Oct 30, X94, P2; X204, P5; Nov 6, X335–X340, P8)
- Finish: should feel like gaining stars, not losing them ("Stars earned at the end"); medal hidden unless won, medal last; very flashy finish was asked for ("Go crazy", "MORE*", "MORE!"), but not at the cost of sharpness. Finishes skippable by a tap. (Oct 30, X173–X179, P4; Nov 1–3, X236–X243, X260, P6; Nov 6, X315–X316, P8)
- Sounds small and clean; removed the per-cell tick ("like someone is eating"); bump and stuck sounds wanted; zoom-limit knock. (Nov 5, X303–X309, P7)

## Visual taste (selected decisions)

- Rejected: separators per move on the score track ("ugly as fuck"), stripes, a red like "stained period blood", rings that read as borders, borders when a block sits on its goal, yellow/bordered particles, white soul centre, gold-star/ghost/ember souls, "goofy" and "train" sounds. (P4, P5, P7, P8)
- Chosen: goal in play = lighter shade of the red block's hue, reached goals gold; blue rosette medal and drawn yellow star with orange border; comet soul, then comet/flame/glint at random after 7 world goals. (Nov 1, X228, P5; Oct 30, X161, P4; Nov 6, X327–X328, P8)

## Rejected or parked ideas

- Locking the next red block (Nov 5, X290); treating fast swipes as pans (X290); a separate "zen" mode only floated (X261); Telegram detection and hints (removed once swipes worked, X216); Phaser and HTML UI libraries (X254); fuel-gauge finish (X179); ease picker and tap-mode toggle (kept only the chosen setting, X95).
- Deferred: cross-browser progress via a temporary user id in the URL, waiting on a server (X290); home-island stamping and offline island (X256, X356–X358; "I need to see this logic when it is created"); loose goals as a prerequisite for "shapes" (X404); special goals that unlock souls (X328); Telegram group picture puzzles (X258).

## Engineering and research process

- Generation runs in a worker; next goal ready before it's needed. (Oct 30, X113, X121)
- Separate the verifier (fixed, white box, cheap) from the algorithm (free, deterministic given a seed, fast); a Fable subagent can be the optimiser against a benchmark, no elaborate system. Expensive checks only in development. (Nov 6, X347–X348, P9)
- Request = world seed + stored moves; the maker may read any cell. (Nov 7, X350, P9)
- End-state architecture: one engine (Rust→WASM offline, SpacetimeDB online, server authority); not now. During development, duplicate engines/makers are fine. (Nov 8, X354, X363, P9)
- Don't prescribe the algorithm to research agents; use a high-intelligence model. (Oct 30, X121, P3)
- Run experiments small first, under memory caps, then scale; approximate tuning only while features (walls) still change. (Oct 30, X88; Nov 4, X265; Nov 9, X375, X401)
- Log play automatically, with the commit hash; analyse later. (Oct 30, X124, X128, X146; Nov 9, X422)
- Reports: big numbers, graphs, conclusions, little text; labelled axes; real play data rather than made-up examples; math rendered with named terms. (Oct 30, X151, X176; Nov 6, X346; Nov 9, X404)
- Subagents: one at a time (serial), no nested subagents, they verify their own work (tests, Playwright against the real game), and the main agent reviews the whole diff and what was not done. (Nov 8, X363–X366, P9)
- When asked to suggest, suggest; don't start. Manual tests one step at a time. (Oct 29–30, X70, X82, P1)
- AI-suggested ideas live in TODO under "AI generated ideas", explicitly not approved. (Nov 2, X257, P6)
