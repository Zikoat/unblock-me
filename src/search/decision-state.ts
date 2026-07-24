import {
  applyMove,
  blockCells,
  type Block,
  type Direction,
  type GameState,
  type MoveAction,
  type Point,
} from "../game";
import { elapsedMs } from "../generation/settings";

const directions: readonly Direction[] = ["left", "right", "up", "down"];

export interface InteractionRegion {
  blockId: string;
  blockerDependencies: string[];
  positions: Point[];
}

export interface SearchMetrics {
  complete: boolean;
  durationMs: number;
  goalReachable: boolean;
  peakQueuedStates: number;
  states: number;
  transitions: number;
}

export interface DecisionSearchMetrics extends SearchMetrics {
  interactionPositionsExamined: number;
}

export interface SearchCounterexample {
  kind: "missed-reachable" | "spurious-reachable";
  initialState: GameState;
  decisionState: string;
  seed?: number;
  sourceCommit: string;
  witnessState: GameState;
}

export interface DecisionStateValidation {
  comparison: {
    extraDecisionStates: number;
    missingDecisionStates: number;
    reachabilityMatches: boolean;
  };
  compressed: DecisionSearchMetrics;
  counterexample?: SearchCounterexample;
  exact: SearchMetrics;
  exactDecisionStates: number;
}

export function validateDecisionStateCompression(
  initialState: GameState,
  options: { maxExactStates?: number; maxDecisionStates?: number; seed?: number; sourceCommit: string },
): DecisionStateValidation {
  const exact = exactSearch(initialState, options.maxExactStates ?? 100_000);
  const compressed = decisionSearch(initialState, options.maxDecisionStates ?? 100_000);
  const exactDecisionKeys = new Set([...exact.statesByKey.values()].map(decisionStateKey));
  const missing = [...exactDecisionKeys].filter((key) => !compressed.statesByDecision.has(key));
  const extra = [...compressed.statesByDecision.keys()].filter((key) => !exactDecisionKeys.has(key));
  const reachabilityMatches = exact.metrics.complete
    && compressed.metrics.complete
    && exact.metrics.goalReachable === compressed.metrics.goalReachable
    && missing.length === 0
    && extra.length === 0;
  const missingDecisionState = missing[0];
  const extraDecisionState = extra[0];
  const missingExactState = missingDecisionState
    ? [...exact.statesByKey.values()].find((state) => decisionStateKey(state) === missingDecisionState)
    : undefined;
  return {
    exact: exact.metrics,
    compressed: compressed.metrics,
    exactDecisionStates: exactDecisionKeys.size,
    comparison: {
      reachabilityMatches,
      missingDecisionStates: missing.length,
      extraDecisionStates: extra.length,
    },
    counterexample: missingDecisionState && missingExactState
      ? {
        kind: "missed-reachable",
        initialState: normalizeState(initialState),
        witnessState: missingExactState,
        decisionState: missingDecisionState,
        seed: options.seed,
        sourceCommit: options.sourceCommit,
      }
      : extraDecisionState
        ? {
          kind: "spurious-reachable",
          initialState: normalizeState(initialState),
          witnessState: compressed.statesByDecision.get(extraDecisionState)!,
          decisionState: extraDecisionState,
          seed: options.seed,
          sourceCommit: options.sourceCommit,
        }
        : undefined,
  };
}

export function deriveInteractionRegion(state: GameState, target: Block): InteractionRegion {
  const positions = new Map<string, Point>();
  const queue: Point[] = [{ x: target.x, y: target.y }];
  positions.set(pointKey(target), queue[0]!);
  const dependencies = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const position = queue[index]!;
    const positioned = stateWithBlockAt(state, target.id, position);
    for (const direction of allowedDirections(target)) {
      const action = { blockId: target.id, direction };
      const result = applyMove(positioned, action);
      if (result.ok && result.state.won === state.won) {
        const moved = result.state.blocks.find((block) => block.id === target.id)!;
        const key = pointKey(moved);
        if (!positions.has(key)) {
          const next = { x: moved.x, y: moved.y };
          positions.set(key, next);
          queue.push(next);
        }
      } else {
        const blocker = blockingBlock(positioned, target.id, direction);
        if (blocker) dependencies.add(`${target.id}->${blocker}`);
      }
    }
  }
  return {
    blockId: target.id,
    positions: [...positions.values()].sort(comparePoints),
    blockerDependencies: [...dependencies].sort(),
  };
}

export function decisionStateKey(state: GameState): string {
  const regions = [...state.blocks]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((block) => {
      const region = deriveInteractionRegion(state, block);
      return `${block.id}[${region.positions.map(pointKey).join(";")}]{${region.blockerDependencies.join(";")}}`;
    });
  return `${state.width}x${state.height}|won=${state.won}|${regions.join("|")}`;
}

