// The app: wires the canvas, the gestures, storage, goals and live reload together.
import type { Point, Rect } from "./camera";
import type { Difficulty } from "./difficulty";
import { MAX_STARS, medalWon, scoreTrack, starsEarned } from "./stars";
import { finishTimes, type TraceEntry } from "./score-track";
import { Inspector } from "./inspector";
import { finishCues, finishParts, SOUL, timeWarp } from "./finish-fx";
import { moreCues, moreParts, warmUp } from "./finish-fx2";
import * as sfx from "./sfx";
import { timedFrame } from "./perf";
import { bestKnown, medal, shownUsed, viewCentre, type Goal } from "./goal";
import type { GoalRequest } from "./goal-worker";
import { Gestures, type Input } from "./gestures";
import { ISLAND_LEVELS } from "./island-levels";
import { bayReached, inIsland, isLast, islandCamera, islandRects, nextIslandGoal, SIDE, squareAt, squareOf } from "./island";
import { fixedLayout, MAX_TRIES, MIN_TRIES, randomLayout, TRIES, UNIT, type Placed, type Ui } from "./layout";
import { CARD, CUE_MS, draw, fading, islandCardRect, resetFades, RIPPLE_MS, SHAKE_MS, THROB_MS, redArrow, uiArrow, type Sparkle } from "./render";
import { ease, slideDuration } from "./slide";
import { blockAt, blocksIn, slideRange, type Move } from "./rules";
import { borderOnScreen, goalSolved, latticeRect, newScene, quickPush, record, relayout, resize, restart, undo, visibleBlocks, whereIs } from "./scene";

// v10: varied island squares; v9 a slower island ramp; v8 harder island squares (their
// blocks' stored places no longer fit, each time); v7 the island (everyone starts on it); v6
// UI blocks in a game row and a debug row (generation changed); v5 two rows of UI blocks, v4
// one row, v3 one 2x2 reset block, v2 no seed, v1 free positions.
const SEED_KEY = "unblock-me:v10:seed";
const MOVED_KEY = "unblock-me:v10:moved";
const HISTORY_KEY = "unblock-me:v10:history";
const GOAL_KEY = "unblock-me:v10:goal";
const BORDER_KEY = "unblock-me:border";
const FPS_KEY = "unblock-me:fps"; // whether the fps counter shows
const TRIES_KEY = "unblock-me:tries";
const CAMERA_KEY = "unblock-me:camera"; // where the view is, kept across reloads
const LOG_KEY = "unblock-me:log"; // the play log; kept across resets
const DEVICE_KEY = "unblock-me:device"; // names this browser's automatic uploads; kept across resets
const DEBUG_KEY = "unblock-me:debug"; // whether the debug UI row is on; kept across resets
const DETAIL_KEY = "unblock-me:detail"; // how far the finish's detail has stepped down on this device (see pace)
/** With the red block stuck, tapping the empty board and then the red block (which shakes)
 * this many times over, with nothing else between, turns the debug UI on (for good) and
 * resets, since its blocks change the board. Unlikely by accident. */
const DEBUG_ROUNDS = 5;
/** The density slider's track, as a share of its block (see densityIcon). */
const TRACK = 0.52;

declare const __BUILD_ID__: string;
declare const __COMMIT__: string;

// ?testbed opens a small fixed board with a few simple goals in turn, for trying the
// finish's animations; a reload starts it over.
const testbed = new URLSearchParams(location.search).has("testbed");
const H = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 1, h: 2 });
const Wall = (x: number, y: number): Placed => ({ id: `wall ${x},${y}`, x, y, w: 1, h: 1, wall: true });
const known = (moves: number): Difficulty => ({ moves, atLeast: moves, searched: 0, branching: 2, score: moves });
const TESTBED = {
  blocks: [H("a", -2, -1), Wall(3, -1), V("b", 3, 1), Wall(3, 6), H("c", -2, 3), Wall(-3, 3), V("v", 1, 2), V("d", -2, 5), Wall(-2, 9), H("e", -1, -3), V("f", 0, 5)],
  // One move for a medal; one for 5 stars; two (move v first) for 5 stars, more for fewer;
  // one more for 5 stars, or fewer after extra moves.
  goals: [
    { id: "a", target: { x: 1, y: -1 }, solution: [], difficulty: known(2) },
    { id: "b", target: { x: 3, y: 4 }, solution: [], difficulty: known(1) },
    { id: "c", target: { x: 1, y: 3 }, solution: [], difficulty: known(2) },
    { id: "d", target: { x: -2, y: 7 }, solution: [], difficulty: known(1) },
  ] as Goal[],
};
// ?island=0 leaves the island out: the generated world from the start, as before it (for
// tests of the world itself).
const withIsland = new URLSearchParams(location.search).get("island") !== "0";
// ?testbed=N starts at goal N (0 first).
let testbedNext = Number(new URLSearchParams(location.search).get("testbed")) || 0;
// ?board=<JSON list of placed blocks> opens exactly that board (for sharing a board, and
// for tests). Nothing is stored while it is open (nor on the testbed).
const shared = new URLSearchParams(location.search).get("board") ?? (testbed ? JSON.stringify(TESTBED.blocks) : null);
// Set by a reset: from then on this page stores nothing.
let forgetting = false;

const canvas = document.querySelector("canvas")!;
const fps = document.querySelector<HTMLElement>("#fps")!;
const tip = document.querySelector<HTMLElement>("#tip")!;
const viewBox = document.querySelector<HTMLElement>("#view")!;

/** Keep the on-screen controls inside the view: the smaller border when it is on. */
function placeView(): void {
  const v = borderOnScreen(scene);
  Object.assign(viewBox.style, { left: `${v.x}px`, top: `${v.y}px`, width: `${v.width}px`, height: `${v.height}px` });
}

// Tapping an edge arrow glides the view there, at the same zoom, putting `to` (lattice units)
// in the middle; `delay` ms later, so the arrow's throb shows first.
// `scale`: the zoom to end at (the same by default).
let flight: { from: { scale: number; offsetX: number; offsetY: number }; to: Point; start: number | null; delay: number; duration: number; scale?: number } | null = null;
function flyTo(to: Point, delay = 0, duration = 350, scale?: number): void {
  flight = { from: { ...scene.camera }, to, start: null, delay, duration, scale };
}
function flying(now: number): void {
  if (!flight) return;
  flight.start ??= now + flight.delay;
  const t = Math.max(0, Math.min(1, (now - flight.start) / flight.duration));
  const { scale: from } = flight.from, scale = flight.scale ?? from;
  const to = { offsetX: scene.width / 2 - flight.to.x * UNIT * scale, offsetY: scene.height / 2 - flight.to.y * UNIT * scale };
  const e = ease(t);
  scene.camera = {
    scale: from + (scale - from) * e,
    offsetX: flight.from.offsetX + (to.offsetX - flight.from.offsetX) * e,
    offsetY: flight.from.offsetY + (to.offsetY - flight.from.offsetY) * e,
  };
  if (t >= 1) flight = null;
}

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

