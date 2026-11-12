// A room's shape (src/room-core.ts has what it means and how it is checked); no imports, so the
// layout can use it.

/** A block in a room: top-left x, y in the box, and 1 if horizontal (2x1), 0 if vertical. */
export type RBlock = [number, number, 0 | 1];
export type Room = {
  id: string;
  W: number;
  H: number;
  /** Set blocks: the first `n` are R (red first), the rest keepers. */
  b: RBlock[];
  n: number;
  /** Walls (cells). */
  w: [number, number][];
  /** Reserved cells: swept by a shortest solution, empty at the start. */
  r: [number, number][];
  /** Red's target (top-left cell). */
  t: [number, number];
  /** Fewest moves, and the least and most extra moves over every shortest solution. */
  f: number;
  e: number;
  E: number;
  /** A shortest solution: block index, to (top-left cell). */
  p: [number, number, number][];
  /** Where it came from (for the logs). */
  from?: string;
};

export const laneAt = (b: RBlock): number => (b[2] ? b[0] : b[1]);
export const cellsOf = (b: RBlock): [number, number][] => (b[2] ? [[b[0], b[1]], [b[0] + 1, b[1]]] : [[b[0], b[1]], [b[0], b[1] + 1]]);

/** Each cell of the box: "s" set block, "w" wall, "r" reserved, "f" free. */
export function cellKinds(room: Room): string[] {
  const k = new Array<string>(room.W * room.H).fill("f");
  for (const b of room.b) for (const [x, y] of cellsOf(b)) k[y * room.W + x] = "s";
  for (const [x, y] of room.w) k[y * room.W + x] = "w";
  for (const [x, y] of room.r) k[y * room.W + x] = "r";
  return k;
}

