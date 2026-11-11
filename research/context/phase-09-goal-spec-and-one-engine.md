# Phase 9: goal spec, one-engine architecture, spec phase 1 (Nov 6 15:00 – Nov 8)

The user reframes goal generation as an optimisation problem with a fixed verifier and a free algorithm. Two spec reports and an architecture report come out of it; an Opus subagent builds spec phase 1 (Referee, Judge, Bench, Records, Reference); "decisions" are redefined to follow how a person solves; the medal bug from a narrow search window is fixed.

Messages are quoted verbatim (only secrets redacted). "X" numbers index every human message across all sessions in time order; gaps are messages left out as unrelated. Times are UTC. Commits are matched to the latest human message before them, so attribution is approximate when work overlapped.


## 2026-11-06 15:06 · 1e4aef56 · X347

**X347 · 15:06**

> ok, so just walk with me in chat through a small journey here. my thoughts aren't quite clear yet. suppose that you would want to only describe the solution by the way it looks at the end, not based on the algorithm, "the way it looks" is defined by a formula which calculates the score of a solution which the algorithm returns. this is sort of a verifier. when the algorithm returns a solution then we have a way of scoring how good it is. we also have a reference algorithm, which can create multiple solutions, and try to find a better solution. we also have some variables, which say what we want from the algorithm (current ramp, variables passed to the verifier to calculate balance, the world and an interface to calculate the positions of blocks in the world, maybe a seed, etc).
> we want the algorithm to be deterministic, so it returns the same given the same input, but if it needs to select a random one then we can pass in a seed.
> we also want the algorithm to be fast.
> in addition, the final solution has a lot of properties, and it should return the correct shape. a start red block location, end block location, and a solution which consists of multiple moves.
> this output has specific properties: the start block should exist at that location in the world. every time we want to move a block, that block's start position should actually contain that block, when we move the block, that block should not be obstructed, and further movements should not be obstructed by a previously moved block, basically no invalid moves. after all of the moves have been replayed, then the red starting block should be at the goal.
> now we need to also explicitly list its non-goals. the solution does not have to be the solution with the least amount of moves. the starting block does not have to be close to the previous goal. the goal does not have to be close to the starting block. it is allowed to have blocks on the same track as the previous goal. the algorithm also doesnt have to be fast. also, there are a few other things which should probably be down-prioritized, such as not putting a goal on another goal, and not share the same track for multiple goals, but that can be deferred. the reason that these are non-goals, is because these statistics and shapes of the algorithm's output are instead prioritized by the "verifier" which is the function which ranks the solution.
> the verifier is a white box, we can see its implementation, how the board storage is implemented etc, but we dont prescribe the algorithm. that allows us to have the algorithm as a "free variable" and an intelligent agent can try to optimize the algorithm, with regards to the verifiers score. so this ends up being an optimization issue.
> the problem is that we are trying to optimize multiple values. in the future we might want to also edit the algorithm to have more features (immovable blocks, the solution should end at a location, other block types not yet thought of), but the basic gist of the solution should be the above. 
> note that this algorithm should have a clear contract such that it in the future can either be replayed in the browser, or in a database procedure or on the backend, or implemented in a different programming language. the exact way in which we call it is not really set, but we need an "api" loosely talking, which is strictly defined, and then when we implement it somewhere then we can create an adapter for the api for the specific language / runtime. maybe we can use rust or lean, or just have the agent choose.
> the main question i have here is if you can help me organize my thoughts a bit here, and find the essence of what my question actually is?
> considering we have multiple free variables, the solution lies on a pareto frontier, but it is not even a pareto frontier because we want the solution to be fast. we also have a "reference algorithm" and when the reference algorithm is run, then it should maybe only in x percent of cases return a better version, so the "score" of the solution run by the algorithm should exceed the score of the reference solution in x percent of cases. or is there a better way to phrase this? or to implement this? the current way we do things is that we "tune" the algorithm and say if we run the algorithm for longer (maybe 8x more steps) then it should only find a better solution in 5 percent of cases, but that solution can't really be used directly here because we can't depend ONLY on the "black box algorithm" to detect if a better solution exists. 
> another idea is that we can have an effort parameter, or maybe just run the algorithm multiple times with different seeds (but the same map and starting location), and then we can run it more to see if it comes up with a better solution than the reference implementation, and then see in how many cases the reference solution is better. dont really know what that should be used for.
> anyways, a lot of the thoughts here are only used for tuning during development, and testing that the implementation is correct when we are testing it, but when it is run during production or on users devices, we can still enable checks and assertions, but the expensive checks (calculating multiple times etc) should NOT be run during production. at that point, we trust the system, and we can run the optimized and balanced / tuned algorithm, such that we can serve many users and many requests and create many goals at the same time, and that the user's power is not used and that it doesnt create lag on their phones / computers.
> next, for maintainability. we now have both a reference implementation and a blackbox implementation, which needs to work correctly against a still evolving contract, property checks, random testing, assertions, and new features. something we can do, is to have a clean implementation in the reference implementation, which then gets continually updated as we implement new features. then when we have done multiple changes, we can run a check against the blackbox implementation, to see wether it still adheres to the rules, and that its output gets an equal (over multiple samples) or better score, and that it is more performant. we can then optimize it now, and we can also do an optimization run later. we could also have a shared unit test suite which runs against both implementations to check their outwards facing contract, but then we need to be careful to not test the internal implementation and decision-making of the algorithm. note also, that 1 seed for the reference and the blackbox does not have to return the same output (non-property).
> how can we balance all of these requirements? still, what is the question? can you organize this? can you search a bit on the web for research towards this, but still keep it simple and understandable for my poor brain? you dont need a report for this. considering that i am asking for a "contract" for this algorithm, could you maybe instead of giving me a code-contract, maybe visualize how this contract should look? and the contract together with the verifier?

