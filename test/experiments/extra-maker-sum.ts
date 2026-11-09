// Sums up extra-maker.ts's files (a line per file, or a markdown table with --md):
export {};
//   bun test/experiments/extra-maker-sum.ts data/extra-maker/*.jsonl [--md]
const files = process.argv.slice(2).filter((a) => !a.startsWith("--")), md = process.argv.includes("--md");
const pct = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] ?? NaN; };
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const f1 = (x: number) => x.toFixed(1), pc = (x: number) => `${Math.round(100 * x)}%`;
const head = ["run", "boards", "found", "fewest med", "fewest mean", "off aim mean", "exact", "extra mean", "extra ≥2", "extra ≥4", "red ≥2×", "decisions", "maker ms med", "p95", "pool near aim", "with extra ≥2"];
if (md) console.log(`| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|`);
else console.log(head.join("\t"));
for (const f of files) {
  const rows = (await Bun.file(f).text()).trim().split("\n").map((l) => JSON.parse(l));
  const ok = rows.filter((r) => r.found);
  const fewest = ok.map((r) => r.proof);
  const cells = [
    f.split("/").at(-1)!.replace(".jsonl", ""), String(rows.length), pc(ok.length / rows.length),
    String(pct(fewest, 0.5)), f1(mean(fewest)), ok[0]?.aim === null ? "-" : f1(mean(ok.map((r) => Math.abs(r.proof - r.aim)))),
    pc(ok.filter((r) => r.exact).length / ok.length),
    f1(mean(ok.map((r) => r.extra))), pc(ok.filter((r) => r.extra >= 2).length / ok.length), pc(ok.filter((r) => r.extra >= 4).length / ok.length),
    pc(ok.filter((r) => r.redMoves >= 2).length / ok.length), f1(mean(ok.map((r) => r.decisions))),
    String(Math.round(pct(rows.map((r) => r.ms), 0.5))), String(Math.round(pct(rows.map((r) => r.ms), 0.95))),
    f1(mean(rows.map((r) => r.pool.nearAim))), f1(mean(rows.map((r) => r.pool.nearAimExtra2))),
  ];
  console.log(md ? `| ${cells.join(" | ")} |` : cells.join("\t"));
}
