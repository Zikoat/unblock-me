import { applyMove, blockCells, validateState, type Block, type Direction, type GameState, type MoveAction, type Point } from "./game";

export interface GeneratedLevel {
  seed: number;
  state: GameState;
  solution: readonly MoveAction[];
}

const directions: readonly Direction[] = ["left", "right", "up", "down"];

export function createGeneratedLevel(seed: number): GeneratedLevel {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const level = generateCandidate(seed, attempt);
    if (level) return level;
  }
  throw new Error(`Unable to generate a proven solvable level for seed ${seed}.`);
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    blocks: state.blocks.map((block) => ({ ...block })),
    walls: state.walls.map((wall) => ({ ...wall })),
    checkpoint: state.checkpoint.map((cell) => ({ ...cell })),
  };
}

function generateCandidate(seed: number, attempt: number): GeneratedLevel | undefined {
  const random = mulberry32((seed + Math.imul(attempt, 0x9e3779b9)) >>> 0);
  const width = integer(random, 6, 10);
  const height = integer(random, 5, 8);
  const checkpointY = integer(random, 0, height - 1);
  const checkpointX = integer(random, 1, width - 2);
  const checkpoint: Point[] = [{ x: checkpointX, y: checkpointY }, { x: checkpointX + 1, y: checkpointY }];
  const reserved = new Set<string>();
  for (let x = 0; x <= checkpointX + 1; x += 1) reserved.add(key({ x, y: checkpointY }));

  const walls = placeWalls(random, width, height, reserved);
  const occupied = new Set(walls.map(key));
  for (const cell of reserved) occupied.add(cell);

  const blocks: Block[] = [{ id: "R", width: 2, height: 1, movement: "horizontal", x: checkpointX, y: checkpointY }];
  const desiredExtras = integer(random, 3, Math.min(6, Math.max(3, Math.floor(width * height / 10))));
  for (let index = 0; index < desiredExtras; index += 1) {
    const shape = index === 0 ? squareShape(random) : randomShape(random);
    const placed = placeBlock(random, String.fromCharCode(65 + index), shape, width, height, occupied);
    if (placed) {
      blocks.push(placed);
      for (const cell of blockCells(placed)) occupied.add(key(cell));
    }
  }
  if (blocks.length < 4) return undefined;

  let state: GameState = { width, height, blocks, walls, checkpoint, moves: 0, won: false };
  if (validateState(state).length > 0) return undefined;
  const scramble: MoveAction[] = [];
  const first: MoveAction = { blockId: "R", direction: "left" };
  const departed = applyMove(state, first);
  if (!departed.ok || departed.state.won) return undefined;
  state = departed.state;
  scramble.push(first);

  const seen = new Set([fingerprint(state)]);
  for (let tries = 0; tries < 400 && scramble.length < 18; tries += 1) {
    const block = state.blocks[Math.floor(random() * state.blocks.length)]!;
    const direction = directions[Math.floor(random() * directions.length)]!;
    const action = { blockId: block.id, direction };
    const result = applyMove(state, action);
    if (!result.ok || result.state.won || seen.has(fingerprint(result.state))) continue;
    state = result.state;
    scramble.push(action);
    seen.add(fingerprint(state));
  }
  if (scramble.length < 8) return undefined;

  return {
    seed,
    state: { ...cloneState(state), moves: 0, won: false },
    solution: [...scramble].reverse().map(invert),
  };
}

function placeWalls(random: () => number, width: number, height: number, reserved: Set<string>): Point[] {
  const walls: Point[] = [];
  const occupied = new Set(reserved);
  const desired = integer(random, 2, Math.max(2, Math.floor(width * height * 0.1)));
  for (let tries = 0; tries < 200 && walls.length < desired; tries += 1) {
    const point = { x: integer(random, 0, width - 1), y: integer(random, 0, height - 1) };
    if (occupied.has(key(point))) continue;
    walls.push(point);
    occupied.add(key(point));
  }
  return walls;
}

type Shape = Pick<Block, "width" | "height" | "movement">;

function squareShape(random: () => number): Shape {
  const size = random() < 0.55 ? 1 : 2;
  return { width: size, height: size, movement: "both" };
}

function randomShape(random: () => number): Shape {
  const kind = Math.floor(random() * 3);
  if (kind === 0) return squareShape(random);
  const length = integer(random, 2, 3);
  return kind === 1
    ? { width: length, height: 1, movement: "horizontal" }
    : { width: 1, height: length, movement: "vertical" };
}

function placeBlock(
  random: () => number,
  id: string,
  shape: Shape,
  boardWidth: number,
  boardHeight: number,
  occupied: Set<string>,
): Block | undefined {
  for (let tries = 0; tries < 120; tries += 1) {
    const block: Block = {
      id,
      ...shape,
      x: integer(random, 0, boardWidth - shape.width),
      y: integer(random, 0, boardHeight - shape.height),
    };
    if (blockCells(block).every((cell) => !occupied.has(key(cell)))) return block;
  }
  return undefined;
}

function invert(action: MoveAction): MoveAction {
  const opposite: Record<Direction, Direction> = { left: "right", right: "left", up: "down", down: "up" };
  return { blockId: action.blockId, direction: opposite[action.direction] };
}

function fingerprint(state: GameState): string {
  return state.blocks.map((block) => `${block.id}:${block.x},${block.y}`).join("|");
}

function key(point: Point): string {
  return `${point.x},${point.y}`;
}

function integer(random: () => number, minimum: number, maximum: number): number {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}
