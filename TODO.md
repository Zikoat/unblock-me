# Unblock Me TODO

## Later

- Deploy script for exe.dev, owned by this project (not shared: each app's setup diverges); waits on you picking it.
- Lock the next red block (darker, immovable until the previous goal is reached); waits on you trying the goal trail.
- Walls in generated boards (dead ends to plan around); waits on a difficulty measure to tune them against.
- Shortest-solution solver as the goal difficulty measure; waits on you picking it.
- Density × walls report graph; waits on walls in generated boards.
- Pins pointing the same way can overlap (red wins the tap); waits on seeing it bother you in play.
- Faster `Window.lower` (half the measure's time: array scans, allocations per call); waits on tournament levels 2-3 being too slow in play.
- Difficulty's branching counts slides, not blocks to choose from (a free block with ten stops counts ten); waits on playtesting whether the score tracks felt hardness.
