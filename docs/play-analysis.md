# Play analysis: the difficulty measure and stars against real play

One device, one afternoon (30 Oct, 12:15–13:49 UTC): 48 goals shown, 42 reached, 5 abandoned,
1 open. Script: `test/experiments/play-analysis.ts` (regen → measure → report). This is very
little data from one player, and density and generator change together over the session, so
every correlation below is soft; read them as "consistent with", not "shows".

## What was done

- **Boards.** Each goal event's board is `randomLayout(seed, {tries})` plus its `moved`
  snapshot. All but one rebuild (goal 14, 12:18, sits next to the UI area, which grew at
  12:19; its red block is not there on today's layout).
- **The game's own proof and score.** The logged goal has only the proof's length, so each goal
  was made again with the request the game sent (near = previous target, or (0,0) after a
  reload; exclude/avoid = goals reached since the last reset) and each generator used that
  day. 46 of 48 came back identical (id, target, proof length), which also tells which
  generator made each: push search (goal-fast) up to 12:32, then the ranked search with α = 0,
  then α = 0.67 from about 13:30 (builds were deployed before their commits). The ranked
  search's difficulty is exactly what the game showed (it matches the three stored ones);
  push goals got `measure()` at 50k states, as the game did.
- **Fewest moves.** A* (copy of `shortest`, 1M states, about 1 GB) in the game's window. When it
  stops first, the fewest is a range: A*'s bound up to the shortest known solution (the game's
  proof and the player's own moves, shortened by local search, and the player's count).
  Exact for 25 of 42 reached goals; the 17 others are ranges like 14–19. The game, at 50k
  states, never knew M for a hard goal: it showed "at least 11–15" for all of them.
- **Moves used** are the game's own count (`reached.used`). The log cannot be trusted for this:
  **it drops the first move after every page load** (`logMoves` sets `logged` to the history's
  length on the first save, after that move is already in it), so 17 goals miss a move.
- **Time.** "Active" = time shown→reached with every gap over 60 s counted as 60 s (there are
  breaks of 17 and 37 minutes). "Think" = time to the first move, capped at 60 s. No undos were
  used at all.