**Agent:** organised the thoughts: split "what a good goal is" (checker = hard rules, scorer = soft wishes) from "how to find one" (the free algorithm); the real question is judging algorithms against each other with several objectives plus speed and no ground truth; drew the contract and verifier as an ASCII picture. No report.


## 2026-11-06 15:36 · 1e4aef56 · X348–X349

**X348 · 15:36**

> >expensive
> the scorer is not expensive. we assume that the algorithm tries to find the shortest solution to the goal.
> well, okay, if we try to find a better solution then it will be expensive, but all of the other items are not expensive to compute.
> >checker is the piece every runtime needs, and it’s small (replay the moves), so port it everywhere
> it might need the board engine tho, also, we dont need to necessarily port it everywhere, we can check a rust solution with the same ts checker everywhere. atleast when developing. okay i see now, if the checker is on in production, then we need it running there, but if it is fast then we can simply use the ts checker on the rust solution, as the checker does way less work than the algorithm. that way we dont need to keep maintaining multiple checkers.
> note that "alphaevolve" and "optimization problem" is the correct direction, but we can simplify this to "let a fable subagent try to create a better implementation, and have it benchmark it", dont need an advanced system, we have subagents.
> could you maybe create 2 things: 1 spec in english, and then another spec visualized. after we have talked through it then you can codify it at the same time as you create the benchmark and the table against the reference, and adjust the reference to match the agreed spec. we might want to do large changes compared between the spec and the current reference, so dont take the reference as a starting point, find where it can be simpler, and the things in this chat and the articles, concepts and research can be used to make this system better.
> also, could you name the various subsystems we are about to build? dont start with the coded spec, benchmark and table just yet, we need to do the visual and english spec first.

**X349 · 15:36** (sent while the agent was still working)

> the visual spec should be a report and may include an example.

**Agent:** named the parts (Engine, Contract, Referee, Judge, Auditor, Reference, Contenders, Bench, Records, Gate, Tuner) and wrote `reports/goal-spec.html` (English) and `reports/goal-spec-visual.html` (drawn with an example).

**Commits:** `9ec14e8` Reports: the goal spec draft, in words and drawn with a worked example

**Reports linked:** reports/goal-spec.html, reports/goal-spec-visual.html


## 2026-11-07 23:57 · 1e4aef56 · X350

**X350 · 23:57**

