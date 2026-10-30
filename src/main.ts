// The app: wires the canvas, the gestures, storage, goals and live reload together.
import type { Point, Rect } from "./camera";
import { starsEarned, starsFor, type Difficulty } from "./difficulty";
import type { Goal } from "./goal";
import { viewCentre } from "./goal";
import type { GoalRequest } from "./goal-worker";
import { Gestures } from "./gestures";
import { fixedLayout, MAX_TRIES, MIN_TRIES, randomLayout, TRIES, UNIT, type Placed, type Ui } from "./layout";
import { CUE_MS, draw, RIPPLE_MS, SHAKE_MS, THROB_MS, goalBand, redArrow, uiArrow, type Sparkle } from "./render";
import { ease, slideDuration } from "./slide";
import { blockAt, blocksIn, slideRange, type Move } from "./rules";
import { borderOnScreen, goalSolved, latticeRect, newScene, relayout, resize, restart, undo, visibleBlocks, whereIs } from "./scene";

// v6: UI blocks in a game row and a debug row (generation changed); v5 two rows of UI
// blocks, v4 one row, v3 one 2x2 reset block, v2 no seed, v1 free positions.
const SEED_KEY = "unblock-me:v6:seed";
const MOVED_KEY = "unblock-me:v6:moved";
const HISTORY_KEY = "unblock-me:v6:history";
const GOAL_KEY = "unblock-me:v6:goal";
const BORDER_KEY = "unblock-me:border";
const FPS_KEY = "unblock-me:fps"; // whether the fps counter shows
const TRIES_KEY = "unblock-me:tries";
const CAMERA_KEY = "unblock-me:camera"; // where the view is, kept across reloads
const LOG_KEY = "unblock-me:log"; // the play log; kept across resets
const DEVICE_KEY = "unblock-me:device"; // names this browser's automatic uploads; kept across resets
/** How many cells the goal's red block is pushed. */
const EFFORT = 12;
/** The density slider's track, as a share of its block (see densityIcon). */
const TRACK = 0.52;

declare const __BUILD_ID__: string;

// ?board=<JSON list of placed blocks> opens exactly that board (the reports link to their
// structures this way). Nothing is stored while it is open.
const shared = new URLSearchParams(location.search).get("board");
// Set by a reset: from then on this page stores nothing.
let forgetting = false;

const canvas = document.querySelector("canvas")!;
const fps = document.querySelector<HTMLElement>("#fps")!;
const tip = document.querySelector<HTMLElement>("#tip")!;
const undoButton = document.querySelector<HTMLButtonElement>("#undo")!;
const viewBox = document.querySelector<HTMLElement>("#view")!;

/** Keep the on-screen controls inside the view: the smaller border when it is on. */
function placeView(): void {
  const v = borderOnScreen(scene);
  Object.assign(viewBox.style, { left: `${v.x}px`, top: `${v.y}px`, width: `${v.width}px`, height: `${v.height}px` });
}

