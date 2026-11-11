// A playlist of candidate levels for normal play (research task 4): opened rooms with real
// come-back moves from the library (data/open-gen/high.jsonl, high6.jsonl), each with 3 cells of
// the world round it, chained so ?trial=R1 plays on to R2, R3... Every board's play is logged on
// its own (play-data/trial-R<k>-...). Boards already used by the H and J trials are left out.
// Writes src/trials-rooms.ts and lab/out/rooms.json (the boards' numbers for later analysis).
//   bun lab/playlist.ts [--count 12]
import { readFileSync, writeFileSync } from "node:fs";
import type { Grid } from "../test/experiments/extra-gen-core";
import { placedOf } from "../test/experiments/open-gen-make";
import { OPEN_TRIALS } from "../src/trials-open";
import { OPEN_TRIALS_J } from "../src/trials-open-j";

const count = Number(process.argv[process.argv.indexOf("--count") + 1] || 12);
type Line = { seed: number; size: number; margin: number; R: number[]; target: number; fewest: number; extra: number; open: { boundary: { blocks: number; movable: number; walls: number }; ring: { blocks: number; movable: number; walls: number } }; board: { W: number; H: number; walls: number[]; pieces: Grid["pieces"]; pos: number[] } };
const lines: (Line & { from: string })[] = [];
for (const f of ["data/open-gen/high.jsonl", "data/open-gen/high6.jsonl"]) for (const [k, l] of readFileSync(f, "utf8").trim().split("\n").entries()) lines.push({ ...JSON.parse(l), from: `${f}:${k}` });
const used = new Set([...OPEN_TRIALS, ...OPEN_TRIALS_J].map((t) => JSON.stringify(t.blocks.filter((b) => !b.wall).map((b) => [b.x, b.y, b.w]))));
const gridOf = (b: Line["board"]): Grid => { const g: Grid = { W: b.W, H: b.H, wall: new Uint8Array(b.W * b.H), pieces: b.pieces, pos: b.pos }; for (const c of b.walls) g.wall[c] = 1; return g; };

// A fixed shuffle, then take `count` boards spread over fewest and extra moves.
let x = 20261111;
const rand = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 4294967296);
const order = [...lines].sort(() => rand() - 0.5);
const picked: typeof lines = [];
const fpOf = (b: Line["board"]) => {
  const ox = -Math.floor(b.W / 2), oy = -Math.floor(b.H / 2);
  return JSON.stringify(b.pieces.map((p, i) => { const c = p.h ? p.lane * b.W + b.pos[i]! : b.pos[i]! * b.W + p.lane; return [(c % b.W) + ox, Math.floor(c / b.W) + oy, p.h ? 2 : 1]; }));
};
for (const l of order) {
  if (picked.length >= count) break;
  if (used.has(fpOf(l.board))) continue;
  if (picked.filter((p) => p.fewest === l.fewest && p.extra === l.extra).length >= 2) continue;
  picked.push(l);
}
const out: string[] = [], meta: unknown[] = [];
picked.forEach((l, k) => {
  const label = `R${k + 1}`, t0 = performance.now();
  const g = gridOf(l.board);
  const p = placedOf(g, l.R, l.target, l.size, l.margin);
  const fp = JSON.stringify(p.blocks.filter((b) => !b.wall).map((b) => [b.x, b.y, b.w]));
  const seen = used.has(fp);
  const next = k + 1 < picked.length ? `R${k + 2}` : undefined;
  console.log(label, "fewest", p.fewest, "extra", p.extra, "from", l.from, seen ? "(already a trial board)" : "", Math.round(performance.now() - t0), "ms");
  out.push(`  { label: ${JSON.stringify(label)}, red: ${JSON.stringify(p.red)}, target: ${JSON.stringify(p.target)}, fewest: ${p.fewest}${next ? `, next: ${JSON.stringify(next)}` : ""},\n    blocks: ${JSON.stringify(p.blocks)},\n    solution: ${JSON.stringify(p.solution)},\n  }`);
  meta.push({ label, from: l.from, fewest: p.fewest, extra: p.extra, extraMax: p.extraMax, size: l.size, open: l.open, room: p.room, box: p.box, roomIds: l.R.map((i) => `b${i}`), states: p.states, seen });
});
writeFileSync("src/trials-rooms.ts", `// Candidate levels for normal play, chained (lab/playlist.ts, research/roadmap.md): opened rooms
// with real come-back moves from the library, each with 3 cells of the world round it; ?trial=R1
// plays on to R2 and so on, each board's play logged on its own. Their numbers: lab/out/rooms.json.
import type { Trial } from "./trials";

export const ROOM_TRIALS: Trial[] = [
${out.join(",\n")},
];
`);
writeFileSync("lab/out/rooms.json", JSON.stringify(meta, null, 1));
