// How mixed a shortest solution's come-back moves are (reports/trial-features.html, "Mixed
// come-backs"): numbers on the order of the moves alone. Only the blocks that move more than once
// count, and red (its "come-back" track); a block moved once is left out, so a world block slid
// out of the way once changes none of these (open-core.ts's two bounds then hold them exact).
//
// A block's moves make "trips": from one of its moves to its next one (out, then back). Each
// number below reads that list of trips in plain terms.
import { checkOpen } from "./open-core";
import type { Grid } from "./extra-gen-core";

export type Mixed = {
  /** Σ (times moved − 1), red included. */
  extra: number;
  /** Times red moves. */
  red: number;
  /** Red's moves before its last one, while some other block is still to come back. */
  redBetween: number;
  /** Moves past a plain out-and-back: Σ max(0, times moved − 2), red included. */
  third: number;
  /** The most blocks (red not counted) moved and still to come back, at once. */
  open: number;
  /** Separate waves: times the count of blocks still to come back (red not counted) rises from none. */
  waves: number;
  /** Pairs of trips (red not counted) that cross: one starts inside the other and ends outside it. */
  crossing: number;
  /** Pairs of trips (red not counted) where one lies inside the other (nested, like brackets). */
  nested: number;
  /** Come-backs out of order: a block comes back while another block moved after it is still out. */
  outOfOrder: number;
  /** The longest trip, counted in come-back moves (red's included) between its two ends. */
  span: number;
  /** Switches between putting blocks back and taking them out: runs of come-backs (red's moves
   * left out) less one. */
  turns: number;
};

/** The numbers for one solution, given as the block moved at each step. */
export function mixed(seq: number[], red: number): Mixed {
  const times = new Map<number, number>();
  for (const b of seq) times.set(b, (times.get(b) ?? 0) + 1);
  // The skeleton: moves of red and of the blocks that move more than once.
  const sk = seq.filter((b) => b === red || times.get(b)! > 1);
  let extra = 0, third = 0;
  for (const [, t] of times) ((extra += t - 1), (third += Math.max(0, t - 2)));
  const redN = times.get(red) ?? 0;
  // Trips: [start, end] in the skeleton, per block.
  const trips: { b: number; a: number; z: number }[] = [];
  const last = new Map<number, number>();
  sk.forEach((b, k) => {
    if (last.has(b)) trips.push({ b, a: last.get(b)!, z: k });
    last.set(b, k);
  });
  const others = trips.filter((t) => t.b !== red);
  let crossing = 0, nested = 0;
  for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) {
    const [x, y] = others[i]!.a < others[j]!.a ? [others[i]!, others[j]!] : [others[j]!, others[i]!];
    if (y.a < x.z && x.z < y.z) crossing++;
    else if (y.a > x.a && y.z < x.z) nested++;
  }
  // Out: blocks moved and still to come back; red's moves between, out-of-order returns, waves.
  const lastAt = new Map<number, number>();
  sk.forEach((b, k) => lastAt.set(b, k));
  const out = new Map<number, number>(); // block -> step of its latest move, while still to come back
  let open = 0, waves = 0, redBetween = 0, outOfOrder = 0;
  sk.forEach((b, k) => {
    if (b === red) {
      if (k < lastAt.get(red)! && out.size > 0) redBetween++;
      return;
    }
    if (out.has(b)) {
      const since = out.get(b)!;
      if ([...out.values()].some((s) => s > since)) outOfOrder++;
      out.delete(b);
    }
    if (k < lastAt.get(b)!) {
      if (out.size === 0) waves++;
      out.set(b, k);
    }
    open = Math.max(open, out.size);
  });
  // Runs of come-backs (a block's second or later move) with red's moves left out.
  const seen = new Set<number>();
  let runs = 0, prevBack = false;
  for (const b of sk) {
    if (b === red) continue;
    const back = seen.has(b);
    seen.add(b);
    if (back && !prevBack) runs++;
    prevBack = back;
  }
  const turns = Math.max(0, runs - 1);
  const span = Math.max(0, ...trips.map((t) => t.z - t.a - 1));
  return { extra, red: redN, redBetween, third, open, waves, crossing, nested, outOfOrder, span, turns };
}

export const KEYS = ["extra", "red", "redBetween", "third", "open", "waves", "crossing", "nested", "outOfOrder", "span", "turns"] as const;
export type Key = (typeof KEYS)[number];
export type Range = { min: number; max: number; mean: number };

/** Each number's least, most and mean over a list of solutions. */
export function over(sols: number[][], red: number): Record<Key, Range> {
  const ms = sols.map((s) => mixed(s, red));
  return Object.fromEntries(KEYS.map((k) => {
    const v = ms.map((m) => m[k]);
    return [k, { min: Math.min(...v), max: Math.max(...v), mean: v.reduce((a, b) => a + b, 0) / v.length }];
  })) as Record<Key, Range>;
}

/** open-core.ts's two bounds on a room's goal, and each number's least and most over every
 * shortest solution of both: when they agree too (and neither list was cut to a sample) the
 * numbers are exact in any surroundings, since every real shortest solution's come-backs are
 * those of a lower-bound solution and every upper-bound solution is real. */
export function checkMixed(g: Grid, R: number[], target: number, { cap = 1_500_000, bound = Infinity, paths = 200_000 } = {}) {
  const c = checkOpen(g, R, target, cap, bound, paths);
  const red = R[0]!;
  const up = c.up.paths ? over(c.up.paths.list.map((p) => p.map((m) => m[0])), red) : null;
  const low = c.low?.paths ? over(c.low.paths.list.map((p) => p.flatMap((m) => [...m[3], m[0]])), red) : null;
  const sampled = !!(c.up.paths?.sampled || c.low?.paths?.sampled);
  const agree = !!up && !!low && KEYS.every((k) => up[k].min === low[k].min && up[k].max === low[k].max);
  return { ...c, mixed: up, mixedLow: low, mixedExact: c.exact && agree && !sampled, sampled, solutions: c.up.paths?.count ?? 0, solutionsLow: c.low?.paths?.count ?? 0 };
}