// The play log: what happened when, for analysing goals and their difficulty against how they
// were really played (sent with the play data). Append-only; the oldest events go past LOG_MAX.
type LogEvent =
  | { e: "load"; commit: string }
  | { e: "error"; message: string; where: string }
  | { e: "goal"; commit: string; id: string; target: Point; start?: Point; tries: number; seed: number; solution: number; moved: [string, number, number][] }
  | { e: "move" | "undo"; id: string; from: Point; to: Point }
  // A move by a gesture also says how (tap or drag), press ms, ms since the last pan, and zoom.
  | { e: "move"; id: string; from: Point; to: Point; how: Input["how"]; ms: number; sincePan: number | null; zoom: number }
  | { e: "panAfterPush"; ms: number }
  | { e: "reached"; id: string; used: number }
  | { e: "reset"; goal: string | null }
  | { e: "density"; from: number; to: number; goal: string | null };
const LOG_MAX = 3000;
const playLog: (LogEvent & { t: number })[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
  } catch {
    return [];
  }
})();
function log(event: LogEvent): void {
  if (shared) return;
  playLog.push({ t: Date.now(), ...event });
  if (playLog.length > LOG_MAX) playLog.splice(0, playLog.length - LOG_MAX);
  if (++unsent >= UPLOAD_EVERY) void upload();
}
// The play data goes to the VM by itself every UPLOAD_EVERY events, and when the page is
// hidden with events not yet sent. Each upload replaces this browser's last one.
const UPLOAD_EVERY = 25;
let unsent = 0;
const device = (() => {
  if (shared) return "";
  try {
    const id = localStorage.getItem(DEVICE_KEY) ?? crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
})();
function upload(): Promise<boolean> {
  unsent = 0;
  return sendPlayData(true);
}
addEventListener("pagehide", () => {
  if (unsent && !shared && !forgetting) navigator.sendBeacon(`play-data?device=${device}`, new Blob([JSON.stringify(playData())], { type: "application/json" }));
});
/** How the move a gesture is recording was made (see Gestures' onInput); logged with it. */
let input: Input | null = null;
/** History entries already in the log (set once the stored history is loaded). */
let logged = 0;
function logMoves(): void {
  while (logged < scene.history.length) {
    // Counted before logging: logging can upload, which saves, which logs moves again.
    const m = scene.history[logged++]!;
    // The gesture's input belongs to the move it just recorded, the newest one.
    const how = input && logged === scene.history.length ? { ...input, zoom: Math.round(scene.camera.scale * 100) / 100 } : {};
    log({ e: "move", id: m.id, from: m.from, to: m.to, ...how });
  }
  input = null;
}

function save(): void {
  if (shared || forgetting) return;
  logMoves();
  try {
    localStorage.setItem(SEED_KEY, JSON.stringify(seed));
    localStorage.setItem(BORDER_KEY, JSON.stringify(scene.border));
    localStorage.setItem(FPS_KEY, JSON.stringify(showingFps));
    localStorage.setItem(TRIES_KEY, JSON.stringify(tries));
    localStorage.setItem(MOVED_KEY, JSON.stringify([...scene.moved].map(([id, p]) => [id, p.x, p.y])));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(scene.history));
    // A goal belongs to one seed and density.
    localStorage.setItem(GOAL_KEY, JSON.stringify({ seed, tries, goal: scene.goal, done: scene.done }));
    localStorage.setItem(LOG_KEY, JSON.stringify(playLog));
  } catch {
    // Private mode or full storage: changes just don't survive a reload.
  }
  lookAhead();
}

const seed = load<number>(SEED_KEY, Math.floor(Math.random() * 2 ** 32));
let tries = load<number>(TRIES_KEY, TRIES);
const debug = load<boolean>(DEBUG_KEY, false);
// The fullscreen block shows only where the browser can go full screen (not iPhone Safari).
const canFullscreen = !!(document.fullscreenEnabled || (document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled);
const shownUi = { debug, fullscreen: canFullscreen, island: withIsland };
const moved = load<[string, number, number][]>(MOVED_KEY, []);
const storedGoal = load<{ seed: number; tries: number; goal: Goal | null; done?: Goal[] } | null>(GOAL_KEY, null);
// (An island goal fits only a page with the island.)
const goalsFit = storedGoal?.seed === seed && storedGoal.tries === tries && (withIsland || squareOf(storedGoal.goal) === null);
const scene = newScene(innerWidth, innerHeight, {
  layout: randomLayout(seed, { tries, ...shownUi }),
  moved: new Map(moved.map(([id, x, y]) => [id, { x, y }])),
  history: load<Move[]>(HISTORY_KEY, []),
  border: load<boolean>(BORDER_KEY, false),
  goal: goalsFit ? storedGoal.goal : null,
  done: goalsFit ? (storedGoal.done ?? []) : [],
});
// The stored history was logged before this page loaded; log only what comes after it.
logged = scene.history.length;
// Each page load starts a stretch of play on one build.
log({ e: "load", commit: __COMMIT__ });
// Errors go in the log too, so a bug seen in play shows up in the play data.
addEventListener("error", (e: ErrorEvent) => {
  log({ e: "error", message: String(e.message).slice(0, 300), where: `${e.filename?.split("/").pop()}:${e.lineno}:${e.colno}` });
  save();
});
addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
  log({ e: "error", message: String(e.reason?.message ?? e.reason).slice(0, 300), where: "promise" });
  save();
});
restoreCamera();
// A fresh start (first visit or after a reset) keeps its seed from the first load on.
if (localStorage.getItem(SEED_KEY) === null) save();

// Goals are made by a worker: shuffling a dense board can take a second or two. Only the
// newest request counts; a slider drag or reset in between makes older answers stale.
const worker = new Worker("goal-worker.js");
let job = 0;
/** The exact board in play when tests place one; null for the random board. */
let placed: Placed[] | null = null;
let goalWaiters: (() => void)[] = [];
/** Ask for a goal near `near` (the middle of the view by default), never with an earlier
 * red block. */
