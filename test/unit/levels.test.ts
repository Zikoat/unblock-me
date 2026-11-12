// The levels page (scripts/levels.ts): every trial in src/trials*.ts is on it (a playlist by its
// first board), and the testbed, newest first, each with a date and a line.
import { expect, test } from "bun:test";
import { levelEntries, levelsPage } from "../../scripts/levels";
import { TRIALS } from "../../src/trials";
import { ROOM_TRIALS } from "../../src/trials-rooms";
import { OPEN_TRIALS_K } from "../../src/trials-open-k";

test("the levels page lists every trial, the playlists and the testbed, newest first", async () => {
  const entries = await levelEntries();
  const hrefs = entries.flatMap((e) => e.links.map((l) => l.href));
  for (const t of [...TRIALS, ...OPEN_TRIALS_K]) expect(hrefs).toContain(`../?trial=${t.label}`);
  expect(hrefs).toContain("../?trial=R1");
  expect(hrefs).not.toContain("../?trial=R2");
  // (A new trials file shows up by itself: the decoy playlist, once there.)
  expect(entries.some((e) => e.date === "2026-11-12") || !hrefs.includes("../?trial=D1")).toBe(true);
  expect(hrefs).toContain("../?testbed");
  const dates = entries.map((e) => e.date);
  expect(dates).toEqual([...dates].sort().reverse());
  for (const e of entries) expect([e.title, /^\d{4}-\d\d-\d\d$/.test(e.date) && e.about.length > 10]).toEqual([e.title, true]);
  expect(entries.find((e) => e.title.startsWith("R1 to R12"))?.title).toContain("12 levels");
  const html = await levelsPage();
  expect(html).toContain('href="../?trial=8A"');
});
