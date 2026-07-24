# Dependency-closure terminal prototype

Question: can Blocker Dependency closure stop naturally on a bounded 40×40
Generation Request, and when does it require a hard cap or immovable separator?

Run:

```powershell
bun run prototype:closure
```

Try each deterministic scenario:

```text
scenario natural
run
scenario runaway
run
scenario separator
run
```

`step` expands one positioned Block's four-cell escape corridor. A Block found
in that corridor becomes a Blocker Dependency. Missing corridor cells commit a
small Generated Region.

- `natural` eventually generates a clear committed corridor.
- `runaway` keeps placing another blocker until the safety cap is reached.
- `separator` places an immovable separator in the otherwise runaway chain.

Stopping at a separator demonstrates bounded generation, not puzzle
solvability. That distinction is printed in the result.

This is throwaway code for Wayfinder issue #10. Record the human verdict there,
then delete the terminal shell or absorb only the validated closure rule.
