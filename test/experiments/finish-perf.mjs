// Frame times while the finish plays, on a phone-sized page with the CPU slowed down
// (Chrome's CPU throttling), and where the time goes (a CPU profile, by function).
//   node test/experiments/finish-perf.mjs [throttle=4] [live|inspector] [goal=0] [zoomOut=0]
// Serves an unminified build (so the profile has names) from /tmp/unblock-perf.
import { chromium, devices } from "playwright";
import { execSync, spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const [rate = 4, mode = "live", goal = 0, zoomOut = 0] = process.argv.slice(2);
const dir = "/tmp/unblock-perf", port = 18766;
execSync(`bun -e '
  const r = await Bun.build({ entrypoints: ["src/main.ts"], outdir: "${dir}", naming: "app.js", minify: false, define: { __BUILD_ID__: "\\"perf\\"", __COMMIT__: "\\"perf\\"" } });
  const w = await Bun.build({ entrypoints: ["src/goal-worker.ts"], outdir: "${dir}", naming: "goal-worker.js" });
  if (!r.success || !w.success) throw new Error("build failed");
  await Bun.write("${dir}/index.html", Bun.file("src/index.html"));
  await Bun.write("${dir}/build.txt", "perf");
'`, { stdio: "inherit" });
const server = spawn("python3", ["-m", "http.server", String(port)], { cwd: dir, stdio: "ignore" });
await sleep(700);
// GPU=1: canvas drawn by the GPU process (SwiftShader, software GL), as on a phone; the CPU
// throttling then slows the page's own work, not the pixel filling.
const browser = await chromium.launch(process.env.GPU ? { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--enable-accelerated-2d-canvas"] } : {});
try {
  const ctx = await browser.newContext({ ...devices["Pixel 5"], viewport: { width: 393, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  if (process.env.GPU) console.log("gpu:", await (await ctx.newPage()).evaluate(() => { const c = document.createElement("canvas"); const gl = c.getContext("webgl"); const d = gl?.getExtension("WEBGL_debug_renderer_info"); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : String(!!gl); }));
  page.on("pageerror", (e) => errors.push(e.message));
  // STEP=n: a returning visit, the detail already stepped down to n (see pace in main.ts).
  if (process.env.STEP) await page.addInitScript((n) => localStorage.setItem("unblock-me:detail", n), process.env.STEP);
  if (process.env.NOSOUND) await page.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; });
  await page.goto(`http://localhost:${port}/?testbed=${goal}${process.env.PERF || process.env.OFF ? "&perf" : ""}${process.env.OFF ? "&off=" + process.env.OFF : ""}${process.env.NOMEASURE ? "&nomeasure" : ""}`);
  await page.waitForTimeout(2500);
  if (+zoomOut) {
    await page.evaluate((k) => { const c = unblock.scene.camera, s = c.scale / k; unblock.scene.camera = { scale: s, offsetX: 196 - (196 - c.offsetX) * s / c.scale, offsetY: 400 - (400 - c.offsetY) * s / c.scale }; unblock.redraw(); }, +zoomOut);
    await page.waitForTimeout(300);
  }
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: +rate });
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  // Frame times, from the page's own animation frames.
  await page.evaluate(() => {
    window.__frames = [];
    const loop = (t) => { window.__frames.push(t); if (window.__frames.length < 4000) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  await cdp.send("Profiler.start");
  if (mode === "idle") {
    // No finish: the board redrawn every frame, for a baseline.
    await page.evaluate(() => { window.__frames = []; const t0 = performance.now(); const loop = () => { unblock.redraw(); if (performance.now() - t0 < 11000) requestAnimationFrame(loop); }; loop(); });
  } else if (mode === "inspector") {
    await page.tap("#insOpen");
    await page.waitForTimeout(500);
    await page.evaluate(() => (window.__frames = []));
    await page.tap("#insPlay");
  } else {
    const at = await page.evaluate(() => {
      const g = unblock.scene.goal, b = unblock.visibleBlocks().find((x) => x.id === g.id), c = unblock.scene.camera;
      return { x: (b.x + b.w / 2) * 60 * c.scale + c.offsetX, y: (b.y + b.h / 2) * 60 * c.scale + c.offsetY };
    });
    await page.evaluate(() => { window.__frames = []; window.__t0 = performance.now(); if (window.__frameCosts) { window.__frameCosts.length = 0; window.__frameTimes.length = 0; } if (window.__perf) for (const k in window.__perf) delete window.__perf[k]; });
    // Layers are timed only in the busy window (3.5 to 7 s after the tap).
    await page.evaluate(() => { window.__perfPaused = true; setTimeout(() => (window.__perfPaused = false), 3500); setTimeout(() => (window.__perfPaused = true), 7000); });
    await page.touchscreen.tap(at.x, at.y);
  }
  for (let i = 0; i < 11; i++) {
    await page.waitForTimeout(1000);
    if (process.env.RES) console.log(`at ${i + 1} s: canvas ${await page.evaluate(() => document.querySelector("canvas").width)} px wide, detail step ${await page.evaluate(() => unblock.detailStep())}`);
  }
  const { profile } = await cdp.send("Profiler.stop");
  const frames = await page.evaluate(() => window.__frames);
  const dt = frames.slice(1).map((t, i) => t - frames[i]);
  const budget = 1000 / 60;
  const skipped = dt.reduce((n, d) => n + Math.max(0, Math.round(d / budget) - 1), 0);
  const long = dt.map((d, i) => [Math.round(frames[i + 1] - frames[0]), Math.round(d)]).filter(([, d]) => d > 25);
  console.log("long frames [ms after the tap, length]:", JSON.stringify(long.slice(0, 60)));
  const sorted = [...dt].sort((a, b) => a - b), pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]?.toFixed(1);
  console.log(`${mode} goal ${goal} cpu x${rate}${+zoomOut ? ` zoomed out x${zoomOut}` : ""}: ${dt.length} frames, ${skipped} skipped, median ${pct(0.5)} ms, p95 ${pct(0.95)} ms, worst ${sorted.at(-1)?.toFixed(1)} ms`);
  // Where the time went: self time per function, top 25.
  const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const counts = new Map();
  // Only samples in the window WINDOW="from,to" (ms from the profile's start), if given.
  const [w0, w1] = (process.env.WINDOW ?? "0,1e9").split(",").map(Number);
  let at = 0;
  profile.samples.forEach((s, i) => {
    at += profile.timeDeltas[i] / 1000;
    if (at >= w0 && at < w1) counts.set(s, (counts.get(s) ?? 0) + 1);
  });
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  for (const [id, n] of counts) {
    const f = byId.get(id).callFrame, key = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + n);
  }
  for (const [k, n] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${((100 * n) / total).toFixed(1).padStart(5)}%  ${k}`);
  const costs = await page.evaluate(() => window.__frameCosts ?? []);
  if (costs.length) {
    const c = [...costs].sort((a, b) => a - b), q = (p) => c[Math.min(c.length - 1, Math.floor(p * c.length))].toFixed(1);
    console.log(`draw cost per frame (raster included): mean ${(costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(2)} ms, p50 ${q(0.5)}, p90 ${q(0.9)}, p99 ${q(0.99)}, worst ${c.at(-1).toFixed(1)}; over 12 ms: ${costs.filter((x) => x > 12).length} of ${costs.length}`);
  }
  const timeline = await page.evaluate(() => (window.__frameTimes ?? []).map((t) => t - window.__t0));
  if (timeline.length) {
    const buckets = new Map();
    timeline.forEach((t, i) => { const b = Math.floor(t / 500) * 500; const v = buckets.get(b) ?? []; v.push(costs[i]); buckets.set(b, v); });
    console.log("draw cost by time after the tap (ms: mean / worst):");
    const busy = timeline.map((t, i) => [t, costs[i]]).filter(([t]) => t >= 3500 && t < 7000).map(([, c]) => c);
    console.log(`busy 3.5-7 s: mean ${(busy.reduce((a, x) => a + x, 0) / busy.length).toFixed(1)} ms`);
    console.log([...buckets].map(([b, v]) => `${b}: ${(v.reduce((a, x) => a + x, 0) / v.length).toFixed(1)}/${Math.max(...v).toFixed(0)}`).join("  "));
  }
  const layers = await page.evaluate(() => window.__perf);
  if (layers) {
    console.log("per layer in the busy window (3.5-7 s), ms per frame (raster included):");
    const rows = Object.entries(layers).filter(([k]) => !k.endsWith("(worst)"));
    console.log("   mean   worst  layer");
    for (const [k, v] of rows.sort((a, b) => layers[b[0] + " (worst)"] - layers[a[0] + " (worst)"])) console.log(k.startsWith("sprites") ? `  made ${v}  ${k}` : `${(v / (3.5 * 60)).toFixed(2).padStart(7)} ${layers[k + " (worst)"].toFixed(1).padStart(7)}  ${k}`);
  }
  if (errors.length) console.log("errors", errors);
} finally {
  await browser.close();
  server.kill();
}
