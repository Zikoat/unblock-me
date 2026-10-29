import { worldRect, type Point } from "./camera";
import { Gestures } from "./gestures";
import { borderOnScreen, latticeRect, newScene, resize, restart, visibleBlocks, type Scene } from "./scene";
import { blocksIn, fixedLayout, randomLayout, slideRange, UNIT, type Block, type Placed } from "./world";

const COLORS = {
  background: "#f3f2ee",
  dot: "#d3d1ca",
  border: "#b9b6ad",
  block: "#4f6d8f",
  moved: "#3f9a7a",
  tapped: "#8b5fbf",
  dragging: "#e0823d",
  circle: "#d64545",
  ui: "#1d1d1f",
  icon: "#f3f2ee",
};
const DOT_SIZE = 4; // world units, one dot per lattice corner
const GAP = 3; // world units between a block's edge and its lattice cells
// v4: a row of 1x1 UI blocks; v3 had one 2x2 reset block, v2 no seed, v1 free positions.
const SEED_KEY = "unblock-me:v4:seed";
const MOVED_KEY = "unblock-me:v4:moved";
const TAPPED_KEY = "unblock-me:v4:tapped";
const BORDER_KEY = "unblock-me:border";
const CAMERA_KEY = "unblock-me:camera"; // carried over a live reload only

declare const __BUILD_ID__: string;

const canvas = document.querySelector("canvas")!;
const fps = document.querySelector<HTMLElement>("#fps")!;
const ctx = canvas.getContext("2d")!;

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
    localStorage.setItem(MOVED_KEY, JSON.stringify([...scene.moved].map(([id, p]) => [id, p.x, p.y])));
    localStorage.setItem(TAPPED_KEY, JSON.stringify([...scene.tapped]));
  } catch {
    // Private mode or full storage: changes just don't survive a reload.
  }
}

const newSeed = () => Math.floor(Math.random() * 2 ** 32);
let seed = load<number>(SEED_KEY, newSeed());
const moved = load<[string, number, number][]>(MOVED_KEY, []);
const scene = newScene(innerWidth, innerHeight, {
  layout: randomLayout(seed),
  moved: new Map(moved.map(([id, x, y]) => [id, { x, y }])),
  tapped: new Set(load<string[]>(TAPPED_KEY, [])),
  border: load<boolean>(BORDER_KEY, true),
});
restoreCamera();
const gestures = new Gestures(scene, {
  onChange: save,
  onUi: (ui) => {
    if (ui === "reset") {
      // A new seed lays out every block anew; moves, marks and the circle are forgotten.
      seed = newSeed();
      restart(scene, randomLayout(seed));
    } else if (ui === "border") {
      scene.border = !scene.border;
    } else {
      toggleFullscreen();
    }
    save();
  },
});

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
    UNIT,
    visibleBlocks: () => visibleBlocks(scene),
    seed: () => seed,
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

