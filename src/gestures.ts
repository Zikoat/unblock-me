import { pan, pinch, toWorld, zoomAt, type Camera, type Point } from "./camera";
import { limits, quickPush, record, visibleBlocks, type Scene } from "./scene";
import { UNIT, type Block, type Ui } from "./layout";
import { blockAt, slideRange, type Move } from "./rules";

/** UI blocks that are also sliders: a drag on them adjusts instead of panning. */
const SLIDERS = new Set<Ui>(["density"]);

/** A press that moves less than this many screen pixels is a tap. */
export const TAP_SLOP = 10;

/** How the last block move was made, for the play log: a tap's push or a drag, how long the
 * finger was down (ms), and how long since the last pan or pinch ended (ms; null if none yet). */
export type Input = { how: "tap" | "drag"; ms: number; sincePan: number | null };

/** A pan starting this soon after a tap's push is logged: a tap that maybe meant to pan. */
const PAN_AFTER_PUSH_MS = 1500;

type Mode =
  | { kind: "idle" }
  /** One pointer down, not yet moved past the tap slop. */
  | { kind: "pressed"; id: number; start: Point; block: Block | null; at: number }
  | { kind: "panning"; id: number; last: Point }
  /** `grab` is where the finger went down, `lo`..`hi` how far the block can slide. */
  | { kind: "dragging"; id: number; block: Block; grab: Point; lo: number; hi: number; at: number }
  /** Dragging sideways on the density block. */
  | { kind: "adjusting"; id: number; ui: Ui; start: Point; dx: number }
  | { kind: "pinching"; ids: [number, number]; from: [Point, Point]; start: Camera };

/**
 * Turns pointer events (screen coordinates) into scene changes: a tap on the background
 * moves the circle and a tap on a block pushes it to the end of its room (see quickPush),
 * one finger pans the background or slides a block along its long axis until it hits
 * another block (a block that cannot move either way pans), two fingers pinch-zoom and pan.
 * UI blocks and walls never move: dragging one pans, tapping a UI block calls `onUi` with
 * its kind. The density block is also a slider: dragging on it calls `onAdjust` with how
 * far the finger has moved sideways since the press (screen px), and once more with `done`.
 * `onChange` runs when a block was moved, to store it.
 */
export class Gestures {
  private mode: Mode = { kind: "idle" };
  private readonly pointers = new Map<number, Point>();
  /** When the last pan or pinch ended, and the last tap that pushed a block. */
  private panEnded: number | null = null;
  private pushedAt: number | null = null;

  constructor(
    private readonly scene: Scene,
    {
      onChange = () => {},
      onUi = () => {},
      onAdjust = () => {},
      onPush = () => {},
      onStuck = () => {},
      onPanAfterPush = () => {},
      onInput = () => {},
      onSnap = () => {},
      now = () => performance.now(),
    }: {
      onChange?: () => void;
      onUi?: (ui: Ui) => void;
      onAdjust?: (ui: Ui, dx: number, done: boolean) => void;
      /** A tap pushed a block (to animate it). */
      onPush?: (move: Move) => void;
      /** A tap on a block that cannot move either way (to shake it). */
      onStuck?: (id: string) => void;
      /** A pan or pinch began soon after a tap pushed a block (ms since): maybe the tap was a
       * pan that didn't get past the tap slop. */
      onPanAfterPush?: (ms: number) => void;
      /** How the move about to be recorded was made (just before onChange). */
      onInput?: (input: Input) => void;
      /** A dropped red block slides on into its target (to animate it): from where it was
       * dropped to the target. Just before the move is recorded. */
      onSnap?: (slide: Move) => void;
      now?: () => number;
    } = {},
  ) {
    this.onChange = onChange;
    this.onUi = onUi;
    this.onAdjust = onAdjust;
    this.onPush = onPush;
    this.onStuck = onStuck;
    this.onPanAfterPush = onPanAfterPush;
    this.onInput = onInput;
    this.onSnap = onSnap;
    this.now = now;
  }

