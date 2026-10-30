// The app: wires the canvas, the gestures, storage, goals and live reload together.
import type { Point } from "./camera";
import type { Goal } from "./goal";
import { viewCentre } from "./goal";
import type { GoalRequest } from "./goal-worker";
import { Gestures } from "./gestures";
import { fixedLayout, MAX_TRIES, MIN_TRIES, randomLayout, TRIES, UNIT, type Placed, type Ui } from "./layout";
import { draw } from "./render";
import { blockAt, blocksIn, slideRange, type Move } from "./rules";
import { latticeRect, newScene, relayout, resize, restart, undo, visibleBlocks, type TapMode } from "./scene";

// v5: two rows of UI blocks (generation changed) and goals; v4 one row, v3 one 2x2 reset
// block, v2 no seed, v1 free positions.
const SEED_KEY = "unblock-me:v5:seed";
const MOVED_KEY = "unblock-me:v5:moved";
const HISTORY_KEY = "unblock-me:v5:history";
const GOAL_KEY = "unblock-me:v5:goal";
const BORDER_KEY = "unblock-me:border";
const TRIES_KEY = "unblock-me:tries";
const TAP_MODE_KEY = "unblock-me:tap-mode";
const CAMERA_KEY = "unblock-me:camera"; // carried over a live reload only
/** How many cells the goal's red block is pushed. */
const EFFORT = 12;
/** The density slider's track, as a share of its block (see densityIcon). */
const TRACK = 0.52;

declare const __BUILD_ID__: string;

// ?board=<JSON list of placed blocks> opens exactly that board (the reports link to their
// structures this way). Nothing is stored while it is open.
const shared = new URLSearchParams(location.search).get("board");

const canvas = document.querySelector("canvas")!;
const fps = document.querySelector<HTMLElement>("#fps")!;
const tip = document.querySelector<HTMLElement>("#tip")!;

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function save(): void {
  if (shared) return;
  try {
    localStorage.setItem(SEED_KEY, JSON.stringify(seed));
    localStorage.setItem(BORDER_KEY, JSON.stringify(scene.border));
    localStorage.setItem(TRIES_KEY, JSON.stringify(tries));
    localStorage.setItem(TAP_MODE_KEY, JSON.stringify(scene.tapMode));
    localStorage.setItem(MOVED_KEY, JSON.stringify([...scene.moved].map(([id, p]) => [id, p.x, p.y])));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(scene.history));
    // A goal belongs to one seed and density.
    localStorage.setItem(GOAL_KEY, JSON.stringify(scene.goal && { seed, tries, goal: scene.goal }));
  } catch {
    // Private mode or full storage: changes just don't survive a reload.
  }
}

const seed = load<number>(SEED_KEY, Math.floor(Math.random() * 2 ** 32));
let tries = load<number>(TRIES_KEY, TRIES);
const moved = load<[string, number, number][]>(MOVED_KEY, []);
const storedGoal = load<{ seed: number; tries: number; goal: Goal } | null>(GOAL_KEY, null);
const scene = newScene(innerWidth, innerHeight, {
  layout: randomLayout(seed, { tries }),
  moved: new Map(moved.map(([id, x, y]) => [id, { x, y }])),
  history: load<Move[]>(HISTORY_KEY, []),
  border: load<boolean>(BORDER_KEY, false),
  tapMode: load<TapMode>(TAP_MODE_KEY, "topright"),
  goal: storedGoal?.seed === seed && storedGoal.tries === tries ? storedGoal.goal : null,
});
restoreCamera();
// A fresh start (first visit or after a reset) keeps its seed from the first load on.
if (localStorage.getItem(SEED_KEY) === null) save();

// Goals are made by a worker: shuffling a dense board can take a second or two. Only the
// newest request counts; a slider drag or reset in between makes older answers stale.
const worker = new Worker("goal-worker.js");
let job = 0;
let goalWaiters: (() => void)[] = [];
function requestGoal(): void {
  if (shared) return;
  const near = viewCentre(scene.camera, scene.width, scene.height);
  // Below the UI rows when the view is on them.
  const at: Point = near.y >= -1 && near.y <= 0 && near.x >= -2 && near.x <= 2 ? { x: near.x, y: 2 } : near;
  const request: GoalRequest = { job: ++job, seed, tries, near: at, moved: [...scene.moved], effort: EFFORT };
  worker.postMessage(request);
}
worker.onmessage = (event: MessageEvent<{ job: number; goal: Goal | null }>) => {
  if (event.data.job !== job) return;
  scene.goal = event.data.goal;
  save();
  redraw();
  goalWaiters.forEach((resolve) => resolve());
  goalWaiters = [];
};
if (!scene.goal) requestGoal();

// While the density slider is held: where its knob is (0..1), following the finger.
let slider: { from: number; at: number } | null = null;

