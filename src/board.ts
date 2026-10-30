// A board for searching: the layout plus moved blocks, indexed by cell so "who is here"
// costs one map lookup however many blocks have moved, with an undo log so a search can
// try moves and take them back without copying anything.
import type { Point } from "./camera";
import type { Block, Layout } from "./layout";
import type { Move } from "./rules";

const OFFSET = 1 << 20;
/** One number per cell (|x|, |y| < 2^20). */
export const cellKey = (x: number, y: number) => (x + OFFSET) * 2 * OFFSET + (y + OFFSET);

export const isFixed = (b: Block) => b.wall || b.ui !== null;

export class Board {
  /** Cells whose occupant differs from the layout's: id, or null for empty. */
  private over = new Map<number, string | null>();
  /** The layout's occupant of each cell looked at so far. */
  private base = new Map<number, string | null>();
  private homes = new Map<string, Block>();
  /** Current position of every block that is not at home. */
  readonly pos = new Map<string, Point>();
  private log: { id: string; from: Point }[] = [];

  constructor(private layout: Layout, moved: ReadonlyMap<string, Point> = new Map()) {
    for (const [id, p] of moved) {
      const home = this.home(id);
      if (!home) continue;
      this.fill(home, null);
      this.pos.set(id, { x: p.x, y: p.y });
    }
    for (const [id, p] of this.pos) {
      const home = this.home(id)!;
      this.fill({ ...home, x: p.x, y: p.y }, id);
    }
  }

  home(id: string): Block | undefined {
    let b = this.homes.get(id);
    if (!b) {
      b = this.layout.byId(id);
      if (b) this.homes.set(id, b);
    }
    return b;
  }

  private fill(b: { x: number; y: number; w: number; h: number }, id: string | null): void {
    for (let x = b.x; x < b.x + b.w; x++) for (let y = b.y; y < b.y + b.h; y++) this.over.set(cellKey(x, y), id);
  }

  /** The id of the block covering a cell, or null. */
  at(x: number, y: number): string | null {
    const k = cellKey(x, y);
    const o = this.over.get(k);
    if (o !== undefined) return o;
    let b = this.base.get(k);
    if (b === undefined) {
      const found = this.layout.blocksIn({ x, y, width: 1, height: 1 })[0];
      b = found ? found.id : null;
      if (found) this.homes.set(found.id, found);
      this.base.set(k, b);
    }
    return b;
  }

  /** A block where it is now. */
  block(id: string): Block {
    const home = this.home(id)!;
    const p = this.pos.get(id);
    return p ? { ...home, x: p.x, y: p.y, moved: true } : home;
  }

  /** Put a block somewhere (no legality check), logged for undo. */
  move(id: string, to: Point): void {
    const b = this.block(id);
    this.log.push({ id, from: { x: b.x, y: b.y } });
    this.place(b, to);
  }

  private place(b: Block, to: Point): void {
    this.fill(b, null);
    const home = this.home(b.id)!;
    if (to.x === home.x && to.y === home.y) this.pos.delete(b.id);
    else this.pos.set(b.id, { x: to.x, y: to.y });
    this.fill({ ...b, x: to.x, y: to.y }, b.id);
  }

  mark(): number {
    return this.log.length;
  }

  undo(mark: number): void {
    while (this.log.length > mark) {
      const { id, from } = this.log.pop()!;
      this.place(this.block(id), from);
    }
  }

  /** Is this a legal slide right now: the block is at `from`, slides on its axis, and every
   * cell it sweeps through is empty? */
  legal(m: Move): boolean {
    const b = this.home(m.id) && this.block(m.id);
    if (!b || isFixed(b) || b.x !== m.from.x || b.y !== m.from.y) return false;
    const horizontal = b.w > b.h;
    if (horizontal ? m.to.y !== b.y : m.to.x !== b.x) return false;
    const pos = horizontal ? b.x : b.y;
    const to = horizontal ? m.to.x : m.to.y;
    const size = horizontal ? b.w : b.h;
    const lo = Math.min(pos, to), hi = Math.max(pos, to) + size;
    for (let p = lo; p < hi; p++) {
      const o = horizontal ? this.at(p, b.y) : this.at(b.x, p);
      if (o !== null && o !== b.id) return false;
    }
    return true;
  }

  /** Play moves; true if all are legal. Leaves the board as it was either way. */
  replays(moves: Move[]): boolean {
    const mark = this.mark();
    let ok = true;
    for (const m of moves) {
      if (!this.legal(m)) {
        ok = false;
        break;
      }
      this.move(m.id, m.to);
    }
    this.undo(mark);
    return ok;
  }
}