  private readonly onSnap: (slide: Move) => void;
  private readonly onInput: (input: Input) => void;
  private readonly onPanAfterPush: (ms: number) => void;
  private readonly now: () => number;

  private readonly onStuck: (id: string) => void;

  private readonly onPush: (move: Move) => void;

  private readonly onChange: () => void;
  private readonly onUi: (ui: Ui) => void;
  private readonly onAdjust: (ui: Ui, dx: number, done: boolean) => void;

  down(id: number, at: Point): void {
    // Outside the island square being played, touches do nothing.
    const cell = this.lattice(at);
    if (this.scene.locked && !this.scene.locked.some((r) => cell.x >= r.x && cell.x < r.x + r.width && cell.y >= r.y && cell.y < r.y + r.height)) return;
    this.pointers.set(id, at);
    if (this.pointers.size === 2) {
      this.startPinch();
      this.panStarted();
    } else if (this.pointers.size === 1) {
      const block = blockAt(visibleBlocks(this.scene), this.lattice(at));
      this.mode = { kind: "pressed", id, start: at, block, at: this.now() };
    }
    // A third finger is ignored until one of the first two lifts.
  }

  move(id: number, at: Point): void {
    if (!this.pointers.has(id)) return; // a hovering mouse
    this.pointers.set(id, at);
    const mode = this.mode;
    if (mode.kind === "pressed" && mode.id === id) {
      if (Math.hypot(at.x - mode.start.x, at.y - mode.start.y) < TAP_SLOP) return;
      if (mode.block?.ui && SLIDERS.has(mode.block.ui)) {
        this.mode = { kind: "adjusting", id, ui: mode.block.ui, start: mode.start, dx: 0 };
      } else if (mode.block === null || mode.block.ui || mode.block.wall) {
        this.mode = { kind: "panning", id, last: mode.start };
        this.panStarted();
      } else {
        const { lo, hi } = slideRange(this.scene.layout, mode.block, this.scene);
        if (lo === hi) {
          // Stuck against blocks at both ends: there is nothing to slide, so pan instead.
          this.scene.stuckId = mode.block.id;
          this.mode = { kind: "panning", id, last: mode.start };
          this.panStarted();
        } else {
          this.mode = { kind: "dragging", id, block: mode.block, grab: this.lattice(mode.start), lo, hi, at: mode.at };
        }
      }
    }
    this.apply(id, at);
  }

  up(id: number, at: Point): void {
    if (!this.pointers.delete(id)) return;
    const mode = this.mode;
    if (mode.kind === "pressed" && mode.id === id) {
      if (mode.block === null) {
        this.scene.circle = toWorld(this.scene.camera, mode.start);
      } else if (mode.block.ui) {
        this.onUi(mode.block.ui);
      } else if (!mode.block.wall) {
        const to = quickPush(this.scene, mode.block);
        if (to) {
          const move = { id: mode.block.id, from: { x: mode.block.x, y: mode.block.y }, to };
          this.onInput(this.inputFor("tap", mode.at));
          this.pushedAt = this.now();
          record(this.scene, move);
          this.onPush(move);
          this.onChange();
        } else {
          this.onStuck(mode.block.id);
        }
      }
    }
    this.end(id);
  }

  /** The browser took the pointer away (e.g. a system gesture): no tap. */
  cancel(id: number): void {
    if (this.pointers.delete(id)) this.end(id);
  }

  wheel(at: Point, deltaY: number): void {
    if (this.scene.locked) return;
    this.scene.camera = zoomAt(this.scene.camera, at, Math.exp(-deltaY * 0.002), limits(this.scene));
  }

  private lattice(screen: Point): Point {
    const world = toWorld(this.scene.camera, screen);
    return { x: world.x / UNIT, y: world.y / UNIT };
  }

