import { applyMove, type Block, type Direction, type GameState } from "../game";
import { cloneState, createGeneratedLevel } from "../generator";
import { createPuzzle } from "../puzzle";

const board = document.querySelector<HTMLDivElement>("#board")!;
const moves = document.querySelector<HTMLSpanElement>("#moves")!;
const seed = document.querySelector<HTMLSpanElement>("#seed")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const win = document.querySelector<HTMLDivElement>("#win")!;

let initialState = createPuzzle();
let state = cloneState(initialState);
let currentSeed: number | undefined;

function render(): void {
  board.replaceChildren();
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      if (state.checkpoint.some((point) => point.x === x && point.y === y)) cell.classList.add("checkpoint");
      if (state.walls.some((point) => point.x === x && point.y === y)) cell.classList.add("wall");
      board.append(cell);
    }
  }
  for (const block of state.blocks) board.append(createBlock(block));
  moves.textContent = `${state.moves} move${state.moves === 1 ? "" : "s"}`;
  seed.textContent = currentSeed === undefined ? "Fixed level" : `Seed ${currentSeed}`;
  win.classList.toggle("visible", state.won);
}

function createBlock(block: Block): HTMLButtonElement {
  const element = document.createElement("button");
  element.className = "block";
  element.dataset.blockId = block.id;
  element.ariaLabel = `${block.id} block`;
  element.textContent = block.id === "R" ? "RED" : block.id;
  element.style.gridColumn = `${block.x + 1} / span ${block.axis === "horizontal" ? block.length : 1}`;
  element.style.gridRow = `${block.y + 1} / span ${block.axis === "vertical" ? block.length : 1}`;
  attachDrag(element, block);
  return element;
}

function attachDrag(element: HTMLElement, block: Block): void {
  let start: { x: number; y: number; pointerId: number } | undefined;
  element.addEventListener("pointerdown", (event) => {
    if (state.won) return;
    start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener("pointerup", (event) => {
    if (!start || start.pointerId !== event.pointerId) return;
    const direction = directionFromDrag(block.axis, event.clientX - start.x, event.clientY - start.y);
    start = undefined;
    if (!direction) {
      status.textContent = "Drag farther along the block's axis.";
      return;
    }
    const result = applyMove(state, { blockId: block.id, direction });
    if (!result.ok) {
      status.textContent = result.message;
      return;
    }
    state = result.state;
    status.textContent = result.state.won ? "Checkpoint reached." : `${block.id} moved ${direction}.`;
    render();
  });
  element.addEventListener("pointercancel", () => { start = undefined; });
}

function directionFromDrag(axis: Block["axis"], dx: number, dy: number): Direction | undefined {
  const threshold = 18;
  if (axis === "horizontal" && Math.abs(dx) >= threshold && Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  if (axis === "vertical" && Math.abs(dy) >= threshold && Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "up" : "down";
  return undefined;
}

document.querySelector<HTMLButtonElement>("[data-action='new-level']")!.addEventListener("pointerup", () => {
  currentSeed = Math.floor(Math.random() * 4_000_000_000) + 1;
  const level = createGeneratedLevel(currentSeed);
  initialState = level.state;
  state = cloneState(initialState);
  status.textContent = `Generated solvable level ${currentSeed}.`;
  render();
});

document.querySelector<HTMLButtonElement>("[data-action='restart']")!.addEventListener("pointerup", () => {
  state = cloneState(initialState);
  status.textContent = "Level restarted.";
  render();
});

render();
