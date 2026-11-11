# Research and design notes: efficient solving and generation of difficult Rush Hour / Unblock Me puzzles

> **What this is.** A literature-review summary and design proposal written by another AI (ChatGPT) on 2026-11-11, given to us by the user. It is **AI-written and unverified**: not peer reviewed, and some citations and numbers are wrong or overstated. Content is kept as written; only formatting was cleaned (math to `$…$` / `$$…$$`, tables, tracking parameters removed from links). The raw original is `research/raw/notes/research-and-design-notes-2026-11-11.md`.
>
> **Before relying on any claim here, check [`ai-notes-verification.md`](ai-notes-verification.md)**, which checks each cited paper and each proposal against the downloaded papers. Sections 12 (open research questions) and 14 (evidence standards) are kept verbatim.

Compiled: 11 November 2026\
Scope: Fixed-axis sliding vehicles; small finite boards for exact analysis and potentially very large or unbounded boards for scalable search.\
Status: Research synthesis and proposed engineering design. Established results are distinguished from hypotheses to test.

## Executive summary

The central problem has three different kinds of explosion:

1. Geometric: a piece may have a huge or unbounded range of positions (and, if any slide length counts as one move, infinitely many immediate successors).
2. Combinatorial: independent pieces generate a Cartesian product of possible configurations.
3. Temporal: the same effective plan can be expressed by exponentially many permutations of independent moves.

No single optimization solves all three. A promising solver combines event/critical-position abstractions, factored or decoupled search, partial-order reduction (especially strong stubborn sets), goal-dependent blocker reasoning, and A\*/Dijkstra with admissible heuristics. The abstractions must be proved safe for the precise rules and move-cost convention.

Generating interesting puzzles is a distinct problem. An optimal solver measures minimum work, not necessarily human-perceived difficulty. Use exact graph metrics on small boards, causal AND/OR subgoal structure, realistic player-choice models, and eventual human validation. Do not evaluate human difficulty exclusively on the reduced solver graph: removing redundant orderings also removes choices that a human may actually consider.

The best short-term experiment is to build a complete finite-board graph analyzer, then rank candidate puzzles by (1) optimal moves, (2) simulated fallible-player effort, and (3) blocker dependency complexity. Compare disagreements in these rankings against human play.

## 1. Formal model and essential assumptions

A piece $i$ has a fixed orientation, a fixed lane, a length $l_i$, and one variable coordinate $p_i$ along its lane. A board state is

$$s=(p_1,p_2,\ldots,p_n).$$

A legal move changes one $p_i$ while keeping the vehicle on its lane, inside the allowed domain, and never overlapping another piece or crossing it during the move. The puzzle's goal is a predicate $\mathrm{Goal}(s)$, e.g. the target's corridor is clear or the target has reached an exit.

Decide these rules before designing algorithms:

- Cost: one move per arbitrarily long legal slide, versus one move per grid cell moved. The complexity and admissible heuristics differ profoundly.
- Boundary: finite board, one-sided infinite lane, or two-sided infinite lane; whether vehicles may exit.
- Goal: exit corridor cleared, specific coordinate reached, or physically moved out of the board.
- Pieces: fixed layout (same vehicles, orientations and lanes) versus generation that can add/remove/move lanes.
- Interface: does the human choose any integer stopping coordinate or choose event-oriented actions? On an infinite lane there is no uniform distribution over all possible integer destinations.

For the rest of these notes, unless stated otherwise, any unobstructed slide of one piece to a different integer coordinate costs one move. Standard Rush Hour slides are reversible until a piece exits permanently; a one-way exit transition changes reverse-search mechanics.

Define the graph $G=(V,E)$ of legal states and moves. With goal set $W$:

$$d^*(s)=\min_{g\in W}\operatorname{dist}(s,g).$$

For a vehicle $i$ that must move into a position interval $I$, an exact repositioning cost is

$$D_i(s,I)=\min_{t:\,p_i(t)\in I}\operatorname{dist}(s,t),$$

which counts all other vehicles' necessary moves as well. This is an optimal action cost, not automatically a measure of how difficult the repositioning is for a person to discover.

## 2. Independence as geometry, not merely graph pruning

Consider two independent components $A$ and $B$. The joint configuration graph is a Cartesian product:

$$G=G_A\,\square\,G_B.$$

