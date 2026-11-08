// Medals against wider searches: every reached world goal in play data, its fewest moves as the
// game knew it (the proof's length it logged: the measure's solution replaced a longer proof,
// so it is the measure's when that finished) next to the difficulty measure in wider windows,
// with a large budget. A medal (fewer moves than the game knew, no undo) is bogus when a wider
// search finds a solution no longer than the player's: the game's fewest was overstated.
//   scripts/capped.sh 2500 7200 bun test/experiments/medals.ts measure <out.json> <play.json...>
//   scripts/capped.sh 2500 7200 bun test/experiments/medals.ts measure <more.json> <play.json...> '[{"cfg": "reach 8:60@50k", "reach": {"depth": 8, "most": 60}, "limit": 50000}]'
//   bun test/experiments/medals.ts report <out.json>[,<more.json>...] [cfg as the game's measure after the fix]
// Play data is read, never copied into the repo.
import { Board } from "../../src/board";
import type { Point } from "../../src/camera";
import { measure, type MeasureOptions } from "../../src/difficulty";
import { randomLayout } from "../../src/layout";
import { parse } from "./play-analysis";

/** The searches (margin:levels@boards). The log has no proof, and the game's window is
 * widened to its proof and slides the proof's blocks and those in their lanes; without it,
 * one more level of lanes stands in for the proof's blocks (the blockers in red's way and
 * the blocks in theirs). So "2:2" is the game's window as near as can be told, and "5:2",
 * "8:2" wider ones at the game's budget. Those marked "+player" take the player's moves as
 * the proof: the window covers every block the player moved and lets them slide, so with a
 * large budget they find the true fewest (never more than the player's moves). */
type Search = MeasureOptions & { cfg: string; player?: boolean; medals?: boolean };
const SEARCHES: Search[] = [
  { cfg: "2:2@50k", margin: 2, levels: 2, limit: 50_000, reach: null },
  { cfg: "5:2@50k", margin: 5, levels: 2, limit: 50_000, reach: null },
  { cfg: "8:2@50k", margin: 8, levels: 2, limit: 50_000, reach: null },
  // The game's measure now: the near window, then the blocks that matter (src/difficulty.ts).
  { cfg: "reach 8:60@50k", limit: 50_000, reach: { depth: 8, most: 60 } },
  { cfg: "8:1@200k+player", margin: 8, levels: 1, limit: 200_000, player: true, reach: null },
  // (Slow: only for medals.)
  { cfg: "16:2@500k+player", margin: 16, levels: 2, limit: 500_000, player: true, medals: true, reach: null },
];

const MEDALS_FROM = Date.parse("2026-10-30T14:02:31Z");

type Run = { cfg: string; moves: number | null; best: number | null; ms: number };
type Row = { file: string; agent: string; t: number; commit: string; id: string; known: number; used: number; undos: number; medal: boolean; runs: Run[] };

const UIS = [{}, { island: true }, { debug: true }, { island: true, debug: true }, { fullscreen: false }, { island: true, fullscreen: false }];

async function run(out: string, files: string[], extra?: string) {
  const searches = extra ? JSON.parse(extra) : SEARCHES;
  // Resumed where it stopped, if it did.
  const rows: Row[] = (await Bun.file(out).exists()) ? await Bun.file(out).json() : [];
  const done = new Set(rows.map((r) => `${r.t} ${r.id}`));
  let skipped = 0;
  // Uploads from one device overlap (each sends its whole log): a goal counts once.
  const seen = new Set<string>();
  for (const file of files) {
    const data = await Bun.file(file).json();
    const log = data.stored?.["unblock-me:log"];
    if (!log) continue;
    const goals = parse(log), events = log.filter((e: any) => e.e === "goal");
    for (const p of goals) {
      const ev = events[p.n];
      if (p.outcome !== "reached" || p.id.startsWith("isle") || typeof ev.solution !== "number" || seen.has(`${p.t} ${p.id}`)) continue;
      seen.add(`${p.t} ${p.id}`);
      if (done.has(`${p.t} ${p.id}`)) continue;
      // The log has no UI shown: the first layout that puts red where the log says and
      // replays the player's moves (or at least puts red there) is taken.
      const moved = new Map((ev.moved as [string, number, number][]).map(([id, x, y]) => [id, { x, y }] as [string, Point]));
      const boards = UIS.map((ui) => new Board(randomLayout(p.seed, { tries: p.tries, ...ui }), moved)).filter((b) => {
        const red = b.home(p.id) && b.block(p.id);
        return red && red.x === p.start.x && red.y === p.start.y;
      });
      const board = boards.find((b) => b.replays(p.moves));
      if (!board) {
        skipped++;
        continue;
      }
      const medal = p.undos === 0 && p.used < ev.solution;
      const runs = searches.filter((o: Search) => medal || !o.medals).map((o: Search) => {
        const t = performance.now();
        const d = measure(board, { id: p.id, target: p.target, solution: o.player ? p.moves : [] }, o);
        return { cfg: o.cfg, moves: d.moves, best: d.solution?.length ?? null, ms: performance.now() - t };
      });
      rows.push({ file: file.split("/").pop()!, agent: data.userAgent ?? "", t: p.t, commit: ev.commit ?? "", id: p.id, known: ev.solution, used: p.used, undos: p.undos, medal, runs });
      process.stderr.write(`\r${rows.length} goals`);
      await Bun.write(out, JSON.stringify(rows));
    }
  }
  process.stderr.write(`\n${rows.length} goals measured, ${skipped} skipped (the board did not replay the player's moves)\n`);
}

