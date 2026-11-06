# Goal spec (draft)

Date: 2026-11-06

What a goal is, how one is judged, and how goal makers compete, without saying how a goal is made. The drawn version, with an example, is [Goal spec, drawn](goal-spec-visual.html). A draft for discussion: nothing here is built yet, and where it differs from today's code (src/goal-search.ts) the spec wins.

## The idea

A goal maker is a black box. What it must return is fixed by a **contract**; whether its answer is legal is decided by the **Referee** (yes or no); how good it is, by the **Judge** (a number). Both are small, readable and the same for every maker, so a maker can be rewritten, tuned or ported (another language, the backend, a database) and judged the same way. Making a better maker is then an optimisation problem: a subagent writes one, runs the **Bench**, and keeps it if it passes the **Gate**.

The output is its own proof (a *certifying algorithm*): the moves show the goal can be done, and checking them is far cheaper than finding them.

## The subsystems

| Name | What it is | Where it runs |
|---|---|---|
| **Engine** | The board: blocks, cells, legal slides, replaying moves. The one implementation everything checks against. | everywhere (TypeScript) |
| **Contract** | The shapes: a **Request** in, a **Goal** out. Versioned. | everywhere |
| **Referee** | The hard rules: is this Goal legal for this Request? Yes or no, with the rule broken. Cheap. | everywhere, always on |
| **Judge** | The soft wishes: how good is this Goal? A few named numbers and one **fitness**. Cheap. | everywhere (logged in play) |
| **Auditor** | The expensive check: is there a shorter solution than the Goal's? Keeps the Judge honest. | development only |
| **Reference** | The simplest maker that meets the spec: plain, slow, correct. New features land here first. | development |
| **Contenders** | Fast makers, any language. The game ships the best that passes the Gate. | production |
| **Bench** | A fixed set of Requests (cases) and the runner that plays every maker on them. | development |
| **Records** | The best fitness ever found per case, and who found it. Only ever improves. | development |
| **Gate** | The rule a Contender must pass to ship. | development |
| **Tuner** | A subagent that writes a Contender, runs the Bench and reports. | development |

## Request

Everything a maker may look at; nothing else (no clock, no global state).

- **board**: a region (a rectangle of cells) and every block in it, each with an id, position, size and kind (sliding, or fixed: wall, UI, island). Cells outside the region are walls. The world is passed as data, not as a seed, so a maker in another language needs no copy of the world generator.
- **last target**: the cell the previous goal ended on (where the player is looking).
- **history**: earlier goals' red blocks and targets.
- **aim**: the fewest moves wanted (the ramp), or none.
- **wishes**: the Judge's weights (below), so they can be tuned without changing makers.
- **effort**: 0 to 3, how hard to try (0: the player is waiting). A maker turns it into its own step counts; it never reads the time.
- **seed**: for any choice a maker wants to make at random.

## Goal

- **red**: the id of the block to move.
- **start**: where it is now.
- **target**: where it has to get to.
- **moves**: the solution, each `{ block, from, to }`.
- **notes** (optional): anything the maker wants to report (steps used, say). The Judge ignores it.

A maker may also answer **none** (found nothing); the Bench counts that as a loss.

## Referee: the hard rules

A Goal is legal only if all of these hold:

1. **Red is real.** A sliding block with that id is at `start`.
2. **Every move is a slide.** Its block is at `from`, `to` is on the block's own axis, not `from`, inside the region, and every cell it sweeps through is empty when it moves.
3. **It ends on the target.** After replaying every move, red is at `target`, and `target` is not `start`.
4. **It is tidy.** No two moves in a row of one block (they are one slide), and no single move can be dropped with the rest still solving it. A cheap guard against padding; it does not prove the solution is the shortest.
5. **It is bounded.** At most 100 moves.
6. **It is deterministic.** The same Request gives the same Goal (the Bench asks twice).