If moves $a$ and $b$ are both enabled and remain legal in either order, and

$$T_b(T_a(s))=T_a(T_b(s)),$$

then they form a commuting diamond. Many paths from one joint state to another differ only by swapping independent adjacent actions. In concurrency theory these orderings belong to the same Mazurkiewicz trace.

Visually, a pair of independent progress coordinates produces a 2-D grid. Fill each commuting square as a 2-cell: now independent permutations are alternative routes across the same geometric patch. Higher-dimensional independent actions produce cubes and higher-dimensional cells. Collisions and synchronization remove or constrain cells; possible holes, bottlenecks and distinct directed-path classes reveal interactions. This connects to directed topology / cubical complexes / geometric partial-order reduction.

Important distinction: a product region can contain many truly distinct joint configurations even after all permutation redundancy is removed. Partial-order reduction (POR) removes redundant traces; factored or decoupled search avoids explicitly materializing the full product of independent local states.

Useful visualization proposal:

1. Board view: real vehicle locations and swept areas.
2. Factorized configuration view: each independent piece or group is an axis; a rectangle/hyperrectangle symbolizes its state product, not thousands of enumerated points.
3. Interaction-frontier view: only the states/conditions where components constrain one another.
4. Dependency/causality view: AND/OR blocker chains and alternative strategies.
5. Solution ribbon: display a partial order of actions rather than an arbitrarily chosen linear sequence; mark steps where the order actually matters.

These views must distinguish physical collisions from planning dependencies, which can exist several moves apart.

## 3. Partial-order reduction for Unblock Me

### 3.1 Move independence

For two different vehicles, a simple sufficient condition for independent moves is that their swept regions do not overlap. More precise state-dependent checking requires:

1. Both moves are enabled at $s$.
2. Each remains enabled after the other.
3. Both execution orders produce the same final state and relevant cost.

Independent currently enabled moves cannot simply be pruned ad hoc: an action that seems irrelevant now may be necessary for a future enabling chain. A sound POR procedure needs a preservation theorem.

### 3.2 Strong stubborn sets (SSS)

Strong stubborn sets are a general optimal-planning POR method. At each search state choose a set of relevant actions subject to conditions involving (a) an action needed by any solution, (b) actions that interfere with enabled members, and (c) necessary enabling actions for disabled members. Expand enabled moves from this closure rather than every action. The exact strong-stubborn-set conditions matter; the sketch below is not a standalone correct implementation:

```
T := a disjunctive action landmark for reaching the goal
repeat:
  for each a in T:
    if enabled(a): add actions that interfere with a
    else:          add a valid necessary enabling set for a
until closure
expand enabled(T)
```

Implement from published definitions or compare against an established implementation (Fast Downward), not just this outline. Different POR variants have different requirements for optimality and soundness, particularly with costs, cycles and dynamically generated operators.

For fixed finite boards, the action set can be enumerated explicitly. With infinite slide destinations, event-based or symbolic actions are needed before SSS closure can even be computed efficiently. SSS is not an infinite-branching solution by itself.

### 3.3 A second reduction: decoupled search

Treat pieces or tightly coupled groups as factors. Let interactions among factors define a center and conditionally independent pieces define leaves. A center state can symbolically represent multiple compatible leaf positions and leaf costs. Search only center choices while propagating leaf reachability. This is the idea behind star-topology decoupled state-space search and later decoupled strong stubborn sets.

Practical note: factors can change relevance over time. Dynamic refactoring may be attractive, but is much more complex than a fixed decomposition. Begin with a conservative fixed grouping and measure the payoff.

## 4. Large or infinite boards: symbolic geometry and event positions

On an infinite unobstructed lane, a single piece has infinitely many legal destinations under the one-slide-cost convention. A finite action generator is required.

### 4.1 Critical-position / interval abstraction

For a fixed arrangement of perpendicular and parallel lanes, occupancy and clearance constraints change at geometric thresholds induced by vehicle endpoints, lane crossings, walls and goal corridors. Partition possible integer coordinates into critical positions and open intervals with consistent local collision relationships.

This suggests representing positions with sets or intervals, rather than enumerating all coordinates.

