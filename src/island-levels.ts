// The island's levels: squares of 2x1 blocks, growing from 4x4 to 6x6. Each is won by its red
// block out into the bay; the last few have more goals inside, in turn (a block onto a cell,
// its top-left). The 4x4, 5x5 and several-goal ones were found by a random search with a
// solver (several goals: the fewest moves for all of them together); the other 6x6 ones were
// made by test/experiments/island-levels.ts (1000 boards, seed 12345, the exit on a random
// row, 6 kept per fewest-moves count, pruned), each picked to differ most from those before
// it in blocks, solution moves and exit row (similar solutions felt repetitive). Each block
// is [x, y, horizontal] inside its square, the red block first, on the exit's row; each
// solution step is [block, to] along the block's lane, a shortest one from where the goal
// before left the blocks. `fewest` is the square's, all its goals together.
export type IslandLevel = {
  side?: number;
  fewest: number;
  blocks: [number, number, 0 | 1][];
  solution: [number, number][];
  goals?: { block: number; at: [number, number]; solution: [number, number][] }[];
};
export const ISLAND_LEVELS: IslandLevel[] = [
  { side: 4, fewest: 4, blocks: [[0, 1, 1], [2, 2, 1], [3, 0, 0], [2, 3, 1], [0, 2, 0]], solution: [[1, 1], [3, 1], [2, 2], [0, 4]] },
  { side: 5, fewest: 6, blocks: [[0, 4, 1], [1, 1, 1], [0, 1, 0], [3, 1, 1], [1, 0, 1], [3, 0, 1], [2, 2, 0], [3, 2, 1], [0, 3, 1], [4, 3, 0]], solution: [[2, 0], [6, 3], [7, 0], [6, 2], [9, 2], [0, 5]] },
  { fewest: 6, blocks: [[2, 5, 1], [5, 4, 0], [3, 2, 0], [2, 1, 1], [4, 4, 0], [4, 3, 1]], solution: [[3, 1], [2, 1], [5, 2], [1, 3], [4, 3], [0, 6]] },
  { fewest: 7, blocks: [[0, 0, 1], [1, 3, 1], [2, 0, 0], [3, 2, 1], [4, 0, 0], [5, 0, 0], [1, 2, 1]], solution: [[1, 0], [5, 1], [6, 0], [2, 3], [3, 2], [4, 1], [0, 6]] },
  { fewest: 8, blocks: [[0, 4, 1], [3, 0, 1], [2, 2, 1], [4, 1, 0], [5, 3, 0], [2, 3, 0], [0, 2, 0], [4, 3, 0]], solution: [[1, 2], [3, 0], [4, 2], [6, 0], [2, 0], [5, 2], [7, 2], [0, 6]] },
  { fewest: 10, blocks: [[1, 2, 1], [0, 3, 0], [3, 1, 0], [1, 3, 1], [3, 4, 1], [4, 2, 0], [2, 4, 0], [1, 1, 1], [5, 1, 0], [4, 0, 0]], solution: [[0, 0], [1, 4], [2, 0], [3, 0], [7, 0], [6, 0], [4, 2], [5, 3], [8, 0], [0, 6]] },
  // From here every square has goals inside too: its red block out to the bay first, then
  // those inside (a block on the first target, a reached block in a later one's way).
  {
    fewest: 9, blocks: [[3, 4, 1], [1, 0, 1], [1, 2, 1], [0, 4, 0], [3, 0, 1], [2, 3, 0], [4, 2, 1], [0, 1, 1], [3, 1, 0], [5, 3, 0], [1, 4, 0]], solution: [[4, 4], [8, 0], [6, 3], [9, 2], [0, 6]],
    goals: [{ block: 10, at: [1, 2], solution: [[9, 3], [6, 4], [2, 2], [10, 2]] }],
  },
  {
    fewest: 10, blocks: [[1, 1, 1], [0, 3, 0], [3, 3, 1], [1, 2, 1], [3, 2, 1], [1, 3, 1], [4, 4, 1], [1, 5, 1], [1, 4, 1], [4, 0, 0]], solution: [[1, 0], [3, 0], [4, 2], [5, 0], [2, 2], [9, 2], [0, 6]],
    goals: [{ block: 3, at: [2, 2], solution: [[9, 0], [4, 4], [3, 2]] }],
  },
  {
    fewest: 11, blocks: [[0, 4, 1], [0, 5, 1], [0, 1, 0], [2, 4, 0], [2, 1, 0], [3, 1, 0], [1, 0, 0], [4, 2, 0], [2, 3, 1], [4, 5, 1], [0, 3, 1]], solution: [[4, 0], [7, 1], [8, 3], [3, 2], [0, 6]],
    goals: [{ block: 2, at: [0, 3], solution: [[3, 4], [10, 1], [2, 3]] }, { block: 3, at: [2, 2], solution: [[2, 1], [10, 0], [3, 2]] }],
  },
  // The last: its goals inside first, its exit shut (src/island.ts GATE); then out to the world.
  {
    fewest: 13, blocks: [[0, 1, 1], [3, 0, 0], [1, 3, 1], [2, 4, 0], [2, 1, 0], [3, 2, 1], [5, 3, 0], [0, 2, 0], [4, 4, 0], [5, 1, 0], [3, 4, 0]], solution: [[5, 0], [1, 2], [4, 2], [9, 2], [0, 6]],
    goals: [{ block: 8, at: [4, 2], solution: [[4, 0], [5, 2], [6, 4], [7, 4], [2, 0], [8, 2]] }, { block: 5, at: [3, 2], solution: [[8, 3], [5, 3]] }],
  },
];
