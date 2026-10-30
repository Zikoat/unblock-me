// A window of the board as a small state space: the blocks inside it that may slide, each
// known by its position along its axis, everything else as walls. Searches (the goal
// search and the difficulty measure) run over its states, which it keeps in one typed
// array (one byte per slider per state) with a map from a state's key to its index, so a
// search of a few hundred thousand boards takes a few tens of MB.
//
// A move legal in the window is legal on the real board: the window only ever adds walls
// (blocks outside it, or straddling its edge, or chosen to stand still), never removes any.
import { Board, isFixed } from "./board";
import type { Rect } from "./camera";
import type { Move } from "./rules";

export type Slider = { id: string; horizontal: boolean; line: number; size: number };

const WALL = 255;

export class Window {
  readonly x0: number;
  readonly y0: number;
  readonly W: number;
  readonly H: number;
  /** WALL where something that never moves stands, 0 elsewhere. */
  readonly wall: Uint8Array;
  readonly sliders: Slider[] = [];
  /** Where the sliders are now (position along the axis, window coordinates). */
  readonly start: Uint8Array;
  /** Working grid: WALL, or slider index + 1, or 0. Valid after fill(). */
  readonly grid: Uint8Array;

  /** The blocks fully inside `rect` that are not fixed slide (those in `mobile` when given);
   * everything else stands as walls. */
  constructor(board: Board, rect: Rect, mobile?: ReadonlySet<string>) {
    this.x0 = rect.x;
    this.y0 = rect.y;
    this.W = rect.width;
    this.H = rect.height;
    const { x0, y0, W, H } = this;
    this.wall = new Uint8Array(W * H);
    this.grid = new Uint8Array(W * H);
    const seen = new Set<string>();
    const start: number[] = [];
    for (let y = y0; y < y0 + H; y++) {
      for (let x = x0; x < x0 + W; x++) {
        const id = board.at(x, y);
        if (!id) continue;
        const b = board.block(id);
        const inside = b.x >= x0 && b.y >= y0 && b.x + b.w <= x0 + W && b.y + b.h <= y0 + H;
        if (isFixed(b) || !inside || (mobile && !mobile.has(id)) || this.sliders.length >= 250) {
          this.wall[(y - y0) * W + (x - x0)] = WALL;
          continue;
        }
        if (seen.has(id)) continue;
        seen.add(id);
        const horizontal = b.w > b.h;
        this.sliders.push({ id, horizontal, line: horizontal ? b.y - y0 : b.x - x0, size: horizontal ? b.w : b.h });
        start.push(horizontal ? b.x - x0 : b.y - y0);
      }
    }
    this.start = Uint8Array.from(start);
  }

  /** The window again with only the sliders that can matter to `seeds`: those, whatever
   * lies in their lanes, whatever lies in those blocks' lanes, and so on for `levels`
   * steps. A block no chain of lanes reaches cannot help or hinder, so it stands still,
   * and the search is smaller. */
  closure(board: Board, seeds: Iterable<string>, levels = Infinity): Window {
    const keep = new Set<string>();
    let queue = [...seeds];
    const byId = new Map(this.sliders.map((s, i) => [s.id, i]));
    for (let level = 0; queue.length && level <= levels; level++) {
      const next: string[] = [];
      for (const id of queue) {
        if (keep.has(id) || !byId.has(id)) continue;
        keep.add(id);
        const s = this.sliders[byId.get(id)!]!;
        for (let p = 0; p < (s.horizontal ? this.W : this.H); p++) {
          const o = s.horizontal ? board.at(this.x0 + p, this.y0 + s.line) : board.at(this.x0 + s.line, this.y0 + p);
          if (o && !keep.has(o)) next.push(o);
        }
      }
      queue = next;
    }
    return new Window(board, { x: this.x0, y: this.y0, width: this.W, height: this.H }, keep);
  }

  index(id: string): number {
    return this.sliders.findIndex((s) => s.id === id);
  }

  cell(s: Slider, p: number, k: number): number {
    return s.horizontal ? s.line * this.W + p + k : (p + k) * this.W + s.line;
  }

  length(s: Slider): number {
    return s.horizontal ? this.W : this.H;
  }

  /** Put a state on the grid. */
  fill(state: Uint8Array, offset = 0): void {
    const { grid, sliders } = this;
    grid.set(this.wall);
    for (let i = 0; i < sliders.length; i++) {
      const s = sliders[i]!;
      const p = state[offset + i]!;
      for (let k = 0; k < s.size; k++) grid[this.cell(s, p, k)] = i + 1;
    }
  }

  /** Every legal slide from the state on the grid: slider index and new position. */
  moves(state: Uint8Array, offset: number, each: (i: number, to: number) => void): number {
    const { grid, sliders } = this;
    let n = 0;
    for (let i = 0; i < sliders.length; i++) {
      const s = sliders[i]!;
      const pos = state[offset + i]!;
      const end = this.length(s);
      for (let p = pos + 1; p + s.size <= end && !grid[this.cell(s, p + s.size - 1, 0)]; p++) {
        each(i, p);
        n++;
      }
      for (let p = pos - 1; p >= 0 && !grid[this.cell(s, p, 0)]; p--) {
        each(i, p);
        n++;
      }
    }
    return n;
  }

  /** A slide as a move on the real board. */
  move(i: number, from: number, to: number): Move {
    const s = this.sliders[i]!;
    const at = (p: number) => (s.horizontal ? { x: this.x0 + p, y: this.y0 + s.line } : { x: this.x0 + s.line, y: this.y0 + p });
    return { id: s.id, from: at(from), to: at(to) };
  }

  /** A slider's position along its axis in world coordinates. */
  world(i: number, p: number): number {
    const s = this.sliders[i]!;
    return (s.horizontal ? this.x0 : this.y0) + p;
  }

