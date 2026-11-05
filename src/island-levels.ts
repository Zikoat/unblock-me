// The island's levels: squares of 2x1 blocks, growing from 4x4 to 6x6. Each is won by its red
// block out into the bay; some then have more goals inside, in turn (a block onto a cell,
// its top-left; a block on the target, a reached block in a later one's way). The 4x4, 5x5
// and several-goal ones were found by a random search with a solver; the other 6x6 ones were
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
  // Then a block onto a cell inside, a block on it.
  {
    fewest: 7, blocks: [[1, 2, 1], [2, 4, 0], [3, 3, 0], [3, 1, 0], [2, 0, 1], [1, 1, 1], [5, 0, 0], [0, 3, 1], [5, 2, 0]], solution: [[4, 1], [3, 0], [8, 3], [0, 6]],
    goals: [{ block: 7, at: [4, 3], solution: [[2, 4], [8, 4], [7, 4]] }],
  },
  { fewest: 8, blocks: [[0, 4, 1], [3, 0, 1], [2, 2, 1], [4, 1, 0], [5, 3, 0], [2, 3, 0], [0, 2, 0], [4, 3, 0]], solution: [[1, 2], [3, 0], [4, 2], [6, 0], [2, 0], [5, 2], [7, 2], [0, 6]] },
  { fewest: 10, blocks: [[1, 2, 1], [0, 3, 0], [3, 1, 0], [1, 3, 1], [3, 4, 1], [4, 2, 0], [2, 4, 0], [1, 1, 1], [5, 1, 0], [4, 0, 0]], solution: [[0, 0], [1, 4], [2, 0], [3, 0], [7, 0], [6, 0], [4, 2], [5, 3], [8, 0], [0, 6]] },
  // Then two inside: the last needs the one before's block moved off its target again.
  {
    fewest: 10, blocks: [[2, 3, 1], [4, 3, 0], [2, 2, 1], [1, 5, 1], [2, 4, 1], [0, 1, 1], [5, 4, 0], [5, 2, 0], [3, 1, 1]], solution: [[1, 4], [7, 1], [0, 6]],
    goals: [{ block: 5, at: [2, 1], solution: [[7, 2], [8, 4], [5, 2]] }, { block: 2, at: [4, 2], solution: [[5, 1], [8, 3], [7, 0], [2, 4]] }],
  },
  { fewest: 11, blocks: [[1, 1, 1], [2, 2, 0], [3, 3, 0], [4, 2, 1], [5, 0, 0], [1, 3, 0], [2, 5, 1], [3, 1, 0], [2, 0, 1], [4, 3, 1]], solution: [[1, 3], [6, 1], [2, 4], [8, 1], [7, 0], [3, 1], [9, 3], [4, 4], [9, 4], [7, 2], [0, 6]] },
  { fewest: 13, blocks: [[1, 4, 1], [1, 0, 1], [1, 1, 1], [2, 2, 0], [3, 1, 1], [0, 2, 1], [3, 0, 1], [3, 2, 0], [4, 2, 1], [5, 0, 0], [4, 3, 0]], solution: [[0, 0], [1, 0], [2, 0], [3, 3], [4, 2], [6, 2], [7, 3], [8, 2], [10, 0], [8, 4], [3, 2], [7, 2], [0, 6]] },
];