The Referee runs in every runtime, on the Engine; a Contender in another language is checked by the same TypeScript Referee. In play, a rejected Goal is retried once with the next seed, then the Reference at effort 0 is asked.

## Judge: the soft wishes

Measured from the Request and the Goal alone, never from how the maker found it:

| Term | Meaning |
|---|---|
| **fewest moves** | the Goal's move count (we trust the maker to look for the shortest; the Auditor checks) |
| **choices** | legal moves on an average board along the replay, counting the blocks in the play area (the cells the moves sweep, 2 cells round) |
| **distance** | cells red travels from start to target |
| **track blocks** | blocks lying the same way in red's lane between start and target: pushed ahead of it, tedious rather than hard |
| **reach** | cells from the last target to red's nearest cell |
| **clashes** | earlier targets the target overlaps, and earlier red blocks whose track red shares |

```
difficulty = fewest moves × log₂(choices)
balance    = difficulty / distance^0.6 × ½^track blocks
fitness    = balance × ½^|fewest moves − aim| × 0.8^max(0, reach − 4) × ½^clashes
```

Every factor is a wish with a weight in `wishes`; none is a rule. Today's hard rules (red within the 8×8 box round the last target, no shared track, no overlapping target) become the reach and clash factors, so a far better goal can still win.

## Auditor: keeping the Judge honest

The Judge takes the move count on trust, so a maker could pad a solution to look harder. On the Bench, the Auditor searches each Goal for a shorter solution, with a large budget. The Bench scores each Goal with the audited count and reports **padding**: how often, and by how much, a maker's count was beaten. It never runs in play.

## Bench, Records and the Gate

- **Cases**: a few hundred fixed Requests across densities, ramp stages (aims 4 to 10, and none), long sessions (many moved blocks) and the island's edge. Each case keeps its Request as data, so every runtime plays exactly the same cases.
- **Records**: per case, the best audited fitness any maker has found, from the Reference with many seeds and high effort, and from every Contender ever run.
- **Scores** for a maker, per effort level:
  - **legal**: share of Goals the Referee accepts;
  - **quality**: its fitness over the record, at the median and the worst 5%;
  - **time**: per Goal at the median and the slowest 5%, per runtime;
  - **padding**: as above.
- **Gate** to ship:
  - legal 100%, deterministic 100%;
  - quality median at least 0.95, and worst-5% at least 0.8;
  - time within the budget (effort 0: 300 ms slowest 5% on a mid phone; ahead: 1 s);
  - no worse than the shipping Contender on quality at the same time.

A maker's quality against time is its *performance profile*; the effort levels are points on it.

## Tuner

A subagent is given this spec, the Engine, the Referee and Judge, and the Bench command. It writes or changes a Contender, runs the Bench, and reports its scores and what it tried. A Contender that passes the Gate and beats the shipping one replaces it; any better Goals it found go in the Records.

## Tests

- **Contract tests**, shared by every maker: shape, Referee acceptance, determinism, random Requests (property-based). Only what goes in and out; never how a maker decides. Two makers need not agree on a case, even with the same seed.
- **Referee and Judge tests**: hand-made Goals that break each rule, and hand-worked scores.
- **The Bench**: quality and time, run on demand and before shipping a Contender.

## Not goals

The spec does not ask a maker for:

- the solution with the fewest moves (the Auditor measures it; padding costs fitness);
- red near the last target, a near target, no blocks on red's track, no shared track, no overlap: all wishes in the Judge, not rules;
- speed in itself: time is measured by the Bench, not part of the contract.

## To settle

1. The aim: a factor in the fitness (above), or first in a lexicographic order (as now).
2. Choices: counted along the replay in the play area (above), or as now (the boards the measure's search expanded, which depends on the search).
3. The board in the Request: a region as data (above), or the world's seed and density (smaller, but every runtime needs the world generator).
4. What happens when the Referee rejects a Goal in play.