> Request board should be seed and stored moves. The algorithm should be able to access any tile, not just the closest ones, bit the algorithm may choose to recreate the board logic such that it is faster. The slowest part may be passing existing moves, so we may have to have a fast data structure to access the ones which the algorithm needs. The map seems nonsensical, I don't understand it. Is effort necessary? Could this not be something the algorithm can manage itself? Isn't red and start the same thing in goal? Notes should not be part of the contract. Shouldn't the last target be on a block?
> Hmm, the choices seems to be calculated incorrectly. It seems as of my knowledge to be calculated as such: in the x*y view of the board, how many blocks can be moved? However this is incorrect and does not match how a human decides choices. Consider this board:
> Rr..gg
> R red block, g goal, . Empty, b block horizontal, d block vertical. Here the human algorithm picks r, attempts to move it to g, therefore there are 0 choices. 
> Let's check this: 
> .dbbd...
> .dd.d..
> Rrd..gg
> ..bb...
> Human picks r, tries to move towards goal, blocked by d. D is blocked by 2 different B's so choice moves from 0 to 1. We try the upper path, b is blocked by 2 D's, choice bumps to 3, try left, blocked by r, r is blocked by d again. This is a cycle so we stop it here and terminate the choice. Then we go to the right branch of the upper b, go to d, which is blocked by nothing. So this one terminates too. Next we go to the bottom B's, which are not blocked either, but we cannot actually move the d block so far away that it removes the obstruction from r, so it gets terminated too. Now we try to move the red block a step further with no obstructions, so we are in the helps state.
> .ddbb...
> .dd.d..
> ..Rrd.gg
> ..bb...
> We try to move red closer again, d is in the way, moving down is not an option, so we need to move b, which is either 1 step left or 2 right, which increases choices by 1. Let's try left, it depends on, which can be moved back, at Wich point that branch terminates. Next we try the top moving right, such works so that branch gets terminated and chosen because it is shorter. After that we can move red with no choices. Does this make sense? My example is not complete it necessarily correct, but intuitively it feels like the choices judge variable is ready too high. Can you adjust the verifier choice algorithm? Changes here should still work together, but the difficulty maybe needs balancing?

**Agent:** Spec updated: Request = world seed/density/version + moved blocks (chunk-indexed) + history + seed; effort dropped; Goal = red, target, moves; last target is the previous goal's block; choices replaced by "decisions" (forks in the clearing chain) following the user's examples.

