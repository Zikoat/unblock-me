import { expect, test } from "bun:test";
import { formatFatalError, runEntrypoint } from "../src/index";

test("normalizes an unexpected entrypoint error without printing its stack", () => {
  const error = new Error("internal failure");
  error.stack = "Error: internal failure\n    at C:\\private\\workspace\\src\\index.ts:1:1";

  expect(formatFatalError(error)).toBe("Fatal: internal failure");
});

test("normalizes newlines in an unexpected error message to one concise line", () => {
  expect(formatFatalError(new Error("first line\nC:\\private\\workspace\\second line"))).toBe("Fatal: first line");
  expect(formatFatalError(new Error("failed at C:\\private\\workspace\\file.ts"))).toBe("Fatal: failed at <path>");
});

test("the entrypoint prints only the normalized fatal line and returns one", async () => {
  const lines: string[] = [];
  const error = new Error("entrypoint exploded");
  error.stack = "Error: entrypoint exploded\n    at C:\\private\\workspace\\src\\index.ts:1:1";

  const exitCode = await runEntrypoint(
    async () => { throw error; },
    (line) => lines.push(line),
  );

  expect(exitCode).toBe(1);
  expect(lines).toEqual(["Fatal: entrypoint exploded"]);
});
