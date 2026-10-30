# Unblock Me TODO

## Later

- Lock the next red block (darker, immovable until the current goal is reached), chosen among blocks the current solution doesn't touch and locked where it stands when the current goal is made, so it can't strand the current goal; waits on you picking it.
- Walls in generated boards (dead ends to plan around); waits on a difficulty measure to tune them against.
- Density × walls report graph; waits on walls in generated boards.
- Pins pointing the same way can overlap (red wins the tap); waits on seeing it bother you in play.
- Faster `Window.lower` (half the measure's time: array scans, allocations per call); waits on tournament levels 2-3 being too slow in play.
- Difficulty's branching counts slides, not blocks (choices a move now counts chain blocks, but the score doesn't); waits on playtesting whether the score tracks felt hardness.
- A* cap per density (95% finds the fewest moves): a background agent is tuning it; when it reports, review, test, push and update the report's "Being tuned" line.
- Remove the dead `RANGE`/`starsFor`/old `starsEarned` in difficulty.ts; waits on the cap agent finishing with that file.
- Log each goal's proof and measured difficulty, and page hides; widen the measure window (goal #37: 8 in the window, player did 6); waits on you picking it.
- Score track instead of stars (reports/score-track.html: one cell per move, gaps where a star or the medal is lost, ends at about 2x fewest); waits on your review of the design.
- Undo a reached goal: rewind to where its moves started counting and replay it for a better score; waits on the score track.
- Undo during a goal (or undoing the goal) loses the medal (shown faded) and is stored with the goal; waits on the score track.
- Hovering a reached goal highlights the blocks its solution needed, and differently those moved without need; waits on you picking it.
