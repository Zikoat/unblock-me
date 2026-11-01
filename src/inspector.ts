// The animation inspector (on ?testbed): replays tapping the red block, the slide to its
// target, and everything the finish plays, on the board itself, at any moment: play, pause
// and scrub. Below the time line: when each part happens, and each icon's place, size and
// opacity over time. Every frame is replayed from the start (the game's state only moves
// forward), with the same scatter of sparkles each time.
import type { TraceEntry } from "./score-track";
import * as sfx from "./sfx";
import { SOUL } from "./finish-fx";

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
  state(): { sliding: boolean; gliding: boolean; finishing: boolean; souling: boolean; goal: string | null; parts: { name: string; from: number; to: number }[] };
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
  /** Up to when the sounds have played (ms). */
  private heard = 0;
  private spans: Span[] = [];
  private samples: { t: number; trace: TraceEntry[] }[] = [];
  private panel: HTMLElement;
  private slider: HTMLInputElement;
  private timeOut: HTMLElement;
  private playButton: HTMLButtonElement;
  private timeline: SVGSVGElement;
  private curves: SVGSVGElement;
  /** The part of the time line shown (ms): zoomed in by pinching or the wheel, moved by
   * dragging. */
  private v0 = 0;
  private v1 = 4000;

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
    for (const svg of [this.timeline, this.curves]) this.gestures(svg);
  }

  /** On the charts: drag to move the time line, pinch (or the wheel) to zoom it, double tap
   * to see it all; a tap, or a drag on the ruler at the top of the time line, moves the
   * play head. */
  private gestures(svg: SVGSVGElement): void {
    const fingers = new Map<number, number>();
    let scrubbing = false, moved = false, start = { x: 0, v0: 0, v1: 0 }, pinch: { d: number; at: number; v0: number; v1: number } | null = null, lastTap = 0;
    const local = (e: { clientX: number; clientY: number }) => {
      const box = svg.getBoundingClientRect();
      return { x: ((e.clientX - box.left) / box.width) * this.width(), y: ((e.clientY - box.top) / box.height) * (box.height * (this.width() / box.width)) };
    };
    const scrub = (x: number) => {
      this.playing = false;
      this.t = Math.max(0, Math.min(this.total, this.ms(x)));
      this.show();
    };
    svg.addEventListener("pointerdown", (e) => {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // Not a live pointer (a test's made-up one).
      }
      const p = local(e);
      fingers.set(e.pointerId, p.x);
      moved = false;
      if (fingers.size === 2) {
        const [a, b] = [...fingers.values()] as [number, number];
        scrubbing = false;
        pinch = { d: Math.max(20, Math.abs(a - b)), at: this.ms((a + b) / 2), v0: this.v0, v1: this.v1 };
        return;
      }
      scrubbing = svg === this.timeline && p.y < RULER;
      start = { x: p.x, v0: this.v0, v1: this.v1 };
      if (scrubbing) scrub(p.x);
    });
    svg.addEventListener("pointermove", (e) => {
      if (!fingers.has(e.pointerId)) return;
      const p = local(e);
      fingers.set(e.pointerId, p.x);
      if (Math.abs(p.x - start.x) > 6) moved = true;
      if (pinch && fingers.size >= 2) {
        const [a, b] = [...fingers.values()] as [number, number];
        const span = (pinch.v1 - pinch.v0) * (pinch.d / Math.max(20, Math.abs(a - b)));
        const share = ((a + b) / 2 - PAD) / (this.width() - 2 * PAD);
        this.view(pinch.at - share * span, pinch.at - share * span + span);
      } else if (scrubbing) scrub(p.x);
      else if (moved && !pinch) {
        const dms = ((p.x - start.x) / (this.width() - 2 * PAD)) * (start.v1 - start.v0);
        this.view(start.v0 - dms, start.v1 - dms);
      }
    });
    const up = (e: PointerEvent) => {
      if (!fingers.delete(e.pointerId)) return;
      if (fingers.size > 0) return;
      const wasPinch = pinch !== null;
      pinch = null;
      if (wasPinch || moved || scrubbing) return (scrubbing = false);
      // A tap moves the head; two quick taps show the whole time line.
      const now = performance.now();
      if (now - lastTap < 300) this.view(0, this.total);
      else scrub(local(e).x);
      lastTap = now;
    };
    svg.addEventListener("pointerup", up);
    // The browser took the touch to scroll the panel up or down: nothing else happens.
    svg.addEventListener("pointercancel", (e) => {
      fingers.delete(e.pointerId);
      if (fingers.size === 0) (pinch = null), (scrubbing = false);
    });
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const dms = (e.deltaX / (this.width() - 2 * PAD)) * (this.v1 - this.v0);
        return this.view(this.v0 + dms, this.v1 + dms);
      }
      const at = this.ms(local(e).x), k = Math.exp(e.deltaY * 0.002);
      this.view(at - (at - this.v0) * k, at + (this.v1 - at) * k);
    }, { passive: false });
  }

  /** Show `a`..`b` ms of the time line (kept within it, and at least 100 ms). */
  private view(a: number, b: number): void {
    const span = Math.min(this.total, Math.max(100, b - a));
    const v0 = Math.max(0, Math.min(this.total - span, a));
    this.v0 = v0;
    this.v1 = v0 + span;
    this.drawTimeline();
    this.drawCurves();
  }

  /** The time at chart x. */
  private ms(x: number): number {
    return this.v0 + ((x - PAD) / (this.width() - 2 * PAD)) * (this.v1 - this.v0);
  }

  /** The panel's height on the screen, px. */
  height(): number {
    return this.panel.getBoundingClientRect().height;
  }

  /** Take the board as it is (a goal in play) and work out its replay. */
  private start(): void {
    this.before = this.hooks.snapshot();
    this.open = true;
    sfx.listen("none");
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
    sfx.listen("all");
    this.redraw();
  }

  private toggle(): void {
    if (this.playing) this.playing = false;
    else {
      if (this.t >= this.total) this.t = 0;
      this.playing = true;
      this.playFrom = performance.now() - this.t;
      this.heard = this.t - 1;
      sfx.unlock();
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
    let parts: { name: string; from: number; to: number }[] = [];
    const limit = 12_000;
    this.replay(limit, (at) => {
      const s = this.hooks.state();
      goalBefore ??= s.goal;
      mark("View glides to the target", s.gliding, at);
      mark("Red block slides", s.sliding, at);
      if (s.finishing && !marks["Finish"]) parts = s.parts.map((p) => ({ ...p, from: p.from + at, to: p.to + at }));
      mark("Finish", s.finishing, at);
      mark("Soul flies to the next red block", s.souling, at);
      if (nextAt < 0 && marks["Finish"] && s.goal && s.goal !== goalBefore) nextAt = at;
      if (at % 32 === 0 && (s.finishing || s.sliding)) {
        const trace: TraceEntry[] = [];
        this.hooks.paint(BASE + at, null, off, trace);
        this.samples.push({ t: at, trace });
      }
    });
    const end = Math.max(0, ...Object.values(marks).map((m) => m[1]));
    this.total = Math.ceil((nextAt > 0 ? Math.max(nextAt + SOUL.TRAVEL_MS + 900, end + 300) : end + 400) / 100) * 100;
    const colors = ["#8a8d91", "#d64545", "#d49a2a", "#e66b2e", "#2f9e6e", "#b84aa8", "#4bb3c4", "#c9a227"];
    // The finish shows as its parts.
    const shown = [...Object.entries(marks).filter(([name]) => name !== "Finish").map(([name, [from, to]]) => ({ name, from, to })), ...parts];
    this.spans = shown.map((s, i) => ({ ...s, color: colors[i % colors.length]! }));
    // The new red block throbs once the soul has got to it.
    const throbAt = marks["Soul flies to the next red block"] ? marks["Soul flies to the next red block"][0] + SOUL.TRAVEL_MS : nextAt;
    if (nextAt > 0) this.spans.push({ name: "Next red block (throb, then its way)", from: throbAt, to: Math.min(this.total, throbAt + 900), color: "#3b6fd4" });
    this.slider.max = String(this.total);
    this.v0 = 0;
    this.v1 = this.total;
  }

  /** Draw the board at the time shown, and the charts with the time marked. */
  show(): void {
    if (!this.open) return;
    if (this.playing) {
      this.t = Math.min(this.total, performance.now() - this.playFrom);
      if (this.t >= this.total) this.playing = false;
    }
    // Sounds only for the frames just played (not the replay up to them, nor scrubbing).
    if (this.playing) sfx.listen([BASE + this.heard, BASE + this.t]);
    const moving = this.replay(this.t);
    sfx.listen("none");
    this.heard = this.t;
    this.hooks.paint(BASE + this.t, moving);
    this.slider.value = String(Math.round(this.t));
    this.timeOut.textContent = `${(this.t / 1000).toFixed(2)} s`;
    this.playButton.textContent = this.playing ? "❚❚" : "▶";
    // Playing past the edge of a zoomed time line pages it on.
    const span = this.v1 - this.v0;
    if (this.t > this.v1 || this.t < this.v0) this.v0 = Math.max(0, Math.min(this.total - span, this.t - span * 0.1)), (this.v1 = this.v0 + span);
    this.drawTimeline();
    this.drawCurves();
    if (this.playing) requestAnimationFrame(() => this.show());
  }

  /** The charts' width: their width on the screen, so text keeps its size on a phone. */
  private width(): number {
    return Math.max(240, this.timeline.clientWidth || 360);
  }

  private x(ms: number): number {
    return PAD + ((ms - this.v0) / (this.v1 - this.v0)) * (this.width() - 2 * PAD);
  }

  /** Clip what follows the time to the charts' width (bars and curves past the zoomed view). */
  private clip(svg: SVGSVGElement, top: number, height: number): SVGGElement {
    const id = `${svg.id}Clip`, defs = el("defs", {}, svg), cp = el("clipPath", { id }, defs);
    el("rect", { x: PAD, y: top, width: this.width() - 2 * PAD, height }, cp);
    return el("g", { "clip-path": `url(#${id})` }, svg) as SVGGElement;
  }

  /** Time marks a readable distance apart for the view's zoom. */
  private ticks(): number[] {
    const per = (this.v1 - this.v0) / ((this.width() - 2 * PAD) / 60);
    const step = [50, 100, 200, 250, 500, 1000, 2000].find((s) => s >= per) ?? 5000;
    const out: number[] = [];
    for (let ms = Math.ceil(this.v0 / step) * step; ms <= this.v1; ms += step) out.push(ms);
    return out;
  }

  /** A ruler with the play head's handle on top (drag it to scrub), then bars for when each
   * part plays, named above them. */
  private drawTimeline(): void {
    const svg = this.timeline, W = this.width(), rh = 30, H = RULER + this.spans.length * rh + 4;
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    el("rect", { x: 0, y: 0, width: W, height: RULER - 2, rx: 4, fill: "#2c2c2f" }, svg);
    const g = this.clip(svg, 0, H);
    for (const ms of this.ticks()) {
      el("line", { x1: this.x(ms), x2: this.x(ms), y1: RULER - 8, y2: H, stroke: "#c9c7bf", "stroke-opacity": 0.25 }, g);
      el("text", { x: this.x(ms), y: RULER - 11, "font-size": 11, "text-anchor": "middle", fill: "#9a988f" }, g).textContent = ms % 1000 ? `${(ms / 1000).toFixed(ms % 100 ? 2 : 1)}` : `${ms / 1000}s`;
    }
    this.spans.forEach((s, i) => {
      el("rect", { x: this.x(s.from), y: RULER + i * rh + 16, width: Math.max(4, this.x(s.to) - this.x(s.from)), height: 9, rx: 3, fill: s.color }, g);
    });
    this.spans.forEach((s, i) => {
      el("text", { x: PAD, y: RULER + i * rh + 12, "font-size": 12, fill: "#e8e6df" }, svg).textContent = s.name;
    });
    const hx = this.x(this.t);
    if (hx >= PAD - 1 && hx <= W - PAD + 1) {
      el("line", { x1: hx, x2: hx, y1: RULER - 2, y2: H, stroke: "#ff5a5a", "stroke-width": 2 }, svg);
      el("path", { d: `M${hx - 8},2 h16 v8 l-8,9 l-8,-9 z`, fill: "#ff5a5a" }, svg);
    }
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
    const g = this.clip(svg, 0, H);
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
        el("path", { d, fill: "none", stroke: color(n), "stroke-width": 1.5 }, g);
      }
      el("line", { x1: this.x(this.t), x2: this.x(this.t), y1: top, y2: top + ph, stroke: "#ff5a5a", "stroke-width": 2 }, g);
    });
  }
}

