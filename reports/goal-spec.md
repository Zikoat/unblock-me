# Goal spec (draft)

Date: 2026-11-08

What a goal is, how one is judged, and how goal makers compete, without saying how a goal is made. The drawn version, with examples, is [Goal spec, drawn](goal-spec-visual.html). A draft for discussion: nothing here is built yet, and where it differs from today's code (src/goal-search.ts) the spec wins.

## The idea

A goal maker is a black box. What it must return is fixed by a **contract**; whether its answer is legal is decided by the **Referee** (yes or no); how good it is, by the **Judge** (a number). Both are small, readable and the same for every maker, so a maker can be rewritten, tuned or ported and judged the same way. Making a better maker is then an optimisation problem: a subagent writes one, runs the **Bench**, and keeps it if it passes the **Gate**.

The output is its own proof (a *certifying algorithm*): the moves show the goal can be done, and checking them is far cheaper than finding them.

## The subsystems

| Name | What it is | Where it runs |
|---|---|---|
| **World** | The board's definition: blocks from a seed and density (the generator, versioned), plus the blocks the player has moved. Any cell can be asked for. | everywhere |
| **Engine** | The TypeScript implementation of the World: who is on a cell, legal slides, replaying moves. | everywhere |
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

The Referee and Judge exist once, in TypeScript, on the Engine; a Contender in another language is checked by them, not by a copy.

## Request

Everything a maker may look at; nothing else (no clock, no global state).

- **world**: the seed, the density and the generator's version. Every cell of the endless board follows from them.
- **moved**: the blocks the player has moved, and where they are now, indexed by chunk (4×4 cells) so that finding who is on a cell stays fast however long the session. It can hold hundreds of blocks; passing it should not copy them (a shared, read-only index).
- **history**: earlier goals, oldest first, each its red block and target. The last one's red block, standing on its target, is where the player is.
- **aim**: the fewest moves wanted (the ramp), or none.
- **wishes**: the Judge's weights (below), so they can be tuned without changing makers.
- **seed**: for any choice a maker wants to make at random.

A maker may look at any cell, near or far. It may use the Engine, or rebuild the World its own way (faster, or in another language), as long as it gives the same board.

There is no effort level. A maker manages its own work within the Gate's time budget, never reading the time (so it stays deterministic). When there is time to spare, as for a goal made ahead, the game may ask with several seeds and keep the fittest by the Judge.

## Goal

- **red**: the id of the block to move. Where it starts is where the board has it.
- **target**: where it has to get to (its top-left cell).
- **moves**: the solution, each `{ block, from, to }`.

A maker may also answer **none** (found nothing); the Bench counts that as a loss.

## Referee: the hard rules

A Goal is legal only if all of these hold:

1. **Red is real.** A sliding block with that id exists.
2. **Every move is a slide.** Its block is at `from`, `to` is on the block's own axis and not `from`, and every cell it sweeps through is empty when it moves.
3. **It ends on the target.** After replaying every move, red is on `target`, and `target` is not where red started.
4. **It is tidy.** No two moves in a row of one block (they are one slide), and no single move can be dropped with the rest still solving it. A cheap guard against padding; it does not prove the solution is the shortest.
5. **It is bounded.** At most 100 moves.
6. **It is deterministic.** The same Request gives the same Goal (the Bench asks twice).

In play the Referee is an assertion: a rejected Goal is a bug, so it is logged (with its Request, to replay) and the maker is asked again with the next seed. It should almost never happen; a simulator playing many sessions would catch these cases before players do.

## Judge: the soft wishes

Measured from the Request and the Goal alone, never from how the maker found it:

| Term | Meaning |
|---|---|
| **fewest moves** | the Goal's move count (we trust the maker to look for the shortest; the Auditor checks) |
| **decisions** | the forks a person meets working out the solution (below) |
| **distance** | cells red travels from start to target |
| **track blocks** | blocks lying the same way in red's lane between start and target: pushed ahead of it, tedious rather than hard |
| **reach** | cells from the last red block (where the player is) to the new one |
| **clashes** | earlier targets the target overlaps, and earlier red blocks whose track red shares |

