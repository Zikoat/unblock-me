import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import {
  createClosureState,
  reduceClosure,
  type ClosureState,
  type PrototypeBlock,
  type Scenario,
} from "./state";

const reset = "\x1b[0m";
const bold = "\x1b[1m";
const dim = "\x1b[2m";
const palette = ["\x1b[38;5;203m", "\x1b[38;5;147m", "\x1b[38;5;216m", "\x1b[38;5;186m", "\x1b[38;5;116m"];
const input = createInterface({ input: stdin, output: stdout, terminal: Boolean(stdin.isTTY) });
let state = createClosureState();
let firstFrame = true;

showFrame();
for await (const rawLine of input) {
  const line = rawLine.trim().toLowerCase();
  if (line === "quit" || line === "q") break;
  if (line === "step" || line === "s") {
    state = reduceClosure(state, { type: "step" });
  } else if (line === "run" || line === "r") {
    state = reduceClosure(state, { type: "run" });
  } else if (line === "reset") {
    state = reduceClosure(state, { type: "reset" });
  } else {
    const match = /^scenario\s+(natural|runaway|separator)$/.exec(line);
    state = match
      ? reduceClosure(state, { type: "reset", scenario: match[1] as Scenario })
      : { ...state, message: "Unknown command. Use scenario NAME, step, run, reset, or quit." };
  }
  showFrame();
}
input.close();

function showFrame(): void {
  if (stdout.isTTY) stdout.write("\x1b[2J\x1b[H");
  else if (!firstFrame) stdout.write("\n---\n");
  stdout.write(`${render(state)}\n`);
  if (stdin.isTTY) stdout.write("\n> ");
  firstFrame = false;
}

function render(current: ClosureState): string {
  const chain = current.dependencies.map(({ blockId, blockerId }) => `${blockId} → ${blockerId}`).join("  ");
  return [
    renderWorld(current),
    "",
    `${bold}Scenario${reset}: ${current.scenario}  ${bold}Status${reset}: ${current.status}  ${bold}Expansions${reset}: ${current.expansionCount}/6`,
    `${bold}Dependencies${reset}: ${chain || "none yet"}`,
    `${bold}Pending${reset}: ${current.frontier.join(", ") || "none"}`,
    current.message,
    `${dim}scenario natural | scenario runaway | scenario separator | step | run | reset | quit${reset}`,
  ].join("\n");
}

function renderWorld(current: ClosureState): string {
  const committed = new Set(current.committed.map(key));
  const walls = new Set(current.walls.map(key));
  const blockCells = new Map<string, PrototypeBlock>();
  for (const block of current.blocks) {
    for (let dy = 0; dy < block.height; dy += 1) {
      for (let dx = 0; dx < block.width; dx += 1) {
        blockCells.set(`${block.x + dx},${block.y + dy}`, block);
      }
    }
  }

  const rows = [`┌${"─".repeat(current.worldWidth)}┐`];
  for (let y = 0; y < current.worldHeight; y += 1) {
    let row = "│";
    for (let x = 0; x < current.worldWidth; x += 1) {
      const point = { x, y };
      const block = blockCells.get(key(point));
      if (walls.has(key(point))) row += `${bold}#${reset}`;
      else if (block) row += renderBlock(block);
      else row += committed.has(key(point)) ? `${dim}·${reset}` : " ";
    }
    rows.push(`${row}${reset}│`);
  }
  rows.push(`└${"─".repeat(current.worldWidth)}┘`);
  return rows.join("\n");
}

function renderBlock(block: PrototypeBlock): string {
  const color = block.id === "R" ? palette[0] : palette[(block.id.charCodeAt(0) - 65) % palette.length];
  return `${color}${bold}${block.id}${reset}`;
}

function key(point: { x: number; y: number }): string {
  return `${point.x},${point.y}`;
}
