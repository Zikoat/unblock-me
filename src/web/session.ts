import type { Direction, GameState } from "../game";
import type { ClosureState } from "../world/closure";
import type { PrototypeState } from "../world/generation";
import type { FeedbackDraft, LevelFeedback } from "./feedback";
import type { FiniteGenerationRecord } from "../generator";

export const BROWSER_SESSION_KEY = "unblock-me.browser-session.v1";

export interface SemanticMove {
  after: GameState;
  before: GameState;
  blockId: string;
  direction: Direction;
  movedSteps: number;
  requestedSteps: number;
  type: "block-move";
}

export interface BrowserSession {
  closureState: ClosureState;
  currentGeneration?: FiniteGenerationRecord;
  currentSeed?: number;
  currentLevelId: string;
  currentLevelSolved: boolean;
  feedbackDraft: FeedbackDraft;
  feedbackEntries: LevelFeedback[];
  initialState: GameState;
  mode: "play" | "world" | "closure";
  moveHistory: SemanticMove[];
  playState: GameState;
  version: 1;
  worldView: { x: number; y: number };
  worldState: PrototypeState;
  zoom: number;
}

export function encodeBrowserSession(session: BrowserSession): string {
  return JSON.stringify(session);
}

export function decodeBrowserSession(value: string | null): BrowserSession | undefined {
  if (value === null) return undefined;
  try {
    const candidate = JSON.parse(value) as Partial<BrowserSession>;
    if (
      candidate.version !== 1
      || !isMode(candidate.mode)
      || typeof candidate.zoom !== "number"
      || !candidate.initialState
      || !candidate.playState
      || !candidate.worldState
      || !candidate.closureState
      || !Array.isArray(candidate.moveHistory)
    ) return undefined;
    return {
      ...candidate,
      currentLevelId: typeof candidate.currentLevelId === "string" ? candidate.currentLevelId : "restored-level",
      currentLevelSolved: typeof candidate.currentLevelSolved === "boolean"
        ? candidate.currentLevelSolved
        : candidate.playState.won,
      feedbackDraft: isFeedbackDraft(candidate.feedbackDraft) ? candidate.feedbackDraft : { comment: "" },
      feedbackEntries: Array.isArray(candidate.feedbackEntries) ? candidate.feedbackEntries : [],
      worldView: candidate.worldView
        && typeof candidate.worldView.x === "number"
        && typeof candidate.worldView.y === "number"
        ? candidate.worldView
        : { x: candidate.worldState.camera.x, y: candidate.worldState.camera.y },
    } as BrowserSession;
  } catch {
    return undefined;
  }
}

function isFeedbackDraft(value: unknown): value is FeedbackDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FeedbackDraft>;
  return typeof candidate.comment === "string"
    && (candidate.rating === undefined || candidate.rating === "up" || candidate.rating === "down");
}

function isMode(value: unknown): value is BrowserSession["mode"] {
  return value === "play" || value === "world" || value === "closure";
}
