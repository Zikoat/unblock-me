# Grim and god levels (your design)

Extra hard levels at the end of a branch: a goal that comes as one side of a split, so the player can skip it.

## Grim (a grim reaper icon)

- A large number of possible moves and many blocks.
- A large space where the player can land.
- A big minimum number of moves to complete it.
- No tutorial, no ASCII board, no text solution, and no entering or leaving.

## God (a black void orb)

So large that a human can't really finish it by hand; the player may write a bot or algorithm instead.

- **The ASCII board:** the board is given to the player as ASCII.
- **The solution box:** the player types the sequence of moves into a box, and it moves the blocks.
- **Checking:**
  - the engine checks the syntax and the moves;
  - it stops on the first invalid move;
  - it explains what is wrong and shows it on the board.
- **Before a solution is run,** the level is reset.
- **Entering and leaving** (the tutorial levels):
  - a level is entered when the first block inside its area is moved;
  - once entered, no block outside the area can be moved;
  - leaving resets the progress inside.

### Tutorial levels

1. **Simple.** The player may use the ASCII board and a text solution, or move the blocks by hand.
2. **Normal difficulty.** Moves by hand are not allowed: only the text solution solves it.
3. **(Not specified.)** You list a first, second and fourth. Is there a third, or is the fourth the third?
4. **Medium difficulty,** open to the endless world.

## Open questions

- The ASCII format and the move syntax. For example, one line per move: `<block id> <direction> <cells>`, or `<block id> <x>,<y>`.
- How grim levels are made within a phone's budget. Probably made ahead in the lab and shipped as a library, as the rooms are.
- How large a god level is, and whether it is made or hand-built.