const gestures = new Gestures(scene, {
  onChange: save,
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
    } else if (ui === "undo") {
      if (undo(scene)) save();
    } else if (ui === "tapmode") {
      scene.tapMode = scene.tapMode === "nearest" ? "topright" : "nearest";
      save();
    }
  },
  // The density slider: the knob stays under the finger, and the board shows that density
  // right away (same seed, no goal). The goal is made once the finger lifts.
  onAdjust: (dx, done) => {
    slider ??= { from: (tries - MIN_TRIES) / (MAX_TRIES - MIN_TRIES), at: 0 };
    slider.at = Math.min(1, Math.max(0, slider.from + dx / (TRACK * UNIT * scene.camera.scale)));
    const next = Math.round(MIN_TRIES + slider.at * (MAX_TRIES - MIN_TRIES));
    if (next !== tries) {
      tries = next;
      relayout(scene, randomLayout(seed, { tries }));
    }
    if (done) {
      slider = null;
      if (!scene.goal) requestGoal();
      save();
    }
  },
});

/** Delete everything Unblock Me stored and reload: a new seed, default settings, centred.
 * Only our own keys go, since other pages on this origin keep theirs in the same storage. */
function forgetEverything(): void {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      for (const key of Object.keys(storage)) if (key.startsWith("unblock-me:")) storage.removeItem(key);
    } catch {
      // No storage: there is nothing to forget.
    }
  }
  location.reload();
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
    /** Resolves once a goal requested by the app has arrived. */
    goalReady: () => (scene.goal ? Promise.resolve() : new Promise<void>((resolve) => goalWaiters.push(resolve))),
    /** Replace the random layout with exactly these blocks, and optionally a goal (for tests). */
    place: (blocks: Placed[], goal: Goal | null = null) => {
      job++; // any goal on its way is for the old board
      restart(scene, fixedLayout(blocks));
      scene.goal = goal;
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
      sessionStorage.setItem(CAMERA_KEY, JSON.stringify(scene.camera));
      location.reload();
    }
  } catch {
    // Offline or the file is missing: try again next time.
  }
}
setInterval(reloadOnNewBuild, 1000);
document.addEventListener("visibilitychange", reloadOnNewBuild);

function restoreCamera(): void {
  try {
    const saved = sessionStorage.getItem(CAMERA_KEY);
    sessionStorage.removeItem(CAMERA_KEY);
    if (saved) {
      scene.camera = JSON.parse(saved);
      resize(scene, scene.width, scene.height);
    }
  } catch {
    // No session storage: start centred.
  }
}

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

// Frames are only drawn when something changes, so the counter shows 0 fps when idle.
// Next to it: how long ago the running code was built.
const frames: number[] = [];
function showFps(now: number): void {
  while (frames.length && frames[0]! <= now - 1000) frames.shift();
  fps.textContent = `${frames.length} fps · ${ago(Date.now() - builtAt)} · ${tries} tries`;
}
setInterval(() => showFps(performance.now()), 500);

let queued = false;
function redraw(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame((now) => {
    queued = false;
    draw(canvas, scene, { fullscreen: document.fullscreenElement !== null, density: slider?.at ?? (tries - MIN_TRIES) / (MAX_TRIES - MIN_TRIES) });
    frames.push(now);
    showFps(now);
  });
}

const point = (e: PointerEvent | WheelEvent) => ({ x: e.offsetX, y: e.offsetY });

/** What each UI block does, shown when the mouse rests on it. */
function tooltip(ui: Ui): string {
  switch (ui) {
    case "tapmode":
      return scene.tapMode === "topright"
        ? "Tapping a block slides it all the way up (vertical blocks) or right (horizontal ones). " +
          "A block already against that end goes the other way. Tap to switch to: towards the nearer end."
        : "Tapping a block slides it all the way to the nearer end of its room (up or right on a tie). " +
          "A block already against one end goes the other way. Tap to switch to: always up or right.";
    case "undo": return "Undo the last move.";
    case "home": return "Back to the homepage.";
    case "density": return "Density: drag sideways for a sparser or denser board.";
    case "border": return "Show only blocks inside a smaller frame, to check that hidden blocks are skipped.";
    case "reset": return "Start over: a new board, and everything forgotten.";
    case "fullscreen": return "Fullscreen on or off.";
    case "reports": return "Reports about the board.";
  }
}

function showTip(e: PointerEvent): void {
  const world = { x: (e.offsetX - scene.camera.offsetX) / scene.camera.scale / UNIT, y: (e.offsetY - scene.camera.offsetY) / scene.camera.scale / UNIT };
  const ui = e.pointerType === "mouse" && e.buttons === 0 ? blockAt(visibleBlocks(scene), world)?.ui : null;
  if (!ui) {
    tip.style.display = "none";
    return;
  }
  tip.textContent = tooltip(ui);
  tip.style.display = "block";
  tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 14)}px`;
  tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 8, e.clientY + 16)}px`;
}
canvas.addEventListener("pointerleave", () => (tip.style.display = "none"));

canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  tip.style.display = "none";
  gestures.down(e.pointerId, point(e));
  redraw();
});
canvas.addEventListener("pointermove", (e) => {
  showTip(e);
  gestures.move(e.pointerId, point(e));
  redraw();
});
canvas.addEventListener("pointerup", (e) => {
  gestures.up(e.pointerId, point(e));
  redraw();
});
canvas.addEventListener("pointercancel", (e) => {
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
