import { applyMoves, type Block, type Direction, type GameState } from "../game";
import { cloneState, createGeneratedLevel } from "../generator";
import { createPuzzle } from "../puzzle";
import {
  createClosureState,
  projectClosureViewport,
  reduceClosure,
  type ClosureState,
} from "../world/closure";
import {
  createPrototypeState,
  projectWorldViewport,
  reducePrototype,
  type PrototypeState,
} from "../world/generation";
import { blockColor, rgbCss } from "../world/palette";
import { createCellViews } from "./view-model";

type AppMode = "play" | "world" | "closure";
type DragPreview = {
  direction?: Direction;
  element: HTMLElement;
  pointerId: number;
  startState: GameState;
  startX: number;
  startY: number;
  steps: number;
};
type PanPreview = {
  pointerId: number;
  startX: number;
  startY: number;
};

const board = document.querySelector<HTMLDivElement>("#board")!;
const moves = document.querySelector<HTMLSpanElement>("#moves")!;
const seed = document.querySelector<HTMLSpanElement>("#seed")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const win = document.querySelector<HTMLDivElement>("#win")!;
const lede = document.querySelector<HTMLParagraphElement>("#lede")!;
const instructions = document.querySelector<HTMLParagraphElement>("#instructions")!;
const modeControls = document.querySelector<HTMLDivElement>("#mode-controls")!;
const playActions = [...document.querySelectorAll<HTMLElement>("[data-action='new-level'], [data-action='restart']")];

let mode: AppMode = "play";
let initialState = createPuzzle();
let state = cloneState(initialState);
let currentSeed: number | undefined;
let worldState: PrototypeState = createPrototypeState();
let closureState: ClosureState = createClosureState();
let panPreview: PanPreview | undefined;

function render(): void {
  updateModeChrome();
  if (mode === "play") renderPlay();
  else if (mode === "world") renderWorld();
  else renderClosure();
}

function renderPlay(): void {
  configureBoard(state.width, state.height, "Sliding block puzzle");
  for (const view of createCellViews(state)) {
    board.append(createCell(view.x, view.y, view.kind));
  }
  for (const block of state.blocks) board.append(createBlock(block));
  moves.textContent = `${state.moves} move${state.moves === 1 ? "" : "s"}`;
  seed.textContent = currentSeed === undefined ? "Fixed level" : `Seed ${currentSeed}`;
  win.classList.toggle("visible", state.won);
}

function renderWorld(): void {
  const cells = projectWorldViewport(worldState);
  configureBoard(worldState.camera.width, worldState.camera.height, "Generated World Viewport");
  for (const cell of cells) {
    const background = createCell(cell.x, cell.y, cell.committed ? "empty" : "unknown");
    background.dataset.worldX = String(cell.worldX);
    background.dataset.worldY = String(cell.worldY);
    background.dataset.regionId = cell.regionId ?? "";
    board.append(background);
    if (cell.blockId) board.append(createWorldBlockCell(cell.x, cell.y, cell.worldX, cell.worldY, cell.blockId));
  }
  moves.textContent = `Camera ${worldState.camera.x},${worldState.camera.y}`;
  seed.textContent = `${worldState.regions.length} region${worldState.regions.length === 1 ? "" : "s"}`;
  status.textContent = worldState.message;
  win.classList.remove("visible");
  addControl("Reset World", () => {
    worldState = createPrototypeState();
    render();
  });
}

function renderClosure(): void {
  const cells = projectClosureViewport(closureState);
  configureBoard(10, 10, "Dependency closure Viewport");
  for (const cell of cells) {
    const background = createCell(cell.x, cell.y, cell.wall ? "wall" : cell.committed ? "empty" : "unknown");
    background.dataset.worldX = String(cell.worldX);
    background.dataset.worldY = String(cell.worldY);
    board.append(background);
    if (cell.blockId) board.append(createWorldBlockCell(cell.x, cell.y, cell.worldX, cell.worldY, cell.blockId));
  }
  moves.textContent = closureState.status;
  seed.textContent = `${closureState.expansionCount}/6 expansions`;
  status.textContent = closureState.message;
  win.classList.remove("visible");

  for (const scenario of ["natural", "runaway", "separator"] as const) {
    addControl(scenario, () => {
      closureState = createClosureState(scenario);
      render();
    }, closureState.scenario === scenario);
  }
  addControl("Step", () => {
    closureState = reduceClosure(closureState, { type: "step" });
    render();
  });
  addControl("Run", () => {
    closureState = reduceClosure(closureState, { type: "run" });
    render();
  });
  addControl("Reset", () => {
    closureState = createClosureState(closureState.scenario);
    render();
  });
}

