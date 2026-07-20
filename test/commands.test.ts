import { expect, test } from "bun:test";
import { parseCommand } from "../src/commands";

test("parses a case-insensitive move with surrounding whitespace", () => {
  expect(parseCommand("  a   UP  ")).toEqual({
    ok: true,
    command: { type: "move", blockId: "a", direction: "up" },
  });
});

test("parses help and quit commands", () => {
  expect(parseCommand(" HELP ")).toEqual({ ok: true, command: { type: "help" } });
  expect(parseCommand("quit")).toEqual({ ok: true, command: { type: "quit" } });
});

test("rejects commands with missing or extra tokens", () => {
  expect(parseCommand("")).toEqual({ ok: false, message: "Enter a block and direction, or help or quit." });
  expect(parseCommand("A")).toEqual({ ok: false, message: "Enter a block and direction, or help or quit." });
  expect(parseCommand("A up now")).toEqual({ ok: false, message: "Enter a block and direction, or help or quit." });
  expect(parseCommand("help now")).toEqual({ ok: false, message: "Enter a block and direction, or help or quit." });
});

test("rejects invalid directions", () => {
  expect(parseCommand("A sideways")).toEqual({ ok: false, message: "Invalid direction: sideways." });
});