- **Branching alternatives**, averaged over the boards along a shortest (or best known) path:
  slides (the game's b counts these, over all expanded boards), movable blocks, movable
  blocks in the red block's chain (blockers in its way plus blocks in their lanes), and, where M
  is exact, the "good" blocks/slides: those after which the rest still takes the fewest moves
  (bounded A* per child). "Trap" = Σ log2(options / good options) along the path.

## Per goal

| # | generator | tries | outcome | dist | fewest M | game M | game b | game score | worth | earned | used | active s | movable blocks | chain blocks | good blocks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | ? | 7 | reached | 12 | 2 | - | - | - | 0 | 0 | 2 | 3 | 3.0 | 1.5 | 1.0 |
| 1 | push | 7 | reached | 12 | 3 | 3 | 23.7 | 13.7 | 0 | 0 | 3 | 6 | 5.0 | 2.7 | 1.3 |
| 2 | push | 7 | reached | 12 | 4 | 4 | 20.9 | 17.5 | 0 | 0 | 5 | 16 | 5.0 | 3.0 | 1.5 |
| 3 | push | 7 | reached | 12 | 3 | 3 | 20.9 | 13.1 | 0 | 0 | 4 | 12 | 3.7 | 2.0 | 1.0 |
| 4 | push | 7 | reached | 12 | 4 | 4 | 22.2 | 17.9 | 0 | 0 | 7 | 12 | 4.5 | 3.2 | 1.5 |
| 5 | push | 7 | reached | 12 | 1 | 1 | 14.0 | 3.8 | 0 | 0 | 1 | 3 | 1.0 | 1.0 | 1.0 |
| 6 | push | 7 | reached | 12 | 4 | 4 | 26.3 | 18.9 | 0 | 0 | 4 | 7 | 4.8 | 3.0 | 1.2 |
| 7 | push | 7 | reached | 12 | 5 | 5 | 19.6 | 21.5 | 1 | 1 | 6 | 8 | 4.0 | 3.2 | 1.2 |
| 8 | push | 7 | reached | 12 | 5 | 5 | 28.3 | 24.1 | 1 | 1 | 9 | 13 | 7.4 | 4.8 | 2.0 |
| 9 | push | 7 | reached | 12 | 3 | 3 | 18.8 | 12.7 | 0 | 0 | 3 | 8 | 3.0 | 2.0 | 1.3 |
| 10 | push | 7 | reached | 12 | 4 | 4 | 27.1 | 19.0 | 0 | 0 | 4 | 8 | 4.8 | 3.5 | 1.0 |
| 11 | push | 7 | abandoned | 12 | 5 | 5 | 27.1 | 23.8 | 1 | - | - | 41 | 7.6 | 3.8 | 2.2 |
| 12 | push | 7 | reached | 12 | 2 | 2 | 18.0 | 8.3 | 0 | 0 | 2 | 13 | 5.5 | 1.5 | 1.0 |
| 13 | push | 7 | abandoned | 12 | 4 | 4 | 13.9 | 15.2 | 0 | - | - | 1 | 5.5 | 3.5 | 1.8 |
| 15 | push | 30 | reached | 11 | 12–13 | ≥11 | 33.1 | 55.5 | 4 | 3 | 14 | 58 | 20.2 | 7.8 | - |
| 16 | push | 30 | reached | 12 | 10–12 | ≥9 | 51.3 | 51.1 | 3 | 1 | 27 | 182 | 26.5 | 5.3 | - |
| 17 | push | 30 | reached | 12 | 11 | 11 | 29.3 | 53.6 | 3 | 1 | 23 | 55 | 18.1 | 9.2 | - |
| 18 | push | 30 | reached | 12 | 12–16 | ≥11 | 36.0 | 56.9 | 4 | 3 | 17 | 20 | 21.6 | 6.8 | - |
| 19 | push | 30 | reached | 12 | 12–18 | ≥11 | 46.3 | 60.9 | 4 | 2 | 25 | 53 | 24.7 | 8.4 | - |
| 20 | push | 30 | reached | 12 | 11 | 11 | 33.3 | 55.6 | 4 | 2 | 27 | 57 | 16.9 | 8.6 | 2.6 |
| 21 | push | 30 | abandoned | 12 | 13–17 | ≥12 | 57.4 | 70.1 | 5 | - | - | 16 | 31.5 | 10.2 | - |
| 22 | push | 12 | reached | 12 | 8 | 8 | 26.2 | 37.7 | 1 | 1 | 11 | 56 | 8.5 | 6.0 | 2.8 |
| 23 | hard α0 | 12 | reached | 12 | 15 | ≥14 | 43.6 | 76.3 | 6 | 4 | 21 | 92 | 19.1 | 7.2 | - |
| 24 | hard α0 | 12 | abandoned | 12 | 16–18 | ≥14 | 58.8 | 82.3 | 7 | - | - | 60 | 24.1 | 8.4 | - |
| 25 | hard α0 | 12 | reached | 12 | 16–24 | ≥15 | 57.6 | 87.7 | 8 | 5 | 26 | 39 | 51.6 | 15.1 | - |
| 26 | hard α0 | 12 | reached | 12 | 13–18 | ≥12 | 53.8 | 69.0 | 5 | 2 | 26 | 88 | 22.3 | 14.6 | - |
| 27 | hard α.67 | 12 | reached | 5 | 12–13 | ≥11 | 47.7 | 61.3 | 4 | 2 | 19 | 71 | 19.7 | 8.1 | - |
| 28 | hard α0 | 12 | reached | 12 | 14–16 | ≥13 | 54.0 | 74.8 | 6 | 3 | 23 | 22 | 23.8 | 7.4 | - |
| 29 | hard α0 | 12 | reached | 12 | 14–19 | ≥13 | 54.2 | 74.9 | 6 | 4 | 21 | 48 | 27.8 | 9.7 | - |
| 30 | hard α0 | 12 | reached | 12 | 14 | ≥14 | 44.3 | 76.6 | 6 | 3 | 33 | 44 | 22.9 | 10.8 | - |
| 31 | hard α0 | 12 | reached | 12 | 16–22 | ≥15 | 51.4 | 85.3 | 7 | 3 | 34 | 43 | 25.3 | 8.7 | - |
| 32 | hard α0 | 12 | reached | 11 | 14–16 | ≥14 | 56.9 | 81.6 | 7 | 6 | 17 | 48 | 21.8 | 9.2 | - |
| 33 | hard α0 | 12 | reached | 12 | 15–17 | ≥14 | 46.2 | 77.4 | 6 | 3 | 30 | 82 | 25.4 | 7.4 | - |
| 34 | hard α0 | 12 | reached | 12 | 15–18 | ≥15 | 61.5 | 89.2 | 8 | 6 | 19 | 18 | 30.6 | 13.4 | - |
| 35 | hard α0 | 12 | reached | 12 | 14–18 | ≥14 | 77.0 | 87.7 | 8 | 5 | 24 | 35 | 30.9 | 13.4 | - |
| 36 | hard α0 | 12 | reached | 12 | 15–20 | ≥14 | 66.0 | 84.6 | 7 | 3 | 36 | 40 | 30.3 | 8.1 | - |
| 37 | hard α.67 | 12 | reached | 2 | 6 | 8 | 14.5 | 30.8 | 0 | 0 | 6 | 9 | 7.2 | 1.8 | 1.6 |
| 38 | hard α.67 | 12 | reached | 4 | 9 | ≥8 | 19.0 | 34.0 | 1 | 0 | 17 | 16 | 11.1 | 5.3 | 2.7 |
| 39 | hard α.67 | 12 | reached | 12 | 15–19 | ≥14 | 62.3 | 83.5 | 7 | 2 | 44 | 97 | 26.7 | 12.3 | - |
| 40 | hard α.67 | 12 | reached | 4 | 8 | 8 | 36.0 | 41.3 | 2 | 2 | 10 | 11 | 15.0 | 7.1 | 2.2 |
| 41 | hard α.67 | 12 | abandoned | 12 | 13–20 | ≥13 | 63.4 | 77.8 | 6 | - | - | 27 | 23.6 | 7.0 | - |
| 42 | hard α.67 | 12 | reached | 8 | 13 | ≥11 | 34.0 | 56.0 | 4 | 2 | 21 | 113 | 14.2 | 7.8 | - |
| 43 | hard α.67 | 12 | reached | 1 | 4 | 4 | 18.0 | 16.7 | 0 | 0 | 5 | 7 | 6.8 | 3.0 | 1.5 |
| 44 | hard α.67 | 12 | reached | 1 | 7 | 7 | 9.6 | 22.9 | 0 | 0 | 8 | 7 | 6.9 | 2.7 | 1.3 |
| 45 | hard α.67 | 12 | reached | 4 | 9 | 9 | 17.5 | 37.1 | 1 | 1 | 11 | 39 | 10.7 | 4.6 | 2.3 |
| 46 | hard α.67 | 12 | reached | 10 | 14–19 | ≥12 | 46.1 | 66.3 | 5 | 2 | 25 | 25 | 18.4 | 4.0 | - |
| 47 | hard α.67 | 12 | reached | 2 | 5 | 5 | 22.4 | 22.4 | 0 | 0 | 6 | 8 | 6.8 | 3.2 | 1.6 |
| 48 | hard α.67 | 12 | open | 12 | 14–21 | ≥14 | 91.0 | 91.1 | 8 | - | - | 79 | 33.1 | 11.7 | - |

"Game b" is the game's "choices a move" (slides per expanded board); "movable blocks", "chain
blocks" and "good blocks" are per board along the path. Abandoned goals are not evidence of
difficulty here: all five had no move made, and each ended in a reset, a density change or a
37-minute break.

Two oddities worth knowing: goal 37's game window says M = 8, but the player did it in 6 (the
window misses a shorter solution through blocks outside it; the measure's M is an upper bound
on the true fewest, not exact). Goals 25 and 34 have proofs of 34 and 25 moves, yet the player
needed only 26 and 19.