function requestGoal(near: Point = viewCentre(scene.camera, scene.width, scene.height)): void {
  if (testbed) return showGoal(TESTBED.goals[testbedNext++] ? { ...TESTBED.goals[testbedNext - 1]! } : null);
  if (shared) return;
  // The island's squares come first, in turn.
  const square = withIsland ? nextIslandGoal(scene.done) : null;
  if (square) return showGoal(square);
  // Past the last square, the world's first goal is made just out of its open bay (the
  // search looks only round `near`, and no island block may be the red block).
  if (withIsland) while (inIsland(near)) near = { x: near.x + 1, y: near.y };
  const exclude = scene.done.map((g) => g.id);
  // Made already while the red block was one move away: no wait.
  const key = boardKey(scene.moved, exclude, near);
  if (ahead.ready?.key === key) {
    showGoal(ahead.ready.goal);
    return;
  }
  const request: GoalRequest = { job: ++job, seed, tries, ui: shownUi, placed, near, moved: [...scene.moved], level: 0, exclude, avoid: targetsOf(scene.done) };
  worker.postMessage(request);
}
type Measured = { of: { id: string; target: Point }; difficulty: Difficulty; choices?: number };
type Reply = { job: number; goal: Goal | null } | ({ job: number } & Measured);
worker.onmessage = (event: MessageEvent<Reply>) => {
  if ("difficulty" in event.data) return measured(event.data);
  if (event.data.job !== job) return;
  showGoal(event.data.goal);
};
/** A goal's difficulty arrived: it belongs to whichever goal it was measured for. */
function measured({ of, difficulty, choices }: Measured): void {
  const all = [scene.goal, ahead.ready?.goal, ...scene.done];
  for (const g of all) {
    if (!g || g.id !== of.id || g.target.x !== of.target.x || g.target.y !== of.target.y) continue;
    g.difficulty = difficulty;
    g.choices = choices;
  }
  save();
}
function showGoal(goal: Goal | null): void {
  job++; // anything still on its way is stale
  // Past the island's last square, the view cuts to the world's first red block.
  if (cutToGoal && goal) {
    const red = scene.layout.byId(goal.id), at = whereIs(scene, goal.id), s = scene.camera.scale;
    if (red && at) scene.camera = { scale: s, offsetX: scene.width / 2 - (at.x + red.w / 2) * UNIT * s, offsetY: scene.height / 2 - (at.y + red.h / 2) * UNIT * s };
  }
  if (goal) cutToGoal = false;
  scene.goal = goal;
  if (goal) {
    goal.tries = tries;
    goal.begun = scene.history.length;
    // A snapshot of the board, so the goal can be measured again later.
    log({ e: "goal", commit: __COMMIT__, id: goal.id, target: goal.target, start: goal.start, tries, seed, solution: goal.solution.length, moved: [...scene.moved].map(([id, p]) => [id, p.x, p.y]) });
  }
  // The last red block's soul flies to the new one, the view following it there.
  const red = goal && scene.layout.byId(goal.id), at = goal && whereIs(scene, goal.id);
  // On the island the view goes to the square's middle, at the square's own zoom.
  if (soulFrom && goal && red && at) {
    soul = { from: soulFrom, toId: goal.id, born: -1 };
    const k = squareOf(goal);
    if (k === null) flyTo({ x: at.x + red.w / 2, y: at.y + red.h / 2 }, 0, SOUL.TRAVEL_MS);
    else flyTo({ x: squareAt(k).x + SIDE / 2, y: squareAt(k).y + SIDE / 2 }, 0, SOUL.TRAVEL_MS, islandCamera(k, borderOnScreen(scene)).scale);
  }
  soulFrom = null;
  // The new red block throbs once; its clock starts at the first frame drawn (after the soul
  // gets there).
  if (scene.goal) throb = { id: scene.goal.id, born: -1 };
  if (scene.goal) cue = { id: scene.goal.id, born: -1 };
  save();
  redraw();
  goalWaiters.forEach((resolve) => resolve());
  goalWaiters = [];
};

// The next goal is made ahead (trying harder: level 2), on its own worker, whenever the red block is one move from its
// target: on the board as it will be when it lands there. If the board is exactly that when
// it lands, the next goal shows at once.
const ahead = {
  worker: new Worker("goal-worker.js"),
  job: 0,
  asked: "",
  ready: null as { key: string; goal: Goal | null } | null,
};
/** The cells of these goals' targets. */
function targetsOf(goals: Goal[]): Rect[] {
  return goals.flatMap((g) => {
    const red = scene.layout.byId(g.id);
    return red ? [{ x: g.target.x, y: g.target.y, width: red.w, height: red.h }] : [];
  });
}
function boardKey(moved: ReadonlyMap<string, Point>, exclude: string[], near: Point): string {
  return JSON.stringify([seed, tries, placed, [...moved].sort(([a], [b]) => (a < b ? -1 : 1)), exclude, near]);
}
function lookAhead(): void {
  const goal = scene.goal;
  const red = goal && scene.layout.byId(goal.id);
  const at = goal && whereIs(scene, goal.id);
  if (shared || !goal || !red || !at || (withIsland && nextIslandGoal([...scene.done, goal]))) return;
  const { lo, hi } = slideRange(scene.layout, { ...red, ...at }, scene);
  const along = red.w > red.h ? goal.target.x : goal.target.y;
  const inLane = red.w > red.h ? goal.target.y === at.y : goal.target.x === at.x;
  if (!inLane || along < lo || along > hi) return;
  const moved = new Map(scene.moved).set(goal.id, goal.target);
  const exclude = [...scene.done.map((g) => g.id), goal.id];
  const key = boardKey(moved, exclude, goal.target);
  if (key === ahead.asked || ahead.ready?.key === key) return;
  ahead.asked = key;
  const request: GoalRequest = { job: ++ahead.job, seed, tries, ui: shownUi, placed, near: goal.target, moved: [...moved], level: 2, exclude, avoid: targetsOf([...scene.done, goal]) };
  ahead.worker.postMessage(request);
}
ahead.worker.onmessage = (event: MessageEvent<Reply>) => {
  if ("difficulty" in event.data) return measured(event.data);
  if (event.data.job === ahead.job) ahead.ready = { key: ahead.asked, goal: event.data.goal };
};
if (testbed) {
  // The testbed shows its first goal once its board is in place (below).
} else if (!scene.goal) requestGoal();
else lookAhead();

// While a slider is held: where its knob is (0..1), following the finger.
let slider: { ui: Ui; from: number; at: number } | null = null;
/** Move the held slider's knob by `dx` screen px from where the drag started. */
function slide(ui: Ui, from: number, dx: number): number {
  slider ??= { ui, from, at: from };
  slider.at = Math.min(1, Math.max(0, slider.from + dx / (TRACK * UNIT * scene.camera.scale)));
  return slider.at;
}

// A tapped (or undone) block glides to its new cell; the move itself is already made.
// The clock starts at the first frame that draws it: started at the tap, the first frame
// came a frame or two late and the block jumped ~20% of the way (measured with
// test/experiments/slide-frames.mjs).
let animation: { move: Move; start: number | null; duration: number; wait?: boolean } | null = null;
function animate(move: Move): void {
  const cells = Math.abs(move.to.x - move.from.x) + Math.abs(move.to.y - move.from.y);
  animation = { move, start: null, duration: slideDuration(cells) };
}
function sliding(now: number): { id: string; x: number; y: number; from: Point; to: Point } | null {
  if (!animation) return null;
  // Waiting for the view to get there first: the block stays where it was.
  if (animation.wait && flight) return { id: animation.move.id, x: animation.move.from.x, y: animation.move.from.y, from: animation.move.from, to: animation.move.to };
  animation.start ??= now;
  const t = Math.min(1, Math.max(0, (now - animation.start) / animation.duration));
  if (t >= 1) {
    animation = null;
    reachGoal(now);
    return null;
  }
  const { move } = animation;
  const e = ease(t);
  return { id: move.id, x: move.from.x + (move.to.x - move.from.x) * e, y: move.from.y + (move.to.y - move.from.y) * e, from: move.from, to: move.to };
}

