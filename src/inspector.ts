// The animation inspector (on ?testbed): replays tapping the red block, the slide to its
// target, and everything the finish plays, on the board itself, at any moment: play, pause
// and scrub. Below the time line: when each part happens, and each icon's place, size and
// opacity over time. Every frame is replayed from the start (the game's state only moves
// forward), with the same scatter of sparkles each time.
import type { TraceEntry } from "./score-track";

export type InspectorHooks = {
  /** Leave `bottom` px below the board for the panel (0: the whole screen again). */
  open(bottom: number): void;
  /** The game as it is now, and back to it. */
  snapshot(): unknown;
  restore(snapshot: unknown): void;
  /** Tap the red block (false when it cannot move). */
  pushRed(): boolean;
  /** One frame: move everything on to `now`, and draw it (on the screen, or another canvas
   * collecting the finish's icons). */
  advance(now: number): unknown;
  paint(now: number, moving: unknown, to?: HTMLCanvasElement, trace?: TraceEntry[]): void;
  /** What is going on, for the time line. */
  state(): { sliding: boolean; gliding: boolean; finishing: boolean; goal: string | null };
  /** The sparkles' random numbers. */
  seed(random: () => number): void;
};

const STEP_MS = 16, BASE = 1_000_000, NS = "http://www.w3.org/2000/svg";
const el = (name: string, attrs: Record<string, string | number>, parent?: Element) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
};
/** mulberry32: the same sparkles every replay. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Span = { name: string; from: number; to: number; color: string };

export class Inspector {
  open = false;
  private snap: unknown = null;
  /** The game as it was before opening, for closing. */
  private before: unknown = null;
  private t = 0;
  private total = 4000;
  private playing = false;
  private playFrom = 0;
  private spans: Span[] = [];
  private samples: { t: number; trace: TraceEntry[] }[] = [];
  private panel: HTMLElement;
  private slider: HTMLInputElement;
  private timeOut: HTMLElement;
  private playButton: HTMLButtonElement;
  private timeline: SVGSVGElement;
  private curves: SVGSVGElement;

  constructor(private hooks: InspectorHooks, private redraw: () => void) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.append(style);
    this.panel = document.createElement("div");
    this.panel.id = "inspector";
    this.panel.innerHTML = `
      <div class="row"><button id="insOpen">Inspect the finish</button></div>
      <div id="insBody" hidden>
        <div class="row"><button id="insPlay">▶</button><input id="insTime" type="range" min="0" max="4000" step="10" value="0"><span id="insOut"></span><button id="insClose">✕</button></div>
        <svg id="insTimeline"></svg>
        <svg id="insCurves"></svg>
      </div>`;
    document.body.append(this.panel);
    this.slider = this.panel.querySelector("#insTime")!;
    this.timeOut = this.panel.querySelector("#insOut")!;
    this.playButton = this.panel.querySelector("#insPlay")!;
    this.timeline = this.panel.querySelector("#insTimeline")!;
    this.curves = this.panel.querySelector("#insCurves")!;
    this.panel.querySelector("#insOpen")!.addEventListener("click", () => this.start());
    this.panel.querySelector("#insClose")!.addEventListener("click", () => this.stop());
    this.playButton.addEventListener("click", () => this.toggle());
    this.slider.addEventListener("input", () => {
      this.playing = false;
      this.t = Number(this.slider.value);
      this.show();
    });
    for (const svg of [this.timeline, this.curves]) svg.addEventListener("click", (e) => {
      const box = svg.getBoundingClientRect(), x = ((e.clientX - box.left) / box.width) * this.width();
      this.playing = false;
      this.t = Math.max(0, Math.min(this.total, ((x - PAD) / (this.width() - 2 * PAD)) * this.total));
      this.show();
    });
  }

  /** The panel's height on the screen, px. */
  height(): number {
    return this.panel.getBoundingClientRect().height;
  }

  /** Take the board as it is (a goal in play) and work out its replay. */
  private start(): void {
    this.before = this.hooks.snapshot();
    this.open = true;
    this.panel.querySelector<HTMLElement>("#insOpen")!.hidden = true;
    this.panel.querySelector<HTMLElement>("#insBody")!.hidden = false;
    this.panel.classList.add("open");
    // Worked out on the board as it is, then the board made room for the panel (the
    // charts first, so the panel has its height).
    this.snap = this.before;
    this.measure();
    this.t = 0;
    this.drawTimeline();
    this.drawCurves();
    this.hooks.restore(this.before);
    this.hooks.open(this.height());
    this.snap = this.hooks.snapshot();
    this.playing = false;
    this.show();
  }

  private stop(): void {
    this.open = false;
    this.playing = false;
    this.panel.querySelector<HTMLElement>("#insOpen")!.hidden = false;
    this.panel.querySelector<HTMLElement>("#insBody")!.hidden = true;
    this.panel.classList.remove("open");
    this.hooks.open(0);
    this.hooks.restore(this.before);
    this.redraw();
  }

  private toggle(): void {
    if (this.playing) this.playing = false;
    else {
      if (this.t >= this.total) this.t = 0;
      this.playing = true;
      this.playFrom = performance.now() - this.t;
    }
    this.show();
  }

  /** From the snapshot to `t` ms after the tap. */
  private replay(t: number, each?: (at: number) => void): unknown {
    this.hooks.restore(this.snap);
    this.hooks.seed(seeded(7));
    if (!this.hooks.pushRed()) return null;
    let moving: unknown = null;
    for (let at = 0; at <= t; at += STEP_MS) {
      moving = this.hooks.advance(BASE + at);
      each?.(at);
    }
    return this.hooks.advance(BASE + t) ?? moving;
  }

  /** One run to the end: when each part happens, and the icons' curves. */
  private measure(): void {
    const marks: Record<string, [number, number]> = {};
    const mark = (name: string, on: boolean, at: number) => {
      if (on) marks[name] ? (marks[name]![1] = at) : (marks[name] = [at, at]);
    };
    const off = document.createElement("canvas");
    this.samples = [];
    let goalBefore: string | null = null, nextAt = -1;
    const limit = 12_000;
    this.replay(limit, (at) => {
      const s = this.hooks.state();
      goalBefore ??= s.goal;
      mark("View glides to the target", s.gliding, at);
      mark("Red block slides", s.sliding, at);
      mark("Finish (stars, medal, gathering)", s.finishing, at);
      if (nextAt < 0 && marks["Finish (stars, medal, gathering)"] && s.goal && s.goal !== goalBefore) nextAt = at;
      if (at % 80 === 0 && (s.finishing || s.sliding)) {
        const trace: TraceEntry[] = [];
        this.hooks.paint(BASE + at, null, off, trace);
        this.samples.push({ t: at, trace });
      }
    });
    const end = Math.max(0, ...Object.values(marks).map((m) => m[1]));
    this.total = Math.ceil((nextAt > 0 ? nextAt + 900 : end + 400) / 100) * 100;
    const colors = ["#8a8d91", "#d64545", "#d49a2a"];
    this.spans = Object.entries(marks).map(([name, [from, to]], i) => ({ name, from, to, color: colors[i % colors.length]! }));
    if (nextAt > 0) this.spans.push({ name: "Next red block (throb, then its way)", from: nextAt, to: Math.min(this.total, nextAt + 900), color: "#3b6fd4" });
    this.slider.max = String(this.total);
  }

  /** Draw the board at the time shown, and the charts with the time marked. */
  show(): void {
    if (!this.open) return;
    if (this.playing) {
      this.t = Math.min(this.total, performance.now() - this.playFrom);
      if (this.t >= this.total) this.playing = false;
    }
    const moving = this.replay(this.t);
    this.hooks.paint(BASE + this.t, moving);
    this.slider.value = String(Math.round(this.t));
    this.timeOut.textContent = `${(this.t / 1000).toFixed(2)} s`;
    this.playButton.textContent = this.playing ? "❚❚" : "▶";
    this.drawTimeline();
    this.drawCurves();
    if (this.playing) requestAnimationFrame(() => this.show());
  }

  /** The charts' width: their width on the screen, so text keeps its size on a phone. */
  private width(): number {
    return Math.max(240, this.timeline.clientWidth || 360);
  }

  private x(ms: number): number {
    return PAD + (ms / this.total) * (this.width() - 2 * PAD);
  }

  /** Bars for when each part plays, named above them. */
  private drawTimeline(): void {
    const svg = this.timeline, W = this.width(), rh = 30, H = this.spans.length * rh + 16;
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    for (let ms = 0; ms <= this.total; ms += 1000) {
      el("line", { x1: this.x(ms), x2: this.x(ms), y1: 0, y2: H - 14, stroke: "#c9c7bf", "stroke-opacity": 0.25 }, svg);
      el("text", { x: this.x(ms), y: H - 2, "font-size": 11, "text-anchor": "middle", fill: "#9a988f" }, svg).textContent = `${ms / 1000}s`;
    }
    this.spans.forEach((s, i) => {
      el("text", { x: PAD, y: i * rh + 12, "font-size": 12, fill: "#e8e6df" }, svg).textContent = s.name;
      el("rect", { x: this.x(s.from), y: i * rh + 16, width: Math.max(4, this.x(s.to) - this.x(s.from)), height: 9, rx: 3, fill: s.color }, svg);
    });
    el("line", { x1: this.x(this.t), x2: this.x(this.t), y1: 0, y2: H - 14, stroke: "#ff5a5a", "stroke-width": 2 }, svg);
  }

  /** Each icon's place along the track, size and opacity over time. */
  private drawCurves(): void {
    const svg = this.curves, W = this.width();
    svg.replaceChildren();
    const names = [...new Set(this.samples.flatMap((s) => s.trace.map((e) => e.name)))];
    const colors = ["#2a78d6", "#e66b2e", "#2f9e6e", "#b84aa8", "#c9a227", "#7a5cd6", "#4bb3c4"];
    const color = (n: string) => colors[names.indexOf(n) % colors.length]!;
    const along = this.samples.flatMap((s) => s.trace.map((e) => e.along));
    const scales = this.samples.flatMap((s) => s.trace.map((e) => e.scale));
    const panels = [
      { title: "Place along the track", get: (e: TraceEntry) => e.along, min: Math.min(0, ...along), max: Math.max(1, ...along) },
      { title: "Size", get: (e: TraceEntry) => e.scale, min: 0, max: Math.max(1, ...scales) * 1.05 },
      { title: "Opacity", get: (e: TraceEntry) => e.opacity, min: 0, max: 1.05 },
    ];
    // The legend wraps over as many rows as the width needs.
    const legend: { n: string; x: number; y: number }[] = [];
    let lx = PAD, ly = 12;
    for (const n of names) {
      const w = 18 + n.length * 6.6;
      if (lx + w > W - PAD && lx > PAD) (lx = PAD), (ly += 17);
      legend.push({ n, x: lx, y: ly });
      lx += w + 10;
    }
    const ph = 52, title = 16, gap = 8, top0 = ly + 12, H = top0 + panels.length * (title + ph + gap);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    for (const { n, x, y } of legend) {
      el("rect", { x, y: y - 6, width: 12, height: 4, rx: 1, fill: color(n) }, svg);
      el("text", { x: x + 16, y, "font-size": 11, fill: "#e8e6df" }, svg).textContent = n;
    }
    panels.forEach((p, i) => {
      const top = top0 + i * (title + ph + gap) + title, y = (v: number) => top + ph - ((v - p.min) / (p.max - p.min || 1)) * ph;
      el("text", { x: PAD, y: top - 5, "font-size": 12, fill: "#e8e6df" }, svg).textContent = p.title;
      el("rect", { x: PAD, y: top, width: W - 2 * PAD, height: ph, fill: "none", stroke: "#c9c7bf", "stroke-opacity": 0.25 }, svg);
      for (const n of names) {
        let d = "", pen = "M";
        for (const s of this.samples) {
          const e = s.trace.find((q) => q.name === n);
          if (!e) {
            pen = "M";
            continue;
          }
          d += `${pen}${this.x(s.t).toFixed(1)},${y(p.get(e)).toFixed(1)}`;
          pen = "L";
        }
        el("path", { d, fill: "none", stroke: color(n), "stroke-width": 1.5 }, svg);
      }
      el("line", { x1: this.x(this.t), x2: this.x(this.t), y1: top, y2: top + ph, stroke: "#ff5a5a", "stroke-width": 2 }, svg);
    });
  }
}

/** The charts' margin left and right, px. */
const PAD = 12;

const STYLE = `
  #inspector { position: fixed; left: 12px; bottom: 16px; z-index: 3; font: 13px/1.3 system-ui, sans-serif; color: #e8e6df; }
  #inspector.open { left: 0; right: 0; bottom: 0; max-height: 55dvh; overflow-y: auto; background: #1d1d1f; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); box-sizing: border-box; }
  #inspector .row { display: flex; align-items: center; gap: 10px; }
  #inspector button { font: inherit; font-weight: 600; border: 0; border-radius: 10px; background: #1d1d1f; color: #f3f2ee; padding: 10px 14px; cursor: pointer; touch-action: manipulation; }
  #inspector.open button { background: #3a3a3d; min-width: 44px; height: 44px; padding: 0 12px; }
  #inspector input[type=range] { flex: 1; min-width: 0; height: 44px; accent-color: #ff5a5a; }
  #inspector #insOut { font-variant-numeric: tabular-nums; min-width: 52px; text-align: right; }
  #inspector svg { display: block; width: 100%; height: auto; margin-top: 6px; }
`;
