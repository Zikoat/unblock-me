// iPhone checks, with Playwright's iPhone 16 Pro in WebKit (in Chromium where WebKit can't run:
// on the VM it lacks system libraries),
// against the real public server (scripts/serve-public.py) over dist/ and an empty play-data
// folder:
// - the player carried in the URL (src/carry.ts): a page gets ?p=<its id>; a goal reached is
//   uploaded; a fresh browser opened with that URL goes on with that progress;
// - the whole screen used, notch and home bar included (index.html viewport-fit=cover).
// Run with `bun run e2e` (after test/e2e.mjs); screenshots go to test/screenshots/iphone-*.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, devices, webkit } from "playwright";

const repo = new URL("..", import.meta.url).pathname;
const shots = join(repo, "test/screenshots/");
await mkdir(shots, { recursive: true });
const playData = await mkdtemp(join(tmpdir(), "unblock-play-data-"));
const port = await new Promise((resolve) => {
  const s = createServer().listen(0, () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});
const server = spawn("python3", [join(repo, "scripts/serve-public.py")], { env: { ...process.env, PORT: String(port), PUBLIC_DIR: join(repo, "dist"), PLAY_DATA_DIR: playData }, stdio: "ignore" });
const root = `http://localhost:${port}/`;
for (let i = 0; i < 50; i++) {
  if (await fetch(root).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 100));
}

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};
const until = async (f, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (await f()) return true;
  return false;
};
const uploaded = async (id) => {
  try {
    return JSON.parse(await readFile(join(playData, `device-${id}.json`), "utf8"));
  } catch {
    return null;
  }
};
const doneIn = (data) => data?.stored?.["unblock-me:v13:goal"]?.done?.length ?? 0;

let engine = webkit;
try {
  await (await webkit.launch()).close();
} catch {
  engine = chromium;
}
console.log(`(${engine.name()})`);
const browser = await engine.launch();
const phone = { ...devices["iPhone 16 Pro"], ...(engine === chromium && { defaultBrowserType: "chromium" }) };
const open = async (url, options = {}) => {
  const context = await browser.newContext({ ...phone, ...options });
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.unblock?.scene);
  return page;
};
const param = (page) => new URL(page.url()).searchParams.get("p");
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const logged = (page, e) => page.evaluate((e) => unblock.playLog.filter((x) => x.e === e), e);

// --- A first visit gets an id, put in the URL at once (no reload).
const a = await open(root);
const id = await stored(a, "unblock-me:device");
check(param(a) === id && /^[0-9a-f-]{36}$/.test(id), `a first visit's URL names its player: ?p=${param(a)}`);
check(await until(async () => (await logged(a, "idInUrl")).length === 1), "and logs idInUrl");

// --- Playing the island's first goal uploads it at once.
const goal = await a.evaluate(() => unblock.scene.goal);
const screen = (x, y) => a.evaluate(([x, y]) => { const c = unblock.scene.camera; return [x * 60 * c.scale + c.offsetX, y * 60 * c.scale + c.offsetY]; }, [x, y]);
for (const m of goal.solution) {
  const b = await a.evaluate((id) => unblock.scene.layout.byId(id), m.id);
  const short = m === goal.solution.at(-1) ? 1 : 0; // (its bay target is out of view; it slides on in)
  const from = await screen(m.from.x + b.w / 2, m.from.y + b.h / 2), to = await screen(m.to.x - short + b.w / 2, m.to.y + b.h / 2);
  await a.mouse.move(...from);
  await a.mouse.down();
  await a.mouse.move(...to, { steps: 8 });
  await a.mouse.up();
}
check(await until(async () => doneIn(await uploaded(id)) >= 1), `the goal reached (${goal.id}) is on the server at once (${doneIn(await uploaded(id))} done)`);

