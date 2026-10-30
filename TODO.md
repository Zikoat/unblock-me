# Unblock Me TODO

## Later

- Deploy script for exe.dev, owned by this project (not shared: each app's setup diverges); waits on you picking it.
- Lock the next red block (darker, immovable until the current goal is reached), chosen among blocks the current solution doesn't touch and locked where it stands when the current goal is made, so it can't strand the current goal; waits on you picking it.
- Walls in generated boards (dead ends to plan around); waits on a difficulty measure to tune them against.
- Density × walls report graph; waits on walls in generated boards.
- Pins pointing the same way can overlap (red wins the tap); waits on seeing it bother you in play.
- Faster `Window.lower` (half the measure's time: array scans, allocations per call); waits on tournament levels 2-3 being too slow in play.
- Difficulty's branching counts slides, not blocks (choices a move now counts chain blocks, but the score doesn't); waits on playtesting whether the score tracks felt hardness.
- A* cap per density (95% finds the fewest moves): a background agent is tuning it; when it reports, review, test, push and update the report's "Being tuned" line.
- Remove the old goal engine (`makeGoal`/`clearCell`) and the dead `RANGE`/`starsFor`/old `starsEarned` in difficulty.ts; waits on the cap agent finishing with those files.
- Push cap 12 -> 20 cells (most goals sit at 10-12); waits on you picking it.
- Log each goal's proof and measured difficulty, and page hides; widen the measure window (goal #37: 8 in the window, player did 6); waits on you picking it.
