import { pan, pinch, toWorld, zoomAt, type Camera, type Point } from "./camera";
import { limits, quickPush, record, visibleBlocks, type Scene } from "./scene";
import { UNIT, type Block, type Ui } from "./layout";
import { blockAt, slideRange, type Move } from "./rules";

/** UI blocks that are also sliders: a drag on them adjusts instead of panning. */
const SLIDERS = new Set<Ui>(["density", "ease"]);

/** A press that moves less than this many screen pixels is a tap. */
export const TAP_SLOP = 10;

type Mode =
  | { kind: "idle" }
  /** One pointer down, not yet moved past the tap slop. */
  | { kind: "pressed"; id: number; start: Point; block: Block | null }
  | { kind: "panning"; id: number; last: Point }
  /** `grab` is where the finger went down, `lo`..`hi` how far the block can slide. */
  | { kind: "dragging"; id: number; block: Block; grab: Point; lo: number; hi: number }
  /** Dragging sideways on the density block. */
  | { kind: "adjusting"; id: number; ui: Ui; start: Point; dx: number }
  | { kind: "pinching"; ids: [number, number]; from: [Point, Point]; start: Camera };

/**
 * Turns pointer events (screen coordinates) into scene changes: a tap on the background
 * moves the circle and a tap on a block pushes it to the end of its room (see quickPush),
 * one finger pans the background or slides a block along its long axis until it hits
 * another block, two fingers pinch-zoom and pan.
 * UI blocks and walls never move: dragging one pans, tapping a UI block calls `onUi` with
 * its kind. The density and ease blocks are also sliders: dragging on one calls `onAdjust`
 * with how far the finger has moved sideways since the press (screen px), and once more
 * with `done`.
 * `onChange` runs when a block was moved, to store it.
 */
export class Gestures {
  private mode: Mode = { kind: "idle" };
  private readonly pointers = new Map<number, Point>();

  constructor(
    private readonly scene: Scene,
    {
      onChange = () => {},
      onUi = () => {},
      onAdjust = () => {},
      onPush = () => {},
    }: {
      onChange?: () => void;
      onUi?: (ui: Ui) => void;
      onAdjust?: (ui: Ui, dx: number, done: boolean) => void;
      /** A tap pushed a block (to animate it). */
      onPush?: (move: Move) => void;
    } = {},
  ) {
    this.onChange = onChange;
    this.onUi = onUi;
    this.onAdjust = onAdjust;
    this.onPush = onPush;
  }

  private readonly onPush: (move: Move) => void;

  private readonly onChange: () => void;
  private readonly onUi: (ui: Ui) => void;
  private readonly onAdjust: (ui: Ui, dx: number, done: boolean) => void;

  down(id: number, at: Point): void {
    this.pointers.set(id, at);
    if (this.pointers.size === 2) {
      this.startPinch();
    } else if (this.pointers.size === 1) {
      const block = blockAt(visibleBlocks(this.scene), this.lattice(at));
      this.mode = { kind: "pressed", id, start: at, block };
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
      } else {
        const { lo, hi } = slideRange(this.scene.layout, mode.block, this.scene);
        this.mode = { kind: "dragging", id, block: mode.block, grab: this.lattice(mode.start), lo, hi };
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
          record(this.scene, move);
          this.onPush(move);
          this.onChange();
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
    this.scene.camera = zoomAt(this.scene.camera, at, Math.exp(-deltaY * 0.002), limits(this.scene));
  }

  private lattice(screen: Point): Point {
    const world = toWorld(this.scene.camera, screen);
    return { x: world.x / UNIT, y: world.y / UNIT };
  }

  private apply(id: number, at: Point): void {
    const mode = this.mode;
    if (mode.kind === "panning" && mode.id === id) {
      this.scene.camera = pan(this.scene.camera, at.x - mode.last.x, at.y - mode.last.y);
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
      this.scene.camera = pinch(mode.start, mode.from, now, limits(this.scene));
    }
  }

  private startPinch(): void {
    // A block being dragged is dropped where it is; the second finger moves the map.
    this.drop();
    this.finishAdjust();
    const ids = [...this.pointers.keys()] as [number, number];
    const from = ids.map((p) => this.pointers.get(p)!) as [Point, Point];
    this.mode = { kind: "pinching", ids, from, start: this.scene.camera };
  }

  /** Snap the dragged block to the nearest lattice position and store where it is. A block
   * back on its start position has nothing to store: its move is forgotten. */
  private drop(): void {
    const drag = this.scene.dragging;
    if (drag === null || this.mode.kind !== "dragging") return;
    const { block } = this.mode;
    const at = { x: Math.round(drag.x), y: Math.round(drag.y) };
    this.scene.dragging = null;
    if (at.x === block.x && at.y === block.y) return;
    record(this.scene, { id: block.id, from: { x: block.x, y: block.y }, to: at });
    this.onChange();
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
    this.drop();
    this.finishAdjust();
    // Lifting one finger of a pinch keeps panning with the other, never a tap.
    const [rest] = [...this.pointers];
    if (mode.kind === "pinching" && rest) {
      this.mode = { kind: "panning", id: rest[0], last: rest[1] };
    } else if (this.pointers.size === 0) {
      this.mode = { kind: "idle" };
    }
  }
}