// The first time the red block lands on its target, stars fly out of it.
let sparkles: Sparkle[] = [];
// Where the sparkles' scatter comes from (seeded by the inspector, so replays match).
let random = Math.random;
let throb: { id: string; born: number } | null = null;
// Just after the throb, a trail from the new red block towards its target shows the way.
let cue: { id: string; born: number } | null = null;
// Each tap's ripple runs to its end, however many taps come in the meantime.
let ripples: { at: Point; born: number }[] = [];
// A tapped block that cannot move shakes.
let shake: { id: string; born: number } | null = null;
// The goal just reached: its score track plays the finish (stars fill, the medal, the row).
// The next goal shows once the stars have gathered (`next`: where it is made).
// An island square's (`island`) plays in a card in the middle of the screen and waits there
// for the next button; the view stays.
let finish: { id: string; born: number; end: number; next: Point; dir: Point; heard: number; island?: boolean } | null = null;
// Once the finish is over, the red block's soul flies from it (`soulFrom`, world px) to the
// next red block, the view gliding along; the new block throbs once it arrives.
type WorldRect = { x: number; y: number; width: number; height: number };
let soulFrom: WorldRect | null = null;
let soul: { from: WorldRect; toId: string; born: number } | null = null;
function reachGoal(now: number): void {
  const goal = scene.goal;
  if (!goal || !goalSolved(scene) || animation?.move.id === goal.id) return;
  // Done: its target plays the finish, and once the stars have gathered the next goal
  // starts from a block close to it.
  goal.used = Math.max(1, movesSince(goal.begun ?? 0));
  logMoves();
  log({ e: "reached", id: goal.id, used: goal.used });
  scene.done.push(goal);
  scene.goal = null;
  // The way it slid in, for the landing's squash and jolt.
  const last = scene.history.at(-1);
  const dir = last?.id === goal.id ? { x: Math.sign(last.to.x - last.from.x), y: Math.sign(last.to.y - last.from.y) } : { x: 0, y: 0 };
  const times = finishTimes(bestKnown(goal) ?? goal.solution.length, shownUsed(goal)!);
  // The island's last square ends as goals in the world do (its target is out there).
  const square = squareOf(goal), island = square !== null && !isLast(square);
  finish = { id: goal.id, born: now, end: timeWarp(times, times.medalAt !== null && !goal.undone).raw(times.end), next: goal.target, dir, heard: -1, island };
  if (island) {
    scene.hover = null; // the board rests under the finish card
    return save();
  }
  const red = scene.layout.byId(goal.id)!;
  const at = whereIs(scene, goal.id)!;
  const cx = (at.x + red.w / 2) * UNIT;
  const cy = (at.y + red.h / 2) * UNIT;
  sparkles = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2 + random() * 0.3;
    const reach = UNIT * (0.9 + random() * 0.9);
    return {
      x: cx, y: cy, dx: Math.cos(angle) * reach, dy: Math.sin(angle) * reach,
      born: now + random() * 80, life: 650 + random() * 250, size: UNIT * (0.09 + random() * 0.08), spin: (random() - 0.5) * 6,
    };
  });
  save();
}

/** Take back the last move. There is no undo button (it was almost never used, in the play
 * data and the play tests); tests and the console still undo with unblock.undo(). */
function takeBack(): void {
  const move = undo(scene);
  if (!move) return;
  log({ e: "undo", id: move.id, from: move.from, to: move.to });
  if (scene.goal) scene.goal.undone = true; // no medal for this goal now
  logged = scene.history.length;
  animate({ id: move.id, from: move.to, to: move.from });
  save();
  redraw();
}

/** Count a step of the debug sequence: a tap on the empty board ("tap"), then a tap on the
 * stuck red block ("red"); anything else (null) starts it over. True once it is complete,
 * which turns the debug UI on. */
let debugSteps = 0;
function debugCode(step: "tap" | "red" | null): boolean {
  if (debug) return false;
  const want = debugSteps % 2 === 0 ? "tap" : "red";
  debugSteps = step === want ? debugSteps + 1 : step === "tap" ? 1 : 0;
  if (debugSteps < DEBUG_ROUNDS * 2) return false;
  try {
    localStorage.setItem(DEBUG_KEY, "true");
  } catch {
    return false; // no storage: no debug UI
  }
  return true;
}

/** A tap pushed a block (the move is made): it slides there. A tap that sends the red block
 * onto its target: if the target is not all in view, the view glides there first and the
 * block moves after, so the finish shows. */
function pushed(move: Move): void {
  animate(move);
  const goal = scene.goal, red = goal && scene.layout.byId(goal.id);
  if (goal && red && animation && move.id === goal.id && move.to.x === goal.target.x && move.to.y === goal.target.y) {
    const c = scene.camera, view = borderOnScreen(scene);
    const x = goal.target.x * UNIT * c.scale + c.offsetX, y = goal.target.y * UNIT * c.scale + c.offsetY;
    const inView = x >= view.x && y >= view.y && x + red.w * UNIT * c.scale <= view.x + view.width && y + red.h * UNIT * c.scale <= view.y + view.height;
    // (Not on an island square: its view is fixed, the target just out of it.)
    if (!inView && !scene.locked) {
      flyTo({ x: goal.target.x + red.w / 2, y: goal.target.y + red.h / 2 });
      animation.wait = true;
    }
  }
}

const gestures = new Gestures(scene, {
  onChange: () => {
    debugCode(null);
    save();
    reachGoal(performance.now()); // a drag lands at once; a tap's slide reaches it at its end
  },
  onPush: (move) => {
    debugCode(null);
    pushed(move);
  },
  onInput: (how) => (input = how),
  onSnap: (slide) => animate(slide),
  onPanAfterPush: (ms) => log({ e: "panAfterPush", ms }),
  onStuck: (id) => {
    if (debugCode(id === scene.goal?.id ? "red" : null)) forgetEverything();
    shake = { id, born: -1 };
    redraw();
  },
  onUi: (ui) => {
    debugCode(null);
    if (ui === "reset") {
      forgetEverything();
    } else if (ui === "border") {
      scene.border = !scene.border;
      save();
    } else if (ui === "fullscreen") {
      toggleFullscreen();
    } else if (ui === "home") {
      // The homepage: the root of the same server, except on the public game (no port),
      // where it is the private one on :8000.
      location.href = location.port ? "/" : `${location.protocol}//${location.hostname}:8000/`;
    } else if (ui === "reports") {
      location.href = "reports/";
    } else if (ui === "testbed") {
      location.href = "?testbed";
    } else if (ui === "upload") {
      void sendPlayData();
    } else if (ui === "fps") {
      showingFps = !showingFps;
      showFpsCounter();
      save();
    }
  },
  // The sliders keep their knob under the finger. Density shows the board at that density
  // right away (same seed, no goal), and the goal is made once the finger lifts.
  onAdjust: (ui, dx, done) => {
    if (ui === "density") {
      const at = slide(ui, (tries - MIN_TRIES) / (MAX_TRIES - MIN_TRIES), dx);
      const next = Math.round(MIN_TRIES + at * (MAX_TRIES - MIN_TRIES));
      if (next !== tries) {
        log({ e: "density", from: tries, to: next, goal: scene.goal?.id ?? null });
        tries = next;
        relayout(scene, randomLayout(seed, { tries, ...shownUi }));
        logged = 0; // a new board starts a new history
      }
      if (done && !scene.goal) requestGoal();
    }
    if (done) {
      slider = null;
      save();
    }
  },
});

/** Delete everything Unblock Me stored and reload: a new seed, default settings, centred.
 * Only our own keys go, since other pages on this origin keep theirs in the same storage. */
