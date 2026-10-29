import type { Camera, Point } from "./camera";

export type Square = { id: number; x: number; y: number; size: number };

export type Scene = {
  camera: Camera;
  /** Drawn in order, so the last square is on top. */
  squares: Square[];
  /** Where the last tap landed, in world coordinates. */
  circle: Point | null;
  /** The square being dragged, drawn in another colour. */
  draggingId: number | null;
};

export function initialScene(width: number, height: number): Scene {
  const at: [number, number][] = [[-260, -180], [40, -120], [-120, 60], [200, 120], [-40, 280], [320, -260]];
  return {
    camera: { scale: 1, offsetX: width / 2, offsetY: height / 2 },
    squares: at.map(([x, y], id) => ({ id, x, y, size: 90 })),
    circle: null,
    draggingId: null,
  };
}

/** The topmost square under a world point. */
export function squareAt(scene: Scene, world: Point): Square | null {
  for (let i = scene.squares.length - 1; i >= 0; i--) {
    const s = scene.squares[i]!;
    if (world.x >= s.x && world.x <= s.x + s.size && world.y >= s.y && world.y <= s.y + s.size) return s;
  }
  return null;
}

export function bringToFront(scene: Scene, id: number): void {
  const index = scene.squares.findIndex((s) => s.id === id);
  if (index >= 0) scene.squares.push(...scene.squares.splice(index, 1));
}
