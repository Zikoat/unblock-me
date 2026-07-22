import { applyMove, type Direction, type GameState, type MoveAction } from "./game";
import { createPuzzle } from "./puzzle";

export interface GeneratedLevel {
  seed: number;
  state: GameState;
  solution: readonly MoveAction[];
}

const baseSolution: readonly MoveAction[] = [
  { blockId: "A", direction: "up" },
  { blockId: "B", direction: "down" },
  { blockId: "R", direction: "right" },
  { blockId: "R", direction: "right" },
  { blockId: "R", direction: "right" },
  { blockId: "R", direction: "right" },
  { blockId: "R", direction: "right" },
];

const directions: readonly Direction[] = ["left", "right", "up", "down"];

export function createGeneratedLevel(seed: number): GeneratedLevel {
  const random = mulberry32(seed);
  let state = createPuzzle();
  const scramble: MoveAction[] = [];
  const seen = new Set([fingerprint(state)]);

  for (let attempt = 0; attempt < 160 && scramble.length < 12; attempt += 1) {
    const actions = state.blocks.flatMap((block) => directions.map((direction) => ({ blockId: block.id, direction })));
    const action = actions[Math.floor(random() * actions.length)]!;
    const result = applyMove(state, action);
    if (!result.ok || result.state.won || seen.has(fingerprint(result.state))) continue;
    state = result.state;
    scramble.push(action);
    seen.add(fingerprint(state));
  }

  if (scramble.length < 3) throw new Error("Unable to generate a sufficiently scrambled level.");
  return {
    seed,
    state: resetMoveCount(state),
    solution: [...scramble].reverse().map(invert).concat(baseSolution),
  };
}

export function initialSolution(): readonly MoveAction[] {
  return baseSolution;
}

export function cloneState(state: GameState): GameState {
  return {
    ...state,
    blocks: state.blocks.map((block) => ({ ...block })),
    walls: state.walls.map((wall) => ({ ...wall })),
    checkpoint: state.checkpoint.map((cell) => ({ ...cell })),
  };
}

function resetMoveCount(state: GameState): GameState {
  return { ...cloneState(state), moves: 0, won: false };
}

function invert(action: MoveAction): MoveAction {
  const opposite: Record<Direction, Direction> = { left: "right", right: "left", up: "down", down: "up" };
  return { blockId: action.blockId, direction: opposite[action.direction] };
}

function fingerprint(state: GameState): string {
  return state.blocks.map((block) => `${block.id}:${block.x},${block.y}`).join("|");
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
