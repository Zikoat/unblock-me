export type Axis = "horizontal" | "vertical";
export type Direction = "left" | "right" | "up" | "down";

export interface Point {
  x: number;
  y: number;
}

export interface Block {
  id: string;
  axis: Axis;
  length: number;
  x: number;
  y: number;
}

export interface GameState {
  width: number;
  height: number;
  blocks: readonly Block[];
  walls: readonly Point[];
  checkpoint: readonly Point[];
  moves: number;
  won: boolean;
}

export function blockCells(block: Block): Point[] {
  return Array.from({ length: block.length }, (_, offset) => ({
    x: block.x + (block.axis === "horizontal" ? offset : 0),
    y: block.y + (block.axis === "vertical" ? offset : 0),
  }));
}

export function validateState(state: GameState): string[] {
  const errors: string[] = [];
  const occupied = new Set<string>();
  const wallCells = new Set<string>();

  if (state.width <= 0 || state.height <= 0) {
    errors.push("Board dimensions must be positive.");
  }

  for (const wall of state.walls) {
    const key = pointKey(wall);
    if (!isInBounds(state, wall)) errors.push(`Wall ${key} is out of bounds.`);
    if (wallCells.has(key)) errors.push(`Wall ${key} is duplicated.`);
    wallCells.add(key);
  }

  for (const block of state.blocks) {
    if (block.length <= 0) errors.push(`Block ${block.id} must have a positive length.`);
    for (const cell of blockCells(block)) {
      const key = pointKey(cell);
      if (!isInBounds(state, cell)) errors.push(`Block ${block.id} cell ${key} is out of bounds.`);
      if (occupied.has(key)) errors.push(`Block ${block.id} overlaps another block at ${key}.`);
      if (wallCells.has(key)) errors.push(`Block ${block.id} overlaps a wall at ${key}.`);
      occupied.add(key);
    }
  }

  return errors;
}

function isInBounds(state: GameState, point: Point): boolean {
  return point.x >= 0 && point.x < state.width && point.y >= 0 && point.y < state.height;
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}
