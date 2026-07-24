import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import {
  createPrototypeState,
  reducePrototype,
  type Direction,
  type PrototypeBlock,
  type PrototypeState,
} from "./state";

const ansiReset = "\x1b[0m";
const bold = "\x1b[1m";
const dim = "\x1b[2m";
const input = createInterface({ input: stdin, output: stdout, terminal: Boolean(stdin.isTTY) });
let state = createPrototypeState();
let firstFrame = true;

showFrame();
for await (const rawLine of input) {
  const line = rawLine.trim().toLowerCase();
  if (line === "quit" || line === "q") break;
  if (line === "reset") {
    state = reducePrototype(state, { type: "reset" });
  } else {
    const match = /^move\s+(left|right|up|down)(?:\s+(\d+))?$/.exec(line);
    if (match) {
      const steps = Number(match[2] ?? "1");
      state = steps > 0
        ? reducePrototype(state, { type: "move-camera", direction: match[1] as Direction, steps })
        : { ...state, message: "Camera movement must be at least one cell." };
    } else {
      state = { ...state, message: "Unknown command. Use move DIRECTION [N], reset, or quit." };
    }
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

function render(current: PrototypeState): string {
  return [
    renderWorld(current),
    "",
    current.message,
    `${dim}move right 5 | move left 5 | move down 5 | move up 5 | reset | quit${ansiReset}`,
  ].join("\n");
}

function renderWorld(current: PrototypeState): string {
  const committed = new Set(current.cells.map((cell) => `${cell.x},${cell.y}`));
  const blockCells = new Map<string, PrototypeBlock>();
  for (const block of current.blocks) {
    for (let dy = 0; dy < block.height; dy += 1) {
      for (let dx = 0; dx < block.width; dx += 1) {
        blockCells.set(`${block.x + dx},${block.y + dy}`, block);
      }
    }
  }

  const rows: string[] = [];
  rows.push(`┌${"──".repeat(current.worldWidth)}┐`);
  for (let y = 0; y < current.worldHeight; y += 1) {
    let row = "│";
    for (let x = 0; x < current.worldWidth; x += 1) {
      const inside = inViewport(current, x, y);
      const blockCell = blockCells.get(`${x},${y}`);
      if (blockCell) row += renderBlock(blockCell, inside);
      else if (committed.has(`${x},${y}`)) row += renderCommitted(inside);
      else row += renderUnknown(inside);
    }
    rows.push(`${row}${ansiReset}│`);
  }
  rows.push(`└${"──".repeat(current.worldWidth)}┘`);
  return rows.join("\n");
}

function renderBlock(block: PrototypeBlock, inside: boolean): string {
  const factor = inside ? 1 : 0.42;
  const [red, green, blue] = block.color.map((channel) => Math.round(channel * factor));
  const label = `${block.id} `.slice(0, 2);
  return `\x1b[48;2;${red};${green};${blue}m\x1b[38;2;15;18;24m${bold}${label}${ansiReset}`;
}

function renderCommitted(inside: boolean): string {
  return inside
    ? "\x1b[48;2;35;50;66m\x1b[38;2;165;180;198m··\x1b[0m"
    : `${dim}. ${ansiReset}`;
}

function renderUnknown(inside: boolean): string {
  return inside ? "\x1b[48;2;24;36;49m░░\x1b[0m" : "  ";
}

function inViewport(state: PrototypeState, x: number, y: number): boolean {
  return x >= state.camera.x
    && x < state.camera.x + state.camera.width
    && y >= state.camera.y
    && y < state.camera.y + state.camera.height;
}