function exactSearch(initialState: GameState, maximumStates: number) {
  const startedAt = performance.now();
  const first = normalizeState(initialState);
  const statesByKey = new Map([[exactStateKey(first), first]]);
  const queue = [first];
  let transitions = 0;
  let goalReachable = first.won;
  let peakQueuedStates = 1;
  for (let index = 0; index < queue.length && statesByKey.size < maximumStates; index += 1) {
    const state = queue[index]!;
    for (const next of exactSuccessors(state)) {
      transitions += 1;
      goalReachable ||= next.won;
      const key = exactStateKey(next);
      if (statesByKey.has(key)) continue;
      statesByKey.set(key, next);
      queue.push(next);
    }
    peakQueuedStates = Math.max(peakQueuedStates, queue.length - index - 1);
  }
  return {
    statesByKey,
    metrics: {
      complete: statesByKey.size < maximumStates,
      durationMs: elapsedMs(startedAt),
      goalReachable,
      peakQueuedStates,
      states: statesByKey.size,
      transitions,
    } satisfies SearchMetrics,
  };
}

function decisionSearch(initialState: GameState, maximumStates: number) {
  const startedAt = performance.now();
  const first = normalizeState(initialState);
  const firstKey = decisionStateKey(first);
  const statesByDecision = new Map([[firstKey, first]]);
  const queue = [first];
  let transitions = 0;
  let interactionPositionsExamined = 0;
  let goalReachable = first.won;
  let peakQueuedStates = 1;
  for (let index = 0; index < queue.length && statesByDecision.size < maximumStates; index += 1) {
    const state = queue[index]!;
    const currentKey = decisionStateKey(state);
    for (const block of state.blocks) {
      const region = deriveInteractionRegion(state, block);
      interactionPositionsExamined += region.positions.length;
      for (const position of region.positions) {
        const positioned = stateWithBlockAt(state, block.id, position);
        for (const direction of allowedDirections(block)) {
          const result = applyMove(positioned, { blockId: block.id, direction });
          if (!result.ok) continue;
          const next = normalizeState(result.state);
          const nextKey = decisionStateKey(next);
          if (nextKey === currentKey) continue;
          transitions += 1;
          goalReachable ||= next.won;
          if (statesByDecision.has(nextKey)) continue;
          statesByDecision.set(nextKey, next);
          queue.push(next);
        }
      }
    }
    peakQueuedStates = Math.max(peakQueuedStates, queue.length - index - 1);
  }
  return {
    statesByDecision,
    metrics: {
      complete: statesByDecision.size < maximumStates,
      durationMs: elapsedMs(startedAt),
      goalReachable,
      peakQueuedStates,
      states: statesByDecision.size,
      transitions,
      interactionPositionsExamined,
    } satisfies DecisionSearchMetrics,
  };
}

function exactSuccessors(state: GameState): GameState[] {
  if (state.won) return [];
  const successors: GameState[] = [];
  for (const block of state.blocks) {
    for (const direction of allowedDirections(block)) {
      const result = applyMove(state, { blockId: block.id, direction });
      if (result.ok) successors.push(normalizeState(result.state));
    }
  }
  return successors;
}

function allowedDirections(block: Block): readonly Direction[] {
  if (block.movement === "horizontal") return ["left", "right"];
  if (block.movement === "vertical") return ["up", "down"];
  return directions;
}

function stateWithBlockAt(state: GameState, blockId: string, position: Point): GameState {
  return {
    ...state,
    moves: 0,
    blocks: state.blocks.map((block) =>
      block.id === blockId ? { ...block, x: position.x, y: position.y } : { ...block }
    ),
  };
}

function blockingBlock(state: GameState, blockId: string, direction: Direction): string | undefined {
  const block = state.blocks.find((candidate) => candidate.id === blockId);
  if (!block) return undefined;
  const delta: Record<Direction, Point> = {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
  };
  const moved = { ...block, x: block.x + delta[direction].x, y: block.y + delta[direction].y };
  const movedKeys = new Set(blockCells(moved).map(pointKey));
  return state.blocks
    .filter((candidate) => candidate.id !== blockId)
    .find((candidate) => blockCells(candidate).some((cell) => movedKeys.has(pointKey(cell))))
    ?.id;
}

function normalizeState(state: GameState): GameState {
  return {
    ...state,
    moves: 0,
    blocks: state.blocks.map((block) => ({ ...block })),
    walls: state.walls.map((wall) => ({ ...wall })),
    checkpoint: state.checkpoint.map((cell) => ({ ...cell })),
  };
}

function exactStateKey(state: GameState): string {
  return `${state.won}|${[...state.blocks]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((block) => `${block.id}:${block.x},${block.y}`)
    .join("|")}`;
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}

function comparePoints(left: Point, right: Point): number {
  return left.y - right.y || left.x - right.x;
}