function configureBoard(width: number, height: number, label: string): void {
  board.replaceChildren();
  modeControls.replaceChildren();
  board.style.gridTemplateColumns = `repeat(${width}, minmax(0, 1fr))`;
  board.style.gridTemplateRows = `repeat(${height}, minmax(0, 1fr))`;
  board.style.aspectRatio = `${width} / ${height}`;
  board.dataset.width = String(width);
  board.dataset.height = String(height);
  board.ariaLabel = label;
}

function createCell(x: number, y: number, kind: string): HTMLDivElement {
  const cell = document.createElement("div");
  cell.className = `cell ${kind}`;
  cell.dataset.x = String(x);
  cell.dataset.y = String(y);
  cell.dataset.kind = kind;
  cell.style.gridColumn = String(x + 1);
  cell.style.gridRow = String(y + 1);
  return cell;
}

function createWorldBlockCell(
  x: number,
  y: number,
  worldX: number,
  worldY: number,
  blockId: string,
): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "world-block";
  element.dataset.worldBlock = blockId;
  element.dataset.worldX = String(worldX);
  element.dataset.worldY = String(worldY);
  element.style.gridColumn = String(x + 1);
  element.style.gridRow = String(y + 1);
  element.style.background = rgbCss(blockColor(blockId));
  element.textContent = blockId;
  return element;
}

function createBlock(block: Block): HTMLButtonElement {
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
  element.style.background = rgbCss(blockColor(block.id));
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
    const result = applyMoves(
      completed.startState,
      { blockId: block.id, direction: completed.direction },
      completed.steps,
    );
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
  const legal = applyMoves(
    preview.startState,
    { blockId: block.id, direction },
    preview.startState.width + preview.startState.height,
  );
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
  const next = board.querySelector<HTMLElement>(
    horizontal ? ".cell[data-x='1'][data-y='0']" : ".cell[data-x='0'][data-y='1']",
  )!.getBoundingClientRect();
  return horizontal ? next.left - first.left : next.top - first.top;
}

function clearPreview(element: HTMLElement): void {
  delete element.dataset.dragPreview;
  delete element.dataset.previewSteps;
  element.style.removeProperty("transform");
}

function updateModeChrome(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    button.ariaPressed = String(button.dataset.mode === mode);
  }
  for (const action of playActions) action.hidden = mode !== "play";

  if (mode === "play") {
    lede.textContent = "Drag a block along its axis. Put the Red Block fully onto the Checkpoint.";
    instructions.textContent = "Desktop: click and drag. Phone: touch and drag. One drag may cross several cells.";
  } else if (mode === "world") {
    lede.textContent = "Drag empty space to pan. Every missing cell in the resulting Viewport is generated.";
    instructions.textContent = "World Blocks are generated evidence, not movable puzzle pieces yet.";
  } else {
    lede.textContent = "Compare how a positioned Blocker Dependency chain closes, separates, or reaches its cap.";
    instructions.textContent = "Choose a scenario, then step once or run to its stopping condition.";
  }
}

function addControl(label: string, action: () => void, active = false): void {
  const button = document.createElement("button");
  button.textContent = label;
  button.ariaPressed = String(active);
  button.addEventListener("pointerup", action);
  modeControls.append(button);
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
  button.addEventListener("pointerup", () => {
    mode = button.dataset.mode as AppMode;
    status.textContent = mode === "play"
      ? "Drag a block across one or more cells."
      : mode === "world"
        ? worldState.message
        : closureState.message;
    render();
  });
}

board.addEventListener("pointerdown", (event) => {
  if (mode !== "world") return;
  const target = event.target as HTMLElement;
  if (target.closest("[data-world-block]")) {
    status.textContent = "This generated Block is static in the current World experiment.";
    return;
  }
  if (!target.closest(".cell")) return;
  panPreview = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
  board.setPointerCapture(event.pointerId);
});

board.addEventListener("pointerup", (event) => {
  if (mode !== "world" || !panPreview || panPreview.pointerId !== event.pointerId) return;
  const preview = panPreview;
  panPreview = undefined;
  const deltaX = Math.round((preview.startX - event.clientX) / cellPitch(true));
  const deltaY = Math.round((preview.startY - event.clientY) / cellPitch(false));
  if (deltaX === 0 && deltaY === 0) {
    status.textContent = "Drag empty space across at least one cell to pan.";
    return;
  }
  worldState = reducePrototype(worldState, { type: "pan-camera", deltaX, deltaY });
  render();
});

board.addEventListener("pointercancel", () => {
  if (mode !== "world" || !panPreview) return;
  panPreview = undefined;
  status.textContent = "Camera drag canceled.";
});

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