```
difficulty = fewest moves + 2 × decisions
balance    = difficulty / distance^0.6 × ½^track blocks
fitness    = balance × ½^|fewest moves − aim| × 0.8^(reach beyond 4) × ½^clashes
```

Every number is a weight in `wishes`; none is a rule. Today's hard rules (red within the 8×8 box round the last target, no shared track, no overlapping target) become the reach and clash factors, so a far better goal can still win. The weight of a decision (2 moves) is a placeholder: it is fitted to play data, so that the extra moves players need rise with it.

### Decisions

How a person works a goal out: try to move red towards the target; whatever is in the way has to move first; and so on, back from the target. A **decision** is a block in that chain that could plausibly go either way.

1. **Stages.** Replay the solution. Before each of red's moves (at the start, and after each red move that leaves it short of the target), look at the cells between red and its target. Each block there has to be cleared.
2. **Clearing a block** from some cells: it can go either way along its axis, by the least that frees the cells. A way is **out** if it runs into the edge or a wall, or into a block already in this chain (a cycle: red itself, or a block waiting on this one). Otherwise it is **plausible**, and the blocks it would sweep into must be cleared in turn, from the cells it sweeps.
3. **A decision** is a block with two plausible ways. Both are explored, and a way that dead-ends further on still counts: a person has to try it to find out.
4. **decisions** is how many blocks are decisions, each counted once a stage however many branches meet it, summed over the stages. (Explored at most 6 blocks deep and 300 blocks in all.)

`Rr..gg` (red, then the target) has none. A blocker that can only go one way adds none, however long the chain behind it. A blocker free both ways adds one.

## Auditor: keeping the Judge honest

The Judge takes the move count on trust, so a maker could pad a solution to look harder. On the Bench, the Auditor searches each Goal for a shorter solution, with a large budget. The Bench scores each Goal with the audited count and reports **padding**: how often, and by how much, a maker's count was beaten. It never runs in play.

## Bench, Records and the Gate

- **Cases**: a few hundred fixed Requests across densities, ramp stages (aims 4 to 10, and none), long sessions (many moved blocks) and the island's edge.
- **Records**: per case, the best audited fitness any maker has found, from the Reference with many seeds, and from every Contender ever run.
- **Scores** for a maker:
  - **legal**: share of Goals the Referee accepts;
  - **quality**: its fitness over the record, at the median and the worst 5%;
  - **time**: per Goal at the median and the slowest 5%, per runtime;
  - **padding**: as above.
- **Gate** to ship:
  - legal 100%, deterministic 100%;
  - quality median at least 0.95, and worst-5% at least 0.8;
  - time: slowest 5% within 300 ms on a mid phone;
  - no worse than the shipping Contender on quality.

A maker's quality against time is its *performance profile*; asking with more seeds moves along it.

## Tuner

A subagent is given this spec, the Engine, the Referee and Judge, and the Bench command. It writes or changes a Contender, runs the Bench, and reports its scores and what it tried. A Contender that passes the Gate and beats the shipping one replaces it; any better Goals it found go in the Records.

## Tests

- **Contract tests**, shared by every maker: shape, Referee acceptance, determinism, random Requests (property-based). Only what goes in and out; never how a maker decides. Two makers need not agree on a case, even with the same seed.
- **Referee and Judge tests**: hand-made Goals that break each rule, and hand-worked scores (the decision examples among them).
- **The Bench**: quality and time, run on demand and before shipping a Contender.

## Not goals

The spec does not ask a maker for:

- the solution with the fewest moves (the Auditor measures it; padding costs fitness);
- red near the last red block, a near target, no blocks on red's track, no shared track, no overlap: all wishes in the Judge, not rules;
- speed in itself: time is measured by the Bench, not part of the contract.

## To settle

1. The aim: a factor in the fitness (above), or first in a lexicographic order (as now).
