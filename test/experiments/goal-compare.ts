// Do two approaches make the same goals? Lists the boards where they differ.
//   scripts/capped.sh 800 120 bun test/experiments/goal-compare.ts <a> <b> <boards> <tries,...> [perCell]
import { randomLayout } from "../../src/layout";
import { APPROACHES } from "./approaches";

const [a, b, boardsArg, triesArg, perCellArg] = process.argv.slice(2);
const perCell = Number(perCellArg ?? 4);
let same = 0, differ = 0;
for (const tries of triesArg!.split(",").map(Number)) {
  for (let seed = 1; seed <= Number(boardsArg); seed++) {
    const layout = randomLayout(seed * 7919, { tries });
    const near = { x: (seed * 37) % 200 - 100, y: (seed * 53) % 200 - 100 };
    const ga = JSON.stringify(APPROACHES[a!]!(layout, near, { perCell, effort: Number(process.env.EFFORT ?? 12) }));
    const gb = JSON.stringify(APPROACHES[b!]!(layout, near, { perCell, effort: Number(process.env.EFFORT ?? 12) }));
    if (ga === gb) same++;
    else {
      differ++;
      console.log(`tries ${tries} seed ${seed}:\n  ${a} ${ga}\n  ${b} ${gb}`);
    }
  }
}
console.log({ same, differ });
