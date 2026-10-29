import { pan, pinch, toWorld, zoomAt, type Camera, type Point } from "./camera";
import { limits, visibleSquares, type Scene } from "./scene";
import { squareAt } from "./world";

/** A press that moves less than this many screen pixels is a tap. */
export const TAP_SLOP = 10;

type Mode =
  | { kind: "idle" }
  /** One pointer down, not yet moved past the tap slop. */
  | { kind: "pressed"; id: number; start: Point; squareId: string | null; corner: Point | null }
  | { kind: "panning"; id: number; last: Point }
  | { kind: "dragging"; id: number; squareId: string; grab: Point }
  | { kind: "pinching"; ids: [number, number]; from: [Point, Point]; start: Camera };

/**
 * Turns pointer events (screen coordinates) into scene changes: tap moves the circle,
 * one finger pans the background or drags a square, two fingers pinch-zoom and pan.
 * `onMoved` runs when a dragged square is dropped, to store the moves.
 */
export class Gestures {
  private mode: Mode = { kind: "idle" };
  private readonly pointers = new Map<number, Point>();

  constructor(private readonly scene: Scene, private readonly onMoved: () => void = () => {}) {}

  down(id: number, at: Point): void {
    this.pointers.set(id, at);
    if (this.pointers.size === 2) {
      this.startPinch();
    } else if (this.pointers.size === 1) {
      const square = squareAt(visibleSquares(this.scene), toWorld(this.scene.camera, at));
      this.mode = { kind: "pressed", id, start: at, squareId: square?.id ?? null, corner: square };
    }
    // A third finger is ignored until one of the first two lifts.
  }

  move(id: number, at: Point): void {
    if (!this.pointers.has(id)) return; // a hovering mouse
    this.pointers.set(id, at);
    const mode = this.mode;
    if (mode.kind === "pressed" && mode.id === id) {
      if (Math.hypot(at.x - mode.start.x, at.y - mode.start.y) < TAP_SLOP) return;
      if (mode.squareId === null || mode.corner === null) {
        this.mode = { kind: "panning", id, last: mode.start };
      } else {
        const world = toWorld(this.scene.camera, mode.start);
        this.mode = { kind: "dragging", id, squareId: mode.squareId, grab: { x: world.x - mode.corner.x, y: world.y - mode.corner.y } };
        this.scene.draggingId = mode.squareId;
      }
    }
    this.apply(id, at);
  }

  up(id: number, at: Point): void {
    if (!this.pointers.delete(id)) return;
    const mode = this.mode;
    if (mode.kind === "pressed" && mode.id === id) {
      this.scene.circle = toWorld(this.scene.camera, mode.start);
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

  private apply(id: number, at: Point): void {
    const mode = this.mode;
    if (mode.kind === "panning" && mode.id === id) {
      this.scene.camera = pan(this.scene.camera, at.x - mode.last.x, at.y - mode.last.y);
      mode.last = at;
    } else if (mode.kind === "dragging" && mode.id === id) {
      const world = toWorld(this.scene.camera, at);
      this.scene.moved.set(mode.squareId, { x: world.x - mode.grab.x, y: world.y - mode.grab.y });
    } else if (mode.kind === "pinching" && mode.ids.includes(id)) {
      const now = mode.ids.map((p) => this.pointers.get(p)!) as [Point, Point];
      this.scene.camera = pinch(mode.start, mode.from, now, limits(this.scene));
    }
  }

  private startPinch(): void {
    // A square being dragged is dropped where it is; the second finger moves the map.
    this.drop();
    const ids = [...this.pointers.keys()] as [number, number];
    const from = ids.map((p) => this.pointers.get(p)!) as [Point, Point];
    this.mode = { kind: "pinching", ids, from, start: this.scene.camera };
  }

  private drop(): void {
    if (this.scene.draggingId === null) return;
    this.scene.draggingId = null;
    this.onMoved();
  }

  private end(id: number): void {
    const mode = this.mode;
    const involved = "ids" in mode ? mode.ids.includes(id) : "id" in mode && mode.id === id;
    if (!involved) return;
    this.drop();
    // Lifting one finger of a pinch keeps panning with the other, never a tap.
    const [rest] = [...this.pointers];
    if (mode.kind === "pinching" && rest) {
      this.mode = { kind: "panning", id: rest[0], last: rest[1] };
    } else if (this.pointers.size === 0) {
      this.mode = { kind: "idle" };
    }
  }
}
