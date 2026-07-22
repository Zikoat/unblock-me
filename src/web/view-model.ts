import { blockCells, type GameState } from "../game";

export type CellKind = "empty" | "wall" | "checkpoint";
export interface CellView { x: number; y: number; kind: CellKind }

export function createCellViews(state: GameState): CellView[] {
  const walls = new Set(state.walls.map(key));
  const checkpoint = new Set(state.checkpoint.map(key));
  return Array.from({ length: state.height }, (_, y) =>
    Array.from({ length: state.width }, (_, x): CellView => ({
      x,
      y,
      kind: walls.has(`${x},${y}`) ? "wall" : checkpoint.has(`${x},${y}`) ? "checkpoint" : "empty",
    })),
  ).flat();
}

export function projectCellViews(state: GameState, cells: readonly CellView[]): string[][] {
  const projection = Array.from({ length: state.height }, () => Array.from({ length: state.width }, () => "."));
  for (const cell of cells) projection[cell.y]![cell.x] = cell.kind === "wall" ? "#" : cell.kind === "checkpoint" ? "*" : ".";
  for (const block of state.blocks) {
    for (const cell of blockCells(block)) projection[cell.y]![cell.x] = block.id;
  }
  return projection;
}

function key(point: { x: number; y: number }): string {
  return `${point.x},${point.y}`;
}
