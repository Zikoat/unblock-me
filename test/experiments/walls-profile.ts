// Where a profiled run's time goes (reports/walls.html): a .cpuprofile (bun --cpu-prof) summed
// into parts of the maker by the deepest function on each sample's stack that names one, as a
// JSONL line of kind "profile":
//   bun test/experiments/walls-profile.ts <file.cpuprofile> <walls> <density> >> data/walls/profile.jsonl
export {};
type PNode = { id: number; callFrame: { functionName: string; url: string }; children?: number[] };
const [file, walls, density] = process.argv.slice(2);
const profile = (await Bun.file(file!).json()) as { nodes: PNode[]; samples: number[]; timeDeltas: number[] };

/** The parts, by file and function ("file.ts:name"); a sample counts for the deepest function
 * on its stack that names one, so Board.at under the lower bound is the lower bound's, and
 * the state pool under A* is A*'s; anything under the experiment's own analysis is its. */
const PARTS: [string, RegExp][] = [
  ["The experiment's own analysis (the Judge on every candidate)", /^walls-candidates\.ts:ranked$/],
  ["Lower bound (window.ts lower, lowerCheap)", /^window\.ts:(lower|lowerCheap)$/],
  ["A* search, the rest (difficulty.ts astar)", /^difficulty\.ts:(astar|shortest)$/],
  ["Measure set-up (windows, the blocks that matter)", /^difficulty\.ts:(measure|measureIn|blocking|difficulty)$/],
  ["Push search (goal-fast.ts)", /^goal-fast\.ts:(pushes|clearCellOn|vacate|candidatesNear)$/],
  ["Simplify and replay proofs", /^(goal-fast\.ts:simplifyFast|board\.ts:replays|goal\.ts:merge|goal-search\.ts:onTrack)$/],
  ["Judging the finalists (decisions)", /^(decisions\.ts:.*|judge\.ts:judge)$/],
  ["Board generation", /^layout\.ts:.*$/],
];
const byId = new Map(profile.nodes.map((n): [number, PNode] => [n.id, n]));
const parent = new Map<number, number>();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const ms: Record<string, number> = {};
const partOf = new Map<number, string>();
function part(id: number): string {
  const known = partOf.get(id);
  if (known) return known;
  let found = "Other (the runtime, garbage collection, the rest)";
  // The experiment's own work counts as its own wherever it calls into the game's code.
  for (let x: number | undefined = id; x !== undefined; x = parent.get(x)) {
    const f = byId.get(x)!.callFrame, up = parent.get(x) === undefined ? null : byId.get(parent.get(x)!)!.callFrame;
    // (Its watch's ranked judges every candidate; its own Judge call on the chosen goal is
    // straight from its module.)
    const direct = f.functionName === "judge" && up?.url.endsWith("walls-candidates.ts");
    if (direct || PARTS[0]![1].test(`${f.url.split("/").pop()}:${f.functionName}`)) {
      partOf.set(id, PARTS[0]![0]);
      return PARTS[0]![0];
    }
  }
  for (let x: number | undefined = id; x !== undefined; x = parent.get(x)) {
    const f = byId.get(x)!.callFrame, name = `${f.url.split("/").pop()}:${f.functionName}`;
    const hit = PARTS.find(([, re]) => re.test(name));
    if (hit) {
      found = hit[0];
      break;
    }
  }
  partOf.set(id, found);
  return found;
}
profile.samples.forEach((s, i) => {
  const p = part(s);
  ms[p] = (ms[p] ?? 0) + profile.timeDeltas[i]! / 1000;
});
for (const k of Object.keys(ms)) ms[k] = Math.round(ms[k]!);
console.log(JSON.stringify({ kind: "profile", walls: Number(walls), density: Number(density), ms }));
