// Today's maker (bench/current.ts) at an effort level with the measure's window at several
// margins, on the Bench's cases: its time, its goal's fewest as the game would know it, and
// whether a wide search (the check below) finds that overstated, as it would let a player
// win a bogus medal.
//   scripts/capped.sh 2500 7200 bun test/experiments/window-effort.ts <out.json> <level> <margins, e.g. 2,5,8> [every] [check margin 12] [check limit 200k]
//   bun test/experiments/window-effort.ts report <out.json>
import { contractGoal, playerCells, requestBoard, worldLayout } from "../../src/contract";
import { measure } from "../../src/difficulty";
import { LEVELS_OF_EFFORT, makeGoalHard } from "../../src/goal-search";
import { inIsland } from "../../src/island";
import type { Case } from "../../bench/cases";
import { pct } from "./window-cost";

type Row = { name: string; margin: string; ms: number; moves: number | null; known: number | null; truth: number | null; exact: boolean };

async function run(out: string, level: number, margins: string[], every: number, checkMargin: number, checkLimit: number) {
  const cases: Case[] = await Bun.file(new URL("../../bench/cases-full.json", import.meta.url).pathname).json();
  const rows: Row[] = [];
  for (const [i, c] of cases.entries()) {
    if (i % every) continue;
    const request = c.request, layout = worldLayout(request.world), board = requestBoard(request);
    const p = playerCells(request, board);
    let near = { x: p.x, y: p.y };
    if (request.world.ui.island) while (inIsland(near)) near = { x: near.x + 1, y: near.y };
    const avoid = request.history.flatMap((h) => {
      const red = layout.byId(h.red);
      return red ? [{ x: h.target.x, y: h.target.y, width: red.w, height: red.h }] : [];
    });
    const options = { moved: board.pos, exclude: new Set(request.history.map((h) => h.red)), avoid, target: request.rampAim ?? undefined };
    for (const margin of margins) {
      const saved = { ...LEVELS_OF_EFFORT[level]! };
      LEVELS_OF_EFFORT[level]!.margin = Number(margin);
      const t = performance.now();
      const found = makeGoalHard(layout, near, options, level);
      const ms = performance.now() - t;
      LEVELS_OF_EFFORT[level] = saved;
      if (!found) {
        rows.push({ name: c.name, margin, ms, moves: null, known: null, truth: null, exact: false });
        continue;
      }
      const known = found.difficulty.moves ?? found.solution.length;
      const goal = contractGoal(found);
      const check = measure(board, { id: goal.red, target: goal.target, solution: found.solution }, { margin: checkMargin, limit: checkLimit });
      rows.push({ name: c.name, margin, ms, moves: found.difficulty.moves, known, truth: Math.min(known, check.solution?.length ?? Infinity), exact: check.moves !== null });
    }
    process.stderr.write(`\r${i + 1}/${cases.length}`);
    await Bun.write(out, JSON.stringify(rows));
  }
  process.stderr.write("\n");
}

async function report(file: string) {
  const rows: Row[] = await Bun.file(file).json();
  const margins = [...new Set(rows.map((r) => r.margin))];
  console.log("margin  goals  exact in game  overstated (by)       ms median / p95 / max");
  for (const m of margins) {
    const rs = rows.filter((r) => r.margin === m), found = rs.filter((r) => r.known !== null);
    const over = found.filter((r) => r.truth! < r.known!), by = over.map((r) => r.known! - r.truth!);
    const ms = rs.map((r) => r.ms);
    console.log(`${m.padStart(6)}  ${String(found.length).padStart(5)}  ${String(found.filter((r) => r.moves !== null).length).padStart(13)}  ${String(over.length).padStart(4)} (${by.length ? (by.reduce((a, b) => a + b, 0) / by.length).toFixed(1) : "-"} avg, ${Math.max(0, ...by)} max)  ${Math.round(pct(ms, 0.5))} / ${Math.round(pct(ms, 0.95))} / ${Math.round(Math.max(...ms))}`);
  }
}

if (import.meta.main) {
  const [a, b, c, d, e, f] = process.argv.slice(2);
  if (a === "report") await report(b!);
  else await run(a!, Number(b), c!.split(","), Number(d ?? 1), Number(e ?? 12), Number(f ?? 200_000));
}