  private apply(id: number, at: Point): void {
    const mode = this.mode;
    if (mode.kind === "panning" && mode.id === id) {
      if (!this.scene.locked) this.scene.camera = pan(this.scene.camera, at.x - mode.last.x, at.y - mode.last.y);
      mode.last = at;
    } else if (mode.kind === "dragging" && mode.id === id) {
      // The block follows the finger along its long axis only, and stops at other blocks.
      const now = this.lattice(at);
      const { block, grab, lo, hi } = mode;
      const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
      this.scene.dragging = block.w > block.h
        ? { id: block.id, x: clamp(block.x + now.x - grab.x), y: block.y }
        : { id: block.id, x: block.x, y: clamp(block.y + now.y - grab.y) };
    } else if (mode.kind === "adjusting" && mode.id === id) {
      mode.dx = at.x - mode.start.x;
      this.onAdjust(mode.ui, mode.dx, false);
    } else if (mode.kind === "pinching" && mode.ids.includes(id)) {
      const now = mode.ids.map((p) => this.pointers.get(p)!) as [Point, Point];
      if (!this.scene.locked) this.scene.camera = pinch(mode.start, mode.from, now, limits(this.scene));
    }
  }

  private startPinch(): void {
    // A block being dragged is dropped where it is; the second finger moves the map.
    this.scene.stuckId = null;
    this.drop();
    this.finishAdjust();
    const ids = [...this.pointers.keys()] as [number, number];
    const from = ids.map((p) => this.pointers.get(p)!) as [Point, Point];
    this.mode = { kind: "pinching", ids, from, start: this.scene.camera };
  }

  /** Snap the dragged block to the nearest lattice position and store where it is. A block
   * back on its start position has nothing to store: its move is forgotten. The red block
   * dropped partly on its target, with the target free, slides the rest of the way in. */
  private drop(): void {
    const drag = this.scene.dragging;
    if (drag === null || this.mode.kind !== "dragging") return;
    const { block, lo, hi } = this.mode;
    const dropped = { x: Math.round(drag.x), y: Math.round(drag.y) };
    this.scene.dragging = null;
    const goal = this.scene.goal, horizontal = block.w > block.h;
    const along = (p: Point) => (horizontal ? p.x : p.y);
    const target = goal?.id === block.id ? goal.target : null;
    const partly = target && (horizontal ? target.y === dropped.y : target.x === dropped.x) && along(target) >= lo && along(target) <= hi
      && along(dropped) !== along(target) && Math.abs(along(dropped) - along(target)) < (horizontal ? block.w : block.h);
    const at = partly ? target : dropped;
    if (at.x === block.x && at.y === block.y) return;
    this.onInput(this.inputFor("drag", this.mode.at));
    if (partly) this.onSnap({ id: block.id, from: dropped, to: at });
    record(this.scene, { id: block.id, from: { x: block.x, y: block.y }, to: at });
    this.onChange();
  }

  private inputFor(how: Input["how"], pressed: number): Input {
    const now = this.now();
    return { how, ms: Math.round(now - pressed), sincePan: this.panEnded === null ? null : Math.round(now - this.panEnded) };
  }

  /** A pan or pinch begins: report it if a tap pushed a block just before. */
  private panStarted(): void {
    if (this.pushedAt === null) return;
    const ms = this.now() - this.pushedAt;
    this.pushedAt = null;
    if (ms < PAN_AFTER_PUSH_MS) this.onPanAfterPush(Math.round(ms));
  }

  private finishAdjust(): void {
    const mode = this.mode;
    if (mode.kind !== "adjusting") return;
    this.onAdjust(mode.ui, mode.dx, true);
  }

  private end(id: number): void {
    const mode = this.mode;
    const involved = "ids" in mode ? mode.ids.includes(id) : "id" in mode && mode.id === id;
    if (!involved) return;
    this.scene.stuckId = null;
    this.drop();
    this.finishAdjust();
    if (mode.kind === "panning" || mode.kind === "pinching") this.panEnded = this.now();
    // Lifting one finger of a pinch keeps panning with the other, never a tap.
    const [rest] = [...this.pointers];
    if (mode.kind === "pinching" && rest) {
      this.mode = { kind: "panning", id: rest[0], last: rest[1] };
    } else if (this.pointers.size === 0) {
      this.mode = { kind: "idle" };
    }
  }
}