function forgetEverything(): void {
  log({ e: "reset", goal: scene.goal?.id ?? null });
  const kept = JSON.stringify(playLog), debugOn = load<boolean>(DEBUG_KEY, false);
  forget();
  try {
    localStorage.setItem(LOG_KEY, kept);
    localStorage.setItem(DEVICE_KEY, device);
    localStorage.setItem(DEBUG_KEY, JSON.stringify(debugOn));
  } catch {
    // No storage: nothing to keep.
  }
  location.reload();
}

/** Delete everything Unblock Me stored, and store nothing more from this page (leaving it
 * would otherwise save the view again). */
function forget(): void {
  forgetting = true;
  clearTimeout(cameraTimer);
  for (const storage of [localStorage, sessionStorage]) {
    try {
      for (const key of Object.keys(storage)) if (key.startsWith("unblock-me:")) storage.removeItem(key);
    } catch {
      // No storage: there is nothing to forget.
    }
  }
}

// Safari has fullscreen only with the webkit prefix, and on iPhone not at all (only for
// video): there the block is left out (canFullscreen).
type Webkit = { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void; webkitRequestFullscreen?: () => void };
const fullscreenElement = () => document.fullscreenElement ?? (document as unknown as Webkit).webkitFullscreenElement ?? null;
function toggleFullscreen(): void {
  // Runs inside the tap's pointerup, which counts as the user gesture fullscreen needs.
  const doc = document as unknown as Webkit, root = document.documentElement as unknown as Webkit & HTMLElement;
  if (fullscreenElement()) void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
  else if (root.requestFullscreen) void root.requestFullscreen().catch(() => {});
  else root.webkitRequestFullscreen?.();
}
document.addEventListener("fullscreenchange", () => redraw());
document.addEventListener("webkitfullscreenchange", () => redraw());

// For tests and debugging in the console.
Object.assign(window, {
  unblock: {
    scene,
    seed: () => seed,
    tries: () => tries,
    visibleBlocks: () => visibleBlocks(scene),
    onScreen: () => blocksIn(scene.layout, latticeRect(scene, { x: 0, y: 0, width: scene.width, height: scene.height }), scene),
    slideRange: (id: string) => slideRange(scene.layout, visibleBlocks(scene).find((b) => b.id === id)!, scene),
    redraw: () => redraw(),
    /** The adaptive detail step (0 full; see pace). */
    detailStep: () => detailStep,
    undo: () => takeBack(),
    /** Forget everything stored, like the reset block but without reloading (for tests). */
    forget: () => forget(),
    playLog,
    /** Frames drawn while recording: when, and where the sliding block was drawn. */
    frames: null as { t: number; x: number; y: number }[] | null,
    /** Ask the worker for a goal near a lattice point, as reaching a goal does. */
    requestGoal: (near: Point) => requestGoal(near),
    /** Resolves once a goal requested by the app has arrived. */
    goalReady: () => (scene.goal ? Promise.resolve() : new Promise<void>((resolve) => goalWaiters.push(resolve))),
    /** Replace the random layout with exactly these blocks, and optionally a goal (for tests). */
    place: (blocks: Placed[], goal: Goal | null = null) => {
      job++; // any goal on its way is for the old board
      placed = blocks;
      restart(scene, fixedLayout(blocks));
      logged = 0;
      scene.goal = goal;
      lookAhead();
      redraw();
    },
  },
});

if (shared) {
  try {
    restart(scene, fixedLayout(JSON.parse(shared)));
  } catch {
    // A broken link: show the normal board.
  }
  if (testbed) requestGoal();
}

// Live reload: every build writes a new id to build.txt. While the page is visible, check
// it every second (and right away when the page comes back), and reload on a new build,
// keeping the view where it was.
async function reloadOnNewBuild(): Promise<void> {
  if (document.hidden) return;
  try {
    const id = (await (await fetch("build.txt", { cache: "no-store" })).text()).trim();
    if (id && id !== __BUILD_ID__) {
      saveCamera();
      location.reload();
    }
  } catch {
    // Offline or the file is missing: try again next time.
  }
}
setInterval(reloadOnNewBuild, 1000);
document.addEventListener("visibilitychange", reloadOnNewBuild);

/** Back where the view was when the page was last open (a reset clears it: centred). */
function restoreCamera(): void {
  if (shared) return;
  const saved = load<typeof scene.camera | null>(CAMERA_KEY, null);
  if (saved) {
    scene.camera = saved;
    resize(scene, scene.width, scene.height);
  }
}

// The island's last square reached: its surface fading out over REVEAL_MS (see reachGoal).
const REVEAL_MS = 1800;
let reveal: { born: number; rects: Rect[] } | null = null;
/** The island's surface as it fades, or null. */
function surface(now: number): { rects: Rect[]; alpha: number } | null {
  if (!reveal) return null;
  const alpha = 1 - (now - reveal.born) / REVEAL_MS;
  if (alpha <= 0) return (reveal = null);
  return { rects: reveal.rects, alpha };
}
/** Each island square's level, on its top wall. */
const LABELS = ISLAND_LEVELS.map((_, k) => ({ x: squareAt(k).x + SIDE / 2, y: squareAt(k).y - 0.5, text: `Level ${k + 1}` }));

// The island's next button: once a square's finish has shown its stars, it cuts straight to
// the next square (no soul, no glide), or past the last one to the world.
const nextButton = document.querySelector<HTMLButtonElement>("#next")!;
let cutToGoal = false;
function showNext(on: boolean): void {
  if (on) {
    const view = borderOnScreen(scene), r = islandCardRect(view);
    nextButton.textContent = nextIslandGoal(scene.done) ? "Next level" : "Continue";
    // (Kept on the screen when that is too short for the card and it together.)
    // Sized with the card; kept on the screen when that is too short for the two.
    const size = (CARD.button / 2.6) * r.width;
    nextButton.style.fontSize = `${size}px`;
    nextButton.style.top = `${Math.max(0, Math.min(r.y + r.height + CARD.gap * r.width, view.y + view.height - 2.6 * size - 8) - view.y)}px`;
  }
  nextButton.hidden = !on;
}
nextButton.addEventListener("click", () => {
  if (!finish?.island) return;
  const next = finish.next;
  finish = null;
  showNext(false);
  cutToGoal = true;
  requestGoal(next);
  redraw();
});
/** The level and the moves so far on the island square being played (or just
 * finished), for the bar at the top. */
function islandHud(): { level: number; moves: number } {
  const g = scene.goal ?? scene.done.find((d) => d.id === finish?.id) ?? null;
  const k = squareOf(g) ?? 0;
  return { level: k + 1, moves: g?.used ?? (g ? movesSince(g.begun ?? 0) : 0) };
}

/** While an island square is played its view is fixed (see islandCamera): set every frame,
 * so a resize keeps it, except while the view glides there. */
function lockView(): void {
  let k = withIsland ? (squareOf(scene.goal) ?? (finish?.island ? squareOf(finish) : null)) : null;
  // The last square's red block in its bay: the world shows, the view free from then on.
  // Getting there (not on a load that finds it there), the view glides slowly out over the
  // bay and the clearing past it as the island's surface fades.
  const at = k !== null && scene.goal ? whereIs(scene, scene.goal.id) : null;
  if (k !== null && at && bayReached(k, at)) {
    if (scene.locked) {
      reveal = { born: performance.now(), rects: islandRects(k) };
      const t = scene.goal!.target, scale = Math.min(scene.camera.scale, scene.width / (10 * UNIT));
      flyTo({ x: t.x - 1.5, y: t.y + 0.5 }, 0, REVEAL_MS, scale);
    }
    k = null;
  }
  scene.locked = k === null ? null : islandRects(k);
  scene.uiOnTop = k !== null && debug;
  if (k !== null && !flight) scene.camera = islandCamera(k, borderOnScreen(scene));
}