// --- The page hiding sends what is not yet sent (leaving Telegram for Safari hides it): the
// next square's goal shown (logged), then the page hides.
await a.waitForSelector("#next:not([hidden])", { timeout: 20000 });
await a.click("#next");
await a.waitForFunction(() => unblock.scene.goal?.id === "isle 1 0", null, { timeout: 20000 });
const before = (await uploaded(id)).sentAt;
await a.evaluate(() => {
  Object.defineProperty(document, "hidden", { value: true, configurable: true });
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
check(await until(async () => (await uploaded(id))?.sentAt !== before), "hiding the page uploads again");

// --- The server hands back only the progress, and only for a well-formed existing id.
const got = await fetch(`${root}progress?p=${id}`).then((r) => r.json());
const keys = Object.keys(got.stored);
check(keys.includes("unblock-me:v13:goal") && keys.includes("unblock-me:log") && !keys.includes("unblock-me:device") && !("userAgent" in got), `GET /progress returns the progress keys (and debug settings) only (${keys.length} keys)`);
const statuses = await Promise.all([crypto.randomUUID(), "../play-data/x", "4bf17ee7"].map((p) => fetch(`${root}progress?p=${encodeURIComponent(p)}`).then((r) => r.status)));
check(statuses.every((s) => s === 404), `an unknown or malformed id gets 404 (${statuses})`);

// --- "Open in Safari": a fresh browser with that URL goes on as that player.
const b = await open(`${root}?p=${id}`);
await b.waitForFunction(() => unblock.scene.done.length > 0, null, { timeout: 10000 }).catch(() => {});
const bDone = await b.evaluate(() => unblock.scene.done.map((g) => g.id));
check((await stored(b, "unblock-me:device")) === id && bDone.includes(goal.id) && param(b) === id, `a fresh browser opened with ?p= restores that progress (${bDone}) and takes the id`);
const restored = await logged(b, "restored");
check(restored.length === 1 && restored[0].goals >= 1 && restored[0].from === null, `and logs restored (${JSON.stringify(restored[0])})`);
check((await logged(b, "move")).length >= goal.solution.length, "the restored log goes on from the first browser's");
await b.reload();
await b.waitForFunction(() => window.unblock?.scene);
check((await logged(b, "restored")).length === 1 && (await b.evaluate(() => unblock.scene.done.length)) >= 1, "a reload there doesn't restore again, and keeps the progress");

// --- Without ?p=, a fresh browser starts fresh (incognito, cleared data): a new player.
const c = await open(root);
const cId = await stored(c, "unblock-me:device");
check(cId !== id && param(c) === cId && (await c.evaluate(() => unblock.scene.done.length)) === 0 && (await logged(c, "restored")).length === 0, "a page without ?p= starts fresh, as a new player");
await until(async () => !!(await uploaded(cId)));

// --- A browser with its own progress keeps it when a link brings another player.
await a.evaluate(() => {
  delete document.hidden;
  delete document.visibilityState;
});
await a.goto(`${root}?p=${cId}`);
await a.waitForFunction(() => window.unblock?.scene);
const conflict = await until(async () => (await logged(a, "idConflict")).length === 1);
check(conflict && (await stored(a, "unblock-me:device")) === id && param(a) === id && (await a.evaluate(() => unblock.scene.done.length)) >= 1, "a browser with goals of its own keeps them (and its id, in the URL) when ?p= names another player; logged as idConflict");
// But one still on level 1 takes the link's player.
const d = await open(root);
await d.goto(`${root}?p=${id}`);
await d.waitForFunction(() => window.unblock?.scene);
const dRestored = await logged(d, "restored");
check((await stored(d, "unblock-me:device")) === id && dRestored.length === 1 && dRestored[0].from !== null, "one with an id of its own but no goal reached takes the link's player");

// --- Shared boards, the testbed and trials neither get nor use ?p=.
for (const q of ["?testbed", `?testbed&p=${id}`, '?board=[{"id":"a","x":0,"y":0,"w":2,"h":1}]']) {
  const e = await open(root + q);
  await e.waitForTimeout(500);
  const p = param(e);
  check(p === (q.includes("p=") ? id : null) && (await stored(e, "unblock-me:device")) === null, `${q.slice(0, 20)}: the URL is left alone and no id is taken (p=${p})`);
  await e.context().close();
}

// --- The whole screen: Safari with its toolbar hidden on an iPhone 16 Pro is 402x874 CSS px,
// a notch (dynamic island) 62 px deep at the top and the home bar 34 px at the bottom.
const viewport = await a.evaluate(() => document.querySelector('meta[name="viewport"]').content);
check(viewport.includes("viewport-fit=cover"), "the viewport reaches under the notch and home bar (viewport-fit=cover)");
const full = await open(`${root}?island=0`, { viewport: { width: 402, height: 874 } });
await full.evaluate(() => {
  // WebKit's emulation has no notch: stand in for env(safe-area-inset-*).
  const s = document.documentElement.style;
  s.setProperty("--safe-top", "62px");
  s.setProperty("--safe-bottom", "34px");
  localStorage.setItem("unblock-me:fps", "true");
  dispatchEvent(new Event("resize"));
});
await full.reload();
await full.waitForFunction(() => window.unblock?.scene);
await full.evaluate(() => {
  const s = document.documentElement.style;
  s.setProperty("--safe-top", "62px");
  s.setProperty("--safe-bottom", "34px");
  dispatchEvent(new Event("resize"));
});
await full.evaluate(() => unblock.goalReady());
await full.waitForTimeout(300);
const box = await full.evaluate(() => {
  const r = document.querySelector("canvas").getBoundingClientRect(), f = document.querySelector("#fps").getBoundingClientRect();
  return { canvas: [r.left, r.top, r.width, r.height], scene: [unblock.scene.width, unblock.scene.height], fpsTop: f.top, safe: unblock.scene.safe };
});
check(box.canvas.join() === "0,0,402,874" && box.scene.join() === "402,874", `the board fills the whole screen (canvas ${box.canvas}, drawn ${box.scene})`);
check(box.fpsTop >= 62 && box.safe.top === 62 && box.safe.bottom === 34, `the debug box keeps below the notch (top ${box.fpsTop}), the game knows the insets (${JSON.stringify(box.safe)})`);
await full.screenshot({ path: shots + "iphone-full-screen.png" });
// The world goal's number, top right: below the notch, clear of the debug box.
const no = await full.evaluate(() => {
  const g = document.querySelector("#goalno"), r = g.getBoundingClientRect(), f = document.querySelector("#fps").getBoundingClientRect();
  return { text: g.hidden ? null : g.textContent, r: [r.left, r.top, r.right, r.bottom], clear: r.left >= f.right || r.top >= f.bottom };
});
check(no.text === "Level 1" && no.r[1] >= 62 && no.r[2] <= 402 && no.clear, `the level number shows top right, below the notch and clear of the debug box (${no.text} at ${no.r.map(Math.round)})`);
await full.screenshot({ path: shots + "iphone-level-number.png" });
// A pin that would sit under it moves out: the board far up and right, the red block's pin in
// the top right corner.
await full.evaluate(() => {
  const c = unblock.scene.camera;
  unblock.scene.camera = { ...c, offsetX: c.offsetX + 3000, offsetY: c.offsetY - 3000 };
  unblock.redraw();
});
await full.waitForTimeout(200);
const corner = await full.evaluate(() => ({ pin: unblock.pins().red, r: document.querySelector("#goalno").getBoundingClientRect().toJSON() }));
const p = corner.pin, r = corner.r;
check(p && (p.x + 13 <= r.left || p.y - 13 >= r.bottom), `a pin in the top right corner keeps clear of it (pin ${p && [p.x, p.y].map(Math.round)}, label ${[r.left, r.bottom].map(Math.round)})`);
await full.screenshot({ path: shots + "iphone-level-number-pin.png" });
await full.evaluate(() => {
  const c = unblock.scene.camera;
  unblock.scene.camera = { ...c, offsetX: c.offsetX - 3000, offsetY: c.offsetY + 3000 };
  unblock.redraw();
});
await full.waitForTimeout(200);
// Pins keep clear of the notch and home bar: the board moved far down, the red block's pin
// sits at the bottom, above the home bar.
await full.evaluate(() => {
  unblock.scene.camera = { ...unblock.scene.camera, offsetY: unblock.scene.camera.offsetY + 2000 };
  unblock.redraw();
});
await full.waitForTimeout(200);
const pin = await full.evaluate(() => unblock.pins().red);
check(pin && Math.abs(pin.y - (874 - 34 - 26)) < 0.5, `a pin at the bottom edge stays above the home bar (y ${pin?.y.toFixed(0)})`);
await full.screenshot({ path: shots + "iphone-full-screen-pin.png" });
// With Safari's bars: 402x754, as the player's Safari logged.
const bars = await open(`${root}?island=0`, { viewport: { width: 402, height: 754 } });
await bars.screenshot({ path: shots + "iphone-safari-bars.png" });
const barsScene = await bars.evaluate(() => [unblock.scene.width, unblock.scene.height]);
check(barsScene.join() === "402,754", `with Safari's bars, it fills what is left (${barsScene})`);
// A resize (bars sliding away) follows at once.
await bars.setViewportSize({ width: 402, height: 874 });
check(await until(async () => (await bars.evaluate(() => unblock.scene.height)) === 874, 3000), "and follows the bars sliding away (874 px)");

await browser.close();
server.kill();
await rm(playData, { recursive: true });
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
