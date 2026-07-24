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
import { zoomFromPinch, zoomFromWheel } from "./zoom";
import { panMapCamera, pinchMapCamera, type MapCamera, type ScreenPoint } from "./map-camera";
import {
  canAdvanceToNextLevel,
  upsertLevelFeedback,
  type FeedbackDraft,
  type LevelFeedback,
  type LevelRating,
} from "./feedback";
import { bundledSourceCommit, createEvidenceExport } from "./evidence-export";
import {
  BROWSER_SESSION_KEY,
  decodeBrowserSession,
  encodeBrowserSession,
  type BrowserSession,
  type SemanticMove,
} from "./session";

type AppMode = "play" | "world" | "closure";
type DragPreview = {
  block: Block;
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
  startCamera: MapCamera;
  startX: number;
  startY: number;
};

const board = document.querySelector<HTMLDivElement>("#board")!;
const boardFrame = document.querySelector<HTMLDivElement>("#board-frame")!;
const moves = document.querySelector<HTMLSpanElement>("#moves")!;
const seed = document.querySelector<HTMLSpanElement>("#seed")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const win = document.querySelector<HTMLDivElement>("#win")!;
const zoomBadge = document.querySelector<HTMLSpanElement>("#zoom")!;
const historyBadge = document.querySelector<HTMLSpanElement>("#history")!;
const lede = document.querySelector<HTMLParagraphElement>("#lede")!;
const instructions = document.querySelector<HTMLParagraphElement>("#instructions")!;
const modeControls = document.querySelector<HTMLDivElement>("#mode-controls")!;
const feedbackPanel = document.querySelector<HTMLElement>("#feedback-panel")!;
const feedbackComment = document.querySelector<HTMLTextAreaElement>("#feedback-comment")!;
const feedbackState = document.querySelector<HTMLParagraphElement>("#feedback-state")!;
const generationDetails = document.querySelector<HTMLDetailsElement>("#generation-details")!;
const generationRecord = document.querySelector<HTMLPreElement>("#generation-record")!;
const ratingButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-rating]")];
const playActions = [...document.querySelectorAll<HTMLElement>("[data-action='new-level'], [data-action='restart']")];

const restoredSession = decodeBrowserSession(localStorage.getItem(BROWSER_SESSION_KEY));
let mode: AppMode = restoredSession?.mode ?? "play";
let initialState = restoredSession?.initialState ?? createPuzzle();
let state = restoredSession?.playState ?? cloneState(initialState);
let currentSeed: number | undefined = restoredSession?.currentSeed;
let currentGeneration = restoredSession?.currentGeneration;
let currentSolution = restoredSession?.currentSolution;
let worldState: PrototypeState = restoredSession?.worldState ?? createPrototypeState();
let worldCamera: MapCamera = {
  x: restoredSession?.worldView.x ?? worldState.camera.x,
  y: restoredSession?.worldView.y ?? worldState.camera.y,
  zoom: restoredSession?.zoom ?? 1,
};
let closureState: ClosureState = restoredSession?.closureState ?? createClosureState();
let moveHistory: SemanticMove[] = restoredSession?.moveHistory ?? [];
let currentLevelId = restoredSession?.currentLevelId ?? crypto.randomUUID();
let currentLevelSolved = restoredSession?.currentLevelSolved ?? state.won;
let feedbackDraft: FeedbackDraft = restoredSession?.feedbackDraft ?? { comment: "" };
let feedbackEntries: LevelFeedback[] = restoredSession?.feedbackEntries ?? [];
let panPreview: PanPreview | undefined;
let dragPreview: DragPreview | undefined;
let zoom = restoredSession?.zoom ?? 1;
const pointerPositions = new Map<number, { x: number; y: number }>();
let pinchStartDistance = 0;
let pinchStartZoom = 1;
let pinchStartCamera: MapCamera = worldCamera;
let pinchStartCentroid: ScreenPoint = { x: 0, y: 0 };
let pinchActive = false;
let suppressDragUntilPointersClear = false;

function render(): void {
  updateModeChrome();
  if (mode === "play") renderPlay();
  else if (mode === "world") renderWorld();
  else renderClosure();
  historyBadge.textContent = `${moveHistory.length} recorded move${moveHistory.length === 1 ? "" : "s"}`;
  renderFeedback();
  persistSession();
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
  renderGenerationDetails(currentGeneration);
}