/** The charts' margin left and right, px. */
const PAD = 12;
/** The ruler's height at the top of the time line, px. */
const RULER = 24;

const STYLE = `
  #inspector { position: fixed; left: 12px; bottom: 16px; z-index: 3; font: 13px/1.3 system-ui, sans-serif; color: #e8e6df; }
  #inspector.open { left: 0; right: 0; bottom: 0; max-height: 55dvh; overflow-y: auto; background: #1d1d1f; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); box-sizing: border-box; }
  #inspector .row { display: flex; align-items: center; gap: 10px; }
  #inspector button { font: inherit; font-weight: 600; border: 0; border-radius: 10px; background: #1d1d1f; color: #f3f2ee; padding: 10px 14px; cursor: pointer; touch-action: manipulation; }
  #inspector.open button { background: #3a3a3d; min-width: 44px; height: 44px; padding: 0 12px; }
  #inspector input[type=range] { flex: 1; min-width: 0; height: 44px; accent-color: #ff5a5a; }
  #inspector #insOut { font-variant-numeric: tabular-nums; min-width: 52px; text-align: right; }
  #inspector svg { display: block; width: 100%; height: auto; margin-top: 6px; touch-action: pan-y; /* up and down scroll the panel; sideways is ours */ user-select: none; -webkit-user-select: none; }
`;
