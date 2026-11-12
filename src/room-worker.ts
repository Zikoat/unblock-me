// The room maker's worker (src/room-make.ts): makes room k when asked, and answers with it.
import { makeRoom } from "./room-make";

self.onmessage = (event: MessageEvent<{ k: number }>) => {
  const t0 = performance.now();
  const { room, tries } = makeRoom(event.data.k);
  postMessage({ k: event.data.k, room, tries, ms: Math.round(performance.now() - t0) });
};
