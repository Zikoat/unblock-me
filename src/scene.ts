import { worldRect, type Camera, type Limits, type Point, type Rect } from "./camera";
import { SQUARE_SIZE, squaresIn, type Square } from "./world";

/** Zoomed out fully, this many world units take a third of the screen width (the spread of
 * the first six hand-placed squares). */
const MIN_ZOOM_SPAN = 670;
/** The culling border is this share of the screen, centred. */
export const BORDER = 0.8;

export type Scene = {
  camera: Camera;
  /** Screen size in CSS pixels. */
  width: number;
  height: number;
  /** Squares that were dragged: id -> top-left corner. Everything else is generated. */
  moved: Map<string, Point>;
  /** Where the last tap landed, in world coordinates. */
  circle: Point | null;
  /** The square being dragged, drawn in another colour. */
  draggingId: string | null;
};

export function newScene(width: number, height: number, moved = new Map<string, Point>()): Scene {
  const scene: Scene = { camera: { scale: 1, offsetX: width / 2, offsetY: height / 2 }, width, height, moved, circle: null, draggingId: null };
  return resize(scene, width, height);
}

/** Max zoom: two squares fill the width. Min zoom: MIN_ZOOM_SPAN fills a third of it. */
export function limits(scene: Scene): Limits {
  return { min: scene.width / (3 * MIN_ZOOM_SPAN), max: scene.width / (2 * SQUARE_SIZE) };
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

/** The culling border in screen pixels. */
export function borderOnScreen(scene: Scene): Rect {
  const margin = (1 - BORDER) / 2;
  return { x: scene.width * margin, y: scene.height * margin, width: scene.width * BORDER, height: scene.height * BORDER };
}

/** The squares to draw and hit-test: only those at least partly inside the border. */
export function visibleSquares(scene: Scene): Square[] {
  const squares = squaresIn(worldRect(scene.camera, borderOnScreen(scene)), scene.moved);
  // The dragged square draws on top of everything.
  const dragged = squares.findIndex((s) => s.id === scene.draggingId);
  if (dragged >= 0) squares.push(...squares.splice(dragged, 1));
  return squares;
}
