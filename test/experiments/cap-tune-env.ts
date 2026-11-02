// Sets src/difficulty.ts tuning from the environment before cap-tune runs:
//   GREEDY_SHARE=0.25 GREEDY=4 bun test/experiments/cap-tune-env.ts <cap-tune args>
import { tuning } from "../../src/difficulty";
if (process.env.GREEDY_SHARE) tuning.greedyShare = Number(process.env.GREEDY_SHARE);
if (process.env.GREEDY) tuning.greedy = Number(process.env.GREEDY);
await import("./cap-tune");
