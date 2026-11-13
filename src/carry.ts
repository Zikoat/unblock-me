// The player carried in the URL: `?p=<device id>`. On iPhone, Telegram's in-app browser and
// Safari keep separate storage, so "Open in Safari" would start over; with the id in the URL the
// new browser asks the server (scripts/serve-public.py, GET /progress?p=<id>) for that player's
// last upload and goes on from there, as the same player.
// Privacy: the id is a random UUID, and anyone with the link gets that progress (and play log).
// Fine for a game; there is no sign-in. Progress never comes back from the fingerprint, and a
// page without ?p= (incognito, cleared data) starts fresh as before.

/** The URL parameter naming the player. */
export const PLAYER_PARAM = "p";
const DEVICE_KEY = "unblock-me:device";
const VIEW_CHECK_KEY = "unblock-me:view-check";
/** A well-formed device id (crypto.randomUUID); the server checks the same. */
export const isPlayerId = (id: string | null): id is string => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
/** The stored keys that are the player's progress (and play log), carried from browser to
 * browser; settings (fps counter, debug row, border) stay with the browser. The server
 * returns only these (PROGRESS_KEY in scripts/serve-public.py). */
export const isProgressKey = (key: string): boolean => /^unblock-me:(v\d+:(seed|moved|history|goal|rooms|seen)|tries|walls|camera|rooms-made|detail|log)$/.test(key);
/** Goals reached in a stored world: the length of its goal key's `done`. */
export function goalsIn(goal: unknown): number {
  const done = (goal as { done?: unknown } | null)?.done;
  return Array.isArray(done) ? done.length : 0;
}

/** What opening the page with ?p= did, logged once the play log is loaded. */
export type Carried =
  | { e: "restored"; from: string | null; goals: number }
  | { e: "idConflict"; url: string; own: string; ownGoals: number; urlGoals: number | null; kept: "own" | "url" }
  | { e: "restoreFailed"; url: string; status: number };

/** Whose progress this page plays, when its URL names a player: the URL's player wins if this
 * browser has no device id, or its own world has no goal reached yet (still on level 1);
 * otherwise this browser keeps its own (logged as a conflict). Pure, for tests. */
export function urlWins(own: string | null, ownGoals: number): boolean {
  return own === null || ownGoals === 0;
}

/** Before anything is loaded from storage: if the URL names another player than this browser's,
 * fetch that player's progress and take it over (its id becomes this browser's device id).
 * Returns what happened, or null if there was nothing to do. */
export async function carryFromUrl(goalKey: string, fetchProgress = defaultFetch): Promise<Carried | null> {
  const url = new URLSearchParams(location.search).get(PLAYER_PARAM);
  if (!isPlayerId(url)) return null;
  let own: string | null;
  try {
    own = localStorage.getItem(DEVICE_KEY);
  } catch {
    return null; // no storage: nothing to load into
  }
  if (own === url) return null;
  let ownGoals = 0;
  try {
    ownGoals = goalsIn(JSON.parse(localStorage.getItem(goalKey) ?? "null"));
  } catch {
    // not JSON: no goals
  }
  if (!urlWins(own, ownGoals)) return { e: "idConflict", url, own: own!, ownGoals, urlGoals: null, kept: "own" };
  const got = await fetchProgress(url);
  if (got.status === 404) {
    // The server has nothing for it (never uploaded): a fresh browser takes the id anyway, so
    // the link stays this player's; one with its own id keeps it.
    if (own === null) localStorage.setItem(DEVICE_KEY, url);
    return own === null ? null : { e: "idConflict", url, own, ownGoals, urlGoals: 0, kept: "own" };
  }
  if (!got.stored) return { e: "restoreFailed", url, status: got.status };
  try {
    for (const key of Object.keys(localStorage)) if (isProgressKey(key) || key === VIEW_CHECK_KEY) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(got.stored)) if (isProgressKey(key)) localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(DEVICE_KEY, url);
  } catch {
    return { e: "restoreFailed", url, status: -1 }; // storage full: plays on as before
  }
  return { e: "restored", from: own, goals: goalsIn(got.stored[goalKey]) };
}

async function defaultFetch(id: string): Promise<{ status: number; stored?: Record<string, unknown> }> {
  // Not long: the page waits for this before it shows anything.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 5000);
  try {
    const res = await fetch(`progress?${PLAYER_PARAM}=${id}`, { signal: abort.signal, cache: "no-store" });
    if (!res.ok) return { status: res.status };
    const body = (await res.json()) as { stored?: Record<string, unknown> };
    return { status: res.status, stored: body.stored ?? {} };
  } catch {
    return { status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Put this player's id in the URL (no reload), so opening the page in another browser
 * carries it. Returns whether the URL changed. */
export function showIdInUrl(id: string): boolean {
  const url = new URL(location.href);
  if (url.searchParams.get(PLAYER_PARAM) === id) return false;
  url.searchParams.set(PLAYER_PARAM, id);
  history.replaceState(history.state, "", url);
  return true;
}

/** Take the id out of the URL (a reset that forgets everything starts a new player). */
export function dropIdFromUrl(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has(PLAYER_PARAM)) return;
  url.searchParams.delete(PLAYER_PARAM);
  history.replaceState(history.state, "", url);
}
