export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** Maps world to screen: screen = world * scale + offset. The renderer applies this once
 * as the canvas transform, so everything drawn in world units zooms and pans together. */
export type Camera = { scale: number; offsetX: number; offsetY: number };
export type Limits = { min: number; max: number };

export const NO_LIMITS: Limits = { min: 0, max: Infinity };

const clamp = (scale: number, limits: Limits) => Math.min(limits.max, Math.max(limits.min, scale));

export function toWorld(camera: Camera, screen: Point): Point {
  return { x: (screen.x - camera.offsetX) / camera.scale, y: (screen.y - camera.offsetY) / camera.scale };
}

export function toScreen(camera: Camera, world: Point): Point {
  return { x: world.x * camera.scale + camera.offsetX, y: world.y * camera.scale + camera.offsetY };
}

/** The world area under a screen rectangle. */
export function worldRect(camera: Camera, screen: Rect): Rect {
  const corner = toWorld(camera, screen);
  return { ...corner, width: screen.width / camera.scale, height: screen.height / camera.scale };
}

/** The camera that shows `world` at screen point `screen` with the given scale. */
function anchored(world: Point, screen: Point, scale: number): Camera {
  return { scale, offsetX: screen.x - world.x * scale, offsetY: screen.y - world.y * scale };
}

export function pan(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, offsetX: camera.offsetX + dx, offsetY: camera.offsetY + dy };
}

/** Zoom by `factor` keeping the world point under `screen` in place (mouse wheel). */
export function zoomAt(camera: Camera, screen: Point, factor: number, limits = NO_LIMITS): Camera {
  return anchored(toWorld(camera, screen), screen, clamp(camera.scale * factor, limits));
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Two-finger gesture like Google Maps without rotation: the world point that was under
 * the midpoint of the fingers at `start` stays under their current midpoint, and the
 * scale follows the change in finger distance. Zoom and pan happen together.
 */
export function pinch(start: Camera, from: [Point, Point], to: [Point, Point], limits = NO_LIMITS): Camera {
  const ratio = distance(...to) / Math.max(1, distance(...from));
  return anchored(toWorld(start, midpoint(...from)), midpoint(...to), clamp(start.scale * ratio, limits));
}
