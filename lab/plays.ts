// What the logged plays say about each board (research/roadmap.md, the data pipeline): for every
// trial label (and the playlist R1..R12), every session that reached the goal, with the numbers
// that stand in for "how hard it felt" when nobody says: moves over fewest, seconds, thinking
// time before the first move, take-backs, blocks moved, and blocks moved that the proof never
// moves (world blocks the player thought mattered). Per device, so players can be told apart.
//   bun lab/plays.ts [--label R] [--json lab/out/plays.json]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { TRIALS, type Trial } from "../src/trials";
import { MAKER_TRIALS } from "../src/trials-maker";
import { GEN_TRIALS } from "../src/trials-gen";
import { OPEN_TRIALS } from "../src/trials-open";
import { OPEN_TRIALS_J } from "../src/trials-open-j";
import { OPEN_TRIALS_K } from "../src/trials-open-k";
import { ROOM_TRIALS } from "../src/trials-rooms";

const all: Trial[] = [...TRIALS, ...MAKER_TRIALS, ...GEN_TRIALS, ...OPEN_TRIALS, ...OPEN_TRIALS_J, ...OPEN_TRIALS_K, ...ROOM_TRIALS];
const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1]! : fallback; };
const prefix = arg("label", ""), jsonOut = arg("json", "lab/out/plays.json");

type Ev = { t: number; e: string; id?: string; from?: { x: number; y: number }; to?: { x: number; y: number } };
export type Play = {
  label: string; device: string; session: string; commit: string; reached: boolean;
  fewest: number; moves: number; ratio: number; seconds: number; think: number; away: number;
  backs: number; blocks: number; offProof: number; undos: number; userAgent: string;
};

export function plays(): Play[] {
  const out: Play[] = [];
  if (!existsSync("play-data")) return out;
  for (const f of readdirSync("play-data").filter((f) => f.startsWith("trial-"))) {
    const data = JSON.parse(readFileSync(`play-data/${f}`, "utf8")) as { device: string; trial: string; session: string; commit: string; userAgent: string; log: Ev[] };
    const t = all.find((t) => t.label === data.trial);
    if (!t || !data.trial.startsWith(prefix)) continue;
    const log = data.log, goal = log.find((e) => e.e === "goal"), reached = log.find((e) => e.e === "reached");
    if (!goal) continue;
    const end = reached?.t ?? log.at(-1)!.t;
    const moves = log.filter((e) => e.e === "move" && e.t <= end);
    // Time with the page hidden does not count as playing.
    let away = 0, hid = -1;
    for (const e of log) { if (e.t > end) break; if (e.e === "hide") hid = e.t; else if (e.e === "show" && hid >= 0) ((away += e.t - hid), (hid = -1)); }
    let backs = 0;
    const last = new Map<string, { x: number; y: number }>();
    for (const m of moves) { const p = last.get(m.id!); if (p && p.x === m.to!.x && p.y === m.to!.y) backs++; last.set(m.id!, m.from!); }
    const proofIds = new Set(t.solution.map((m) => m.id)), movedIds = new Set(moves.map((m) => m.id!));
    out.push({
      label: data.trial, device: data.device, session: data.session, commit: data.commit, reached: !!reached,
      fewest: t.fewest, moves: moves.length, ratio: moves.length / t.fewest, seconds: (end - goal.t - away) / 1000,
      think: moves.length ? (moves[0]!.t - goal.t) / 1000 : 0, away: away / 1000, backs, blocks: movedIds.size,
      offProof: [...movedIds].filter((id) => !proofIds.has(id)).length, undos: log.filter((e) => e.e === "undo").length, userAgent: data.userAgent,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }) || a.session.localeCompare(b.session));
}

if (import.meta.main) {
  const ps = plays();
  console.log("label  device   reached  moves/fewest  seconds  think  backs  blocks  offProof");
  for (const p of ps) console.log(`${p.label.padEnd(6)} ${p.device.slice(0, 8)} ${String(p.reached).padEnd(7)} ${p.moves}/${p.fewest} (${p.ratio.toFixed(2)})  ${p.seconds.toFixed(0).padStart(5)}  ${p.think.toFixed(0).padStart(4)}  ${p.backs}  ${p.blocks}  ${p.offProof}`);
  writeFileSync(jsonOut, JSON.stringify(ps, null, 1));
}