## 1. Stars earned vs stars worth

| goals | n | worth mean | earned mean | worth histogram 0..10 | earned histogram 0..10 | stars lost to excess | stars never offered (10 − worth) |
|---|---|---|---|---|---|---|---|
| all reached | 42 | 3.1 | 1.7 | 14 5 1 2 6 2 5 4 3 0 0 | 15 6 8 7 2 2 2 0 0 0 0 | 56 | 291 |
| push | 18 | 1.4 | 0.8 | 9 3 0 2 4 0 0 0 0 0 0 | 9 5 2 2 0 0 0 0 0 0 0 | 10 | 155 |
| hard α0 | 12 | 6.7 | 3.9 | 0 0 0 0 0 1 5 3 3 0 0 | 0 0 1 5 2 2 2 0 0 0 0 | 33 | 40 |
| hard α.67 | 11 | 2.2 | 1.0 | 4 2 1 0 2 1 0 1 0 0 0 | 5 1 5 0 0 0 0 0 0 0 0 | 13 | 86 |

Yes, earned is usually low (median 1, never above 6). Mostly that is **low worth, not excess**:
across all goals 291 star-slots were never offered against 56 lost to extra moves. No goal was
worth 9 or 10. Two causes:

- Easy goals score 0: every tries-7 goal (M 1–5) is worth 0–1, since tries 7's 5th
  percentile is a score of 17.7.