function draw(scene: Scene): void {
  const dpr = devicePixelRatio || 1;
  const { width, height, camera } = scene;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // From here on everything is drawn in world units; this one transform zooms and pans it all.
  ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.offsetX, dpr * camera.offsetY);

  const view = worldRect(camera, { x: 0, y: 0, width, height });
  ctx.fillStyle = COLORS.dot;
  for (let x = Math.floor(view.x / UNIT) * UNIT; x < view.x + view.width; x += UNIT) {
    for (let y = Math.floor(view.y / UNIT) * UNIT; y < view.y + view.height; y += UNIT) {
      ctx.fillRect(x - DOT_SIZE / 2, y - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE);
    }
  }

  const blocks = visibleBlocks(scene);
  for (const block of blocks) {
    ctx.fillStyle = block.ui ? COLORS.ui
      : block.id === scene.dragging?.id ? COLORS.dragging
      : block.tapped ? COLORS.tapped
      : block.moved ? COLORS.moved
      : COLORS.block;
    ctx.beginPath();
    ctx.roundRect(block.x * UNIT + GAP, block.y * UNIT + GAP, block.w * UNIT - 2 * GAP, block.h * UNIT - 2 * GAP, 8);
    ctx.fill();
    if (block.ui === "reset") drawResetIcon(block);
    else if (block.ui === "border") drawBorderIcon(block, scene.border);
    else if (block.ui === "fullscreen") drawFullscreenIcon(block, document.fullscreenElement !== null);
  }

  if (scene.circle) {
    ctx.fillStyle = COLORS.circle;
    ctx.beginPath();
    ctx.arc(scene.circle.x, scene.circle.y, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // The culling border is a screen thing, so it is drawn in screen pixels.
  if (scene.border) {
    const border = borderOnScreen(scene);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(border.x + 0.5, border.y + 0.5, border.width - 1, border.height - 1);
  }
}

/** A circular arrow in the middle of the block. */
function drawResetIcon(block: Block): void {
  const cx = (block.x + block.w / 2) * UNIT;
  const cy = (block.y + block.h / 2) * UNIT;
  const r = UNIT * 0.2;
  const end = -Math.PI / 2 + Math.PI * 1.6; // the arrow runs clockwise from the top
  ctx.strokeStyle = COLORS.icon;
  ctx.fillStyle = COLORS.icon;
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, end);
  ctx.stroke();
  // Arrowhead at the end of the arc, pointing along it.
  const tip = { x: cx + r * Math.cos(end), y: cy + r * Math.sin(end) };
  const along = end + Math.PI / 2;
  const size = r * 0.55;
  ctx.beginPath();
  ctx.moveTo(tip.x + size * Math.cos(along), tip.y + size * Math.sin(along));
  ctx.lineTo(tip.x + size * Math.cos(along + 2.4), tip.y + size * Math.sin(along + 2.4));
  ctx.lineTo(tip.x + size * Math.cos(along - 2.4), tip.y + size * Math.sin(along - 2.4));
  ctx.closePath();
  ctx.fill();
}

/** A small copy of the culling border with a switch inside it. */
function drawBorderIcon(block: Block, on: boolean): void {
  const x = block.x * UNIT;
  const y = block.y * UNIT;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + UNIT * 0.2, y + UNIT * 0.2, UNIT * 0.6, UNIT * 0.6);
  const w = UNIT * 0.36;
  const h = UNIT * 0.18;
  const left = x + (UNIT - w) / 2;
  const top = y + (UNIT - h) / 2;
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, h / 2);
  ctx.fillStyle = on ? COLORS.icon : COLORS.ui;
  ctx.fill();
  ctx.strokeStyle = COLORS.icon;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(on ? left + w - h / 2 : left + h / 2, top + h / 2, h / 2 - 2.5, 0, Math.PI * 2);
  ctx.fillStyle = on ? COLORS.ui : COLORS.icon;
  ctx.fill();
}

/** Four corner brackets: pointing out to enter fullscreen, in to leave it. */
function drawFullscreenIcon(block: Block, active: boolean): void {
  const cx = (block.x + 0.5) * UNIT;
  const cy = (block.y + 0.5) * UNIT;
  const r = UNIT * 0.22; // corner distance from the middle
  const arm = UNIT * 0.1;
  ctx.strokeStyle = COLORS.icon;
  ctx.lineWidth = UNIT * 0.05;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const corner = { x: cx + sx * r, y: cy + sy * r };
    // Outward: arms run back towards the middle. Inward: the corner sits nearer the middle
    // and the arms run outwards.
    const at = active ? { x: cx + sx * (r - arm), y: cy + sy * (r - arm) } : corner;
    const dir = active ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(at.x + dir * sx * arm, at.y);
    ctx.lineTo(at.x, at.y);
    ctx.lineTo(at.x, at.y + dir * sy * arm);
    ctx.stroke();
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
  fps.textContent = `${frames.length} fps · ${ago(Date.now() - builtAt)}`;
}
setInterval(() => showFps(performance.now()), 500);

let queued = false;
function redraw(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame((now) => {
    queued = false;
    draw(scene);
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
