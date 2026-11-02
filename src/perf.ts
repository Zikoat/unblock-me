// With ?perf, how long each layer of the drawing takes (ms, summed over frames), the
// canvas's own pixel work included (each layer waits for it): window.__perf, read by
// test/experiments/finish-perf.mjs to find what makes frames late.
export const perf: Record<string, number> | null = typeof location !== "undefined" && new URLSearchParams(location.search).has("perf") ? {} : null;
if (perf) (globalThis as unknown as { __perf: typeof perf }).__perf = perf;

/** With ?perf&off=a,b: the layers left out (to see what they cost). */
const off = new Set(perf ? (new URLSearchParams(location.search).get("off") ?? "").split(",") : []);

/** With &nomeasure: layers can be left out, but are not timed (timing waits for each). */
const measureOff = perf !== null && new URLSearchParams(location.search).has("nomeasure");

/** Draw `layer` (named `name`), timed with ?perf. */
export function timed(ctx: CanvasRenderingContext2D, name: string, layer: () => void): void {
  if (!perf) return layer();
  if (off.has(name)) return;
  if (measureOff) return layer();
  ctx.getImageData(0, 0, 1, 1); // what came before is drawn
  const t0 = performance.now();
  layer();
  ctx.getImageData(0, 0, 1, 1); // and this layer
  const ms = performance.now() - t0;
  if ((globalThis as unknown as { __perfPaused?: boolean }).__perfPaused) return;
  perf[name] = (perf[name] ?? 0) + ms;
  perf[`${name} (worst)`] = Math.max(perf[`${name} (worst)`] ?? 0, ms);
}

/** With ?perf: each frame's whole drawing time (ms, raster included) and when, in order. */
export const frameCosts: number[] = [];
export const frameTimes: number[] = [];
if (perf) (globalThis as unknown as { __frameTimes: number[] }).__frameTimes = frameTimes;
if (perf) (globalThis as unknown as { __frameCosts: number[] }).__frameCosts = frameCosts;

/** Draw a frame, timed with ?perf. */
export function timedFrame(ctx: CanvasRenderingContext2D, frame: () => void): void {
  if (!perf || measureOff) return frame();
  ctx.getImageData(0, 0, 1, 1);
  const t0 = performance.now();
  frame();
  ctx.getImageData(0, 0, 1, 1);
  frameCosts.push(performance.now() - t0);
  frameTimes.push(t0);
}
