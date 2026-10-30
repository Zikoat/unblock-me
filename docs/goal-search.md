# The goal search problem

What the game needs from goal generation, stated without the rest of the game. Current code:
`makeGoalHard` in `src/goal-search.ts`.

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
- `near`: a cell (the previous target, or the middle of the view). The goal should be near
  it, so the player doesn't have to travel; which block becomes the red block is free.
- `exclude`: blocks that may not be chosen (earlier red blocks), and no block on the same
  track (same row for a horizontal block, same column for a vertical one) as an excluded one.
- `avoid`: rectangles (earlier targets) the new target may not overlap.

## Output

A goal: a red block R near `near`, a target position T for it on its own line, and a
solution: a sequence of legal moves from the current board that ends with R on T. The
solution proves the goal is reachable.

## What makes a good goal

A good goal is a hard one: it takes many moves, and finding them means choosing among many
options. Distance is not the aim; a short trip that needs a long, branching solution is
better than a long free slide.

A first difficulty measure is in `src/difficulty.ts`: the fewest moves M (one move = one
block sliding any distance), found by A* in a window around the goal, and the average number
of moves to choose from on the way (branching b). Difficulty = log2(b^M), the size of the
tree of move sequences as long as the shortest solution. It is a proposal, not settled:
improving the measure itself (so it tracks what makes a puzzle hard for a person) is part of
the problem. It is also slow on dense boards (seconds, often capped at a lower bound).

## Requirements

- Scaling, not a fixed time limit: the aim is an approach that, given more time, finds
  harder goals (more moves, more branching), and that stays fast across densities (tries
  1..30) and long sessions.
- The time is there: goals can be made in a Web Worker while the player solves the current
  one, or several goals ahead; only a goal the player is waiting for has to be quick.
- Memory: a few tens of MB.
- Deterministic for the same input.
- Every goal's solution must replay legally from the board it was made for.

## Current approach

`makeGoalTournament` in `src/goal-search.ts`: the push search (`pushes` in `src/goal-fast.ts`)
pushes the blocks nearest `near` one cell at a time, clearing each next cell with a bounded
backwards search, until a cell cannot be cleared or the push's share of the tick budget is
spent (no cap on cells). Every cell reached is a candidate; the difficulty measure ranks
them by difficulty for the distance, roughly and then exactly for the best few.
