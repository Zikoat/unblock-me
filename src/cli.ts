import { createInterface } from "node:readline";
import { parseCommand } from "./commands";
import { applyMove } from "./game";
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

      const result = applyMove(state, parsed.command);
      state = result.state;
      output.write(`${renderFrame(state, result.ok ? undefined : result.message)}\n`);
      if (state.won) return 0;
    }

    return 0;
  } finally {
    readline.close();
  }
}