// Tapping an edge marker (the arrows, the target's glow) glides the view there, at the same
// zoom, putting `to` (lattice units) in the middle.
let flight: { from: { scale: number; offsetX: number; offsetY: number }; to: Point; start: number | null } | null = null;
function flyTo(to: Point): void {
  flight = { from: { ...scene.camera }, to, start: null };
}
function flying(now: number): void {
  if (!flight) return;
  flight.start ??= now;
  const t = Math.min(1, (now - flight.start) / 350);
  const { scale } = flight.from;
  const to = { offsetX: scene.width / 2 - flight.to.x * UNIT * scale, offsetY: scene.height / 2 - flight.to.y * UNIT * scale };
  const e = ease(t);
  scene.camera = {
    scale,
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
  | { e: "goal"; id: string; target: Point; start?: Point; tries: number; seed: number; solution: number; moved: [string, number, number][] }
  | { e: "move" | "undo"; id: string; from: Point; to: Point }
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
/** History entries already in the log. */
let logged = -1;
function logMoves(): void {
  if (logged < 0 || logged > scene.history.length) logged = scene.history.length;
  while (logged < scene.history.length) {
    // Counted before logging: logging can upload, which saves, which logs moves again.
    const m = scene.history[logged++]!;
    log({ e: "move", id: m.id, from: m.from, to: m.to });
  }
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
const moved = load<[string, number, number][]>(MOVED_KEY, []);
const storedGoal = load<{ seed: number; tries: number; goal: Goal | null; done?: Goal[] } | null>(GOAL_KEY, null);
const goalsFit = storedGoal?.seed === seed && storedGoal.tries === tries;
const scene = newScene(innerWidth, innerHeight, {
  layout: randomLayout(seed, { tries }),
  moved: new Map(moved.map(([id, x, y]) => [id, { x, y }])),
  history: load<Move[]>(HISTORY_KEY, []),
  border: load<boolean>(BORDER_KEY, false),
  goal: goalsFit ? storedGoal.goal : null,
  done: goalsFit ? (storedGoal.done ?? []) : [],
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
  if (shared) return;
  const exclude = scene.done.map((g) => g.id);
  // Made already while the red block was one move away: no wait.
  const key = boardKey(scene.moved, exclude, near);
  if (ahead.ready?.key === key) {
    showGoal(ahead.ready.goal);
    return;
  }
  const request: GoalRequest = { job: ++job, seed, tries, placed, near, moved: [...scene.moved], effort: EFFORT, level: 0, exclude, avoid: targetsOf(scene.done) };
  worker.postMessage(request);
}
type Reply = { job: number; goal: Goal | null } | { job: number; of: { id: string; target: Point }; difficulty: Difficulty };
worker.onmessage = (event: MessageEvent<Reply>) => {
  if ("difficulty" in event.data) return measured(event.data);
  if (event.data.job !== job) return;
  showGoal(event.data.goal);
};
/** A goal's difficulty arrived: it belongs to whichever goal it was measured for. */
function measured({ of, difficulty }: { of: { id: string; target: Point }; difficulty: Difficulty }): void {
  const all = [scene.goal, ahead.ready?.goal, ...scene.done];
  for (const g of all) if (g && g.id === of.id && g.target.x === of.target.x && g.target.y === of.target.y) g.difficulty = difficulty;
  save();
}
function showGoal(goal: Goal | null): void {
  job++; // anything still on its way is stale
  scene.goal = goal;
  if (goal) {
    goal.tries = tries;
    goal.begun = scene.history.length;
    // A snapshot of the board, so the goal can be measured again later.
    log({ e: "goal", id: goal.id, target: goal.target, start: goal.start, tries, seed, solution: goal.solution.length, moved: [...scene.moved].map(([id, p]) => [id, p.x, p.y]) });
  }
  // The new red block throbs once; its clock starts at the first frame drawn.
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
  if (shared || !goal || !red || !at) return;
  const { lo, hi } = slideRange(scene.layout, { ...red, ...at }, scene);
  const along = red.w > red.h ? goal.target.x : goal.target.y;
  const inLane = red.w > red.h ? goal.target.y === at.y : goal.target.x === at.x;
  if (!inLane || along < lo || along > hi) return;
  const moved = new Map(scene.moved).set(goal.id, goal.target);
  const exclude = [...scene.done.map((g) => g.id), goal.id];
  const key = boardKey(moved, exclude, goal.target);
  if (key === ahead.asked || ahead.ready?.key === key) return;
  ahead.asked = key;
  const request: GoalRequest = { job: ++ahead.job, seed, tries, placed, near: goal.target, moved: [...moved], effort: EFFORT, level: 2, exclude, avoid: targetsOf([...scene.done, goal]) };
  ahead.worker.postMessage(request);
}
ahead.worker.onmessage = (event: MessageEvent<Reply>) => {
  if ("difficulty" in event.data) return measured(event.data);
  if (event.data.job === ahead.job) ahead.ready = { key: ahead.asked, goal: event.data.goal };
};
if (!scene.goal) requestGoal();
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
let animation: { move: Move; start: number | null; duration: number } | null = null;
function animate(move: Move): void {
  const cells = Math.abs(move.to.x - move.from.x) + Math.abs(move.to.y - move.from.y);
  animation = { move, start: null, duration: slideDuration(cells) };
}
function sliding(now: number): { id: string; x: number; y: number; from: Point; to: Point } | null {
  if (!animation) return null;
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

// The first time the red block lands on its target, stars fly out of it; from then on the
// target keeps a check.
let sparkles: Sparkle[] = [];
let throb: { id: string; born: number } | null = null;
// Just after the throb, a trail from the new red block towards its target shows the way.
let cue: { id: string; born: number } | null = null;
// Each tap's ripple runs to its end, however many taps come in the meantime.
let ripples: { at: Point; born: number }[] = [];
// A tapped block that cannot move shakes.
let shake: { id: string; born: number } | null = null;
function reachGoal(now: number): void {
  const goal = scene.goal;
  if (!goal || !goalSolved(scene) || animation?.move.id === goal.id) return;
  // Done: its target keeps a check, and the next goal starts from a block close to it.
  goal.used = Math.max(1, movesSince(goal.begun ?? 0));
  logMoves();
  log({ e: "reached", id: goal.id, used: goal.used });
  scene.done.push(goal);
  scene.goal = null;
  requestGoal(goal.target);
  const red = scene.layout.byId(goal.id)!;
  const at = whereIs(scene, goal.id)!;
  const cx = (at.x + red.w / 2) * UNIT;
  const cy = (at.y + red.h / 2) * UNIT;
  sparkles = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
    const reach = UNIT * (0.9 + Math.random() * 0.9);
    return {
      x: cx, y: cy, dx: Math.cos(angle) * reach, dy: Math.sin(angle) * reach,
      born: now + Math.random() * 80, life: 650 + Math.random() * 250, size: UNIT * (0.09 + Math.random() * 0.08), spin: (Math.random() - 0.5) * 6,
    };
  });
  save();
}

function takeBack(): void {
  const move = undo(scene);
  if (!move) return;
  log({ e: "undo", id: move.id, from: move.from, to: move.to });
  logged = scene.history.length;
  animate({ id: move.id, from: move.to, to: move.from });
  save();
  redraw();
}
undoButton.addEventListener("click", takeBack);

const gestures = new Gestures(scene, {
  onChange: () => {
    save();
    reachGoal(performance.now()); // a drag lands at once; a tap's slide reaches it at its end
  },
  onPush: animate,
  onStuck: (id) => {
    shake = { id, born: -1 };
    redraw();
  },
  onUi: (ui) => {
    if (ui === "reset") {
      forgetEverything();
    } else if (ui === "border") {
      scene.border = !scene.border;
      save();
    } else if (ui === "fullscreen") {
      toggleFullscreen();
    } else if (ui === "reports") {
      location.href = "reports/";
    } else if (ui === "home") {
      location.href = "/";
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
        relayout(scene, randomLayout(seed, { tries }));
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
  const kept = JSON.stringify(playLog);
  forget();
  try {
    localStorage.setItem(LOG_KEY, kept);
    localStorage.setItem(DEVICE_KEY, device);
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

function toggleFullscreen(): void {
  // Runs inside the tap's pointerup, which counts as the user gesture fullscreen needs.
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}
document.addEventListener("fullscreenchange", () => redraw());

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

// The fps counter, with how long ago the running code was built.
const frames: number[] = [];
function showFps(now: number): void {
  while (frames.length && frames[0]! <= now - 1000) frames.shift();
  fps.textContent = `${frames.length} fps · ${ago(Date.now() - builtAt)}`;
}
setInterval(() => showFps(performance.now()), 500);

let queued = false;
function redraw(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame((now) => {
    queued = false;
    flying(now);
    placeView();
    cameraMoved();
    const moving = sliding(now);
    if (throb && throb.born < 0) throb.born = now;
    if (throb && now > throb.born + THROB_MS) throb = null;
    if (cue && cue.born < 0) cue.born = now;
    if (cue && now > cue.born + CUE_MS) cue = null;
    for (const r of ripples) if (r.born < 0) r.born = now;
    ripples = ripples.filter((r) => now <= r.born + RIPPLE_MS);
    if (shake && shake.born < 0) shake.born = now;
    if (shake && now > shake.born + SHAKE_MS) shake = null;
    draw(canvas, scene, {
      fullscreen: document.fullscreenElement !== null,
      density: slider?.ui === "density" ? slider.at : (tries - MIN_TRIES) / (MAX_TRIES - MIN_TRIES),
      fps: showingFps,
      sliding: moving,
      sparkles,
      throb,
      cue,
      ripples,
      shake,
      now,
    });
    sparkles = sparkles.filter((s) => now < s.born + s.life);
    undoButton.disabled = scene.history.length === 0;
    const debug = (window as unknown as { unblock: { frames: { t: number; x: number; y: number }[] | null } }).unblock;
    if (debug.frames && moving) debug.frames.push({ t: now, x: moving.x, y: moving.y });
    if (animation || sparkles.length || flight || throb || cue || ripples.length || shake) redraw();
  });
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
    case "reports": return "Reports";
    case "fps": return "Debug: Show or hide the fps counter";
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
  return { sentAt: new Date().toISOString(), build: builtAt, device, userAgent: navigator.userAgent, screen: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, stored };
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
function note(text: string): void {
  tip.textContent = text;
  tip.style.display = "block";
  tip.style.left = `${(innerWidth - tip.offsetWidth) / 2}px`;
  tip.style.top = `${innerHeight / 2}px`;
  setTimeout(() => (tip.style.display = "none"), 2500);
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
      const worth = starsFor(d.score, g.tries ?? tries);
      lines.push(g.used === undefined ? `Worth ${worth} of 10 stars` : `Stars: ${starsEarned(worth, d.moves ?? d.atLeast, g.used)} of ${worth} (worth ${worth} of 10)`);
    }
    return lines.join("\n");
  }
  return null;
}
function showTip(e: PointerEvent): void {
  const world = { x: (e.offsetX - scene.camera.offsetX) / scene.camera.scale / UNIT, y: (e.offsetY - scene.camera.offsetY) / scene.camera.scale / UNIT };
  const hovering = e.pointerType === "mouse" && e.buttons === 0;
  const ui = hovering ? blockAt(visibleBlocks(scene), world)?.ui : null;
  const text = ui ? tooltip(ui) : hovering ? goalTip(world) : null;
  if (!text) {
    tip.style.display = "none";
    return;
  }
  tip.textContent = text;
  tip.style.display = "block";
  tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 14)}px`;
  tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 16)}px`;
}
canvas.addEventListener("pointerleave", () => {
  tip.style.display = "none";
  scene.hover = null;
  redraw();
});
/** A resting mouse over a sliding block hints where a click would send it. */
function hoverAt(e: PointerEvent): void {
  const world = { x: (e.offsetX - scene.camera.offsetX) / scene.camera.scale / UNIT, y: (e.offsetY - scene.camera.offsetY) / scene.camera.scale / UNIT };
  const b = e.pointerType === "mouse" && e.buttons === 0 ? blockAt(visibleBlocks(scene), world) : null;
  scene.hover = b && !b.ui && !b.wall ? b.id : null;
}

// A press on the arrow to the UI blocks is the arrow's, not the board's.
let onArrow: number | null = null;
/** Where tapping the edge marker under the pointer goes (lattice units), or null. */
function markerAt(e: PointerEvent): Point | null {
  const near = (a: { x: number; y: number } | null) => !!a && Math.hypot(e.offsetX - a.x, e.offsetY - a.y) <= 24;
  // The goal's markers first: when pins overlap, the red one is on top.
  const goal = scene.goal;
  const red = goal && scene.layout.byId(goal.id);
  if (goal && red) {
    const at = whereIs(scene, goal.id)!;
    if (near(redArrow(scene))) return { x: at.x + red.w / 2, y: at.y + red.h / 2 };
    const b = goalBand(scene);
    if (b && b.alpha > 0.3 && e.offsetX >= b.x - 8 && e.offsetX <= b.x + b.width + 8 && e.offsetY >= b.y - 8 && e.offsetY <= b.y + b.height + 8) {
      return { x: goal.target.x + red.w / 2, y: goal.target.y + red.h / 2 };
    }
  }
  if (near(uiArrow(scene))) return { x: 0.5, y: 0.5 };
  return null;
}
const hitsArrow = (e: PointerEvent) => markerAt(e) !== null;

canvas.addEventListener("pointerdown", (e) => {
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
    if (to) flyTo(to);
    redraw();
    return;
  }
  const tapped = scene.circle;
  gestures.up(e.pointerId, point(e));
  if (scene.circle && scene.circle !== tapped) ripples.push({ at: scene.circle, born: -1 }); // a tap on the background
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
addEventListener("resize", () => {
  resize(scene, innerWidth, innerHeight);
  redraw();
});

redraw();
