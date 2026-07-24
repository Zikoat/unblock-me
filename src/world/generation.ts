/**
 * VALIDATED PROTOTYPE QUESTION:
 * Does Viewport-driven generation feel understandable when the entire 40×40
 * World remains visible and a 10×10 Viewport moves across it?
 *
 * Every camera position requests all missing cells in the Viewport. A Generated
 * Region includes that coverage plus a small rounded margin.
 */

import { blockColor } from "./palette";

export type Direction = "left" | "right" | "up" | "down";

export interface Point {
  x: number;
  y: number;
}

export interface Camera extends Point {
  width: number;
  height: number;
}

export interface RegionCell extends Point {
  regionId: string;
}

export interface PrototypeBlock extends Point {
  color: readonly [number, number, number];
  height: number;
  id: string;
  regionId: string;
  width: number;
}

export interface GeneratedRegion {
  blockIds: string[];
  cellCount: number;
  id: string;
  site: Point;
}

export interface PrototypeState {
  blocks: PrototypeBlock[];
  camera: Camera;
  cells: RegionCell[];
  message: string;
  regions: GeneratedRegion[];
  worldHeight: number;
  worldWidth: number;
}

export interface WorldViewportCell {
  blockId?: string;
  color?: readonly [number, number, number];
  committed: boolean;
  regionId?: string;
  worldX: number;
  worldY: number;
  x: number;
  y: number;
}

export type PrototypeAction =
  | { type: "move-camera"; direction: Direction; steps: number }
  | { type: "pan-camera"; deltaX: number; deltaY: number }
  | { type: "reset" };

const WORLD_SIZE = 40;
const VIEWPORT_SIZE = 10;
const REQUEST_MARGIN = 2;
const shapes = [
  { width: 2, height: 1 },
  { width: 1, height: 2 },
  { width: 1, height: 1 },
  { width: 2, height: 2 },
  { width: 3, height: 1 },
  { width: 1, height: 3 },
] as const;

export function createPrototypeState(): PrototypeState {
  const state: PrototypeState = {
    blocks: [],
    camera: { x: 0, y: 0, width: VIEWPORT_SIZE, height: VIEWPORT_SIZE },
    cells: [],
    message: "",
    regions: [],
    worldHeight: WORLD_SIZE,
    worldWidth: WORLD_SIZE,
  };
  const seeded = commitViewportRequest(state);
  return {
    ...seeded,
    message: "The initial Viewport was requested and committed. Move the camera anywhere to request all missing cells there.",
  };
}

export function reducePrototype(state: PrototypeState, action: PrototypeAction): PrototypeState {
  if (action.type === "reset") return createPrototypeState();
  if (action.type === "pan-camera") return panCamera(state, action.deltaX, action.deltaY);
  return moveCamera(state, action.direction, action.steps);
}

export function projectWorldViewport(state: PrototypeState): WorldViewportCell[] {
  const committed = new Map(state.cells.map((cell) => [key(cell), cell]));
  const occupied = new Map<string, PrototypeBlock>();
  for (const block of state.blocks) {
    for (const point of blockPoints(block)) occupied.set(key(point), block);
  }
  return Array.from({ length: state.camera.height }, (_, y) =>
    Array.from({ length: state.camera.width }, (_, x): WorldViewportCell => {
      const worldX = state.camera.x + x;
      const worldY = state.camera.y + y;
      const cell = committed.get(`${worldX},${worldY}`);
      const block = occupied.get(`${worldX},${worldY}`);
      return {
        x,
        y,
        worldX,
        worldY,
        committed: cell !== undefined,
        regionId: cell?.regionId,
        blockId: block?.id,
        color: block?.color,
      };
    }),
  ).flat();
}

function moveCamera(state: PrototypeState, direction: Direction, steps: number): PrototypeState {
  const delta: Record<Direction, Point> = {
    left: { x: -steps, y: 0 },
    right: { x: steps, y: 0 },
    up: { x: 0, y: -steps },
    down: { x: 0, y: steps },
  };
  const movement = delta[direction];
  const camera = {
    ...state.camera,
    x: state.camera.x + movement.x,
    y: state.camera.y + movement.y,
  };
  const moved = { ...state, camera };
  const committed = commitViewportRequest(moved);
  if (committed.regions.length === moved.regions.length) {
    return { ...moved, message: `Camera moved ${direction} ${steps}; the whole Viewport was already committed.` };
  }
  const region = committed.regions.at(-1)!;
  return {
    ...committed,
    message: `Camera moved ${direction} ${steps}; ${region.id} committed all missing Viewport cells plus its rounded margin.`,
  };
}