  /** A lower bound on the moves that get slider `r` to `want`, from the state on the grid:
   * its own move, one for each block in the cells it has to cross, and one more for each
   * of those that cannot get out of the way in one slide without some further block moving
   * first (counted once per distinct set of further blocks, so the bound stays true when
   * one such block frees several). Infinity when a wall is in the way. */
  lower(state: Uint8Array, offset: number, r: number, want: number): number {
    const pos = state[offset + r]!;
    if (pos === want) return 0;
    const { grid, sliders } = this;
    const red = sliders[r]!;
    const lo = Math.min(pos, want), hi = Math.max(pos, want) + red.size;
    let blockers = 0;
    let mask: number[] | null = null; // slider indices in the way
    for (let p = lo; p < hi; p++) {
      if (p >= pos && p < pos + red.size) continue;
      const o = grid[this.cell(red, p, 0)]!;
      if (o === WALL) return Infinity;
      if (!o) continue;
      (mask ??= []);
      if (!mask.includes(o - 1)) {
        mask.push(o - 1);
        blockers++;
      }
    }
    if (!mask) return 1;
    // Stuck blockers: the further blocks (not red, not blockers) at least one of which has
    // to move before the blocker can clear the crossing. Disjoint sets each cost a move.
    const needs: number[][] = [];
    for (const b of mask) {
      const s = sliders[b]!;
      const q = state[offset + b]!;
      const further: number[] = [];
      let counted = false; // a direction clear, or cleared by a counted move: not stuck
      for (const dir of [1, -1]) {
        // Slide until no cell of the blocker is in the crossing.
        let clear = true;
        let inWay = 0;
        for (let d = 1; ; d++) {
          const edge = dir > 0 ? q + s.size - 1 + d >= this.length(s) : q - d < 0;
          const sweptCell = edge ? -1 : dir > 0 ? this.cell(s, q + s.size - 1 + d, 0) : this.cell(s, q - d, 0);
          if (edge || grid[sweptCell] === WALL) {
            clear = false;
            break;
          }
          const o = grid[sweptCell]!;
          if (o) {
            const j = o - 1;
            if (j === r || mask.includes(j)) {
              counted = true;
              break;
            }
            inWay++;
            if (!further.includes(j)) further.push(j);
          }
          if (!this.crosses(s, q + dir * d, red, lo, hi)) break;
        }
        if (clear && inWay === 0) counted = true;
        if (counted) break;
      }
      if (!counted && further.length) needs.push(further);
      else if (!counted && !further.length) return Infinity; // walls both ways
    }
    let extra = 0;
    const used = new Set<number>();
    for (const set of needs) {
      if (set.some((j) => used.has(j))) continue;
      set.forEach((j) => used.add(j));
      extra++;
    }
    return 1 + blockers + extra;
  }

  /** Does slider `s` at `q` cover a cell of `red`'s lane between `lo` and `hi`? */
  private crosses(s: Slider, q: number, red: Slider, lo: number, hi: number): boolean {
    if (s.horizontal === red.horizontal) {
      return s.line === red.line && q < hi && q + s.size > lo;
    }
    return s.line >= lo && s.line < hi && red.line >= q && red.line < q + s.size;
  }
}

/** A pool of states, each `n` bytes, keyed, with parents: the memory of a search. */
export class Pool {
  readonly n: number;
  data: Uint8Array;
  readonly parent: number[] = [];
  readonly depth: number[] = [];
  readonly index = new Map<string, number>();
  count = 0;

  constructor(n: number, capacity = 1024) {
    this.n = n;
    this.data = new Uint8Array(Math.max(1, n) * capacity);
  }

  key(state: Uint8Array, offset: number): string {
    return String.fromCharCode.apply(null, state.subarray(offset, offset + this.n) as unknown as number[]);
  }

  /** Add a state unless it is known; its index, or -1 when known. */
  add(state: Uint8Array, offset: number, parent: number, depth: number): number {
    const key = this.key(state, offset);
    if (this.index.has(key)) return -1;
    const i = this.count++;
    if ((i + 1) * this.n > this.data.length) {
      const bigger = new Uint8Array(this.data.length * 2);
      bigger.set(this.data);
      this.data = bigger;
    }
    this.data.set(state.subarray(offset, offset + this.n), i * this.n);
    this.index.set(key, i);
    this.parent.push(parent);
    this.depth.push(depth);
    return i;
  }

  /** A known state's index, or undefined. */
  find(state: Uint8Array, offset: number): number | undefined {
    return this.index.get(this.key(state, offset));
  }

  offset(i: number): number {
    return i * this.n;
  }

  /** The moves from the root to state `i`. */
  path(win: Window, i: number): Move[] {
    const moves: Move[] = [];
    for (let at = i; this.parent[at]! >= 0; at = this.parent[at]!) {
      const p = this.parent[at]!;
      const a = this.offset(p), b = this.offset(at);
      for (let k = 0; k < this.n; k++) {
        if (this.data[a + k] !== this.data[b + k]) moves.push(win.move(k, this.data[a + k]!, this.data[b + k]!));
      }
    }
    return moves.reverse();
  }
}

/** The window round a block's run: `along` cells beyond each end of the run on its axis,
 * `across` on each side. */
export function runWindow(b: { x: number; y: number; w: number; h: number }, run: { from: number; to: number }, along: number, across: number): Rect {
  const horizontal = b.w > b.h;
  const lo = Math.min(run.from, run.to) - along, hi = Math.max(run.from, run.to) + (horizontal ? b.w : b.h) + along;
  return horizontal
    ? { x: lo, y: b.y - across, width: hi - lo, height: b.h + 2 * across }
    : { x: b.x - across, y: lo, width: b.w + 2 * across, height: hi - lo };
}
