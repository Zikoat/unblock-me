// Numbers about a board, for the density report.
import type { Rect } from "./camera";
import type { Layout } from "./layout";
import { blocksIn, NO_CHANGES, position, slide } from "./rules";

export type Summary = {
  /** Blocks in the area (UI blocks left out) and the share of its cells they cover. */
  blocks: number;
  coverage: number;
  blocksPer100Cells: number;
  /** Shares of blocks that can slide 0, exactly 1, exactly 2 and 3 or more cells in total
   * (both directions together). */
  stuck: number;
  oneStep: number;
  twoSteps: number;
  threePlus: number;
  medianSteps: number;
  /** On average, how many blocks one block is blocking: the blocks it touches end-on in
   * their lane, so they cannot move towards it at all. */
  meanBlocking: number;
};

/** Measure every block inside `area` (lattice units) on an untouched board. */
export function summarize(layout: Layout, area: Rect): Summary {
  const blocks = blocksIn(layout, area, NO_CHANGES).filter(
    (b) => !b.ui && b.x >= area.x && b.y >= area.y && b.x + b.w <= area.x + area.width && b.y + b.h <= area.y + area.height,
  );
  const steps: number[] = [];
  let blocking = 0;
  let cells = 0;
  for (const b of blocks) {
    const s = slide(layout, b, NO_CHANGES);
    steps.push(s.hi - s.lo);
    // A touching neighbour on either side is a block blocking this one.
    if (s.before && s.lo === position(b)) blocking++;
    if (s.after && s.hi === position(b)) blocking++;
    cells += b.w * b.h;
  }
  const n = Math.max(1, blocks.length);
  const share = (test: (s: number) => boolean) => steps.filter(test).length / n;
  steps.sort((a, b) => a - b);
  return {
    blocks: blocks.length,
    coverage: cells / (area.width * area.height),
    blocksPer100Cells: (100 * blocks.length) / (area.width * area.height),
    stuck: share((s) => s === 0),
    oneStep: share((s) => s === 1),
    twoSteps: share((s) => s === 2),
    threePlus: share((s) => s >= 3),
    medianSteps: steps.length ? steps[Math.floor(steps.length / 2)]! : 0,
    meanBlocking: blocking / n,
  };
}