function panCamera(state: PrototypeState, deltaX: number, deltaY: number): PrototypeState {
  const camera = {
    ...state.camera,
    x: state.camera.x + deltaX,
    y: state.camera.y + deltaY,
  };
  const moved = { ...state, camera };
  const committed = commitViewportRequest(moved);
  const generated = committed.regions.length - moved.regions.length;
  return {
    ...committed,
    message: generated > 0
      ? `Camera panned to ${camera.x},${camera.y}; every missing Viewport cell was committed.`
      : `Camera panned to ${camera.x},${camera.y}; the whole Viewport was already committed.`,
  };
}

function commitViewportRequest(state: PrototypeState): PrototypeState {
  const regionId = `region-${state.regions.length + 1}`;
  const existingCells = new Set(state.cells.map(key));
  const site = {
    x: state.camera.x + Math.floor(state.camera.width / 2),
    y: state.camera.y + Math.floor(state.camera.height / 2),
  };
  const newCells = viewportRequestCells(state.camera, REQUEST_MARGIN)
    .filter((cell) => !existingCells.has(key(cell)))
    .map((cell): RegionCell => ({ ...cell, regionId }));
  if (newCells.length === 0) return state;
  const allCells = [...state.cells, ...newCells];
  const blocks = placeRegionBlocks(state.blocks, newCells, regionId, site, state.regions.length);
  return {
    ...state,
    blocks: [...state.blocks, ...blocks],
    cells: allCells,
    regions: [
      ...state.regions,
      { id: regionId, site: { ...site }, cellCount: newCells.length, blockIds: blocks.map((block) => block.id) },
    ],
  };
}

function placeRegionBlocks(
  existingBlocks: readonly PrototypeBlock[],
  committedCells: readonly RegionCell[],
  regionId: string,
  site: Point,
  regionIndex: number,
): PrototypeBlock[] {
  const committed = new Set(committedCells.map(key));
  const occupied = new Set(existingBlocks.flatMap(blockPoints).map(key));
  const blocks: PrototypeBlock[] = [];
  const desired = regionIndex === 0 ? 7 : 6;

  for (let index = 0; index < desired; index += 1) {
    const isRed = regionIndex === 0 && index === 0;
    const shape = isRed ? { width: 2, height: 1 } : shapes[(regionIndex * 3 + index) % shapes.length]!;
    const id = isRed ? "R" : blockId(existingBlocks.length + blocks.length);
    const color = blockColor(id);
    const position = findPosition(site, shape, committed, occupied, regionIndex * 17 + index * 11);
    if (!position) continue;
    const block = { id, regionId, ...shape, ...position, color };
    blocks.push(block);
    for (const point of blockPoints(block)) occupied.add(key(point));
  }
  return blocks;
}

function findPosition(
  site: Point,
  shape: { width: number; height: number },
  committed: ReadonlySet<string>,
  occupied: ReadonlySet<string>,
  offset: number,
): Point | undefined {
  const candidates: Point[] = [];
  for (let radius = 0; radius <= 10; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) !== radius) continue;
        candidates.push({ x: site.x + dx, y: site.y + dy });
      }
    }
  }
  for (let index = 0; index < candidates.length; index += 1) {
    const point = candidates[(index + offset) % candidates.length]!;
    const cells = rectanglePoints(point, shape.width, shape.height);
    if (cells.every((cell) => committed.has(key(cell)) && !occupied.has(key(cell)))) return point;
  }
  return undefined;
}

function viewportRequestCells(camera: Camera, margin: number): Point[] {
  const cells: Point[] = [];
  for (let y = camera.y - margin; y < camera.y + camera.height + margin; y += 1) {
    for (let x = camera.x - margin; x < camera.x + camera.width + margin; x += 1) {
      const horizontalDistance = x < camera.x
        ? camera.x - x
        : x >= camera.x + camera.width
          ? x - (camera.x + camera.width - 1)
          : 0;
      const verticalDistance = y < camera.y
        ? camera.y - y
        : y >= camera.y + camera.height
          ? y - (camera.y + camera.height - 1)
          : 0;
      if (horizontalDistance * horizontalDistance + verticalDistance * verticalDistance <= margin * margin) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function blockPoints(block: Pick<PrototypeBlock, "x" | "y" | "width" | "height">): Point[] {
  return rectanglePoints(block, block.width, block.height);
}

function rectanglePoints(origin: Point, width: number, height: number): Point[] {
  return Array.from({ length: height }, (_, dy) =>
    Array.from({ length: width }, (_, dx) => ({ x: origin.x + dx, y: origin.y + dy }))
  ).flat();
}

function blockId(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

function key(point: Point): string {
  return `${point.x},${point.y}`;
}
