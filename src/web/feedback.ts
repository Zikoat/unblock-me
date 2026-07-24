import type { GameState } from "../game";
import type { SemanticMove } from "./session";

export type LevelRating = "up" | "down";

export interface LevelFeedback {
  comment: string;
  initialState: GameState;
  levelId: string;
  moveHistory: SemanticMove[];
  ratedAt: string;
  rating: LevelRating;
  solved: boolean;
  stateAtRating: GameState;
}

export interface FeedbackDraft {
  comment: string;
  rating?: LevelRating;
}

export function canAdvanceToNextLevel(won: boolean, rating: LevelRating | undefined): boolean {
  return !won || rating !== undefined;
}

export function upsertLevelFeedback(
  entries: readonly LevelFeedback[],
  feedback: LevelFeedback,
): LevelFeedback[] {
  const existingIndex = entries.findIndex((entry) => entry.levelId === feedback.levelId);
  if (existingIndex === -1) return [...entries, feedback];
  return entries.map((entry, index) => index === existingIndex ? feedback : entry);
}
