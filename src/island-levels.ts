// The island's levels: 6x6 squares of 2x1 blocks, made by test/experiments/island-levels.ts
// (300 boards, seed 12345, pruned) and picked as a ramp. Each block is [x, y, horizontal]
// inside its square (0..5), the red block first; each solution step is [block, to] along
// the block's lane, a shortest one (the fewest moves).
export type IslandLevel = { fewest: number; blocks: [number, number, 0 | 1][]; solution: [number, number][] };
export const ISLAND_LEVELS: IslandLevel[] = [
  { fewest: 1, blocks: [[4, 2, 1]], solution: [[0, 6]] },
  { fewest: 3, blocks: [[0, 2, 1], [5, 2, 0], [2, 2, 0]], solution: [[1, 0], [2, 0], [0, 6]] },
  { fewest: 5, blocks: [[0, 2, 1], [5, 2, 0], [4, 2, 0], [2, 2, 0], [3, 2, 0]], solution: [[1, 0], [2, 0], [3, 0], [4, 0], [0, 6]] },
  { fewest: 7, blocks: [[2, 2, 1], [4, 0, 1], [3, 4, 1], [3, 0, 0], [5, 4, 0], [4, 1, 0], [5, 1, 0]], solution: [[0, 1], [2, 1], [3, 3], [1, 3], [5, 3], [6, 0], [0, 6]] },
  { fewest: 10, blocks: [[1, 2, 1], [3, 3, 0], [5, 2, 0], [4, 2, 0], [3, 1, 0], [4, 1, 1], [2, 0, 0], [0, 2, 0], [4, 4, 0]], solution: [[1, 4], [2, 3], [4, 2], [7, 0], [0, 0], [6, 3], [5, 1], [3, 0], [4, 0], [0, 6]] },
  { fewest: 13, blocks: [[2, 2, 1], [1, 3, 1], [5, 1, 0], [4, 1, 0], [4, 0, 1], [5, 3, 0], [3, 0, 0], [4, 5, 1], [1, 0, 1], [3, 3, 1], [0, 2, 0], [2, 4, 1], [0, 0, 0]], solution: [[0, 1], [7, 3], [5, 4], [9, 4], [10, 3], [11, 1], [6, 3], [12, 1], [8, 0], [4, 2], [2, 0], [3, 0], [0, 6]] },
];