async function report(file: string, after?: string) {
  // Several files (comma separated): the same goals measured with other searches.
  const [first, ...more] = file.split(",");
  const rows: Row[] = await Bun.file(first!).json();
  for (const f of more) {
    const extra: Row[] = await Bun.file(f).json();
    for (const r of rows) r.runs.push(...(extra.find((x) => x.t === r.t && x.id === r.id)?.runs ?? []));
  }
  // No medals before they came in (5dc61bf).
  for (const r of rows) r.medal &&= r.t >= MEDALS_FROM;
  const cfgs = [...new Set(rows.flatMap((r) => r.runs.map((x) => x.cfg)))];
  const best = (r: Row, cfg: string) => r.runs.find((x) => x.cfg === cfg)?.best ?? Infinity;
  // The fewest known anywhere (the player's own moves are a solution too), and whether a
  // search that knew the player's moves proved it.
  const fewest = (r: Row) => Math.min(r.known, r.used, ...r.runs.map((x) => x.best ?? Infinity));
  const proved = (r: Row) => r.runs.some((x) => x.cfg.includes("+player") && x.moves !== null && x.moves === fewest(r));
  // The wider searches that do not know the player's moves.
  const blind = ["5:2@50k", "8:2@50k"];
  const wide = (r: Row) => Math.min(...blind.map((c) => best(r, c)));
  const medals = rows.filter((r) => r.medal);
  const over = rows.filter((r) => fewest(r) < r.known), by = over.map((r) => r.known - fewest(r));
  console.log(`${rows.length} reached world goals (${rows.filter(proved).length} with the fewest proved), ${medals.length} medals`);
  console.log(`the game's fewest overstated (a shorter solution exists): ${over.length} (${(100 * over.length / rows.length).toFixed(1)}%), by ${(by.reduce((a, b) => a + b, 0) / by.length).toFixed(1)} on average, ${Math.max(...by)} at most`);
  for (const cfg of cfgs) {
    const shorter = rows.filter((r) => best(r, cfg) < r.known), d = shorter.map((r) => r.known - best(r, cfg));
    const exact = rows.filter((r) => r.runs.find((x) => x.cfg === cfg)?.moves != null).length;
    const ms = rows.flatMap((r) => r.runs.filter((x) => x.cfg === cfg).map((x) => x.ms)).sort((a, b) => a - b);
    console.log(`  ${cfg.padEnd(17)} exact ${String(exact).padStart(3)}, shorter than the game's: ${String(shorter.length).padStart(3)} (by ${d.length ? (d.reduce((a, b) => a + b, 0) / d.length).toFixed(1) : "-"} avg, ${Math.max(0, ...d)} max), medals it denies: ${String(medals.filter((r) => best(r, cfg) <= r.used).length).padStart(2)}; ms median ${Math.round(ms[Math.floor(ms.length / 2)]!)}, p95 ${Math.round(ms[Math.floor(ms.length * 0.95)]!)}`);
  }
  // Every medal is won against an overstated fewest (the player's moves are a solution, so the
  // true fewest is never more); bogus: one a wider search, not knowing the player's moves,
  // would have known about (a solution no longer than the player's).
  const bogus = (r: Row) => r.medal && wide(r) <= r.used;
  const left = (r: Row) => r.medal && after !== undefined && r.used < Math.min(r.known, best(r, after));
  console.log(`bogus medals (${blind.join(" or ")} finds one no longer than the player's): ${medals.filter(bogus).length} of ${medals.length}; none shorter than the player's found: ${medals.filter((r) => r.used === fewest(r)).length}${after ? `; medals left with ${after} as the game's measure: ${medals.filter(left).length}` : ""}`);
  const files = [...new Set(rows.map((r) => r.file))].sort((a, b) => rows.filter((r) => r.file === b).length - rows.filter((r) => r.file === a).length);
  const day = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ");
  console.log("\nfile                                             agent    goals medals bogus" + (after ? " after" : "") + "  dates (UTC), commits");
  for (const f of files) {
    const rs = rows.filter((r) => r.file === f), ms = rs.filter((r) => r.medal);
    const a = rs[0]!.agent;
    const agent = /Windows/.test(a) ? "Windows" : /Android/.test(a) ? "Android" : /iPhone|iPad/.test(a) ? "iPhone" : /Linux/.test(a) ? "Linux" : /Mac/.test(a) ? "Mac" : "?";
    const commits = [...new Set(rs.map((r) => r.commit))];
    console.log(`${f.padEnd(48)} ${agent.padEnd(8)} ${String(rs.length).padStart(5)} ${String(ms.length).padStart(6)} ${String(ms.filter(bogus).length).padStart(5)}${after ? String(ms.filter(left).length).padStart(6) : ""}  ${day(rs[0]!.t)} to ${day(rs.at(-1)!.t)}, ${commits.length > 3 ? `${commits[0]}..${commits.at(-1)} (${commits.length})` : commits.join(" ")}`);
    for (const r of ms) console.log(`    medal ${day(r.t)} ${r.commit} goal ${r.id}: game's fewest ${r.known}, player ${r.used}, true fewest ${fewest(r)}${proved(r) ? "" : "?"}, wider search ${wide(r) === Infinity ? "-" : wide(r)}${bogus(r) ? " BOGUS" : ""}${after ? (left(r) ? " (kept after)" : " (gone after)") : ""}`);
  }
}

if (import.meta.main) {
  const [cmd, a, ...rest] = process.argv.slice(2);
  if (cmd === "measure") await run(a!, rest.filter((f) => !f.startsWith("[")), rest.find((f) => f.startsWith("[")));
  else await report(a!, rest[0]);
}
