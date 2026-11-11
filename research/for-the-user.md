# For the user: things to play, decide and do

Written 2026-11-11 by the research agent. A simpler agent walks the user through this, one item
at a time, in order. Each item says what, why, how, and what changes with the answer. Items are
small on purpose; skip any the user has no opinion on.

## A. Play (in the game, logged automatically)

### A1. Play the playlist: ?trial=R1
- **What:** open https://hockey-mandolin.exe.xyz/?trial=R1 and play through. After each goal the
  next board loads by itself (R1 to R12, about 12 boards, 10 to 16 moves each). Stop whenever.
  No need to report anything; the plays are logged.
- **Why:** these are candidate levels (rooms with come-back moves, set into the world). The logs
  (moves, time, take-backs, which blocks you moved) have tracked your verdicts about as well as
  your words did, so this replaces the chat round-trips.
- **How:** just play. If one stands out (very good, very bad, or looks wrong), note its number
  (shown top left, "Trial R7") and one line about it.
- **What changes:** with 10 or so reached boards we can rank the candidate measures (section B
  of the roadmap) against your play instead of asking you.

### A2. If the playlist felt fine: a second one later
- **What:** a second playlist will vary one thing at a time (how much world shows round the
  room, world blocks pulled into the room). Same link style, different letters.
- **Why:** to test the "can't tell the puzzle from the world" feeling on purpose.
- **How:** as A1.
- **What changes:** which generator gets stamped into the real world first.

## B. Decide (short questions)

### B1. What should "hard" mean in the logs?
- **What:** when nobody says how a level felt, which of these should we read as "it was hard"?
  1. Moves used compared with the fewest (recommended).
  2. Time from seeing the goal to reaching it.
  3. Both, averaged by rank.
- **Why:** this is what every later analysis sorts by; both tracked your verdicts about equally.
- **What changes:** the sort order in lab/plays.ts and in later reports.

### B2. Same link, other browser
- **What:** to recognise you (and friends) across phone, computer and Telegram without a
  login, the game could show a small link you can open elsewhere, which carries your id. No
  fingerprinting, nothing sent but a random id, screen size and browser name.
  1. Yes, a link in the hidden debug row (recommended).
  2. No, wait for a real sign-in with the server.
- **Why:** otherwise the same person shows up as several players and skill cannot be tracked.
- **What changes:** whether per-player skill can be used to set difficulty before a server exists.

### B3. Rooms in the real world
- **What:** should the next step put library rooms (like the playlist boards) into the endless
  world as patches where goals are placed, behind a switch at first?
  1. Yes, behind `?rooms=1`, logged (recommended).
  2. No, keep improving the maker on the plain world first.
- **Why:** rooms are the only way we have so far to make real come-back moves; the maker's
  proofs on the open world showed detours instead.
- **What changes:** the next implementation item on the roadmap.

### B4. Decoys on purpose?
- **What:** the best-liked boards had blocks that looked like part of the puzzle but were not
  needed. Should the generator add such blocks deliberately (they never change the fewest
  moves; they only add things to think about)?
  1. Yes, try it in a playlist first (recommended).
  2. No, that is cheating the player.
- **Why:** this is the first board-side test of your "which blocks look relevant" idea.
- **What changes:** whether the "decoy count" becomes a wish in the Judge.

## C. Do (small tasks)

### C1. Nothing right now. (A server or sign-in is not needed for the next steps.)

## D. Concepts worth understanding (teaching plans for the simpler agent)

Only two. Everything else (stubborn sets, bounds, correlations) is not worth the user's time.

### D1. "Stuck" in a sliding puzzle means far, not trapped
- **Why it matters:** the user asked for "getting stuck in a wrong part of the state space"; the
  right picture decides what we measure.
- **Socratic sequence:**
  1. "On K2A you got stuck for a while. Could you have undone every move you made, back to the
     start?" (Yes: every slide can be slid back.)
  2. "So was there ever a position from which the goal was impossible?" (No.)
  3. "Then what was 'stuck'?" (Being many moves from the goal without seeing it; every move that
     looked useful made it worse or no better.)
  4. "If we could number every position by how many moves it is from the goal, what would your
     stuck stretch look like?" (The number going up, or staying flat, for a long run.)
- **Concrete example:** on K2A the log shows 85 moves for a 12-move goal, 33 of them straight
  take-backs; the last 5 moves were a clean run to the goal. The puzzle was the setup.
- **Check:** ask the user to say in one sentence what we should measure. Looking for: how far
  off a player can get while the board looks fine, not whether they can get trapped.

### D2. Why a number proved on a small room holds in the endless world
- **Why it matters:** it is why rooms made ahead are safe to stamp anywhere, and why the maker's
  own counts on the open world were not.
- **Socratic sequence:**
  1. "If the world round a room froze, could a solution get longer or shorter?" (Only longer or
     the same: fewer things move.)
  2. "If every world block could move away for one move the moment you need its cell, and the
     space past the edge was all free, could a solution get longer?" (No: that is the easiest
     world possible.)
  3. "If both of those give the same count, what do you know about the real world in between?"
     (The count is exact, whatever is out there.)
- **Concrete example:** H3A and J1B were checked this way; the maker's proofs for M1 were not,
  and their come-back moves turned out to be detours.
- **Check:** ask why a room with a block that can slide out to the world edge is "unsealed" and
  needs the check. Looking for: something from outside could slide in, or the block could leave.
