# Roadmap: a good level generator for the endless board

Written 2026-11-11 by the research agent, for the agents that continue the work. It says what the
goal is, what the evidence says so far, how data is collected and analysed, what to try next and
how to judge it, and what to avoid. Everything in reports/ and the specs may still change; this
file is the current plan, not a contract. Keep it updated: when an experiment lands, add its
result under "Evidence" and move its item out of "Next experiments".

Companion files: [for-the-user.md](for-the-user.md) (what we need from the user),
[inconsistencies.md](inconsistencies.md) (what is wrong where), [reports.md](reports.md),
[papers.md](papers.md), `../lab/README.md` (the analysis scripts).

## 1. The goal, and the researchable question

The user wants a good game, and concretely a fast algorithm that makes good levels on the
endless board. From their messages (research/context, VM only) the picture of a good level is
consistent over three weeks:

- It takes thinking, not pushing: the player cannot read the answer off the board, loses track
  of what they moved, has to move blocks away and bring them back (their "cycle complexity").
- It is one with the world: the player cannot tell which blocks belong to the puzzle and which
  to the surroundings; world blocks interfere; red may be free to leave into the world. A visible
  ring of stuck blocks reads as "small puzzle, solved by routine".
- No tedium: no pushing several blocks along red's own track, no long detours, no very long
  first goal; a slow ramp for newcomers.
- Fast enough for a phone, no hard caps: budgets in work, fall back to simpler goals.

So the researchable question is:

> **Which cheaply computable property of a goal (board + target) predicts that this player
> finds it hard-and-good, beyond the fewest moves, and how do we generate goals with that
> property inside the endless world within a phone's budget?**

with two sub-questions the data can answer as it grows:

1. **Measure:** of the candidate numbers (extra moves, mixedness, state-space numbers, simulated
   players, "blocks that look relevant"), which tracks the player's felt difficulty (verdicts)
   and their logged play (moves over fewest, seconds, take-backs, blocks moved that the proof
   never moves)?
2. **Generator:** which way of making levels (today's maker on the open world, rooms from a
   library opened into the world, rooms with world blocks pulled in, constructive placement)
   yields goals that score high on that number at a phone's budget, and do players agree?

The literature's baseline (Jarušek & Pelánek 2011, Schaa 2026): for Rush Hour, optimal length
alone predicts human solving time well (Spearman about 0.9). Anything we claim must beat
"fewest moves" on the same boards. On our 20 trial boards the fewest moves were held equal
within pairs on purpose, so there the baseline is flat and the question is what explains the
rest.

## 2. Evidence so far (one player, few boards: hints, not findings)

### 2.1 The verdicts and the play logs agree