Caution: two positions with the same immediate blocker set are not necessarily equivalent for future motion, shortest solution length, or availability of stopping points. An exact quotient requires proving transition and goal preservation (e.g. bisimulation or an appropriate cost-preserving simulation). Otherwise use the abstraction merely for candidate generation, lower bounds, or iterative refinement.

### 4.2 Event-based actions

Rather than "move vehicle A to each integer $x$", enumerate meaningful events such as:

- clear a particular crossing or corridor;
- enter/leave the blocking interval of another vehicle;
- align an endpoint to a relevant threshold;
- reach a boundary or target-relevant clearance position.

Whether these events suffice for exact optimality is a theorem to establish for the chosen rules. The generator should retain witness coordinates, and split intervals on discovering a counterexample (counterexample-guided abstraction refinement, CEGAR).

### 4.3 Reachability focus

Only explore a goal-relevant interaction frontier, seeded from the target's required corridor and recursively expanded through blockers of prospective clearance moves. A purely local closure is a useful heuristic but may miss dependencies introduced by choosing one among many clearance strategies; represent AND/OR alternatives and permit refinement.

### 4.4 Search structure

A recommended structure is:

```
exact finite puzzle oracle (small boards)
     |
geometry + legal-move engine
     |
critical-position / interval representation
     |
goal dependency analysis + factorization
     |
partial-order-reduced symbolic successor generation
     |
A* or Dijkstra, with pattern-database/relaxed lower bounds
     |
solution proof or bounded solution + lower-bound certificate
```

The proof obligation extends to combinations of optimizations: each individual optimization being correct does not mean their composition automatically preserves the same semantics.

## 5. Exhaustive small-board analysis: the oracle

For a fixed layout (vehicle set, orientations and lanes), build the reachable configuration graph, ideally using canonical compact integer encodings. Run multi-source reverse BFS from all goal states on reversible moves. If reaching the exit is one-way, use explicit predecessors of each goal/exit condition instead of blindly reversing the exit action.

This yields exact $d^*(s)$ for all solvable configurations and gives a reference against which optimized algorithms can be checked.

For every legal action $a: s\to s'$ with unit cost, classify:

