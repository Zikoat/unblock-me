import { applyMoves, type Block, type Direction, type GameState } from "../game";
import { cloneState, createGeneratedLevel } from "../generator";
import { createPuzzle } from "../puzzle";
import { createCellViews } from "./view-model";

const board = document.querySelector<HTMLDivElement>("#board")!;
const moves = document.querySelector<HTMLSpanElement>("#moves")!;
const seed = document.querySelector<HTMLSpanElement>("#seed")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const win = document.querySelector<HTMLDivElement>("#win")!;

let initialState = createPuzzle();
let state = cloneState(initialState);
let currentSeed: number | undefined;

type DragPreview = {
  direction?: Direction;
  element: HTMLElement;
  pointerId: number;
  startState: GameState;
  startX: number;
  startY: number;
  steps: number;
};

function render(): void {
  board.replaceChildren();
  board.style.gridTemplateColumns = `repeat(${state.width}, minmax(0, 1fr))`;
  board.style.gridTemplateRows = `repeat(${state.height}, minmax(0, 1fr))`;
  board.style.aspectRatio = `${state.width} / ${state.height}`;
  board.dataset.width = String(state.width);
  board.dataset.height = String(state.height);
  for (const view of createCellViews(state)) {
    const cell = document.createElement("div");
    cell.className = `cell ${view.kind}`;
    cell.dataset.x = String(view.x);
    cell.dataset.y = String(view.y);
    cell.dataset.kind = view.kind;
    cell.style.gridColumn = String(view.x + 1);
    cell.style.gridRow = String(view.y + 1);
    board.append(cell);
  }
  for (const [index, block] of state.blocks.entries()) board.append(createBlock(block, index));
  moves.textContent = `${state.moves} move${state.moves === 1 ? "" : "s"}`;
  seed.textContent = currentSeed === undefined ? "Fixed level" : `Seed ${currentSeed}`;
  win.classList.toggle("visible", state.won);
}

function createBlock(block: Block, index: number): HTMLButtonElement {
  const element = document.createElement("button");
  element.className = "block";
  element.dataset.blockId = block.id;
  element.dataset.x = String(block.x);
  element.dataset.y = String(block.y);
  element.dataset.width = String(block.width);
  element.dataset.height = String(block.height);
  element.dataset.movement = block.movement;
  element.ariaLabel = `${block.id} block`;
  element.textContent = block.id === "R" ? "RED" : block.id;
  element.style.gridColumn = `${block.x + 1} / span ${block.width}`;
  element.style.gridRow = `${block.y + 1} / span ${block.height}`;
  element.style.setProperty("--block-hue", String((195 + index * 57) % 360));
  attachDrag(element, block);
  return element;
}

function attachDrag(element: HTMLElement, block: Block): void {
  let preview: DragPreview | undefined;
  element.addEventListener("pointerdown", (event) => {
    if (state.won) return;
    preview = {
      element,
      pointerId: event.pointerId,
      startState: state,
      startX: event.clientX,
      startY: event.clientY,
      steps: 0,
    };
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener("pointermove", (event) => {
    if (!preview || preview.pointerId !== event.pointerId) return;
    updatePreview(preview, block, event.clientX - preview.startX, event.clientY - preview.startY);
  });
  element.addEventListener("pointerup", (event) => {
    if (!preview || preview.pointerId !== event.pointerId) return;
    const completed = preview;
    preview = undefined;
    clearPreview(completed.element);
    if (!completed.direction || completed.steps === 0) {
      status.textContent = "Drag farther to cross a cell.";
      return;
    }
    const result = applyMoves(completed.startState, { blockId: block.id, direction: completed.direction }, completed.steps);
    if (!result.ok) {
      status.textContent = result.message;
      render();
      return;
    }
    state = result.state;
    status.textContent = result.state.won
      ? "Checkpoint reached."
      : `${block.id} moved ${result.movedSteps} cell${result.movedSteps === 1 ? "" : "s"} ${completed.direction}.`;
    render();
  });
  element.addEventListener("pointercancel", (event) => {
    if (!preview || preview.pointerId !== event.pointerId) return;
    clearPreview(preview.element);
    preview = undefined;
    status.textContent = "Drag canceled.";
  });
}

function updatePreview(preview: DragPreview, block: Block, dx: number, dy: number): void {
  const direction = dragDirection(block, dx, dy);
  if (!direction) {
    preview.steps = 0;
    preview.direction = undefined;
    clearPreview(preview.element);
    return;
  }
  const horizontal = direction === "left" || direction === "right";
  const displacement = horizontal ? dx : dy;
  const pitch = cellPitch(horizontal);
  const requested = Math.max(1, Math.ceil(Math.abs(displacement) / pitch));
  const legal = applyMoves(preview.startState, { blockId: block.id, direction }, preview.startState.width + preview.startState.height);
  const maximumSteps = legal.ok ? legal.movedSteps : 0;
  const clampedPixels = Math.min(Math.abs(displacement), maximumSteps * pitch) * Math.sign(displacement);
  preview.direction = direction;
  preview.steps = Math.min(maximumSteps, Math.max(0, Math.round(Math.abs(displacement) / pitch)));
  preview.element.dataset.dragPreview = "true";
  preview.element.style.transform = horizontal ? `translateX(${clampedPixels}px)` : `translateY(${clampedPixels}px)`;
  preview.element.dataset.previewSteps = String(Math.min(requested, maximumSteps));
}

function dragDirection(block: Block, dx: number, dy: number): Direction | undefined {
  if (dx === 0 && dy === 0) return undefined;
  if (block.movement === "horizontal") return dx === 0 ? undefined : dx < 0 ? "left" : "right";
  if (block.movement === "vertical") return dy === 0 ? undefined : dy < 0 ? "up" : "down";
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

function cellPitch(horizontal: boolean): number {
  const first = board.querySelector<HTMLElement>(".cell[data-x='0'][data-y='0']")!.getBoundingClientRect();
  const next = board.querySelector<HTMLElement>(horizontal ? ".cell[data-x='1'][data-y='0']" : ".cell[data-x='0'][data-y='1']")!.getBoundingClientRect();
  return horizontal ? next.left - first.left : next.top - first.top;
}

function clearPreview(element: HTMLElement): void {
  delete element.dataset.dragPreview;
  delete element.dataset.previewSteps;
  element.style.removeProperty("transform");
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