`lab/plays.ts` on the 18 trial boards with a logged reach (K and the user's own device mostly):

| play number | ρ with the verdict order | blind pairs right/wrong |
|---|---|---|
| moves played / fewest | 0.46 | 6/2 |
| seconds from goal to reach | 0.51 | 5/3 |
| take-backs (a block moved straight back) | 0.44 | 5/3 |
| blocks moved that the proof never moves | 0.35 | 4/3 |
| extra moves (the board measure, for comparison) | 0.30 | 5/4 |

So the logged play is a usable stand-in for asking. K2A, called very hard and very good, took 85
moves for 12 fewest, 200 s, 33 take-backs, 9 blocks moved that no shortest solution needs. This
is what makes the playlist approach (section 3) work without chat round-trips.

### 2.2 Board numbers tested so far

Measured on the trial boards (reports trial-features, trial-mixed, and `lab/statespace.ts`):

- **Extra moves** Σ(times a block moves − 1) over a shortest solution: ρ ≈ 0.3 over 20 boards,
  5 pairs right, 4 wrong. Real on confined rooms; on the open world the maker's proofs show
  detours instead (extra-maker). Still the best *board* number we have for "has to come back".
- **Mixedness** of the come-backs (crossing trips, red moving in between): no better (ρ 0.28).
- **Judge's decisions, fewest, state counts, branching:** do not track.
- **State-space numbers** (`lab/statespace.ts`, full graph of the blocks that matter, exact on
  the 10 framed boards 8A–16B, G1–G2; the open rooms with the world frozen and a bound):
  - *Simulated fallible player* (greedy on a blocker bound with 25 % random moves, no straight
    take-backs): mean moves and give-up rate ρ ≈ 0.4 with the verdicts on the framed boards,
    6/3 pairs. About as good as extra moves, and it is a different kind of number (it
    measures getting lost, not the solution's shape). Worth keeping as a candidate.
  - *Misleading moves* (a move that removes a blocker from red's path yet does not shorten the
    way), *greedy local minima*, *bits to find the way* (log2 of choices along the easiest
    shortest solution): no clear signal on 10 boards; several ran the wrong way.
  - Reversibility: slides are reversible, so nobody is ever stuck for good; "stuck" means far
    from the goal in moves while the board gives no sign. The user's paths show this: on the
    boards they called hard, d* rose by up to 9 above the start (userMaxOff), and the last 4–5
    moves are always a straight downhill run. The work is in the setup, not the finish.
- **Room graphs of the open boards** (`ROOM=1 SLACK=4`, 22 boards, the room's blocks moving,
  the world frozen, states on solutions of at most fewest + 4): the numbers that track both
  the verdicts and the play logs are about *room to wander*: the share of states farther from
  the goal than the start (farShare: ρ 0.37 with verdicts, 7/3 pairs; 0.56 with seconds, 0.66
  with moves/fewest), the farthest state (maxDist: 0.35; 0.49; 0.56), greedy local minima
  (0.34; 0.46; 0.41), and the erring-but-informed player's mean moves (softMean: 0.47; 0.45;
  −0.18). K1A, K1B, K2A and J1B have farShare 0.4–0.8; the easy H2A, H3A, G1B and 12B under
  0.05. First board-side candidates that beat extra moves on the same boards; n is small.
- **Blocks that look relevant** (the user's newest hunch): the first board-side version (free
  blocks whose reach crosses a cell some shortest solution sweeps; "decoys" = those no shortest
  solution moves) **does not track anything** (ρ 0.04 with verdicts, −0.09 with seconds; H2A and
  H2B, both easy, have as many decoys as K2A). The play log's "blocks moved that the proof never
  moves" (K2A 9, G2B 5, K1B 5; easy boards 0–1) still does. So what looks relevant is not a
  count of lanes crossing the solution; the next version should weight by distance from red's
  path and by whether the block is in the way of a *likely* plan (Ho 2022), or be dropped.

### 2.3 The state space explodes on open boards (and what that means)

On every open-room trial (H, J, K, M) 35–56 blocks matter by lane overlap. A breadth-first
search bounded to solutions of at most fewest + 3 moves still passes 2 million states before
reaching the goal, and finding d* for a state the user visited mid-play fails the same way. The
exact bounds of open-core.ts (room blocks move; world blocks frozen for the upper bound, "soft"
and passable once for the lower bound) are the only thing that has worked: 30–300 k states.
Conclusions:

- Any phone-side measure must be built on a **reduction**: room + soft world (open-core), not
  "all blocks whose lanes overlap". This is the user's "compress the measure" question, and the
  answer so far is: decouple the world as single-move tolls, prove exactness by agreement of two
  bounds. Strong stubborn sets and decoupled search (papers.md) are the next tools if the room
  itself gets too big; they need a center/leaf split, which the room/world split already is.
- Fernau 2003's result (finitely many stopping positions per block) is what makes a bounded
  window sound on the endless board; the "sealed/unsealed" test in extra-gen-core is its
  practical form.

### 2.4 What newcomers do (play-data, 2026-10-30 to 11-03, 8 phones, 2 friends)

First goals were far too long (25–50 fewest before the shorter-first-goal change); newcomers who
finished used 2–2.6× the fewest; half the phones that moved a block never reached a goal. The
island and the ramp came from this. Undo is almost never used. Nothing here is about level
quality beyond "start short".

## 3. The data pipeline

Collection is automatic and in the game; analysis runs later on the VM. Keep them apart.

### 3.1 What the game logs (src/main.ts `LogEvent`)

- Per device (`play-data/device-<id>.json`, replaced on each upload): `load`, `goal` (seed, walls,
  target, fewest, **the proof itself** since ce82324, the moved blocks, the Judge's terms),
  `move` (block, from, to, tap or drag, press ms, time since the last pan, zoom), `reached`
  (moves used), `reset`, `density`, `walls`, **`hide`/`show`** (since ce82324; time away is not
  thinking), `rejected` (a bug), `error`.
- Per trial page (`play-data/trial-<label>-<device>-<session>.json`): the same events from an
  empty log, one file per page load, sent every 5 events, on the reach and on page hide.
- The device id is a random UUID in localStorage. A trial page reads it but stores nothing.

### 3.2 What to add (small, in priority order)

1. **A returning-player id across browsers.** Fingerprinting is not worth it (fragile, and it is
   the kind of tracking the user has not asked for). Keep the random device id, and add an
   opt-in link: a `?u=<id>` the player can open in another browser, which adopts that id (TODO
   has this as the "temporary user id" item). With a server later, sign-in replaces it. Privacy:
   nothing but a random id, user agent and screen size is sent; say so on the reports page.
2. **Log the generator kind and its numbers with each goal** (`how: "maker" | "room" | ...`,
   `extra`, `mixed`, and whichever measure is being tested), so the analysis never has to
   regenerate. The playlist does this through `lab/out/rooms.json` by label.
3. **A per-goal "gave up" signal:** the next `goal` event without a `reached` for the previous
   one already means that; also log `reset` reasons. Nothing to add yet.
4. When a server exists: uploads keyed by player id, not device; the same log format.

### 3.3 How to analyse it later (`lab/`)

- `bun lab/plays.ts` turns every trial play into one row: moves/fewest, seconds (page-hidden
  time removed), think time before the first move, take-backs, blocks moved, blocks moved that
  the proof never moves, per device and session. Extend it to world goals from the device logs
  (the `goal` event now carries the proof) when the generator kinds are logged.
- `bun lab/statespace.ts` (ROOM=1 SLACK=4 for the open boards) measures a board's state space
  and the user's path through it (d* after every move; regret; how far off they went).
- Ranking against verdicts is in `lab/verdicts.ts` (ORDER_ALL, PAIRS). When new verdicts come,
  add them there, paraphrased, never quoted.
- **Per-player skill:** with one main player, fit nothing; report each player's median of
  moves/fewest and seconds/fewest over their last 10 goals, and compare a board's play to that
  player's own median (a board is "hard for them" when it is in their top quarter). That ratio is
  the skill estimate, and it scales: with many players it becomes a random-effects model
  (board difficulty + player skill; Kristensen 2021's negative binomial fits attempts). Use the
  skill to pick the ramp aim per player (today's ramp is by goal count).
- Small samples: use ranks and pair counts, not p-values; report n every time; never conclude
  from fewer than about 8 boards per side.

## 4. Current best measures and generators, and what to build next

### 4.1 Measure (use now)

A goal's **score** = fewest moves (the baseline), then **extra moves** on a shortest solution
proved exact (open-core's two bounds agreeing), then **room to wander** (farShare) and the
**erring player's mean moves** on the bounded room graph as tie-breakers (2.2). All three are computable on a phone only for rooms made ahead
(the room graph is 30–300 k states; a phone does that in well under a second in WASM, several
seconds in JS). On the open world with today's maker, only the fewest moves is trustworthy.

### 4.2 Candidate board numbers (from 2.2, to confirm on the playlist)

1. **Room to wander** (farShare, maxDist on the bounded room graph): cheap once the room graph
   exists (it is the same search the exactness check runs). Confirm on the playlist: ρ ≥ 0.4
   with moves/fewest over 10+ reached boards keeps it; then make it a Judge wish for room goals.
2. **Erring informed player** (softMean): same graph, 200 rollouts; keep as a tie-breaker.
3. **Blocks that look relevant:** the lane-crossing count failed (2.2). Next version, only if
   someone has a better definition: weight by how a fallible plan would use the block, not by
   geometry alone; validate against `lab/plays.ts`'s offProof. Otherwise leave it.

### 4.3 Generators

- **In the game now:** `?trial=R1` plays twelve library rooms opened into the world in a row
  (src/trials-rooms.ts, numbers in lab/out/rooms.json), each logged on its own. This is the
  candidate-levels-in-normal-play channel. Make more playlists the same way (`bun
  lab/playlist.ts`), with the variable you want to test varied across boards (world margin, pulled
  world blocks, decoys), and compare the play rows by that variable.
- **Next in the world:** stamp library rooms into the endless world as patches (TODO's "goals
  with real extra moves in the world"): the island code (src/island.ts) already overrides
  generation in an area; a room patch is the same with a jagged edge and no walls. The goal
  maker takes the patch's proved goal instead of searching. Ship a library of a few hundred
  rooms (data/open-gen/rooms6-0.jsonl has 5,794 raw rooms; opening one takes 2–4 min on the
  VM, so open them ahead and ship JSON).
- **Then:** a generator that places decoys on purpose (blocks on cells no shortest solution
  uses, lanes crossing the solution's cells) and verifies the fewest and extra moves still hold
  (the open-pull.ts machinery), and the constructive "build toward a plan" idea (Dart & Nelson,
  AI notes §9) only if the library route runs dry.

### 4.4 Performance for a phone

- Rooms from a library: 100 % within 200 ms (extra-gen report). Opening on the device is the
  cost; do it ahead.
- The bounded BFS (`bound` in extra-gen-core's solve, `lab/graph.ts`) is the right primitive;
  port it to WASM when it is the bottleneck, not before.
- Keep the maker's budget in states, not milliseconds, so results are the same on every device.

## 5. Next experiments, with how to judge them

1. **Play the playlist** (`?trial=R1`): 12 boards, logged. Judge: `bun lab/plays.ts --label R`;
   compare moves/fewest and seconds against extra moves and against the room's "decoy" count
   (4.2) by rank. Needs about 10 reached boards from one player to say anything.
2. **Room to wander on the playlist** (4.2): run `ROOM=1 SLACK=4 bun lab/statespace.ts` with
   the R boards added (their rooms are in lab/out/rooms.json), rank farShare and softMean
   against the play rows. Keep if ρ ≥ 0.4 with moves/fewest.
3. **Simulated player calibration:** fit the greedy player's noise (25 %) and its heuristic to
   the user's logged paths (which move they took, given d* of each option; Olieslagers' model is
   the reference). Judge: held-out move prediction better than uniform over sensible moves.
4. **Second playlist with a varied world margin** (3 vs 5 cells of world round the room, same
   rooms): does more visible world make the same room feel harder (the user's integration
   wish)? Judge: paired play rows per room.
5. **Rooms stamped into the world** (4.3): first behind `?rooms=1`, logged with `how: "room"`.
   Judge: play ratio and seconds of room goals against maker goals at the same fewest, same
   player.
6. **Ramp by skill:** aim = the player's median-adjusted target. Judge: fewer first-goal
   abandonments on phones, stable moves/fewest over the first 30 goals.

## 6. Pitfalls

- One player's verdicts mix "harder" with "better"; the order in lab/verdicts.ts is an agent's
  reading of chat. Treat ρ below 0.45 at n = 20 as noise. Pairs are the honest unit.
- The maker's own proofs are not shortest solutions on the open world; never count extra moves
  on them (extra-maker). Only trust numbers proved by agreeing bounds.
- The walls report's numbers were inflated for the same reason.
- "All blocks whose lanes overlap" is not a usable state space on the open world (2.3). Build
  every measure on the room/world split.
- Slides are reversible: no dead ends. Do not look for "trap states"; look for distance and
  disguise.
- The early trials 8A–16B have no play logs (logging came after). The G and J1A verdicts came
  from a different device than most (the user's phone, probably); keep devices apart.
- Keep research/context out of git and do not quote the user in committed files.
- Memory on the VM is about 2 GB free; a 2 M-state graph with 20 blocks is about 500 MB. Run
  lab scripts one at a time, in the background, with a cap.
