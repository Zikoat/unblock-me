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

export interface MoveAction {
  blockId: string;
  direction: Direction;
}

export type MoveErrorCode =
  | "unknown-block"
  | "wrong-axis"
  | "blocked"
  | "out-of-bounds"
  | "already-won";

export type MoveResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; code: MoveErrorCode; message: string };

export function blockCells(block: Block): Point[] {
  return Array.from({ length: block.length }, (_, offset) => ({
    x: block.x + (block.axis === "horizontal" ? offset : 0),
    y: block.y + (block.axis === "vertical" ? offset : 0),
  }));
}

export function applyMove(state: GameState, action: MoveAction): MoveResult {
  if (state.won) return reject(state, "already-won", "The puzzle is already won.");

  const block = state.blocks.find((candidate) => candidate.id.toLowerCase() === action.blockId.toLowerCase());
  if (!block) return reject(state, "unknown-block", `Unknown block: ${action.blockId}.`);

  const movesHorizontally = action.direction === "left" || action.direction === "right";
  if ((block.axis === "horizontal") !== movesHorizontally) {
    return reject(state, "wrong-axis", `Block ${block.id} cannot move ${action.direction}.`);
  }

  const delta = directionDelta(action.direction);
  const movedBlock: Block = { ...block, x: block.x + delta.x, y: block.y + delta.y };
  const movedCells = blockCells(movedBlock);
  if (movedCells.some((cell) => !isInBounds(state, cell))) {
    return reject(state, "out-of-bounds", `Block ${block.id} would leave the board.`);
  }

  const wallCells = new Set(state.walls.map(pointKey));
  if (movedCells.some((cell) => wallCells.has(pointKey(cell)))) {
    return reject(state, "blocked", `Block ${block.id} is blocked by a Wall.`);
  }

  const occupiedByOtherBlocks = new Set(
    state.blocks
      .filter((candidate) => candidate !== block)
      .flatMap(blockCells)
      .map(pointKey),
  );
  if (movedCells.some((cell) => occupiedByOtherBlocks.has(pointKey(cell)))) {
    return reject(state, "blocked", `Block ${block.id} is blocked by another block.`);
  }

  const blocks = state.blocks.map((candidate) => (candidate === block ? movedBlock : candidate));
  const checkpointCells = new Set(state.checkpoint.map(pointKey));
  const redBlock = blocks.find((candidate) => candidate.id.toLowerCase() === "r");
  const won = redBlock !== undefined && blockCells(redBlock).every((cell) => checkpointCells.has(pointKey(cell)));

  return { ok: true, state: { ...state, blocks, moves: state.moves + 1, won } };
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

function directionDelta(direction: Direction): Point {
  switch (direction) {
    case "left": return { x: -1, y: 0 };
    case "right": return { x: 1, y: 0 };
    case "up": return { x: 0, y: -1 };
    case "down": return { x: 0, y: 1 };
  }
}

function reject(state: GameState, code: MoveErrorCode, message: string): MoveResult {
  return { ok: false, state, code, message };
}
