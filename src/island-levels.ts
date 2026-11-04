// The island's levels: 6x6 squares of 2x1 blocks, made by test/experiments/island-levels.ts
// (1000 boards, seed 12345, the exit on a random row, 6 kept per fewest-moves count, pruned).
// One per count from 6 to 13 (1 to 5 were too easy; 7 to 22 ramped too fast), each picked to
// differ most from those before it in blocks, solution moves and exit row (similar
// solutions felt repetitive). Each block is [x, y, horizontal] inside its square (0..5), the
// red block first, on the exit's row; each solution step is [block, to] along the block's
// lane, a shortest one.
export type IslandLevel = { fewest: number; blocks: [number, number, 0 | 1][]; solution: [number, number][] };
export const ISLAND_LEVELS: IslandLevel[] = [
  { fewest: 6, blocks: [[2, 5, 1], [5, 4, 0], [3, 2, 0], [2, 1, 1], [4, 4, 0], [4, 3, 1]], solution: [[3, 1], [2, 1], [5, 2], [1, 3], [4, 3], [0, 6]] },
  { fewest: 7, blocks: [[0, 0, 1], [1, 3, 1], [2, 0, 0], [3, 2, 1], [4, 0, 0], [5, 0, 0], [1, 2, 1]], solution: [[1, 0], [5, 1], [6, 0], [2, 3], [3, 2], [4, 1], [0, 6]] },
  { fewest: 8, blocks: [[0, 4, 1], [3, 0, 1], [2, 2, 1], [4, 1, 0], [5, 3, 0], [2, 3, 0], [0, 2, 0], [4, 3, 0]], solution: [[1, 2], [3, 0], [4, 2], [6, 0], [2, 0], [5, 2], [7, 2], [0, 6]] },
  { fewest: 9, blocks: [[0, 3, 1], [4, 4, 0], [0, 5, 1], [2, 2, 0], [3, 1, 1], [2, 4, 1], [2, 0, 0], [2, 5, 1]], solution: [[1, 3], [5, 0], [7, 3], [3, 4], [6, 2], [4, 0], [1, 1], [6, 1], [0, 6]] },
  { fewest: 10, blocks: [[1, 2, 1], [0, 3, 0], [3, 1, 0], [1, 3, 1], [3, 4, 1], [4, 2, 0], [2, 4, 0], [1, 1, 1], [5, 1, 0], [4, 0, 0]], solution: [[0, 0], [1, 4], [2, 0], [3, 0], [7, 0], [6, 0], [4, 2], [5, 3], [8, 0], [0, 6]] },
  { fewest: 11, blocks: [[1, 1, 1], [2, 2, 0], [3, 3, 0], [4, 2, 1], [5, 0, 0], [1, 3, 0], [2, 5, 1], [3, 1, 0], [2, 0, 1], [4, 3, 1]], solution: [[1, 3], [6, 1], [2, 4], [8, 1], [7, 0], [3, 1], [9, 3], [4, 4], [9, 4], [7, 2], [0, 6]] },
  { fewest: 12, blocks: [[1, 3, 1], [3, 3, 0], [2, 2, 1], [3, 5, 1], [4, 1, 1], [4, 2, 0], [5, 4, 0], [3, 0, 0], [5, 2, 0], [2, 4, 0]], solution: [[0, 0], [2, 1], [9, 3], [3, 0], [1, 4], [5, 4], [7, 2], [4, 1], [7, 1], [8, 1], [9, 4], [0, 6]] },
  { fewest: 13, blocks: [[1, 4, 1], [1, 0, 1], [1, 1, 1], [2, 2, 0], [3, 1, 1], [0, 2, 1], [3, 0, 1], [3, 2, 0], [4, 2, 1], [5, 0, 0], [4, 3, 0]], solution: [[0, 0], [1, 0], [2, 0], [3, 3], [4, 2], [6, 2], [7, 3], [8, 2], [10, 0], [8, 4], [3, 2], [7, 2], [0, 6]] },
];
