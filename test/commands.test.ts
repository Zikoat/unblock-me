import { expect, test } from "bun:test";
import { parseCommand } from "../src/commands";

test("parses a case-insensitive move with surrounding whitespace", () => {
  expect(parseCommand("  a   UP  ")).toEqual({
    ok: true,
    command: { type: "move", blockId: "a", direction: "up", steps: 1 },
  });
});

test("parses help and quit commands", () => {
  expect(parseCommand(" HELP ")).toEqual({ ok: true, command: { type: "help" } });
  expect(parseCommand("quit")).toEqual({ ok: true, command: { type: "quit" } });
});

test("rejects commands with missing or extra tokens", () => {
  expect(parseCommand("")).toEqual({ ok: false, message: "Enter a block and direction, or help or quit." });
  expect(parseCommand("A")).toEqual({ ok: false, message: "Enter a block and direction, or help or quit." });
  expect(parseCommand("A up 2 now")).toEqual({ ok: false, message: "Enter a block and direction, or help or quit." });
  expect(parseCommand("help now")).toEqual({ ok: false, message: "Enter a block and direction, or help or quit." });
});

test("rejects invalid directions", () => {
  expect(parseCommand("A sideways")).toEqual({ ok: false, message: "Invalid direction: sideways." });
});

test("parses an optional positive multi-cell step count", () => {
  expect(parseCommand("R right 4")).toEqual({
    ok: true,
    command: { type: "move", blockId: "R", direction: "right", steps: 4 },
  });
});

test("rejects invalid step counts", () => {
  for (const value of ["0", "-1", "1.5", "many"]) {
    expect(parseCommand(`R right ${value}`)).toEqual({ ok: false, message: "Step count must be a positive integer." });
  }
});
