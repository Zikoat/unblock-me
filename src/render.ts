import { projectState, type GameState } from "./game";

export const instructions = "Enter <block-id> <direction> [steps] (left, right, up, down), help, or quit.";
export const legend = "Legend: R/A/B=blocks #=Wall *=Checkpoint .=empty";

export function renderFrame(state: GameState, notice?: string): string {
  const board = projectState(state).map((row) => row.join(" ")).join("\n");
  const footer = [
    legend,
    `moves=${state.moves} won=${state.won}`,
    ...(state.won ? ["YOU WIN"] : []),
  ].join("\n");

  return [notice, board, footer].filter((section): section is string => section !== undefined).join("\n\n");
}
