import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { goalsIn, isPlayerId, isProgressKey, urlWins } from "../../src/carry";

test("only well-formed ids are carried", () => {
  expect(isPlayerId(crypto.randomUUID())).toBe(true);
  expect(isPlayerId("../etc/passwd")).toBe(false);
  expect(isPlayerId("4bf17ee7")).toBe(false);
  expect(isPlayerId(null)).toBe(false);
});

test("progress keys are the world and the log, not the browser's settings", () => {
  for (const key of ["unblock-me:v13:goal", "unblock-me:v13:moved", "unblock-me:v14:seed", "unblock-me:log", "unblock-me:rooms-made", "unblock-me:camera"]) expect(isProgressKey(key)).toBe(true);
  for (const key of ["unblock-me:device", "unblock-me:fps", "unblock-me:debug", "unblock-me:border", "unblock-me:view-check", "other:v13:goal"]) expect(isProgressKey(key)).toBe(false);
});

test("the server returns the same keys", () => {
  const server = readFileSync(new URL("../../scripts/serve-public.py", import.meta.url), "utf8");
  const py = server.match(/PROGRESS_KEY = re\.compile\(r"(.*)"\)/)![1]!;
  const ts = readFileSync(new URL("../../src/carry.ts", import.meta.url), "utf8").match(/isProgressKey = \(key: string\): boolean => \/\^(.*)\$\/\.test/)![1]!;
  expect(py).toBe(ts);
});

test("the URL's player wins only over a browser with no id or no goal reached", () => {
  expect(urlWins(null, 0)).toBe(true);
  expect(urlWins("own", 0)).toBe(true);
  expect(urlWins("own", 1)).toBe(false);
  expect(goalsIn({ done: [1, 2, 3] })).toBe(3);
  expect(goalsIn(null)).toBe(0);
});
