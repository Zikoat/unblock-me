// Pictures drawn once and then stamped (drawImage), for what would otherwise be redrawn from
// scratch every frame at a slightly different size: text and emoji above all, whose glyphs
// the browser rasterizes again at each new size (slow: frames were skipped).

import { perf } from "./perf";

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Draw the picture `key`, `w` by `h` world px, centred on (0, 0) of `ctx`'s current
 * transform. `scale` is device px per world px (the zoom times the pixel ratio; null: as
 * `ctx` draws now); the picture is made for it, to the nearest quarter octave, by `paint`
 * (drawing centred on (0, 0) in world px).
 */
export function sprite(ctx: CanvasRenderingContext2D, key: string, w: number, h: number, scale: number | null, paint: (c: CanvasRenderingContext2D) => void): void {
  if (scale === null) {
    const m = ctx.getTransform();
    scale = Math.hypot(m.a, m.b);
  }
  const s = 2 ** (Math.round(Math.log2(Math.max(0.05, scale)) * 4) / 4);
  const id = `${key}@${s}`;
  let img = cache.get(id);
  if (!img) {
    if (cache.size > 400) cache.clear();
    img = document.createElement("canvas");
    img.width = Math.max(1, Math.ceil(w * s));
    img.height = Math.max(1, Math.ceil(h * s));
    const c = img.getContext("2d")!;
    c.setTransform(s, 0, 0, s, img.width / 2, img.height / 2);
    paint(c);
    cache.set(id, img);
    if (perf) perf[`sprites made: ${key.split(":")[0]}`] = (perf[`sprites made: ${key.split(":")[0]}`] ?? 0) + 1;
  }
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
}

/** Soft discs of light (radial gradients: offset, "r, g, b", alpha), made once. */
const GLOWS = {
  gold: [[0, "255, 214, 90", 1], [0.3, "255, 214, 90", 0.9], [1, "255, 214, 90", 0]],
  halo: [[0, "255, 236, 140", 1], [1, "255, 220, 90", 0]],
  white: [[0, "255, 255, 255", 0.9], [1, "255, 255, 255", 0]],
  soul: [[0, "255, 255, 255", 1], [0.25, "255, 150, 150", 1], [0.55, "214, 69, 69", 0.55], [1, "214, 69, 69", 0]],
} as const satisfies Record<string, readonly (readonly [number, string, number])[]>;
const lights = new Map<string, HTMLCanvasElement>();
function light(key: string, size: number, paint: (c: CanvasRenderingContext2D, r: number) => void): HTMLCanvasElement {
  let img = lights.get(key);
  if (!img) {
    img = document.createElement("canvas");
    img.width = img.height = size;
    const c = img.getContext("2d")!;
    c.translate(size / 2, size / 2);
    paint(c, size / 2);
    lights.set(key, img);
  }
  return img;
}

/** A soft disc of light `kind`, radius `r`, centred on (x, y), at `alpha`: a picture
 * stretched into place (a gradient over the same area is worked out per pixel: slower). */
export function glow(ctx: CanvasRenderingContext2D, kind: keyof typeof GLOWS, x: number, y: number, r: number, alpha: number): void {
  if (alpha <= 0 || r <= 0) return;
  const img = light(`glow:${kind}`, 128, (c, R) => {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
    for (const [at, rgb, a] of GLOWS[kind]) g.addColorStop(at, `rgba(${rgb}, ${a})`);
    c.fillStyle = g;
    c.fillRect(-R, -R, 2 * R, 2 * R);
  });
  const was = ctx.globalAlpha;
  ctx.globalAlpha = was * Math.min(1, alpha);
  ctx.drawImage(img, x - r, y - r, 2 * r, 2 * r);
  ctx.globalAlpha = was;
}

/** Fill `n` wedges `width` radians wide, out to `r` round (0, 0): rays of light. Solid, so
 * only their own pixels are drawn (a gradient or a picture costs every pixel round them). */
export function wedges(ctx: CanvasRenderingContext2D, r: number, n: number, width: number): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, a, a + width);
    ctx.closePath();
  }
  ctx.fill();
}