**Commits:** `16f64e0` Goal spec: the world as seed and moved blocks, no effort or notes, red without start, and decisions (forks in …

**Reports linked:** reports/goal-spec.html, reports/goal-spec-visual.html


## 2026-11-08 10:37 · 1e4aef56 · X351

**X351 · 10:37**

> Short:why was previously last target not on a block?

**Agent:** Explained: in the game the previous target is always under the previous red block; the spec copied a cell, and the example used a made-up point.


## 2026-11-08 10:46 · 1e4aef56 · X352–X353

**X352 · 10:46**

> 1r 2r 3 I don't know what aim is 4 this should very rarely happen, you can add assertions for this and if we in the future have a simulator most of these cases will get caught and fixed.

**X353 · 10:50**

> 1. I just didn't recognize the name, maybe call it ramp aim

**Agent:** Decision weight to be fitted to play data; dead ends count; a rejected goal is a logged bug and the maker is asked again; "aim" renamed "ramp aim", a factor halving fitness per move off.

**Commits:** `ddf34ec` Goal spec: decision weight fitted to play, dead ends count, a rejected goal is a logged bug; `51571b5` Goal spec: "ramp aim", a factor in the fitness; nothing left to settle


## 2026-11-08 11:22 · 1e4aef56 · X354

**X354 · 11:22**

> Okay, so for the future, how can we massively simplify this system? When all features are implemented, i see the system implemented line this: backend and frontend have the same "board engine" which shares: level generation, board storage, moving engine (when interaction then change board storage), logic for given player location and viewport, which blocks are relevant to them and send them to render for display. We will then also have multiplayer, which includes multiple players, multiple locations, subscribing to updates in the board, handling interactions of multiple players, offline handling and the previously mentioned starter island merging and offline to online transfer logic, and includes all future gane specific features. There will be 2 different users of this engine, when offline, it will run on the users browser, compiled from rust to webassembly, and stored in indexeddb. Interactions come from human interactions with the rendered game and go directly to the offline store. When the game is online, the interactions go directly to the server, where a spacetimedb procedure calculates the next board state and the server also handles goal(level) generation. Spacetimedb then handles user subscriptions so changes go to all players, and also has some more multiplayer features like chat, seeing other players location etc. the frontend client will also use techniques to replay locally the current users interactions so the game continues to feel responsive during lag spikes. the high level goal of this architecture is:
>  to reuse a single engine code for offline and online play. Have the database data close to the server logic. Use the same language for the board storage, referee, level maker, benchmark harness, judge, auditor, and we may even remove the referee, judge and auditor and instead move them to assertions in the code and a set of unit tests for the engine. We could also hardcode the values of the wishes such that we can optimize for the current set of wishes and not all wishes. We also do not create multiple engines. This would also remove the current contract, such that we can optimize the system across the whole engine, not just the goal generation stage. The reason we have a strict contract right now is because we might during development have multiple languages talking to each other, and the goal generation is currently the slowest part, so we need to independently optimize the level maker, and need judges and referees so we can hill climb the solution, but after the maker is in a local minima, then we need to look at larger parts of tye system. The reason we don't do this" everything in a single engine" architecture right now is because we are still adding multiple new features to the game, and they would be difficult to add with the correct architecture. 
> Those were the goals. What I need you to do is create this new architecture document and plan. Can you create a new report? Be sure to mention most things I have said here in the report, and create it with visuals to explain, and note any contradictions to the previous report and how they should be solved. I will review it. Research a bit on the various technologies I have mentioned.

**Agent:** `reports/one-engine.html`: end-state architecture (one Rust engine compiled to WASM for offline + SpacetimeDB server online, prediction, subscriptions), the user's aims, why not now, contradictions with the goal spec.

**Commits:** `cfb2647` Report: one engine, the end-state architecture and the plan to get there

**Reports linked:** reports/one-engine.html


## 2026-11-08 11:28 · 1e4aef56 · X355–X356

**X355 · 11:28**

> Have you seen the previous work on island merging? Explain it in short to show understanding

**X356 · 11:29**

> Spacetimenlocnese is not a catch.  A starter island does not need to be rectangular.
> Do 1.

**Agent:** had not read the island-merging design; summarised it from TODO and updated the report (stamp any shape, offline island, outbox).

**Commits:** `bb3a67e` One engine report: the home island stamped beside the world (any shape), offline island and outbox from the TO…; `da6dfa2` TODO: a stamped home island can be any shape

**Reports linked:** reports/one-engine.html


## 2026-11-08 12:38 · 1e4aef56 · X357

**X357 · 12:38**

> Final architecture: Note that we have some testing code which is not shipped, which includes the benchmarks, test suite, and also the stored "record fewest moves" per goal to compare against. Innebar that they should be in the same language not shipped together. 
> >Rebuild confirmed board. 
> The player who did an action should receive the new board state from the server in the same way that other players receive updates, through subscriptions.
> >Offline: finish the goal.
> Note that when moving from the online world to the online world and back is the only time when the player has a visible jump. They either move a large distance or it somehow fades. Can you maybe suggest a few solutions in chat how we can make this transition from online to offline better? 
> >What becomes of the goal spec's parts
> This may change during implementation. We might not need to prescribe where the various parts go, this is only a suggestion. 
> >Server time
> We can generate the next goal as close as possible to when a player actually has to see that goal. We could do it in response to the player pressing the red block to move it on the goal, we then immediately create the next one. I think we can get the goal generation down to a few milliseconds, plus the network time will be 50 milliseconds, but the push animation is longer than that.
> For other players, they will simply have to wait a bit, I think it's okay to put in the main blocking thread. That way we can avoid a whole lot of inconsistency issues. 
> > One machine
> Memory grows with number of players, but the board is generally stored as a table (as with all other things in spacetime) so spacetime should handle the memory-storage split, we should only be careful to use spacetime's intended way of doing things. 
> Prediction misses may need an animation yes.
> The server is the authority. 
> When multiple moves are sent to the server, or replayed to the client, then we need an animation for that, we may use the same animation. The "rewards" do not exist yet, but they should also snap back to what is reported by the server. How is this a risk? We can just use the default path, but this needs to be testable, all the way to the animations. 
> >Port
> Yes, we may during the port check behavior against the current implementation, but this comparison should be removed so we can evolve the code after the port freely.
> >Stamp
> I need to see this logic when it is created. We will do it together in the future.

**Agent:** Report updated per notes: dev-only tests/benchmarks/records in the same language but not shipped; the mover hears back via subscription; next goal made in the blocking reducer; server authority; port comparison temporary.

**Commits:** `cb4ec86` One engine report: tests, benchmarks and records beside the engine (not shipped), the mover hears back by subs…

**Reports linked:** reports/one-engine.html


## 2026-11-08 12:55 · 1e4aef56 · X358

**X358 · 12:55**

> This would probably need to be implemented to know which solution would be best. But I think a combination of 1 and 2. While the last online goal (at which Point the player is already offline) Is beeing played, and the player zooms out, then he will see the whole online world, but at the point where that goal gets finished, the camera pans to the offline world. During the pan, the blocks change from being online blocks to being offline blocks, and when the players camera lands on the offline block, and they zoom out, then the whole infinite world is the offline world. The "offline island" is in fact a complete infinite world, but it gets called an island because it only exists on the players device and it cannot interact with the online island. We cannot spec this anymore before we actually implement it.

**Agent:** Offline transition recorded as a direction (pan to an offline infinite world, blocks turning offline), to be found by building.

**Commits:** `957c6a6` Offline island: a whole endless world on the device; the switch as a pan with blocks turning offline (found by…


## 2026-11-08 12:57 · 1e4aef56 · X359–X362

**X359 · 12:57**

> Ok, now what do you suggest we implement? Can you list multiple from the Todo, and then order them based on my preferences? Can you list them all in short?

**X360 · 12:59**

> Q: 4, will that not be done? Can you remove it? Or tick it off as superseded?

**X361 · 13:05**

> Move to top: 1 2 3 8 15
> Move to bottom: 7 (superseded by 8), 13, 14, 16. 
> Others in the middle I don't know the order. 
> Order is approximate priority, note that in the Todo.

**X362 · 13:09**

> . Q: does 2 mean that another additional engine will be created in rust or is that during 1?

**Agent:** TODO "Later" listed and reordered by the user (goal spec phase 1, Tuner runs, decision weight, teaching squares, walls at the top); superseded goal-maker items removed. Agent asked whether Rust makers are allowed now.

**Commits:** `df7df64` TODO: drop the goal-maker items the goal spec supersedes (its Bench and Tuner take them over); `b0ac26f` TODO: Later in approximate priority order (goal spec first), with the user-testing and idea items it was missi…


## 2026-11-08 13:12 · 1e4aef56 · X363

**X363 · 13:12**

> You can do it in an opus subagent. Don't have the subagent create more subagents, and only use 1 sequential subagent at a time. Have it verify its own work, use tests, do testing against the actual game using playwright, give it concrete things it needs to do to verify its own work, and also tell him to come up with additional verifications. You should verify its work too, with your own things, and specifically check out what the agent has NOT done or where it has cut corners. Read it's whole diff when done. Altho, it is okay to create multiple board engines or makers now, we will simply reify them in a later phase. "We do not create multiple engines" is only tye end goals but we rewrite and duplicate as necessary. So 2.

**Agent:** Opus subagent (alone, serial) built spec phase 1 in TypeScript: Request/Goal contract, Referee, Judge with decisions, in-game Referee check, `bench/` with the Auditor, a new Reference maker, today's maker as a Contender, 228 bench cases, Records and the Gate. Agent reviewed and found two problems (decisions inflated; trivial winners).

**Commits:** `464c5e3` Bench makers: today's maker as a Contender, the Reference (breadth first round each candidate's lane, the Judg…; `68ba368` Goal contract, Referee and Judge (reports/goal-spec.md): the Request and Goal as JSON, the hard rules, decisio…; `34d866c` Bench: fixed cases as JSON (fresh boards, goals played, long sessions, the island's edge), the runner (twice p…; `90b2bfb` In play, every goal from the maker is checked by the Referee (a rejected one is logged with its Request and co…; `8598516` TODO: goal spec phase 1 built; Later: asking again on a rejected goal, the Gate's phone time, a deeper Referen…; `c9a3d69` Bench: records from today's maker (efforts 0 and 2) and the Reference on the full and quick sets; the Referee …; `897a634` README: the Bench command


## 2026-11-08 15:16 · 1e4aef56 · X364

**X364 · 15:16**

> Hmm, okay it seems like the decision weight uses breadth first, but it should use depth first? That would change the judge and the generated goals, bit will that solve some of the level generation goals? Like, it is okay if the goals are short, as long as they are difficult and require many moves. If this is not the root cause then do 1, or try to have a subagent inspect this specific decision, it may generate some levels and maybe try to solve on its own, if that helps it towards the goal. 
> You say the reference takes 1.8 seconds, is that the same as today?
> Could you maybe, in the debug text at the top right, have a colored square and text which says what the state of the maker in the background is, so we can see a bit when it works. Is the current code running on the website when I play? Does it use the new code to generate? When those is done, you can continue with the next phase without stopping and asking for my approval or review, do in another serial subagent. In general use serial subagents.

**Agent:** Serial subagents: a maker status light in the debug text, a retry for rejected goals; then decisions recounted depth-first like a person (easier way first, stop at the first that works), weight 1 move, distance^0.4; goals without ramp aim got longer (median 14.5 vs 7.5). The site runs the new maker.

**Commits:** `2706cdf` Debug text: what each goal maker is doing (idle, making at an effort level and for how long, ready with its mo…; `49a1c80` A goal the Referee rejects is asked for again once: one waited for at the next effort level, one made ahead th…; `b9af524` Experiment: decisions counted several ways (every way, depth first stopping at the first way that works in two…; `40f4e28` Auditor: a window 5 cells round red's run, not the game's 2: 12 of the 228 Records (mostly near goals) had a s…; `7e792ed` Judge: decisions are the forks a person meets trying the easier way first (fewer blocks to clear, then the sho…


## 2026-11-08 16:20 · 1e4aef56 · X365–X366

**X365 · 16:20**

> Next implementation: I am not sure what the difference between judge, auditor, referee etc is, but you mentioned earlier that the thing which checks if it can be done in less moves is limited to a small area around the red block and goal, but "more effort" means that it should both search for longer and also in a larger area. Couldnt you just use the whole board api to find a faster solution? Why is it restricted? In how many cases is there a smaller solution if we check a bigger board? Are there some medals that I have earned that j the game which has used solutions that use more of the board than the fastest solution? Note that the only thing really I want is to fix that bug so we get less medals, we can then also tune the effort again probably. At least for the current reference maker. 
> Next I would like you to send me a notification using exe.dev notification api on this machine and using exe.devs service. I am not sure how the notification gets delivered, so we need to test manually these things: notifications show. Notifications can be discarded or closed in code. It sends notification when you are finished. It does not send notification when you are not finished but waiting on a subagent or background task. It should send a notification when you are finished but a background task runs which is not supposed to finish. It should not send a notification when a subagent finishes. You can have a subagent investigate and implement, but we need to do manual testing to verify it works. Notifications should go only to my phone. Will it in the future be possible to send notifications to other players using this system?

**X366 · 16:20** (sent while the agent was still working)

> Omly use a single subagent, queue ut until the other agent is finished.

**Agent:** explained Referee (legal?), Judge (how good?), Auditor (shorter solution, dev only); queued the medal fix and (non-game) phone notifications as one subagent at a time.

**Commits:** `fb645af` Bench: the cases carry today's wishes (decision 1, distance 0.4), and the Records made again from nothing by t…


## 2026-11-08 20:03 · 1e4aef56 · X367

**X367 · 20:03**

> >follow whichever blocks turn out to matter instead of using a fixed box
> Yes, this is my suggested solution, we only need to move the ones which are blocking the red ones, and the ones which block those again, and only as far until we search less than the previous minimum amount of moves. We can also stop after some effort. If these blocks are close to the red block or not, does not matter, they are naturally close because they block the red one. Or maybe read all relevant ones and cache them in a copied board? Not sure tho. Also it seems like the current command has run for a long time? Maybe check if there are some performance problems?

**Agent:** Medal fix the user's way: after the near window, only blocks that block red (and those blocking them) slide, no fixed box, searching only for shorter than the best found, within a budget; removed 7 of 26 player medals (both of the user's). Records rebuilt.

**Commits:** `7fd9255` Experiments: what a wider window costs the measure (window-cost.ts), medals in the play data against wider sea…; `7ca6a51` Experiments: the measure's reach as an option (window-effort.ts, medals.ts: the game's measure now), the boxes…; `844cc99` TODO: the window item done; medals on long goals, where the measure stops at its budget and the proof stands a…; `e6441e2` Measure: after the near window (2 cells round red's run), only the blocks that matter slide, with no fixed box…; `f260293` Bench: the Records made again from nothing, audited as the Auditor now searches (boxes of 5 and 8 and the bloc…