- **RANGE was calibrated on α = 0 goals**, and α = 0.67 then made goals nearer and easier, so
  they land at the bottom of a range made for harder goals: α.67 goals average worth 2.2 against
  6.7 for α0 at the same density.

Where goals were worth something (hard α0), excess is the main loss: 33 of 80 stars (41%).
Also, the game divides by its lower bound on M ("≥14"), which is often 1–5 below the true M, so
it charges for moves that are not really extra.

## 2. Moves used vs fewest

| goals | n | M exact | used − M, median (M range's top..bottom) | used / M, median | done in exactly M |
|---|---|---|---|---|---|
| all reached | 42 | 25 | 2..4 | 1.28..1.41 | 8 |
| M ≤ 5 | 14 | 14 | 0.5 | 1.10 | 7 |
| M 6–12 | 13 | 8 | 3..5 | 1.38..1.42 | 1 |
| M > 12 | 15 | 3 | 7..10 | 1.44..1.71 | 0 |

The excess grows with M, both in moves and as a ratio: up to 5 moves the player is nearly
optimal; past 12 they use about 1.5× the minimum and never hit it.

- Excess vs M: Spearman ρ = 0.65 (all), 0.74 (exact-M goals only).
- vs branching *given M* (partial ρ, M ranked out): slides 0.01, movable blocks 0.09, chain
  blocks 0.27. Branching adds little or nothing over M.
- vs distance: 0.16 overall; within tries 12, 0.57 raw and 0.33 given M. But distance there
  is mixed up with the α change (α.67 goals are both short and low M), so I would not lean on it.

## 3. Does the score track felt difficulty?

Spearman ρ (90% bootstrap interval); all 41 reached goals with a game score:

| predictor | active time | think time | excess | used/M |
|---|---|---|---|---|
| M (middle of its range) | 0.68 (0.52..0.79) | 0.38 | 0.65 (0.46..0.80) | 0.52 |
| game b (slides) | 0.66 | 0.36 | 0.57 | 0.47 |
| game score M·log2 b | 0.67 (0.50..0.78) | 0.36 | 0.64 (0.44..0.80) | 0.50 |
| distance | 0.16 (−0.11..0.41) | −0.01 | 0.16 | 0.22 |
| chain blocks | 0.72 (0.57..0.82) | 0.36 | 0.67 | 0.56 |
| log2 A* boards expanded | 0.70 | 0.50 (0.27..0.65) | 0.54 | 0.42 |

On tries 12 only (n = 24) everything falls to ρ ≈ 0.4–0.5 with intervals from about 0 to 0.75.

The score tracks felt difficulty about **as well as M alone, not better**. Every column's
intervals overlap, and across densities everything correlates with everything (tries 7 goals
are short and fast, tries 30/12 goals are long and slow). log2 b barely varies once density
is fixed (game b 30–77 on hard goals), so the score is basically M times a constant per
density. Distance alone does not track difficulty (except through the α confound above).
The one hint that something beyond M matters: think time goes better with *A* effort* (boards
expanded, ρ 0.50, and 0.49 within tries 12) than with M (0.38): goals where the search has to
look around are the ones where the player stops to think. Confidence: low, from one player and
about 40 goals.

## 4. Branching: what to count

What the alternatives give per board along the path (hard goals at tries 12):

| count | typical value |
|---|---|
| slides, all expanded boards (game "choices a move") | 45–77 |
| slides along the path | 50–120 |
| movable blocks along the path | 18–50 |
| movable blocks in the red block's chain | 7–15 |
| good blocks (keep the fewest), exact goals only (M ≤ 13) | 1.3–2.8 |

The player says they weigh far fewer than 30+; the chain count (≈ 5–15) and the good-block
count (≈ 1–3) are on that scale, slides are not. On the 21 goals where M is exact (mostly easy
ones), Spearman ρ against excess / active time:

| measure | excess | active time | used/M |
|---|---|---|---|
| slides (the game's b) | 0.38 | 0.38 | 0.42 |
| movable blocks | 0.66 | 0.63 | 0.55 |
| chain blocks | **0.82** (0.64..0.93) | 0.65 | **0.73** |
| good blocks | 0.75 | 0.64 | 0.67 |
| trap, slides Σlog2(options/good) | 0.66 | 0.64 | 0.53 |
| M | 0.74 | 0.62 | 0.60 |
| game score | 0.70 | 0.62 | 0.57 |

Counting slides is the weakest branching measure on every outcome; counting blocks fixes most
of that, and the red block's chain is best (also the only one that keeps a little signal once M
is ranked out: partial ρ 0.27–0.36 over all goals). "Dead ends" via good/trap measures do
no better than chain blocks and cost a bounded A* per child, which is too slow for hard goals.
Chain blocks are cheap: one pass over the grid per board.

## 5. The star mapping and the stars-earned rule

RANGE (5th–95th percentile of generated scores per density) is not a good fit:

- It grades the generator, not the player: when the generator changed (α), the same density
  gave half the stars, though nothing about the player changed. It needs re-measuring on every
  generator change, and it never offers 9–10 in practice (max shown: 8).
- Per-density normalisation hides real difficulty: a 5-move tries-7 goal gets 0–1 stars like a
  1-move one.
- It is built on a capped M (a lower bound), and log2 b is near-constant per density, so it is
  M in disguise anyway.

Suggested mapping: **stars from the fewest moves directly, the same at every density**, with
worth ≤ M, e.g. `worth = clamp(round((M − 3) / 1.5), 0, min(10, M))` (M 4 → 1, 9 → 4,
13 → 7, 18 → 10). On this session that gives a mean worth of 4.9 instead of 3.1, with the hard
goals at 7–10. If chain branching is adopted, use `M + c·(chain − typical)` or the like, but
the data does not justify more than M yet. M should be the best *known* (upper bound, e.g. the
proof after shortening) rather than A*'s lower bound, so the player is not charged for the
measure stopping early.

Stars earned: keep `round(worth × M / used)`. With worth ≤ M, one extra move costs at most
worth/M ≤ 1 star (and rounding cannot make one step cost 2), which is the player's rule. The
current mapping breaks it only because worth can exceed M (worth 10 at M 4: one extra move
costs 2). Flat "−1 per extra move" is too harsh for real play: with the median excess of 7–10
on M > 12, hard goals would nearly always earn 0 (mean 0.2 stars on this session vs 1.8 now).
Simulated on the reached goals (M = best known solution), the M-based worth with the ratio
rule earns a mean of 3.6 stars instead of 1.8, with excess still costing a visible share.

## Suggestions, ranked

1. **Fix the play log** (`logMoves` drops the first move after each page load: start `logged`
   at the stored history's length when the page loads, not at the first save). 17 of 42 goals
   miss a move; analyses of what the player did need the full sequence.
2. **Stars from M, worth ≤ M, earned = worth·M/used, M = best known solution.** Fixes the low
   counts (most of the loss is never-offered stars), stops generator changes from moving the
   scale, and meets the "one move ≤ one star" rule by construction.
3. **Branching by blocks, not slides; preferably blocks in the red block's chain.** Slides are
   the worst predictor on every outcome; chain blocks are the best and are on the scale the
   player describes (≈ 5–15, not 30–90). Show it as "choices a move".
4. **Report M as a range, and let the measure search more for the shown goal.** At 50k states
   the game knew M for no hard goal; 1M states (about 1 GB, too much for the browser) still left
   17 of 42 as ranges. A better lower bound or an upper bound by shortening the proof (cheap: it
   took 34 → 27 and 26 → 24 here) would tighten it. Also widen the window: goal 37's M was 8 in
   the window, 6 in play.
5. **Generator:** for this player, difficulty is M; distance did not matter on its own (ρ 0.16).
   α = 0.67 cut M from about 16 to about 10 on average; if the aim is hard goals near the player,
   rank by M (or M·log2 chain) with a softer distance weight, and re-check once more data exists.
6. **Log more:** each goal's proof (the moves, not just the length) and its measured difficulty
   in the goal event, so nothing has to be regenerated; build id per event (code changed under
   the session); page loads and hides (to separate breaks from thinking); time per move is
   already there. With undo unused, its count says nothing yet.
7. **More data before tuning further:** one player, ~40 goals, density and generator varying
   together. Ideally a few dozen goals per generator at one density.
