import { expect, test } from "bun:test";
import { createPuzzle } from "../src/puzzle";
import * as feedbackModule from "../src/web/feedback";
import { pageHtml } from "../src/web/page";

test("requires a rating only when advancing a solved level", () => {
  expect(feedbackModule.canAdvanceToNextLevel(false, undefined)).toBe(true);
  expect(feedbackModule.canAdvanceToNextLevel(true, undefined)).toBe(false);
  expect(feedbackModule.canAdvanceToNextLevel(true, "up")).toBe(true);
  expect(feedbackModule.canAdvanceToNextLevel(true, "down")).toBe(true);
});

test("renders phone-tappable ratings and an optional comment", () => {
  expect(pageHtml).toContain('data-rating="up"');
  expect(pageHtml).toContain('data-rating="down"');
  expect(pageHtml).toContain('id="feedback-comment"');
});

test("stores an optional comment and exact evidence with a vote", () => {
  const state = createPuzzle();
  const entries = feedbackModule.upsertLevelFeedback([], {
    levelId: "level-1",
    rating: "down",
    comment: "Too much empty space",
    initialState: state,
    stateAtRating: { ...state, moves: 3 },
    moveHistory: [],
    ratedAt: "2026-07-24T12:00:00.000Z",
    solved: false,
  });

  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    levelId: "level-1",
    rating: "down",
    comment: "Too much empty space",
    stateAtRating: { moves: 3 },
  });

  const updated = feedbackModule.upsertLevelFeedback(entries, {
    ...entries[0]!,
    rating: "up",
    comment: "",
  });
  expect(updated).toHaveLength(1);
  expect(updated[0]).toMatchObject({ levelId: "level-1", rating: "up", comment: "" });
});
