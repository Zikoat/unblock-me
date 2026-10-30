import { worldRect, type Camera, type Limits, type Point, type Rect } from "./camera";
import { randomLayout, UNIT, type Block, type Layout } from "./layout";
import { blocksIn } from "./rules";

/** Zoomed out fully, this many world units take a third of the screen width. */
const MIN_ZOOM_SPAN = 670;
/** The culling border is this share of the screen, centred. */
export const BORDER = 0.8;

export type Scene = {
  camera: Camera;
  /** Screen size in CSS pixels. */
  width: number;
  height: number;
  /** Where the blocks start. */
  layout: Layout;
  /** Blocks that were dragged: id -> lattice position. The rest are where the layout put them. */
  moved: Map<string, Point>;
  /** Blocks that were tapped. */
  tapped: Set<string>;
  /** Where the last tap landed, in world coordinates. */
  circle: Point | null;
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
    tapped = new Set<string>(),
    border = true,
  }: { layout?: Layout; moved?: Map<string, Point>; tapped?: Set<string>; border?: boolean } = {},
): Scene {
  const scene: Scene = { camera: centred(width, height), width, height, layout, moved, tapped, circle: null, dragging: null, border };
  return resize(scene, width, height);
}

/** The middle of the reset block (lattice cell 0,0) in the middle of the screen at scale 1. */
export function centred(width: number, height: number): Camera {
  return { scale: 1, offsetX: width / 2 - UNIT / 2, offsetY: height / 2 - UNIT / 2 };
}

/** Start over with a new layout: every move, mark and the circle are forgotten. */
export function restart(scene: Scene, layout: Layout): void {
  scene.layout = layout;
  scene.moved.clear();
  scene.tapped.clear();
  scene.circle = null;
  scene.dragging = null;
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
