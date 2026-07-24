/**
 * VALIDATED PROTOTYPE QUESTION:
 * Can Blocker Dependency closure stop naturally on a bounded 40×40 request,
 * and when does it require a hard cap or immovable separator?
 *
 * This deliberately models one dependency chain. Blocker Dependencies are
 * derived from positioned Blocks in each Block's four-cell escape corridor.
 */

export type Scenario = "natural" | "runaway" | "separator";
export type ClosureStatus = "exploring" | "closed" | "separated" | "capped";
export type Axis = "horizontal" | "vertical";

export interface Point {
  x: number;
  y: number;
}

export interface PrototypeBlock extends Point {
  axis: Axis;
  height: number;
  id: string;
  width: number;
}

export interface Dependency {
  blockerId: string;
  blockId: string;
}

export interface ClosureState {
  blocks: PrototypeBlock[];
  committed: Point[];
  dependencies: Dependency[];
  expansionCount: number;
  frontier: string[];
  message: string;
  processed: string[];
  scenario: Scenario;
  status: ClosureStatus;
  walls: Point[];
  worldHeight: number;
  worldWidth: number;
}

export interface ClosureViewportCell {
  blockId?: string;
  committed: boolean;
  wall: boolean;
  worldX: number;
  worldY: number;
  x: number;
  y: number;
}

export type ClosureAction =
  | { type: "reset"; scenario?: Scenario }
  | { type: "step" }
  | { type: "run" };

const WORLD_SIZE = 40;
const CORRIDOR_LENGTH = 4;
const EXPANSION_CAP = 6;
const NATURAL_BLOCK_COUNT = 4;
const SEPARATOR_AT_BLOCK_INDEX = 4;
const chain = createChain();

export function createClosureState(scenario: Scenario = "natural"): ClosureState {
  const initialBlocks = chain.slice(0, 2);
  return {
    blocks: initialBlocks,
    committed: rectanglePoints({ x: 0, y: 27 }, 9, 7),
    dependencies: [],
    expansionCount: 0,
    frontier: ["R"],
    message: `${scenario} scenario ready. Step from Red Block R.`,
    processed: [],
    scenario,
    status: "exploring",
    walls: [],
    worldHeight: WORLD_SIZE,
    worldWidth: WORLD_SIZE,
  };
}

export function reduceClosure(state: ClosureState, action: ClosureAction): ClosureState {
  if (action.type === "reset") return createClosureState(action.scenario ?? state.scenario);
  if (action.type === "step") return stepClosure(state);

  let next = state;
  while (next.status === "exploring" && next.frontier.length > 0) {
    next = stepClosure(next);
  }
  return next;
}

export function projectClosureViewport(state: ClosureState): ClosureViewportCell[] {
  const focusId = state.frontier[0] ?? state.processed.at(-1) ?? "R";
  const focus = state.blocks.find((block) => block.id === focusId) ?? state.blocks[0]!;
  const width = 10;
  const height = 10;
  const cameraX = clamp(Math.round(focus.x + focus.width / 2 - width / 2), 0, state.worldWidth - width);
  const cameraY = clamp(Math.round(focus.y + focus.height / 2 - height / 2), 0, state.worldHeight - height);
  const committed = new Set(state.committed.map(key));
  const walls = new Set(state.walls.map(key));
  const occupied = new Map<string, PrototypeBlock>();
  for (const block of state.blocks) {
    for (const point of blockPoints(block)) occupied.set(key(point), block);
  }
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x): ClosureViewportCell => {
      const worldX = cameraX + x;
      const worldY = cameraY + y;
      const pointKey = `${worldX},${worldY}`;
      return {
        x,
        y,
        worldX,
        worldY,
        committed: committed.has(pointKey),
        wall: walls.has(pointKey),
        blockId: occupied.get(pointKey)?.id,
      };
    }),
  ).flat();
}

function stepClosure(state: ClosureState): ClosureState {
  if (state.status !== "exploring") {
    return { ...state, message: `Closure already stopped: ${state.status}. Reset or choose another scenario.` };
  }

  const blockId = state.frontier[0];
  if (!blockId) return finish(state, "closed", "No unresolved Blocker Dependencies remain.");
  const block = state.blocks.find((candidate) => candidate.id === blockId)!;
  const corridor = escapeCorridor(block);
  const committedKeys = new Set(state.committed.map(key));
  const missing = corridor.filter((point) => !committedKeys.has(key(point)));

  if (missing.length > 0 && state.expansionCount >= EXPANSION_CAP) {
    return finish(
      state,
      "capped",
      `Safety cap stopped generation before ${block.id}'s unknown escape corridor was committed.`,
    );
  }

  let next: ClosureState = {
    ...state,
    frontier: state.frontier.slice(1),
    processed: [...state.processed, block.id],
  };

  if (missing.length > 0) {
    next = expandForBlock(next, block, corridor);
  }

  const wallKeys = new Set(next.walls.map(key));
  if (corridor.some((point) => wallKeys.has(key(point)))) {
    if (next.frontier.length === 0) {
      return finish(
        next,
        "separated",
        `${block.id}'s corridor reached an immovable separator. Closure stopped, but this alone does not prove the puzzle solvable.`,
      );
    }
    return {
      ...next,
      message: `${block.id}'s corridor reached a separator; other dependency branches remain.`,
    };
  }

  const blocker = next.blocks.find(
    (candidate) => candidate.id !== block.id && blockPoints(candidate).some((point) => corridor.some(equal(point))),
  );
  if (!blocker) {
    if (next.frontier.length === 0) {
      return finish(next, "closed", `${block.id} has a clear committed escape corridor. Dependency closure is complete.`);
    }
    return { ...next, message: `${block.id} has a clear escape corridor; continuing another dependency branch.` };
  }

  const alreadyKnown = next.processed.includes(blocker.id) || next.frontier.includes(blocker.id);
  const withDependency = {
    ...next,
    dependencies: alreadyKnown
      ? next.dependencies
      : [...next.dependencies, { blockId: block.id, blockerId: blocker.id }],
    frontier: alreadyKnown ? next.frontier : [...next.frontier, blocker.id],
    message: `${block.id}'s escape corridor is blocked by ${blocker.id}; ${blocker.id} joined the Dependency closure.`,
  };
  if (withDependency.frontier.length === 0) {
    return finish(withDependency, "closed", "All positioned Blocker Dependencies were already resolved.");
  }
  return withDependency;
}

