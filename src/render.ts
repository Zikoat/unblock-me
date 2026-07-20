import { blockCells, type GameState } from "./game";

export const instructions = "Enter <block-id> <direction> (left, right, up, down), help, or quit.";

export function renderFrame(state: GameState, notice?: string): string {
  const cells = Array.from({ length: state.height }, () => Array.from({ length: state.width }, () => "."));

  for (const wall of state.walls) cells[wall.y][wall.x] = "#";
  for (const checkpoint of state.checkpoint) cells[checkpoint.y][checkpoint.x] = "*";
  for (const block of state.blocks) {
    for (const cell of blockCells(block)) cells[cell.y][cell.x] = block.id;
  }

  const board = cells.map((row) => row.join(" ")).join("\n");
  const footer = [
    "Legend: R/A/B=blocks #=Wall *=Checkpoint .=empty",
    `moves=${state.moves} won=${state.won}`,
    ...(state.won ? ["YOU WIN"] : []),
  ].join("\n");

  return [notice, board, footer].filter((section): section is string => section !== undefined).join("\n\n");
}
