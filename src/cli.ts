import { createInterface } from "node:readline";
import { parseCommand } from "./commands";
import { applyMoves } from "./game";
import { createPuzzle } from "./puzzle";
import { instructions, legend, renderFrame } from "./render";

export async function runCli(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<number> {
  let state = createPuzzle();
  output.write(`Unblock Me\n\n${instructions}\n\n${renderFrame(state)}\n`);

  const readline = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of readline) {
      const parsed = parseCommand(line);
      if (!parsed.ok) {
        output.write(`${renderFrame(state, parsed.message)}\n`);
        continue;
      }

      if (parsed.command.type === "help") {
        output.write(`${instructions}\n${legend}\n`);
        continue;
      }

      if (parsed.command.type === "quit") return 0;

      const result = applyMoves(state, parsed.command, parsed.command.steps);
      state = result.state;
      const notice = result.ok
        ? result.movedSteps < result.requestedSteps
          ? `Moved ${result.movedSteps} of ${result.requestedSteps} cells before ${result.stoppedBy!.replace(/-/g, " ")}.`
          : undefined
        : result.message;
      output.write(`${renderFrame(state, notice)}\n`);
      if (state.won) return 0;
    }

    return 0;
  } finally {
    readline.close();
  }
}
