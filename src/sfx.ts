// The finish's sounds, made on the spot with Web Audio (no sound files): a thud for the
// landing, a rising chime per star, the medal's boom and shimmer, confetti pops, a fanfare
// for the word, fireworks, whooshes, and the red block's soul flying on. Browsers only let
// a page make sound after a touch, so the first touch starts it (unlock).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Which moments may sound (performance.now() time): all (the game), none, or a span (the
 * animation inspector, playing: only the frames just played, not its replays from the start). */
let window_: "all" | "none" | [number, number] = "all";

/** Start sound (call from every touch, click and key: see main.ts; `on` names the event, for
 * audioState). iPhones need more than other browsers: a context made or resumed in an event
 * that counts as the player's (on some only touchend, on others touchstart), a sound
 * played in it, and resuming again after the page was in the background. A context that
 * still won't run after a few tries is replaced. Their silent switch mutes Web Audio unless
 * the page asks for playback, as a game's sound does. */
let tries = 0, lastOn = "", startedAfter = 0;
export function unlock(on = ""): void {
  lastOn = on;
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== "playback") session.type = "playback";
    if (ctx && ctx.state !== "running" && tries >= 3) {
      void ctx.close().catch(() => {});
      ctx = null;
    }
    if (!ctx) {
      const AC = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
      tries = 0;
    }
    if (ctx.state !== "running") {
      tries++;
      startedAfter++;
      void ctx.resume().catch(() => {});
      // A silent sample, played in the touch itself.
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, 22050);
      source.connect(ctx.destination);
      source.start(0);
    }
  } catch {
    ctx = null; // no sound here
  }
}

/** Let the sound go (the page is going away: a reload on a new build, or closed), so the
 * next page gets it at once: an iPhone kept the old page's for minutes. */
export function release(): void {
  void ctx?.close().catch(() => {});
  ctx = null;
}

/** How sound is doing, for the debug counter: the context's state, the tries it took to
 * start, and the last event that tried. */
export function audioState(): string {
  return `${ctx?.state ?? "none"} · ${startedAfter} tries · ${lastOn || "no touch yet"}`;
}

export function listen(w: typeof window_): void {
  window_ = w;
}

export type Sound = "thud" | "glitch" | "heartbeat" | "riser" | "zap" | "stamp" | "beat" | "chime" | "fall" | "drumroll" | "boom" | "confetti" | "fanfare" | "cheer" | "firework" | "whoosh" | "land" | "jingle" | "twinkle" | "incoming" | "soul" | "press" | "release" | "push" | "bump" | "stuck";

/** Play `sound` (the moment it belongs to is `at`; `n` picks a variant, e.g. which star). */
export function play(sound: Sound, at: number, n = 0): void {
  if (window_ === "none" || (window_ !== "all" && (at <= window_[0] || at > window_[1]))) return;
  if (!ctx || !master || ctx.state !== "running") return;
  try {
    SOUNDS[sound](ctx, master, ctx.currentTime + 0.01, n);
  } catch {
    // A sound that failed is just not heard.
  }
}

type Make = (a: AudioContext, out: AudioNode, t: number, n: number) => void;

/** A tone: `type` wave gliding from f0 to f1 Hz, loud `vol`, attack then decay over `len` s. */
function tone(a: AudioContext, out: AudioNode, t: number, f0: number, f1: number, len: number, vol: number, type: OscillatorType = "sine", attack = 0.005): void {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + len + 0.05);
}

let noiseBuffer: AudioBuffer | null = null;
/** Filtered noise: a hiss, crash or whoosh (`filter` and its frequency from f0 to f1). */
function noise(a: AudioContext, out: AudioNode, t: number, len: number, vol: number, filter: BiquadFilterType, f0: number, f1: number, attack = 0.005, q = 1): void {
  if (!noiseBuffer || noiseBuffer.sampleRate !== a.sampleRate) {
    noiseBuffer = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuffer;
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random());
  s.stop(t + len + 0.05);
}

/** A bell: a few partials, decaying. */
function bell(a: AudioContext, out: AudioNode, t: number, f: number, len: number, vol: number): void {
  tone(a, out, t, f, f, len, vol);
  tone(a, out, t, f * 2.01, f * 2.01, len * 0.6, vol * 0.4);
  tone(a, out, t, f * 3.02, f * 3.02, len * 0.35, vol * 0.2);
}

// A major pentatonic, so any run of chimes sounds right.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const note = (base: number, step: number) => base * 2 ** (PENTA[step % PENTA.length]! / 12 + Math.floor(step / PENTA.length));

