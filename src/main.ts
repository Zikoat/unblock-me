// The app: wires the canvas, the gestures, storage and live reload together.
import { Gestures } from "./gestures";
import { fixedLayout, MAX_TRIES, MIN_TRIES, randomLayout, TRIES, type Placed } from "./layout";
import { draw } from "./render";
import { blocksIn, slideRange } from "./rules";
import { latticeRect, newScene, relayout, resize, restart, visibleBlocks } from "./scene";

// v4: a row of 1x1 UI blocks; v3 had one 2x2 reset block, v2 no seed, v1 free positions.
const SEED_KEY = "unblock-me:v4:seed";
const MOVED_KEY = "unblock-me:v4:moved";
const TAPPED_KEY = "unblock-me:v4:tapped";
const BORDER_KEY = "unblock-me:border";
const TRIES_KEY = "unblock-me:tries";
const CAMERA_KEY = "unblock-me:camera"; // carried over a live reload only

declare const __BUILD_ID__: string;

const canvas = document.querySelector("canvas")!;
const fps = document.querySelector<HTMLElement>("#fps")!;

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function save(): void {
  try {
    localStorage.setItem(SEED_KEY, JSON.stringify(seed));
    localStorage.setItem(BORDER_KEY, JSON.stringify(scene.border));
    localStorage.setItem(TRIES_KEY, JSON.stringify(tries));
    localStorage.setItem(MOVED_KEY, JSON.stringify([...scene.moved].map(([id, p]) => [id, p.x, p.y])));
    localStorage.setItem(TAPPED_KEY, JSON.stringify([...scene.tapped]));
  } catch {
    // Private mode or full storage: changes just don't survive a reload.
  }
}

const seed = load<number>(SEED_KEY, Math.floor(Math.random() * 2 ** 32));
let tries = load<number>(TRIES_KEY, TRIES);
const moved = load<[string, number, number][]>(MOVED_KEY, []);
const scene = newScene(innerWidth, innerHeight, {
  layout: randomLayout(seed, { tries }),
  moved: new Map(moved.map(([id, x, y]) => [id, { x, y }])),
  tapped: new Set(load<string[]>(TAPPED_KEY, [])),
  border: load<boolean>(BORDER_KEY, false),
});
restoreCamera();
// A fresh start (first visit or after a reset) keeps its seed from the first load on.
if (localStorage.getItem(SEED_KEY) === null) save();

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
    }
  },
  // The density slider: the same seed laid out with more or fewer tries per chunk, live.
  onAdjust: (steps, done) => {
    adjustFrom ??= tries;
    const next = Math.min(MAX_TRIES, Math.max(MIN_TRIES, adjustFrom + steps));
    if (next !== tries) {
      tries = next;
      relayout(scene, randomLayout(seed, { tries }));
    }
    if (done) {
      adjustFrom = null;
      save();
    }
  },
});
let adjustFrom: number | null = null;

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
    /** Replace the random layout with exactly these blocks (for tests). */
    place: (blocks: Placed[]) => {
      restart(scene, fixedLayout(blocks));
      redraw();
    },
  },
});

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
    draw(canvas, scene, { fullscreen: document.fullscreenElement !== null, density: (tries - MIN_TRIES) / (MAX_TRIES - MIN_TRIES) });
    frames.push(now);
    showFps(now);
  });
}

const point = (e: PointerEvent | WheelEvent) => ({ x: e.offsetX, y: e.offsetY });

canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  gestures.down(e.pointerId, point(e));
  redraw();
});
canvas.addEventListener("pointermove", (e) => {
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
