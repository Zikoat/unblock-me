import type { Direction } from "./game";

export type Command =
  | { type: "move"; blockId: string; direction: Direction; steps: number }
  | { type: "help" }
  | { type: "quit" };

export type ParseResult =
  | { ok: true; command: Command }
  | { ok: false; message: string };

const usageMessage = "Enter a block and direction, or help or quit.";
const directions = new Set<Direction>(["left", "right", "up", "down"]);

export function parseCommand(line: string): ParseResult {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  const firstToken = tokens[0]?.toLowerCase();

  if (tokens.length === 1) {
    const command = firstToken;
    if (command === "help" || command === "quit") return { ok: true, command: { type: command } };
  }

  if (firstToken === "help" || firstToken === "quit") return { ok: false, message: usageMessage };
  if (tokens.length !== 2 && tokens.length !== 3) return { ok: false, message: usageMessage };

  const [blockId, rawDirection, rawSteps] = tokens;
  const direction = rawDirection.toLowerCase();
  if (!directions.has(direction as Direction)) {
    return { ok: false, message: `Invalid direction: ${rawDirection}.` };
  }

  const steps = rawSteps === undefined ? 1 : Number(rawSteps);
  if (!Number.isInteger(steps) || steps <= 0) {
    return { ok: false, message: "Step count must be a positive integer." };
  }

  return { ok: true, command: { type: "move", blockId, direction: direction as Direction, steps } };
}