function saveCamera(): void {
  if (shared || forgetting) return;
  try {
    localStorage.setItem(CAMERA_KEY, JSON.stringify(scene.camera));
  } catch {
    // No storage: the view starts centred next time.
  }
}
// The view changes every frame while panning; store it once it rests.
let cameraTimer: Timer | undefined;
let savedCamera = "";
function cameraMoved(): void {
  const now = JSON.stringify(scene.camera);
  if (now === savedCamera) return;
  savedCamera = now;
  clearTimeout(cameraTimer);
  cameraTimer = setTimeout(saveCamera, 300);
}
addEventListener("pagehide", saveCamera);

/** "12s ago", "4m ago", "3h ago", "2d ago". */
function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
// The build id is the build time in base 36.
const builtAt = parseInt(__BUILD_ID__, 36);

// The fps counter, with how long ago the running code was built and from which commit.
const frames: number[] = [];
function showFps(now: number): void {
  while (frames.length && frames[0]! <= now - 1000) frames.shift();
  fps.textContent = `${frames.length} fps · ${ago(Date.now() - builtAt)} · ${__COMMIT__}`;
}
setInterval(() => showFps(performance.now()), 500);

let queued = false;
function redraw(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame((now) => {
    queued = false;
    if (inspector?.open) return; // it draws the frames itself
    pace(now);
    const moving = advance(now);
    paint(now, moving);
    if (animation || sparkles.length || flight || throb || cue || ripples.length || shake || finish || soul || pinThrob || fading()) redraw();
  });
}

// Detail that adapts: when frames come late (a slow phone in a busy finish), the finish draws
// less (fewer particles, no trails, at the least no glow or rays), a step at a time; after a
// long run of frames on time it steps back up. (Drawing with fewer pixels was tried too, but
// the board looked blurry.)
const DETAIL = [1, 0.6, 0.35, 0.2];
let detailStep = Math.min(DETAIL.length - 1, Math.max(0, load<number>(DETAIL_KEY, 0)));
let lastFrame = 0, onTime = 0, late: number[] = [];
const recent: number[] = []; // the last frames' lengths, for the screen's frame time
function pace(now: number): void {
  const dt = now - lastFrame;
  lastFrame = now;
  if (dt > 250) return; // the first frame after a rest
  recent.push(dt);
  if (recent.length > 60) recent.shift();
  if (recent.length < 20) return;
  // The screen's frame time: the median frame (most frames come on time).
  const vsync = [...recent].sort((a, b) => a - b)[recent.length >> 1]!;
  if (dt > vsync * 1.7) {
    // Two late frames within a second step down, or one that missed two frames or more.
    late = [...late.filter((t) => now - t < 1000), now];
    onTime = 0;
    if ((late.length >= 2 || dt > vsync * 2.7) && detailStep < DETAIL.length - 1) {
      detailStep++;
      late = [];
      keepDetail();
    }
  } else if (++onTime > 600 && detailStep > 0) {
    detailStep--;
    onTime = 0;
    keepDetail();
  }
}
/** The step is kept for next time, so a slow phone starts where it got to. */
function keepDetail(): void {
  try {
    localStorage.setItem(DETAIL_KEY, String(detailStep));
  } catch {
    // No storage: it adapts again next time.
  }
}

/** Move everything on to `now`: the view's glide, the slide, the goal reached, and the
 * timed effects (what a frame does before it draws). */
function advance(now: number): ReturnType<typeof sliding> {
    flying(now);
    lockView();
    placeView();
    cameraMoved();
    const moving = sliding(now);
    // A red block standing on its target always counts, whatever ended its slide (a reload
    // mid-slide, a frame that failed): reachGoal does nothing otherwise.
    if (!animation) reachGoal(now);
    if (soul && soul.born < 0) {
      soul.born = now;
      sfx.play("soul", now);
    }
    if (soul && now > soul.born + SOUL.TRAVEL_MS + SOUL.BURST_MS) soul = null;
    const arrived = !soul || now >= soul.born + SOUL.TRAVEL_MS;
    if (throb && throb.born < 0 && arrived) throb.born = now;
    if (throb && throb.born >= 0 && now > throb.born + THROB_MS) throb = null;
    if (cue && cue.born < 0 && arrived) cue.born = now;
    if (cue && cue.born >= 0 && now > cue.born + CUE_MS) cue = null;
    for (const r of ripples) if (r.born < 0) r.born = now;
    ripples = ripples.filter((r) => now <= r.born + RIPPLE_MS);
    if (shake && shake.born < 0) shake.born = now;
    if (shake && now > shake.born + SHAKE_MS) shake = null;
    if (pinThrob && pinThrob.born < 0) pinThrob.born = now;
    if (pinThrob && now > pinThrob.born + THROB_MS) pinThrob = null;
    if (finish) {
      // Its sounds, each once, as the finish gets to it.
      const g = scene.done.find((d) => d.id === finish!.id);
      if (g && g.used !== undefined) {
        const times = finishTimes(bestKnown(g) ?? g.solution.length, shownUsed(g)!), medal = times.medalAt !== null && !g.undone;
        const t = timeWarp(times, medal).warp(now - finish.born);
        for (const cue of [...finishCues({ times, medal }), ...(finish.island ? [] : moreCues({ times, medal }))]) if (cue.at > finish.heard && cue.at <= t) sfx.play(cue.sound, now, cue.n);
        finish.heard = t;
      }
    }
    // An island square's finish waits for its next button once the stars have landed.
    if (finish?.island) {
      const g = scene.done.find((d) => d.id === finish!.id);
      const landed = g && g.used !== undefined && finish.heard >= finishTimes(bestKnown(g) ?? g.solution.length, shownUsed(g)!).landed;
      showNext(!!landed);
    } else if (finish && now > finish.born + finish.end) {
      const next = finish.next;
      const red = scene.layout.byId(finish.id), at = whereIs(scene, finish.id);
      soulFrom = red && at ? { x: at.x * UNIT + 3, y: at.y * UNIT + 3, width: red.w * UNIT - 6, height: red.h * UNIT - 6 } : null;
      finish = null;
      requestGoal(next);
    }
    sparkles = sparkles.filter((s) => now < s.born + s.life);
    return moving;
}