function expandForBlock(state: ClosureState, block: PrototypeBlock, corridor: Point[]): ClosureState {
  const blockIndex = chain.findIndex((candidate) => candidate.id === block.id);
  const committed = unionPoints(state.committed, expandPoints(corridor));
  let blocks = state.blocks;
  let walls = state.walls;

  if (state.scenario === "separator" && blockIndex === SEPARATOR_AT_BLOCK_INDEX) {
    walls = unionPoints(walls, separatorPoints(block, corridor));
  } else if (
    state.scenario === "runaway"
    || state.scenario === "separator"
    || blockIndex + 1 < NATURAL_BLOCK_COUNT
  ) {
    const nextBlock = chain[blockIndex + 1];
    if (nextBlock && !blocks.some((candidate) => candidate.id === nextBlock.id)) {
      blocks = [...blocks, nextBlock];
    }
  }

  return {
    ...state,
    blocks,
    committed,
    expansionCount: state.expansionCount + 1,
    message: `Committed Generated Region ${state.expansionCount + 1} around ${block.id}'s escape corridor.`,
    walls,
  };
}

function finish(state: ClosureState, status: Exclude<ClosureStatus, "exploring">, message: string): ClosureState {
  return { ...state, frontier: [], message, status };
}

function createChain(): PrototypeBlock[] {
  const blocks: PrototypeBlock[] = [
    { id: "R", axis: "horizontal", x: 2, y: 30, width: 2, height: 1 },
  ];
  for (let index = 1; index < 12; index += 1) {
    const previous = blocks[index - 1]!;
    const id = String.fromCharCode(65 + index);
    if (previous.axis === "horizontal") {
      blocks.push({
        id,
        axis: "vertical",
        x: previous.x + previous.width + 2,
        y: previous.y - 1,
        width: 1,
        height: 3,
      });
    } else {
      blocks.push({
        id,
        axis: "horizontal",
        x: previous.x - 1,
        y: previous.y - CORRIDOR_LENGTH,
        width: 3,
        height: 1,
      });
    }
  }
  return blocks;
}

function escapeCorridor(block: PrototypeBlock): Point[] {
  if (block.axis === "horizontal") {
    return Array.from(
      { length: CORRIDOR_LENGTH },
      (_, offset) => ({ x: block.x + block.width + offset, y: block.y }),
    );
  }
  return Array.from(
    { length: CORRIDOR_LENGTH },
    (_, offset) => ({ x: block.x, y: block.y - 1 - offset }),
  );
}

function separatorPoints(block: PrototypeBlock, corridor: Point[]): Point[] {
  const center = corridor[Math.floor(corridor.length / 2)]!;
  return block.axis === "horizontal"
    ? [center, { x: center.x, y: center.y - 1 }, { x: center.x, y: center.y + 1 }]
    : [center, { x: center.x - 1, y: center.y }, { x: center.x + 1, y: center.y }];
}

function expandPoints(corridor: Point[]): Point[] {
  return corridor.flatMap((point) =>
    rectanglePoints({ x: Math.max(0, point.x - 1), y: Math.max(0, point.y - 1) }, 3, 3)
      .filter(({ x, y }) => x < WORLD_SIZE && y < WORLD_SIZE)
  );
}

function blockPoints(block: PrototypeBlock): Point[] {
  return rectanglePoints(block, block.width, block.height);
}

function rectanglePoints(origin: Point, width: number, height: number): Point[] {
  return Array.from({ length: height }, (_, dy) =>
    Array.from({ length: width }, (_, dx) => ({ x: origin.x + dx, y: origin.y + dy }))
  ).flat();
}

function unionPoints(left: Point[], right: Point[]): Point[] {
  const points = new Map(left.map((point) => [key(point), point]));
  for (const point of right) points.set(key(point), point);
  return [...points.values()];
}

function equal(left: Point): (right: Point) => boolean {
  return (right) => left.x === right.x && left.y === right.y;
}

function key(point: Point): string {
  return `${point.x},${point.y}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
