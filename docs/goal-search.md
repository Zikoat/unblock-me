# The goal search problem

What the game needs from goal generation, stated without the rest of the game. Current code:
`src/goal.ts` (`makeGoal`) on top of `src/frozen.ts` (`clearCell`).

## Board

- An infinite grid of unit cells. Blocks occupy cells; no two blocks share a cell.
- Sliding blocks are 2x1 (horizontal) or 1x2 (vertical). A block moves only along its long
  axis, any number of cells per move, through empty cells only (it cannot jump).
- Fixed cells: some 1x1 cells are walls, and a small fixed area holds UI blocks. Neither
  ever moves.
- The board is generated lazily per 4x4 chunk from a seed (`randomLayout(seed, { tries })`),
  deterministic, and can be queried by area (`layout.blocksIn(rect)`). Density goes up with
  `tries` (1..30, default 7; around 15 and up is a dense, heavily jammed board).
- Play changes the board: a map of moved blocks, id -> position (`moved`). It grows as the
  player plays; after a long session it can hold hundreds of entries spread over a large
  area.

## Input

- The board (layout + `moved`).
- `near`: a cell (the previous target, or the middle of the view).
- `exclude`: blocks that may not be chosen (earlier red blocks), and no block on the same
  track (same row for a horizontal block, same column for a vertical one) as an excluded one.
- `avoid`: rectangles (earlier targets) the new target may not overlap.

## Output

A goal: a red block R (a sliding block within a few cells of `near`), a target position T
for it on its own line, and a solution: a sequence of legal moves from the current board that
ends with R on T. The solution is proof the goal is reachable; it need not be optimal, but
shorter is nicer (it is an upper bound shown as difficulty).

## What makes a good goal

- Reachable (always; the solution proves it).
- Far: |T - R| along R's axis as large as possible, up to a cap (`effort`, 12 cells).
- Not trivial: ideally R cannot just slide there in one move; it should need other blocks
  moved first. (Today this is not enforced: distance is maximised, ties broken by fewer
  moves.)
- Near `near`, so the next goal is close to where the player is.

## Requirements

- Runs in a Web Worker, so it does not block the UI, but the player waits for it after
  each goal. Target: under 100 ms at default density, under 1 s at the densest, on a phone.
  Today it is ~100 ms at default density and 10-25 s on dense boards (tries 15, effort
  12-24); players have seen ~20 s waits.
- Memory: a few tens of MB at most.
- Deterministic for the same input (so a goal made ahead of time matches).

## Current approach (for reference, not a constraint)

For up to 6 candidate blocks nearest `near`, both directions: push R one cell at a time;
for each next cell, `clearCell` searches (iterative deepening, up to 4 moves per cell,
200k-node budget) for moves that empty that cell without moving R or undoing cells needed.
Keep the candidate that got furthest; `simplify` then merges and drops redundant moves.

Known costs: every cell lookup (`blocksIn` on a 1x1 area) scans the whole `moved` map, so
it slows as play goes on; failed `clearCell` calls exhaust their budget; up to 12
push attempts each with up to 12 cell clears.