function renderWorld(): void {
  const overscan = 5;
  const projection = {
    ...worldState,
    camera: {
      x: worldState.camera.x - overscan,
      y: worldState.camera.y - overscan,
      width: worldState.camera.width + overscan * 2,
      height: worldState.camera.height + overscan * 2,
    },
  };
  const cells = projectWorldViewport(projection);
  configureBoard(projection.camera.width, projection.camera.height, "Generated World map", true);
  for (const cell of cells) {
    const background = createCell(cell.x, cell.y, cell.committed ? "empty" : "unknown");
    background.dataset.worldX = String(cell.worldX);
    background.dataset.worldY = String(cell.worldY);
    background.dataset.regionId = cell.regionId ?? "";
    board.append(background);
    if (cell.blockId) board.append(createWorldBlockCell(cell.x, cell.y, cell.worldX, cell.worldY, cell.blockId));
  }
  updateWorldCameraBadge();
  seed.textContent = `${worldState.regions.length} region${worldState.regions.length === 1 ? "" : "s"}`;
  status.textContent = worldState.message;
  win.classList.remove("visible");
  renderGenerationDetails(worldState.generation);
  addControl("Reset World", () => {
    worldState = createPrototypeState();
    worldCamera = { x: worldState.camera.x, y: worldState.camera.y, zoom };
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
  renderGenerationDetails(undefined);

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

function configureBoard(width: number, height: number, label: string, worldMap = false): void {
  board.replaceChildren();
  modeControls.replaceChildren();
  board.style.gridTemplateColumns = `repeat(${width}, minmax(0, 1fr))`;
  board.style.gridTemplateRows = `repeat(${height}, minmax(0, 1fr))`;
  board.style.aspectRatio = `${width} / ${height}`;
  boardFrame.style.aspectRatio = `${width} / ${height}`;
  board.dataset.width = String(width);
  board.dataset.height = String(height);
  board.ariaLabel = label;
  board.classList.toggle("world-map", worldMap);
  applyZoom();
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
  element.addEventListener("pointerdown", (event) => {
    if (pinchActive || suppressDragUntilPointersClear) return;
    dragPreview = {
      block,
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
    if (!dragPreview || dragPreview.pointerId !== event.pointerId) return;
    if (pinchActive || suppressDragUntilPointersClear) {
      cancelActiveInteractions();
      return;
    }
    updatePreview(
      dragPreview,
      block,
      event.clientX - dragPreview.startX,
      event.clientY - dragPreview.startY,
    );
  });
  element.addEventListener("pointerup", (event) => {
    if (!dragPreview || dragPreview.pointerId !== event.pointerId) return;
    if (pinchActive || suppressDragUntilPointersClear) {
      cancelActiveInteractions();
      return;
    }
    const completed = dragPreview;
    dragPreview = undefined;
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
    currentLevelSolved ||= result.state.won;
    moveHistory = [
      ...moveHistory,
      {
        type: "block-move",
        blockId: block.id,
        direction: completed.direction,
        requestedSteps: completed.steps,
        movedSteps: result.movedSteps,
        before: cloneState(completed.startState),
        after: cloneState(result.state),
      },
    ];
    status.textContent = result.state.won
      ? "Checkpoint reached."
      : `${block.id} moved ${result.movedSteps} cell${result.movedSteps === 1 ? "" : "s"} ${completed.direction}.`;
    render();
  });
  element.addEventListener("pointercancel", (event) => {
    if (!dragPreview || dragPreview.pointerId !== event.pointerId) return;
    clearPreview(dragPreview.element);
    dragPreview = undefined;
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

function cancelActiveInteractions(): void {
  if (dragPreview) clearPreview(dragPreview.element);
  dragPreview = undefined;
  panPreview = undefined;
}

function applyZoom(): void {
  worldCamera.zoom = zoom;
  board.style.setProperty("--board-zoom", String(zoom));
  if (mode === "world") {
    const cellSize = mapCellSize();
    board.style.setProperty("--map-pan-x", `${(worldState.camera.x - worldCamera.x) * cellSize}px`);
    board.style.setProperty("--map-pan-y", `${(worldState.camera.y - worldCamera.y) * cellSize}px`);
    updateWorldCameraBadge();
  } else {
    board.style.setProperty("--map-pan-x", "0px");
    board.style.setProperty("--map-pan-y", "0px");
  }
  zoomBadge.textContent = `${Math.round(zoom * 100)}% zoom`;
}

function persistSession(): void {
  localStorage.setItem(BROWSER_SESSION_KEY, encodeBrowserSession(currentSession()));
}

function currentSession(): BrowserSession {
  return {
    version: 1,
    mode,
    zoom,
    currentSeed,
    currentGeneration,
    currentSolution,
    currentLevelId,
    currentLevelSolved,
    feedbackDraft,
    feedbackEntries,
    worldView: { x: worldCamera.x, y: worldCamera.y },
    initialState,
    playState: state,
    moveHistory,
    worldState,
    closureState,
  };
}

function pointerDistance(): number {
  const [first, second] = [...pointerPositions.values()];
  if (!first || !second) return 0;
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function pointerCentroid(): ScreenPoint {
  const [first, second] = [...pointerPositions.values()];
  if (!first || !second) return { x: 0, y: 0 };
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function mapCellSize(): number {
  return boardFrame.getBoundingClientRect().width / worldState.camera.width;
}

function mapFrameCenter(): ScreenPoint {
  const frame = boardFrame.getBoundingClientRect();
  return { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 };
}

function updateWorldCameraBadge(): void {
  if (mode !== "world") return;
  moves.textContent = `Camera ${worldCamera.x.toFixed(1)},${worldCamera.y.toFixed(1)}`;
}

function syncWorldCamera(): void {
  const targetX = Math.round(worldCamera.x);
  const targetY = Math.round(worldCamera.y);
  const deltaX = targetX - worldState.camera.x;
  const deltaY = targetY - worldState.camera.y;
  if (deltaX !== 0 || deltaY !== 0) {
    worldState = reducePrototype(worldState, { type: "pan-camera", deltaX, deltaY });
    render();
    return;
  }
  applyZoom();
  persistSession();
}

function updateModeChrome(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    button.ariaPressed = String(button.dataset.mode === mode);
  }
  for (const action of playActions) action.hidden = mode !== "play";
  feedbackPanel.hidden = mode !== "play";

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

function renderFeedback(): void {
  feedbackComment.value = feedbackDraft.comment;
  for (const button of ratingButtons) {
    button.ariaPressed = String(button.dataset.rating === feedbackDraft.rating);
  }
  feedbackState.textContent = feedbackDraft.rating
    ? `Saved thumbs ${feedbackDraft.rating}. You can change the vote or comment.`
    : currentLevelSolved
      ? "Rate this solved level to unlock the next level. You can keep moving blocks."
      : "You can rate this level now, or skip it unfinished.";
}

function renderGenerationDetails(record: unknown): void {
  generationDetails.hidden = record === undefined;
  generationRecord.textContent = record === undefined ? "" : JSON.stringify(record, null, 2);
}

function saveFeedback(): void {
  if (!feedbackDraft.rating) return;
  feedbackEntries = upsertLevelFeedback(feedbackEntries, {
    levelId: currentLevelId,
    rating: feedbackDraft.rating,
    comment: feedbackDraft.comment,
    ratedAt: new Date().toISOString(),
    solved: currentLevelSolved,
    initialState: cloneState(initialState),
    generation: currentGeneration,
    solution: currentSolution,
    sourceCommit: bundledSourceCommit(),
    stateAtRating: cloneState(state),
    moveHistory: structuredClone(moveHistory),
  });
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
  panPreview = {
    pointerId: event.pointerId,
    startCamera: { ...worldCamera, zoom },
    startX: event.clientX,
    startY: event.clientY,
  };
  board.setPointerCapture(event.pointerId);
});

board.addEventListener("pointerdown", (event) => {
  pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointerPositions.size !== 2) return;
  pinchActive = true;
  suppressDragUntilPointersClear = true;
  pinchStartDistance = pointerDistance();
  pinchStartZoom = zoom;
  pinchStartCamera = { ...worldCamera, zoom };
  pinchStartCentroid = pointerCentroid();
  cancelActiveInteractions();
}, { capture: true });

board.addEventListener("pointermove", (event) => {
  if (!pointerPositions.has(event.pointerId)) return;
  pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (!pinchActive || pointerPositions.size < 2) return;
  event.preventDefault();
  if (mode === "world") {
    worldCamera = pinchMapCamera(
      pinchStartCamera,
      mapFrameCenter(),
      pinchStartCentroid,
      pointerCentroid(),
      pinchStartDistance,
      pointerDistance(),
      mapCellSize(),
      worldState.camera.width / 2,
    );
    zoom = worldCamera.zoom;
    syncWorldCamera();
  } else {
    zoom = zoomFromPinch(pinchStartZoom, pinchStartDistance, pointerDistance());
    applyZoom();
    persistSession();
  }
}, { capture: true });

board.addEventListener("pointermove", (event) => {
  if (mode !== "world" || pinchActive || !panPreview || panPreview.pointerId !== event.pointerId) return;
  worldCamera = panMapCamera(
    panPreview.startCamera,
    { x: panPreview.startX, y: panPreview.startY },
    { x: event.clientX, y: event.clientY },
    mapCellSize(),
  );
  syncWorldCamera();
});

for (const eventName of ["pointerup", "pointercancel"] as const) {
  board.addEventListener(eventName, (event) => {
    pointerPositions.delete(event.pointerId);
    if (pointerPositions.size < 2) pinchActive = false;
    if (pointerPositions.size === 0) suppressDragUntilPointersClear = false;
  }, { capture: true });
}

boardFrame.addEventListener("wheel", (event) => {
  event.preventDefault();
  const nextZoom = zoomFromWheel(zoom, event.deltaY);
  if (mode === "world" && nextZoom !== zoom) {
    const pointer = { x: event.clientX, y: event.clientY };
    worldCamera = pinchMapCamera(
      { ...worldCamera, zoom },
      mapFrameCenter(),
      pointer,
      pointer,
      1,
      nextZoom / zoom,
      mapCellSize(),
      worldState.camera.width / 2,
    );
  }
  zoom = nextZoom;
  applyZoom();
  persistSession();
}, { passive: false });

board.addEventListener("pointerup", (event) => {
  if (mode !== "world" || !panPreview || panPreview.pointerId !== event.pointerId) return;
  panPreview = undefined;
  persistSession();
});

board.addEventListener("pointercancel", () => {
  if (mode !== "world" || !panPreview) return;
  panPreview = undefined;
  status.textContent = "Camera drag canceled.";
});

document.querySelector<HTMLButtonElement>("[data-action='new-level']")!.addEventListener("pointerup", () => {
  if (!canAdvanceToNextLevel(currentLevelSolved, feedbackDraft.rating)) {
    status.textContent = "Choose thumbs up or thumbs down before starting the next solved level.";
    renderFeedback();
    return;
  }
  currentSeed = Math.floor(Math.random() * 4_000_000_000) + 1;
  const level = createGeneratedLevel(currentSeed);
  currentGeneration = level.generation;
  currentSolution = level.solution;
  initialState = level.state;
  state = cloneState(initialState);
  moveHistory = [];
  currentLevelId = crypto.randomUUID();
  currentLevelSolved = false;
  feedbackDraft = { comment: "" };
  status.textContent = `Generated solvable level ${currentSeed}.`;
  render();
});

document.querySelector<HTMLButtonElement>("[data-action='restart']")!.addEventListener("pointerup", () => {
  state = cloneState(initialState);
  moveHistory = [];
  status.textContent = "Level restarted.";
  render();
});

for (const button of ratingButtons) {
  button.addEventListener("pointerup", () => {
    feedbackDraft = { ...feedbackDraft, rating: button.dataset.rating as LevelRating };
    saveFeedback();
    status.textContent = `Thumbs ${feedbackDraft.rating} saved${feedbackDraft.comment ? " with your comment" : ""}.`;
    render();
  });
}

feedbackComment.addEventListener("input", () => {
  feedbackDraft = { ...feedbackDraft, comment: feedbackComment.value };
  saveFeedback();
  persistSession();
  renderFeedback();
});

document.querySelector<HTMLButtonElement>("[data-action='export']")!.addEventListener("pointerup", () => {
  const exported = createEvidenceExport(currentSession());
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `unblock-me-evidence-${exported.exportedAt.replaceAll(":", "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
  status.textContent = "Complete play and generation evidence exported.";
});

render();
