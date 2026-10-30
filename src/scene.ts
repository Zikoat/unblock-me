import { worldRect, type Camera, type Limits, type Point, type Rect } from "./camera";
import type { Goal } from "./goal";
import { randomLayout, UNIT, type Block, type Layout } from "./layout";
import { blocksIn, isHorizontal, position, slide, type Move } from "./rules";

/** Zoomed out fully, this many world units take a third of the screen width. */
const MIN_ZOOM_SPAN = 670;
/** The culling border is this share of the screen, centred. */
export const BORDER = 0.8;

/** How far a tap sends a block when nothing stops it on that side. */
export const QUICK_PUSH_MAX = 8;

export type Scene = {
  camera: Camera;
  /** Screen size in CSS pixels. */
  width: number;
  height: number;
  /** Where the blocks start. */
  layout: Layout;
  /** Blocks that were moved: id -> lattice position. The rest are where the layout put them. */
  moved: Map<string, Point>;
  /** Every move since the board was laid out, oldest first, for undo. */
  history: Move[];
  /** The red block and its target, once one has been made for this layout. */
  goal: Goal | null;
  /** The red block has been on its target at least once. */
  reached: boolean;
  /** Where the last tap landed, in world coordinates. */
  circle: Point | null;
  /** A stuck block the finger is on: it cannot move either way, so the drag pans instead. */
  stuckId: string | null;
  /** The block being dragged and where it is right now, in (fractional) lattice units. */
  dragging: { id: string; x: number; y: number } | null;
  /** Cull to the smaller border (and draw it), or to the screen edge. */
  border: boolean;
};

export function newScene(
  width: number,
  height: number,
  {
    layout = randomLayout(1),
    moved = new Map<string, Point>(),
    history = [] as Move[],
    border = true,
    goal = null as Goal | null,
    reached = false,
  }: { layout?: Layout; moved?: Map<string, Point>; history?: Move[]; border?: boolean; goal?: Goal | null; reached?: boolean } = {},
): Scene {
  const scene: Scene = { camera: centred(width, height), width, height, layout, moved, history, goal, reached, circle: null, dragging: null, stuckId: null, border };
  return resize(scene, width, height);
}

/** The middle of the reset block (lattice cell 0,0) in the middle of the screen at scale 1. */
export function centred(width: number, height: number): Camera {
  return { scale: 1, offsetX: width / 2 - UNIT / 2, offsetY: height / 2 - UNIT / 2 };
}

/** Swap in another layout where the view is; moves and the goal belong to the old one. */
export function relayout(scene: Scene, layout: Layout): void {
  scene.layout = layout;
  scene.moved.clear();
  scene.history.length = 0;
  scene.goal = null;
  scene.reached = false;
  scene.dragging = null;
}

/** Put a block at `to`; a block back on its start position has nothing stored. */
function put(scene: Scene, id: string, to: Point): void {
  const start = scene.layout.byId(id)!;
  if (to.x === start.x && to.y === start.y) scene.moved.delete(id);
  else scene.moved.set(id, to);
}

/** Make a move (already checked legal) and remember it for undo. */
export function record(scene: Scene, move: Move): void {
  put(scene, move.id, move.to);
  scene.history.push(move);
}

/** Take back the last move. Always legal: nothing else moved since, so the cells it came
 * from are still free. Returns the move undone, or null when there is none. */
export function undo(scene: Scene): Move | null {
  const move = scene.history.pop() ?? null;
  if (move) put(scene, move.id, move.from);
  return move;
}

/**
 * Where a tap sends a block: all the way up (a vertical block) or right (a horizontal one);
 * a block already against that end goes all the way the other way instead. An end with
 * nothing in reach stops after QUICK_PUSH_MAX cells. Null when it cannot move.
 */
export function quickPush(scene: Scene, block: Block): Point | null {
  const s = slide(scene.layout, block, scene);
  const pos = position(block);
  const lo = s.before ? s.lo : Math.max(s.lo, pos - QUICK_PUSH_MAX);
  const hi = s.after ? s.hi : Math.min(s.hi, pos + QUICK_PUSH_MAX);
  if (lo === pos && hi === pos) return null;
  // Up is towards lower y, right towards higher x.
  const up = !isHorizontal(block);
  const toLow = up ? lo !== pos : hi === pos;
  const to = toLow ? lo : hi;
  return isHorizontal(block) ? { x: to, y: block.y } : { x: block.x, y: to };
}

/** Where a block is now (it may be off screen). */
export function whereIs(scene: Scene, id: string): Point | null {
  const home = scene.layout.byId(id);
  return scene.moved.get(id) ?? (home ? { x: home.x, y: home.y } : null);
}

/** Is the red block on its target? */
export function goalSolved(scene: Scene): boolean {
  const goal = scene.goal;
  const at = goal && whereIs(scene, goal.id);
  return !!goal && !!at && at.x === goal.target.x && at.y === goal.target.y;
}

/** Start over with a new layout: every move, the goal and the circle are forgotten. */
export function restart(scene: Scene, layout: Layout): void {
  relayout(scene, layout);
  scene.circle = null;
  scene.camera = centred(scene.width, scene.height);
  resize(scene, scene.width, scene.height);
}

/** Max zoom: two lattice cells fill the width. Min zoom: MIN_ZOOM_SPAN fills a third of it. */
export function limits(scene: Scene): Limits {
  return { min: scene.width / (3 * MIN_ZOOM_SPAN), max: scene.width / (2 * UNIT) };
}

export function resize(scene: Scene, width: number, height: number): Scene {
  scene.width = width;
  scene.height = height;
  const { min, max } = limits(scene);
  const scale = Math.min(max, Math.max(min, scene.camera.scale));
  // Keep the screen centre where it was.
  const cx = (width / 2 - scene.camera.offsetX) / scene.camera.scale;
  const cy = (height / 2 - scene.camera.offsetY) / scene.camera.scale;
  scene.camera = { scale, offsetX: width / 2 - cx * scale, offsetY: height / 2 - cy * scale };
  return scene;
}

/** The culling border in screen pixels: the smaller border, or the screen when it is off. */
export function borderOnScreen(scene: Scene): Rect {
  const share = scene.border ? BORDER : 1;
  const margin = (1 - share) / 2;
  return { x: scene.width * margin, y: scene.height * margin, width: scene.width * share, height: scene.height * share };
}

/** A screen rectangle in lattice units. */
export function latticeRect(scene: Scene, screen: Rect): Rect {
  const r = worldRect(scene.camera, screen);
  return { x: r.x / UNIT, y: r.y / UNIT, width: r.width / UNIT, height: r.height / UNIT };
}

/** The blocks to draw and hit-test: only those at least partly inside the border. The
 * dragged block is shown where the finger has it and drawn on top. */
export function visibleBlocks(scene: Scene): Block[] {
  const blocks = blocksIn(scene.layout, latticeRect(scene, borderOnScreen(scene)), scene);
  const drag = scene.dragging;
  const index = drag ? blocks.findIndex((b) => b.id === drag.id) : -1;
  if (drag && index >= 0) blocks.push({ ...blocks.splice(index, 1)[0]!, x: drag.x, y: drag.y });
  return blocks;
}