const SOUNDS: Record<Sound, Make> = {
  glitch(a, out, t, n) {
    // Digital blips, square and choppy.
    for (let i = 0; i < (n ? 10 : 4); i++) {
      const f = 200 + Math.random() * 2400;
      tone(a, out, t + i * 0.028, f, f * (0.5 + Math.random()), 0.03, n ? 0.07 : 0.04, "square", 0.002);
    }
  },
  heartbeat(a, out, t) {
    for (let i = 0; i < 3; i++) {
      tone(a, out, t + i * 0.42, 70, 40, 0.16, 0.7);
      tone(a, out, t + i * 0.42 + 0.17, 60, 35, 0.14, 0.5);
    }
  },
  riser(a, out, t, n) {
    // A cymbal swell (rising noise) cut off at the hit.
    const len = n / 1000;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    if (!noiseBuffer) noise(a, out, t, 0.01, 0.0001, "lowpass", 100, 100);
    s.buffer = noiseBuffer;
    f.type = "highpass";
    f.frequency.setValueAtTime(800, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + len);
    g.gain.setValueAtTime(0.0001, t + len + 0.01);
    s.connect(f).connect(g).connect(out);
    s.start(t);
    s.stop(t + len + 0.05);
    tone(a, out, t, 200, 800, len, 0.06, "sawtooth", len * 0.8);
  },
  zap(a, out, t) {
    for (let i = 0; i < 6; i++) tone(a, out, t + i * 0.05 + Math.random() * 0.03, 1800 + Math.random() * 2000, 100, 0.09, 0.08, "sawtooth", 0.002);
    noise(a, out, t, 0.5, 0.25, "highpass", 5000, 2000, 0.002);
  },
  stamp(a, out, t) {
    tone(a, out, t, 130, 55, 0.2, 0.8);
    noise(a, out, t, 0.12, 0.5, "lowpass", 3000, 400, 0.002);
    noise(a, out, t + 0.02, 0.35, 0.12, "bandpass", 600, 300, 0.05, 1);
  },
  beat(a, out, t, n) {
    // A dance beat (kick, hi-hat, clap) till the stars gather.
    const len = n / 1000, step = 0.4;
    for (let at = 0, i = 0; at < len; at += step / 2, i++) {
      const fade = Math.min(1, (len - at) / 0.3);
      if (i % 2 === 0) tone(a, out, t + at, 120, 45, 0.18, 0.55 * fade);
      noise(a, out, t + at + (i % 2 ? 0 : step / 4), 0.04, 0.08 * fade, "highpass", 7000, 8000, 0.001);
      if (i % 4 === 2) noise(a, out, t + at, 0.12, 0.25 * fade, "bandpass", 1500, 1200, 0.002, 1);
    }
  },
  thud(a, out, t) {
    tone(a, out, t, 150, 45, 0.28, 0.9);
    noise(a, out, t, 0.18, 0.5, "lowpass", 900, 150);
    tone(a, out, t, 600, 300, 0.08, 0.15, "triangle");
  },
  chime(a, out, t, n) {
    bell(a, out, t, note(784, n * 2), 0.7, 0.35);
    tone(a, out, t, note(784, n * 2) * 4, note(784, n * 2) * 4.2, 0.12, 0.06, "triangle");
  },
  incoming(a, out, t) {
    noise(a, out, t, 0.5, 0.12, "bandpass", 1200, 6000, 0.35, 4);
  },
  fall(a, out, t) {
    tone(a, out, t, 1800, 500, 0.35, 0.12, "sine", 0.05);
  },
  drumroll(a, out, t, n) {
    // Snare hits coming faster and louder up to the hit (`n` ms long).
    const len = n / 1000;
    let at = 0, i = 0;
    while (at < len) {
      const q = at / len;
      noise(a, out, t + at, 0.07, 0.08 + 0.3 * q * q, "bandpass", 2200, 1800, 0.002, 0.8);
      tone(a, out, t + at, 220, 150, 0.05, 0.05 + 0.12 * q);
      at += 0.09 - 0.065 * q;
      i++;
    }
  },
  cheer(a, out, t, n) {
    // A crowd: bands of noise swelling and falling, and a few "whoo"s.
    const len = n ? 2.6 : 1.8;
    for (const f of [700, 1300, 2400]) noise(a, out, t, len, 0.09 + 0.03 * n, "bandpass", f, f * 1.15, 0.35, 1.5);
    for (let i = 0; i < (n ? 6 : 3); i++) {
      const at = t + 0.1 + Math.random() * 0.8, f = 380 + Math.random() * 250;
      tone(a, out, at, f, f * 1.7, 0.45, 0.025, "sawtooth", 0.08);
    }
  },
  jingle(a, out, t) {
    // A short victory tune.
    const tune: [number, number, number][] = [[0, 0, 0.12], [3, 0.12, 0.12], [4, 0.24, 0.12], [5, 0.36, 0.28], [4, 0.66, 0.12], [5, 0.8, 0.6]];
    for (const [s, at, len] of tune) {
      const f = note(523, s);
      tone(a, out, t + at, f, f, len + 0.08, 0.12, "square", 0.008);
      tone(a, out, t + at, f / 2, f / 2, len + 0.08, 0.1, "triangle", 0.008);
    }
  },
  twinkle(a, out, t) {
    for (let i = 0; i < 16; i++) bell(a, out, t + Math.random() * 1.4, note(1568, Math.floor(Math.random() * 8)), 0.35, 0.05);
  },
  boom(a, out, t) {
    tone(a, out, t, 55, 30, 1.6, 0.9); // the drop
    tone(a, out, t, 110, 32, 0.8, 1);
    noise(a, out, t, 1.1, 0.45, "highpass", 3000, 6000);
    noise(a, out, t, 0.4, 0.6, "lowpass", 1500, 100);
    for (let i = 0; i < 5; i++) bell(a, out, t + 0.05 + i * 0.06, note(1046, i * 2 + 1), 1.2, 0.12);
  },
  confetti(a, out, t) {
    for (let i = 0; i < 9; i++) noise(a, out, t + i * 0.035 + Math.random() * 0.03, 0.05, 0.25, "bandpass", 1500 + Math.random() * 3000, 2000, 0.002, 3);
  },
  fanfare(a, out, t, n) {
    const steps = n ? [0, 2, 3, 5, 7] : [0, 2, 3, 5];
    steps.forEach((s, i) => {
      const f = note(523, s), at = t + i * 0.09, len = i === steps.length - 1 ? 0.6 : 0.16;
      tone(a, out, at, f, f, len, 0.16, "square", 0.01);
      tone(a, out, at, f * 2, f * 2, len, 0.08, "triangle", 0.01);
    });
  },
  firework(a, out, t) {
    tone(a, out, t, 400, 2200, 0.35, 0.08, "sine", 0.05);
    noise(a, out, t, 0.35, 0.06, "highpass", 2000, 5000, 0.2);
    const b = t + 0.35;
    tone(a, out, b, 90, 40, 0.4, 0.6);
    noise(a, out, b, 0.6, 0.4, "lowpass", 4000, 300);
    for (let i = 0; i < 12; i++) noise(a, out, b + 0.15 + Math.random() * 0.7, 0.03, 0.12, "highpass", 4000, 6000, 0.002);
  },
  // Moving blocks: small and quiet, as they come often. A soft click when a block is pressed,
  // a lower one when a drag lets go, a short swish for a tap's push, a soft knock when a
  // block runs into another, and a low double buzz for one that can't move. (A tick per cell
  // a dragged block crossed was too much, buzzy or clean.)
  press(a, out, t) {
    tone(a, out, t, 900, 650, 0.035, 0.05, "triangle", 0.002);
  },
  release(a, out, t) {
    tone(a, out, t, 520, 380, 0.05, 0.06, "triangle", 0.002);
  },
  bump(a, out, t) {
    tone(a, out, t, 190, 120, 0.07, 0.09, "sine", 0.002);
    noise(a, out, t, 0.03, 0.03, "lowpass", 900, 400, 0.001);
  },
  stuck(a, out, t) {
    tone(a, out, t, 196, 185, 0.07, 0.05, "triangle", 0.004);
    tone(a, out, t + 0.09, 156, 147, 0.1, 0.05, "triangle", 0.004);
  },
  push(a, out, t) {
    noise(a, out, t, 0.12, 0.05, "bandpass", 700, 2200, 0.01, 1.5);
  },
  whoosh(a, out, t) {
    noise(a, out, t, 0.85, 0.3, "bandpass", 300, 3000, 0.3, 2);
  },
  land(a, out, t) {
    for (let i = 0; i < 6; i++) bell(a, out, t + i * 0.055, note(1046, i + 2), 0.5, 0.1);
    tone(a, out, t, 220, 110, 0.2, 0.3);
  },
  soul(a, out, t) {
    // Rising and airy as it flies, a bright bell as it arrives.
    const o = a.createOscillator(), lfo = a.createOscillator(), depth = a.createGain(), g = a.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(330, t);
    o.frequency.exponentialRampToValueAtTime(990, t + 1);
    lfo.frequency.value = 7;
    depth.gain.value = 18;
    lfo.connect(depth).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    o.connect(g).connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.1);
    lfo.stop(t + 1.1);
    noise(a, out, t, 1, 0.08, "bandpass", 600, 4000, 0.4, 3);
    bell(a, out, t + 1, 1318, 0.9, 0.25);
    bell(a, out, t + 1, 1975, 0.7, 0.12);
  },
};
