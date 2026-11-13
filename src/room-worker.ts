// The room maker's worker (src/room-make.ts): makes room k when asked (from try `from` on), says
// each try that failed (so a maker stopped for a goal goes on from there), and answers with it.
import { makeRoom } from "./room-make";

self.onmessage = (event: MessageEvent<{ k: number; from?: number }>) => {
  const t0 = performance.now(), { k, from = 1 } = event.data;
  const { room, tries } = makeRoom(k, 30, from, (failed) => postMessage({ k, failed }));
  postMessage({ k, room, tries, ms: Math.round(performance.now() - t0) });
};