/** Draw the board as it is at `now` (on `to`, the screen's canvas by default). */
function paint(now: number, moving: ReturnType<typeof sliding>, to: HTMLCanvasElement = canvas, trace?: TraceEntry[]): void {
    timedFrame(to.getContext("2d")!, () =>
      draw(to, scene, {
        fullscreen: fullscreenElement() !== null,
        density: slider?.ui === "density" ? slider.at : (tries - MIN_TRIES) / (MAX_TRIES - MIN_TRIES),
        fps: showingFps,
        sliding: moving,
        sparkles,
        throb,
        cue,
        ripples,
        shake,
        pinThrob,
        used: scene.goal ? movesSince(scene.goal.begun ?? 0) : 0,
        finish,
        soul,
        trace,
        hud: scene.locked ? islandHud() : null,
        surface: surface(now),
        // Out in the world, every square's; on one, its own (the rest are under the surface).
        // (None while a finish card shows: it has the level.)
        labels: !withIsland || finish?.island ? [] : scene.locked ? LABELS.filter((_, k) => k === islandHud().level - 1) : LABELS,
        now,
        detail: DETAIL[detailStep],
      }),
    );
    if (to !== canvas) return;
    const debug = (window as unknown as { unblock: { frames: { t: number; x: number; y: number }[] | null } }).unblock;
    if (debug.frames && moving) debug.frames.push({ t: now, x: moving.x, y: moving.y });
}

// Frames are counted here, not in redraw: redraw only runs while something changes, and the
// counter would drop to 0 whenever the board is still. The spinner keeps frames coming,
// only while the counter shows.
const spin = document.querySelector<HTMLElement>("#spin")!;
let showingFps = load<boolean>(FPS_KEY, false);
let ticking = false;
function tick(now: number): void {
  if (!showingFps) {
    ticking = false;
    return;
  }
  spin.style.transform = `rotate(${(now / 4) % 360}deg)`;
  frames.push(now);
  showFps(now);
  requestAnimationFrame(tick);
}
function showFpsCounter(): void {
  fps.style.display = spin.style.display = showingFps ? "" : "none";
  if (showingFps && !ticking) {
    ticking = true;
    frames.length = 0;
    requestAnimationFrame(tick);
  }
  redraw();
}
showFpsCounter();

const point = (e: PointerEvent | WheelEvent) => ({ x: e.offsetX, y: e.offsetY });

/** What a UI block does, shown when the mouse rests on it; some need no words. */
function tooltip(ui: Ui): string | null {
  switch (ui) {
    case "border": return "Debug: Make the viewport smaller to test frustum culling.";
    case "reset": return "Reset";
    case "fps": return "Debug: Show or hide the fps counter";
    case "reports": return "Reports";
    case "testbed": return "Debug: The testbed, a small board for trying the finish's animations";
    case "upload": return "Debug: Send play data to the VM for analysis";
    default: return null;
  }
}

/** Everything this game keeps in the browser, sent to the VM (play-data/ in the repo) so the
 * goals and their difficulty can be analysed. A note shows how it went. */
function playData() {
  const stored: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (!key.startsWith("unblock-me:")) continue;
    const value = localStorage.getItem(key);
    try {
      stored[key] = JSON.parse(value ?? "null");
    } catch {
      stored[key] = value; // not JSON (the device id)
    }
  }
  return { sentAt: new Date().toISOString(), build: builtAt, commit: __COMMIT__, device, userAgent: navigator.userAgent, screen: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, stored };
}
/** Send it; `quiet` (automatic) replaces this device's last upload and shows nothing. */
async function sendPlayData(quiet = false): Promise<boolean> {
  if (shared) return false;
  save(); // the log as it is now
  try {
    const sent = await fetch(quiet ? `play-data?device=${device}` : "play-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(playData()) });
    if (!quiet) note(sent.ok ? `Sent play data (${scene.done.length} goals)` : `Sending failed (${sent.status})`);
    return sent.ok;
  } catch {
    if (!quiet) note("Sending failed (offline?)");
    return false;
  }
}
/** A short note in the middle of the view for a couple of seconds. */
/** Until when a note stays up (hovering and pointers leaving do not hide it). */
let noteUntil = 0;
function note(text: string, ms = 2500): void {
  noteUntil = performance.now() + ms;
  tip.textContent = text;
  tip.style.display = "block";
  tip.style.left = `${(innerWidth - tip.offsetWidth) / 2}px`;
  tip.style.top = `${innerHeight / 2}px`;
  setTimeout(() => (tip.style.display = "none"), ms);
}
/** Moves made since history had `begun` entries, where moving one block several times in a
 * row counts once (as in the fewest-moves count). */
function movesSince(begun: number): number {
  let moves = 0;
  for (let i = begun; i < scene.history.length; i++) if (i === begun || scene.history[i]!.id !== scene.history[i - 1]!.id) moves++;
  return moves;
}
/** A goal's numbers, over its red block or its target (the current goal or a reached one). */
function goalTip(at: Point): string | null {
  const inside = (p: Point, w: number, h: number) => at.x >= p.x && at.x < p.x + w && at.y >= p.y && at.y < p.y + h;
  for (const g of [scene.goal, ...scene.done]) {
    const red = g && scene.layout.byId(g.id);
    if (!g || !red) continue;
    const now = whereIs(scene, g.id)!;
    if (!inside(now, red.w, red.h) && !inside(g.target, red.w, red.h)) continue;
    const from = g.start;
    const lines = [
      `Distance: ${from ? `${Math.abs(g.target.x - from.x) + Math.abs(g.target.y - from.y)} cells` : "unknown"}`,
    ];
    const d = g.difficulty;
    const used = g.used ?? movesSince(g.begun ?? 0);
    lines.push(`${g.used === undefined ? "Moves so far" : "Moves used"}: ${used}`);
    if (!d) lines.unshift("Fewest moves: measuring…");
    else {
      // When the search stopped early, the fewest moves is between its lower bound and the
      // goal's own solution.
      const fewest = d.moves ?? (d.atLeast >= g.solution.length ? g.solution.length : `${d.atLeast} to ${g.solution.length}`);
      lines.unshift(`Fewest moves: ${fewest}`);
      lines.push(`Difficulty: ${d.score.toFixed(1)}${d.moves === null ? "+" : ""}`);
      if (g.choices !== undefined) lines.push(`Choices a move: about ${Math.round(g.choices)}`);
      const best = bestKnown(g)!;
      lines.push(g.used === undefined ? `${MAX_STARS} stars within ${best} moves, one fewer every ${scoreTrack(best).step} more` : `Stars: ${starsEarned(best, g.used)} of ${MAX_STARS}`);
      if (medal(g)) lines.push(`Medal: ${g.used} moves, fewer than the game's best (${best})`);
      else if (g.undone && g.used !== undefined && medalWon(best, g.used)) lines.push("No medal: a move was undone");
    }
    return lines.join("\n");
  }
  return null;
}
/** Under the island's surface (round the square being played): hidden, so nothing there
 * reacts to the mouse. */
const covered = (world: Point) => !!scene.locked && !scene.locked.some((r) => world.x >= r.x && world.x < r.x + r.width && world.y >= r.y && world.y < r.y + r.height);
function showTip(e: PointerEvent): void {
  const world = { x: (e.offsetX - scene.camera.offsetX) / scene.camera.scale / UNIT, y: (e.offsetY - scene.camera.offsetY) / scene.camera.scale / UNIT };
  const hovering = e.pointerType === "mouse" && e.buttons === 0 && !covered(world) && !finish?.island;
  const ui = hovering ? blockAt(visibleBlocks(scene), world)?.ui : null;
  const text = ui ? tooltip(ui) : hovering ? goalTip(world) : null;
  if (!text) {
    if (performance.now() >= noteUntil) tip.style.display = "none";
    return;
  }
  tip.textContent = text;
  tip.style.display = "block";
  tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 14)}px`;
  tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 16)}px`;
}
canvas.addEventListener("pointerleave", () => {
  if (performance.now() >= noteUntil) tip.style.display = "none";
  scene.hover = null;
  redraw();
});
/** A resting mouse over a sliding block hints where a click would send it. */
function hoverAt(e: PointerEvent): void {
  const world = { x: (e.offsetX - scene.camera.offsetX) / scene.camera.scale / UNIT, y: (e.offsetY - scene.camera.offsetY) / scene.camera.scale / UNIT };
  const b = e.pointerType === "mouse" && e.buttons === 0 && !covered(world) && !finish?.island ? blockAt(visibleBlocks(scene), world) : null;
  scene.hover = b && !b.ui && !b.wall ? b.id : null;
}