- $d^*(s') = d^*(s)-1$: can begin an optimal solution;
- $d^*(s') = d^*(s)$: neutral relative to shortest remaining length;
- $d^*(s') = d^*(s)+1$: moves one farther from a goal.

For a reversible undirected unit-cost graph, adjacent distances differ by at most one. For a directed transition graph, these three cases need not exhaust possibilities.

If optimal distance is known, restricting to downhill actions is sufficient to construct an optimal solution. It is not a usable prospective pruning rule for an unsolved large instance, because computing the exact distance was the difficult problem in the first place. Nor is it appropriate to prune all the non-downhill actions out of a human-difficulty model; those alternatives may make the puzzle hard.

Symbolic backward analysis with BDDs has previously been applied to hardest Rush Hour configurations. This is a strong precedent for evaluating whole families instead of solving instances one by one.

## 6. What makes a puzzle difficult? Separate at least three quantities

(A) Optimal work: minimum moves or weighted cost $d^*(s)$. (B) Algorithmic search effort: how hard a fixed solver finds/proves the solution. (C) Human-perceived difficulty: probability of success, time, extra moves, backtracks, mental planning depth and confusion.

These need not agree. Long obvious chains can be easy for humans. A short chain requiring a counterintuitive preparatory move may be hard. Large independent-state products can fool naive solvers while being visually easy.

Empirical research on transport puzzles indicates that graph structure matters, but optimal path length is still a strong baseline for Rush Hour in some data sets. Always evaluate whether more sophisticated features actually outperform it.

### 6.1 Optimal-action regret

For unit-cost slides, define

$$R(s,a)=1+d^*(T(s,a))-d^*(s)\ge 0.$$

An optimal action has regret zero. On a completed run from $s_0$ to a goal of total length $L$, regret telescopes:

$$\sum_t R(s_t,a_t)=L-d^*(s_0).$$

This gives an exact decomposition of excess moves into choice-level mistakes. Potential generation metric: high expected regret under a realistically fallible policy, but low optimal path length and manageable backtracking.

### 6.2 Expected human-policy effort

Define a stochastic decision policy $\pi(a\mid s)$ and an expected goal-hitting time:

$$H_\pi(g)=0,\qquad H_\pi(s)=1+\sum_a\pi(a\mid s)\,H_\pi(T(s,a)).$$

For finite state spaces solve the appropriate linear system if goal absorption is almost sure and expected time finite, or estimate with Monte Carlo rollouts and explicit time/move limits. A naive illustrative policy is

$$\pi_\beta(a\mid s)\propto\exp\!\left[-\beta\, d^*(T(s,a))\right].$$

But it is an oracle-informed baseline: humans do not know true $d^*$. Replace it with visual and subgoal features, limited-depth lookahead, persistence, memory and occasional random/undo choices. A uniform policy is also suspect when one piece has many equivalent stopping coordinates.

### 6.3 Decision information / choice uncertainty

For optimal action set $A^*(s)$ and policy $\pi$, define the probability mass assigned to optimal actions:

$$p_*(s)=\sum_{a\in A^*(s)}\pi(a\mid s).$$

A proposed information measure is

$$I(s)=-\log_2 p_*(s).$$

This is an engineering hypothesis inspired by puzzle-entropy work, not a validated universal difficulty measure. Evaluate strategic choices, not arbitrary destinations along the same empty corridor. Consider computing the metric over a solution trajectory, or through the player's belief-state process, rather than summing independently over every visited state.

### 6.4 AND/OR blocker and subgoal complexity

Build backward from the objective:

- AND: every vehicle crossing the exit path must be cleared;
- OR: a blocker can be cleared in different directions/positions;
- recursion: a selected clearance may require moving more vehicles;
- cycles / temporary obstructions: sometimes a prerequisite requires revisiting or reversing an earlier move.

Proposed features:

- minimum and maximum useful dependency depth;
- breadth of plausible OR choices;
- number of distinct essential subgoals/pieces;
- interaction and reuse among subgoals;
- cyclic dependencies and necessary temporary rearrangements;
- number and severity of visually counterintuitive optimal moves;
- cost of changing the dependency structure along a solution.

A subtlety: a plain dependency graph may have cycles that disappear when you pick a different clearance location. Use conditions on subgoals and validate realizability, rather than treating every syntactic cycle as genuine difficulty.

The 2026 human backward-reasoning paper models Rush Hour decisions using AND/OR trees and releases behavioral data and code. This is probably the most valuable source for building a human policy rather than merely an optimal solver.

### 6.5 Visual / perceptual difficulty

Gestalt grouping can make adjacent or parallel pieces appear to be a meaningful unit even when their moves should be planned separately. Thus two layouts with similar solution lengths and even similar graph statistics can feel different. Features for the generator might include misleading visual clusters, decoy corridors and apparent near-solutions. Avoid confusing legitimate challenge with merely poor visual legibility.

### 6.6 Solver expansion metrics (with qualification)

Search-node counts, closed-list size, effective branching, heuristic errors, and plateau structure may correlate with player difficulty. However these values are algorithm-dependent: stronger heuristics, POR, representation changes and tie-breaking can drastically alter them without changing the puzzle. If used as difficulty features, fix a benchmark solver and version its parameters. Compare reduced and full-graph counts explicitly.

## 7. Pruning for optimization versus pruning for player modeling

Maintain two logically distinct successor models:

| Purpose | Correct behavior |
|---|---|
| Optimal solver | May use sound dominance, SSS/POR, equivalent-state compression, admissible heuristics and safe abstractions. |
| Human difficulty model | Must preserve choice probabilities and misleading alternatives or aggregate them with correct probability mass. Cannot simply inherit all solver pruning. |

A counterintuitive move can be optimal even if it increases visual distance to the exit or the current blocker count. Therefore never prune solely on local visible progress unless the property is proved a true monotone invariant.

A search can selectively explore small relevant portions of the original choice graph, while using statistical models for the rest. This is an estimation choice, not a proof of optimality.

## 8. Approximate difficulty from partial search

Use a tiered evaluation process:

1. Static geometry: target corridor occupancy, blocker dependencies, interactions, visual clustering, candidate subgoals.
2. Relaxations and pattern databases: solve smaller projected problems, obtain admissible lower bounds when constraints are only relaxed.
3. Bounded A\*: find a solution with upper bound $U$; maintain valid lower bound $L$ from the frontier if the search implementation supports it.
4. Human-policy rollout: sample bounded trials; estimate success by move limit, expected moves when successful, regret, undo rate, visits to misleading regions. Attach confidence intervals.
5. Exact full state analysis: reserve for finalists and small-board validation.

### Pattern databases (PDBs)

Build projections of tightly interacting vehicles; a projection that removes constraints gives an admissible heuristic $h_{\mathrm{PDB}}(s)\le d^*(s)$. For multiple overlapping patterns, $\max_i h_i$ is safe; summing them without cost partitioning can double-count moves. In Rush Hour, naive removal of one blocker can destroy most of a puzzle's difficulty, so pattern selection matters.

### A\* bounds

With nonnegative costs and an admissible heuristic, an incumbent goal path has cost $U$; a correctly maintained lower bound on unexplored solutions can provide $L$. A candidate can be screened when its bounds are already outside the desired difficulty range. Be explicit about graph-search/reopening/termination assumptions. An early-found solution does not establish a matching lower bound on its own.

### Sampling limitations

A random rollout over a large board can spend almost all its time in irrelevant reversible moves. Model goal-directed action proposals, memory and loop avoidance. Use fixed rollout budgets and report both completion probability and censored time-to-completion, not only average successful-run length (which is selection biased).

For an infinite board, probability measures must be explicitly defined over finite event actions or a normalized coordinate distribution; "uniformly choose a legal destination" is not meaningful.

## 9. Generation approaches

### 9.1 Fixed vehicle layout, variable start positions

Because ordinary legal slides are reversible, sample solved states and search backward to discover solvable start positions. Multi-source reverse search from a goal set is better than arbitrarily fixing one solved coordinate configuration. A vehicle leaving the board may be terminal or one-way, so special-case that action.

On a small finite layout, compute $d^*$ for every reachable state once, then rank all starting positions. Hardest under this exact definition means maximum shortest-path length, not maximum human difficulty.

### 9.2 Variable layouts

Mutate/add/remove vehicles, change lanes, lengths and starting coordinates subject to legality. Each layout may have a different reachable-state graph. Use cheap screening before expensive exact solving.

### 9.3 Search-guided generation

Possible optimizers:

- Beam search / simulated annealing / evolutionary mutation over layouts.
- Monte Carlo Tree Search over level-construction decisions.
- Backward causal construction: specify a difficult AND/OR dependency pattern, then place pieces to realize it geometrically.
- MAP-Elites / quality diversity: maintain good candidates across bins such as dependency depth, solution length, visual deception, interaction count and estimated human effort.

Novelty is necessary to avoid generating hundreds of superficially different versions of the same blocker chain. Deduplicate symmetric, translated and lane-equivalent patterns where applicable.

### 9.4 Candidate objectives

Do not immediately compress all goals into one arbitrary weighted sum. Track a multi-objective vector, e.g.

$$D(P)=\left(d^*,\ H_\pi,\ D_{\mathrm{dep}},\ I_{\mathrm{choice}},\ C_{\mathrm{counter}},\ N_{\mathrm{relevant}},\ \mathrm{novelty}\right).$$

Use hard constraints for solvability and quality (unavoidable dead ends, excessive tedium, ambiguity, visual clarity), then maintain a Pareto frontier or MAP-Elites archive. Human evaluations can later be used to fit calibrated predicted completion rate, solve time and excess moves.

### 9.5 Cluster-level exploration

A 2026 Safari Rush Hour study groups structurally similar layouts/configurations using compact representations and explores families via search/retrograde methods. Such clusters are excellent units for generation search, but are not automatically exact equivalence classes of graph states. Do not conflate cluster-based organization with cost-preserving symbolic abstraction.

## 10. Integrated system design

```
  [Puzzle grammar / candidate layout generator]
                    |
          [Geometry + state codec]
                    |
       +------------+-------------+
       |                          |
 [Exact small-board oracle]  [Scalable solver]
  full graph / reverse BFS      |
  exact d*, regret          critical positions / intervals
       |                   interaction dependencies
       |                   factoring / decoupling
       |                   POR / strong stubborn sets
       |                   admissible heuristic + A*
       |                          |
       +----------+---------------+
                  |
          [Verified solution]
                  |
       +----------+-----------------+
       |                            |
 [Difficulty features]      [Human policy simulator]
 dependency, topology,      decision/undo/rollout model
 visual grouping, cost             |
       +-------------+--------------+
                     |
            [Level evaluator]
           bounds + uncertainty
                     |
          [Pareto / MAP-Elites archive]
                     |
           [Human playtesting]
                     |
        [Calibrated difficulty model]
```

Data to save per candidate: ruleset/cost model/version, layout hash and state, exact or bounded optimal cost, solution and its proof status, dependency features, raw-graph and optimized-search metrics with solver versions, rollout statistics and confidence intervals, visual features, generation seed, and (when available) anonymized human outcomes.

## 11. Concrete experimental plan

### Phase 1 — exact reference (small finite boards)

- Enumerate all legal states per fixed layout; canonicalize and deduplicate.
- Reverse BFS over the actual goal set; keep exact distances and optimal-action masks.
- Record action-level regret, degree, distance plateaus, number of optimal successors, and short-path multiplicity.
- Compare brute-force search, goal-blocker heuristics, A\* and SSS to verify cost and reachability.
- Create graph visualizations of commuting diamonds and interaction bottlenecks.

Milestone: for every generated small puzzle, know the true cost and every optimal first move.

### Phase 2 — difficulty models

- Build conditional AND/OR clearance trees with alternative stopping intervals and feasibility checks.
- Implement basic random/optimal-mixture, visual hill-climber, and bounded backward-reasoning policies.
- Monte Carlo sample each policy, measuring completion probability by budget, excess moves and revisits.
- Rank by shortest length, dependency complexity and simulated difficulty; study puzzles where rankings disagree.
- Compare predictions to recorded play or a small controlled user study.

Milestone: at least one model demonstrably predicts human effort better than optimal length alone, or a negative result showing that it does not.

### Phase 3 — generation

- Backward-sample start states within layouts.
- Mutate layouts and filter invalid/uninteresting configurations cheaply.
- Maintain quality-diversity bins, not only global maximum solution length.
- Use expensive evaluation adaptively for candidates with high potential and uncertain scores.

Milestone: a diverse library of validated puzzles, with explicit difficulty provenance.

### Phase 4 — scaling

- Introduce event/critical-position actions and symbolic intervals.
- Prove or refute exactness for the game rules with counterexample search on finite boards.
- Add factoring/decoupling and SSS, cross-checking small-board exact results.
- Add PDB/relaxed lower bounds, bounded A\*, and profiler instrumentation.
- Preserve a distinct player-action model when the exact solver prunes actions.

Milestone: meaningful solver scalability gains without silently changing optimal costs or difficulty semantics.

## 12. Open research questions worth testing

1. What is the right quotient of continuous/unbounded slide positions? Can a finite set of event coordinates preserve optimal number of slides under clear geometric assumptions? If not, what is the smallest sound abstraction plus refinement scheme?
2. How to represent conditional independence? Pieces may be independent for most states and coupled only near a crossing. Can a region-based factorization avoid reconstructing the full state product?
3. Does dependency complexity predict human effort beyond solution length? Test after controlling for the number of vehicles and visual clutter.
4. Can we generate a desired causal plan first, then realize it in geometry? This could outperform random-layout search for rare complex dependency structures.
5. What does a human consider a single choice? A move to any of 100 empty coordinates is physically 100 actions but may be psychologically one strategic 'move aside'. Need a hierarchical, goal-oriented action vocabulary.
6. Does a POR-canonical solution erase difficulty signals? Measure differences between search over complete actions and search over causally meaningful actions.
7. Can difficult puzzles be summarized by a small interaction skeleton? A graph of synchronization events may capture both solvability and human planning demands across large open spaces.
8. Can behavioral-policy parameters adapt per player? This could let the same generator target beginners versus expert players with empirically calibrated challenge.

## 13. Annotated bibliography and resources

(Local copies: see `research/raw/FINDS.md`; cleaned text in `research/cleaned/<slug>/`. Corrections to these entries are in the verification file.)

### A. Rush Hour difficulty, human cognition and generation

1. P. Jarušek & R. Pelánek (2011), *What Determines Difficulty of Transport Puzzles?* Empirical comparison across Rush Hour, Sokoban and Replacement puzzles; graph structure and simulated human traversal. [Paper PDF](https://www.fi.muni.cz/~xpelanek/publications/flairs-transport.pdf) · [Institutional entry](https://www.muni.cz/en/research/publications/941424).
2. J. Olieslagers, Z. Bnaya, D. X. Lin & W. J. Ma (2026), *A Computational Model of Backward Reasoning in Human Problem Solving.* AND/OR subgoal trees, Rush Hour participant choices and a fitted cognitive model. [Journal/DOI](https://doi.org/10.1007/s42113-026-00335-2) · [GitHub code](https://github.com/WeiJiMaLab/rush_hour) · [OSF data](https://osf.io/23vrb).
3. S. Bennati et al. (2014), *Gestalt Effects in Planning: Rush-Hour as an Example.* Perceptual grouping and its influence on optimality. [Open-access paper](https://escholarship.org/uc/item/8458c8hj).
4. *Procedural Generation of Rush Hour Levels* (CG 2022 / 2023 proceedings). Rush Hour solver, heuristic blocker closure, and classifiers for solvability/difficulty categories. [PDF](https://www.lamsade.dauphine.fr/~cazenave/papers/RushHour.pdf).
5. *Using Effective State Representations and Search to Identify Interesting Safari Rush Hour Puzzle Instances* (2026). Cluster-level representation, retrograde/search-based evaluation and search for interesting layouts. [Research page/preprint](https://www.researchgate.net/publication/409974653_Using_Effective_State_Representations_and_Search_to_Identify_Interesting_Safari_Rush_Hour_Puzzle_Instances). Check final publication metadata and version before relying on exact statistics.
6. *Modeling Puzzle Difficulty via A\* Search Behavior, Solution Paths, and Spatial Metrics* (2026). Explores search and structural predictors across puzzle families including Safari Rush Hour. [Preprint listing](https://www.researchgate.net/publication/408441841_Modeling_Puzzle_Difficulty_via_A_Search_Behavior_Solution_Paths_and_Spatial_Metrics). Treat correlations as dataset-specific.
7. *GP-rush: Using Genetic Programming to Evolve Solvers for the Rush Hour Puzzle* (2009). Evolved heuristic functions for IDA\* and limitations of weak Rush Hour relaxations. [Research listing](https://www.researchgate.net/publication/220741440_GP-rush_Using_genetic_programming_to_evolve_solvers_for_the_rush_hour_puzzle).
8. Collette, Raskin & Servais (2006), *On the Symbolic Computation of the Hardest Configurations of the Rush Hour Game.* BDD-style symbolic exploration and extremal solution-length computation. [Article](https://www.sciencedirect.com/science/article/pii/S0304397506002376) (verify bibliographic identifier before publication use).

### B. State-space reduction, concurrency and automated planning

9. Goubault, Heindel & Mimram (2013), *A Geometric View of Partial Order Reduction.* Directed geometric/cubical interpretation of independent transitions. [Search by title](https://scholar.google.com/scholar?q=A+Geometric+View+of+Partial+Order+Reduction).
10. *Star-topology Decoupled State Space Search* (Gnad & Hoffmann, 2018). Separate center and independent leaf factors. [Journal listing](https://www.sciencedirect.com/science/article/pii/S000437021730173X).
11. *Decoupled Strong Stubborn Sets* (Gnad, Wehrle & Hoffmann, 2016). Combines decoupling and POR. [IJCAI paper](https://www.ijcai.org/proceedings/2016/441).
12. Fast Downward — Pruning Methods. Practical implementation options for stubborn sets and related methods. [Documentation](https://www.fast-downward.org/26.6/documentation/search/PruningMethod/).
13. ProB — State-space visualization examples. Shows graph visualization and POR reductions, including concurrency examples. [Examples](https://prob.uni-duesseldorf.de/w/index.php/State_space_visualization_examples).
14. *Sokoban: Improving the Search with Relevance Cuts* (Junghanns & Schaeffer, 2001). Domain-dependent cuts to exclude irrelevant ordering/region choices. [Article](https://www.sciencedirect.com/science/article/pii/S0304397500000803).
15. Mazurkiewicz traces / partial-order semantics. Formal foundation for treating reorderings of independent events as equivalent. [Reference search](https://scholar.google.com/scholar?q=Mazurkiewicz+traces+partial+order+reduction).
16. Pattern database heuristics. Admissible solutions to projected search problems; use goal-relevant interacting subsets and cost partitioning. [Reference search](https://scholar.google.com/scholar?q=pattern+databases+heuristic+search+cost+partitioning).
17. Counterexample-guided abstraction refinement (CEGAR). Useful conceptual framework for splitting overcoarse critical-position intervals. [Reference search](https://scholar.google.com/scholar?q=counterexample+guided+abstraction+refinement+model+checking).

### C. Procedural generation and difficulty estimation

18. Bento, Pereira & Lelis (2019), *Procedural Generation of Initial States of Sokoban.* Backward state generation, hardness/novelty, and search. [IJCAI paper](https://www.ijcai.org/proceedings/2019/646).
19. Kartal, Sohre & Guy (2016), *Data-Driven Sokoban Puzzle Generation with Monte Carlo Tree Search.* Search-guided generation and human-calibrated features. [AIIDE article](https://ojs.aaai.org/index.php/AIIDE/article/view/12859) · [Independent example implementation](https://github.com/lkseg/sokoban-level-generator-mcts).
20. Sturtevant (2013), *An Argument for Large-Scale Breadth-First Search for Game Design and Content Generation via a Case Study of Fling.* Reverse/exhaustive search as a tool for game design. [Research listing](https://scholar.google.com/scholar?q=An+Argument+for+Large-Scale+Breadth-First+Search+for+Game+Design+Fling).
21. Dart & Nelson (2012), *Smart Terrain Causality Chains for Adventure-Game Puzzle Generation.* Generate causal prerequisite chains, potentially transferable to vehicle blockers. [Research listing](https://scholar.google.com/scholar?q=Smart+Terrain+Causality+Chains+Adventure+Game+Puzzle+Generation).
22. *Entropy as a Measure of Puzzle Difficulty* (2023). Information-theoretic puzzle difficulty. [AIIDE paper](https://ojs.aaai.org/index.php/AIIDE/article/view/27499).
23. *Generalized Entropy and Solution Information for Measuring Puzzle Difficulty* (2024). Extends solution-information measurement with player/model assumptions. [AIIDE paper](https://ojs.aaai.org/index.php/AIIDE/article/view/31872).
24. *Using Search Algorithm Statistics for Assessing Maze and Puzzle Difficulty* (2025). Search-effort measures as proxies for human effort in mazes and Sokoban. [Journal article](https://www.sciencedirect.com/science/article/pii/S1875952125000059).
25. Alvarez et al. (2019), *Empowering Quality Diversity in Dungeon Design with Interactive Constrained MAP-Elites.* Maintain diverse good generated levels instead of a single maximum. [IEEE article](https://ieeexplore.ieee.org/document/8848022).

### D. Suggested reading order

For solver correctness and scaling: 11 → 12 → 10 → 9 → 13 → 8.\
For human difficulty modeling: 2 → 1 → 3 → 6 → 22/23.\
For generating levels: 4 → 5 → 18 → 19 → 25 → 21.

## 14. Evidence standards and caveats

- Established: shortest-path distances on a finite exact graph, conditional action commutativity, exact regret identity, standard admissible-heuristic search, and results proved under published POR conditions.
- Established with domain restrictions: symbolic backward exploration, decoupled planning, pattern databases, and strong stubborn sets. They do not automatically apply to an infinite action domain without a suitable representation and sound mapping.
- Empirical, dataset-dependent: correlations of human difficulty with shortest paths, branching or solver expansions; cognitive-model fit; visual grouping effects.
- Our proposals, requiring validation: event-coordinate sufficiency for an unbounded board, dynamic interaction-frontier factorization, dependency-complexity score, decision-information measure for vehicle clearance choices, and causal-plan-first generation.
- Terminology: 'hardest' in an exhaustive Rush Hour study usually means maximum optimal solution length under a specified board/rule family, not hardest for humans.
- Source caution: some 2026 links above point to preprints or listings. Use the published versions and original experiments to check precise reported numerical claims before citing them in a formal paper.

## Closing recommendation

Use a finite exact graph analyzer as an oracle, a causal AND/OR player model as the first human-difficulty hypothesis, and quality-diversity backward generation as the candidate engine. Only after the exact model and difficulty experiments work should you add critical-position abstraction, decoupled factors and strong stubborn sets for the unbounded case. Keep a full-choice player model separate from the pruned optimal solver. This separation is the most important architectural invariant.
