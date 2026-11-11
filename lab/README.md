# lab/

Analysis and prototype scripts for the research (research/roadmap.md). Output goes to lab/out/
(gitignored). Run one at a time; the VM has about 2 GB free.

- `graph.ts`: a board's state graph for a chosen set of moving blocks, optionally bounded like the
  solver (only states on a solution of at most `bound` moves), with distances from the goal and
  from the start, blocker heuristics, and `rollout` for simulated players.
- `statespace.ts`: every trial board's state-space numbers and the user's path through it
  (d* after each move), ranked against the verdicts. `ROOM=1 SLACK=4 bun lab/statespace.ts` for
  the open rooms (room blocks move, world frozen); without ROOM it tries all blocks that matter
  and runs out of states on open boards (that is a finding, see the roadmap).
- `plays.ts`: one row per logged trial play (moves/fewest, seconds, think time, take-backs,
  blocks moved, blocks moved that the proof never moves), per device. The stand-in for verdicts.
- `playlist.ts`: makes src/trials-rooms.ts (?trial=R1 ... chained) from the opened-room library
  in data/open-gen, and lab/out/rooms.json with each board's numbers.
- `verdicts.ts`: the verdict order and blind pairs (an agent's reading of chat, paraphrased),
  Spearman and pair counts.