// A press on the arrow to the UI blocks is the arrow's, not the board's.
let onArrow: number | null = null;
/** Where tapping the edge arrow under the pointer goes (lattice units), and which arrow it
 * is, or null. (The goal's glow is not tappable: it was hit by accident.) */
function markerAt(e: PointerEvent): (Point & { pin: "red" | "ui" }) | null {
  const near = (a: { x: number; y: number } | null) => !!a && Math.hypot(e.offsetX - a.x, e.offsetY - a.y) <= 24;
  // The red arrow first: when pins overlap, it is on top.
  const goal = scene.goal;
  const red = goal && scene.layout.byId(goal.id);
  if (goal && red) {
    const at = whereIs(scene, goal.id)!;
    if (near(redArrow(scene))) return { x: at.x + red.w / 2, y: at.y + red.h / 2, pin: "red" };
  }
  const home = scene.layout.byId("fullscreen");
  if (home && near(uiArrow(scene))) return { x: home.x + 0.5, y: home.y + 0.5, pin: "ui" };
  return null;
}
const hitsArrow = (e: PointerEvent) => markerAt(e) !== null;
// A tapped arrow throbs, then the view glides, so it is clear the arrow did it.
let pinThrob: { pin: "red" | "ui"; born: number } | null = null;

canvas.addEventListener("pointerdown", (e) => {
  sfx.unlock(); // sound can start only from a touch
  if (inspector?.open) return; // the board is a replay while it is open
  if (finish?.island) return; // under an island square's finish card
  if (e.pointerType === "mouse" && e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  if (onArrow === null && hitsArrow(e)) {
    onArrow = e.pointerId;
    return;
  }
  tip.style.display = "none";
  // A new touch shows every block where it really is, so a cut-short slide still lands: the
  // red block reaches its goal now instead of never.
  if (animation) {
    animation = null;
    reachGoal(performance.now());
  }
  gestures.down(e.pointerId, point(e));
  redraw();
});
canvas.addEventListener("pointermove", (e) => {
  showTip(e);
  hoverAt(e);
  if (e.pointerId === onArrow) return;
  gestures.move(e.pointerId, point(e));
  redraw();
});
canvas.addEventListener("pointerup", (e) => {
  if (e.pointerId === onArrow) {
    onArrow = null;
    const to = markerAt(e);
    if (to) {
      pinThrob = { pin: to.pin, born: -1 };
      flyTo(to, 160);
    }
    redraw();
    return;
  }
  const tapped = scene.circle;
  gestures.up(e.pointerId, point(e));
  if (scene.circle && scene.circle !== tapped) {
    ripples.push({ at: scene.circle, born: -1 }); // a tap on the background
    if (debugCode("tap")) forgetEverything();
  }
  redraw();
});
canvas.addEventListener("pointercancel", (e) => {
  if (e.pointerId === onArrow) onArrow = null;
  gestures.cancel(e.pointerId);
  redraw();
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  gestures.wheel(point(e), e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY);
  redraw();
}, { passive: false });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
// Telegram's in-app browser on iPhone takes swipes right and down to close itself unless the
// page blocks the touch's moves (telegram-test.html showed touch-action alone is not enough).
canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
addEventListener("resize", () => {
  resize(scene, innerWidth, innerHeight - (inspector?.open ? inspector.height() : 0));
  if (inspector?.open) inspector.show();
  else redraw();
});

// On the testbed: the animation inspector, replaying the tap on the red block and its finish.
/** Everything a replay changes (copied in and out whole). */
const playState = () => ({
  scene: { moved: scene.moved, history: scene.history, goal: scene.goal, done: scene.done, camera: scene.camera, circle: scene.circle },
  state: { flight, animation, sparkles, throb, cue, ripples, shake, finish, pinThrob, testbedNext, soul, soulFrom },
});
const inspector: Inspector | null = !testbed ? null : new Inspector({
  open(bottom) {
    // The board above the panel, with the red block and its target in the middle.
    canvas.style.height = bottom ? `${innerHeight - bottom}px` : "";
    resize(scene, innerWidth, innerHeight - bottom);
    const goal = scene.goal, at = goal && whereIs(scene, goal.id), red = goal && scene.layout.byId(goal.id);
    if (!bottom || !goal || !at || !red) return;
    const x = ((at.x + goal.target.x + red.w) / 2) * UNIT, y = ((at.y + goal.target.y + red.h) / 2) * UNIT, c = scene.camera;
    scene.camera = { scale: c.scale, offsetX: scene.width / 2 - x * c.scale, offsetY: scene.height / 2 - y * c.scale };
  },
  snapshot: () => structuredClone(playState()),
  restore(snap) {
    const { scene: s, state: t } = structuredClone(snap as ReturnType<typeof playState>);
    Object.assign(scene, s, { dragging: null, stuckId: null });
    ({ flight, animation, sparkles, throb, cue, ripples, shake, finish, pinThrob, testbedNext, soul, soulFrom } = t);
    random = Math.random;
    resetFades();
  },
  pushRed() {
    const goal = scene.goal, red = goal && scene.layout.byId(goal.id), at = goal && whereIs(scene, goal.id);
    if (!goal || !red || !at) return false;
    const to = quickPush(scene, { ...red, ...at });
    if (!to) return false;
    const move = { id: goal.id, from: at, to };
    record(scene, move);
    pushed(move);
    return true;
  },
  advance,
  paint: (now, moving, to, trace) => paint(now, moving as ReturnType<typeof sliding>, to, trace),
  state: () => {
    const g = finish && scene.done.find((d) => d.id === finish!.id);
    const times = g && g.used !== undefined ? finishTimes(bestKnown(g) ?? g.solution.length, shownUsed(g)!) : null;
    const medal = !!times && times.medalAt !== null && !g!.undone, raw = times ? timeWarp(times, medal).raw : (t: number) => t;
    // On the inspector's time line in real time (slow motion takes longer).
    const parts = g && times ? [...finishParts({ times, medal }), ...moreParts({ times, medal })].map((p) => ({ ...p, from: raw(p.from), to: raw(p.to) })) : [];
    return { sliding: !!animation && !(animation.wait && flight), gliding: !!flight, finishing: !!finish, souling: !!soul, goal: scene.goal?.id ?? null, parts };
  },
  seed(r) {
    random = r;
  },
  pace,
}, redraw);

redraw();

// The finish's fonts loaded ahead, as soon as the page is idle.
if ("requestIdleCallback" in window) requestIdleCallback(warmUp, { timeout: 1000 });
else setTimeout(warmUp, 300);
