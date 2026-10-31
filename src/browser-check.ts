// Telegram's in-app browser takes sideways swipes for itself (they close the page), which
// breaks the game. This finds out whether the page is in it, asks the player, records how
// swipes arrive (and whether the page is left mid-swipe), and sends that to the server for
// a look. In Telegram it offers to open the game in the phone's own browser.

type Gesture = { t: number; kind: string; x0: number; y0: number; x1: number; y1: number; ms: number; moves: number; end: string };

/** Kept across resets (main.ts). */
export const ANSWER_KEY = "unblock-me:browser-answer";
export const SENT_KEY = "unblock-me:browser-sent"; // how many reports this browser sent (a few are enough)
const MAX_REPORTS = 4;

type Proxy = { postEvent?: (event: string, data: string) => void };
const proxy = (): Proxy | undefined => (window as unknown as { TelegramWebviewProxy?: Proxy }).TelegramWebviewProxy;

/** Telegram's in-app browser: it injects TelegramWebviewProxy, and some versions name
 * themselves in the user agent. */
export function inTelegram(): boolean {
  return !!proxy() || /Telegram/i.test(navigator.userAgent);
}

/** What the page can tell about where it runs. */
function facts(): Record<string, unknown> {
  const w = window as unknown as Record<string, unknown>;
  const nav = navigator as unknown as { userAgentData?: { brands?: unknown; mobile?: boolean; platform?: string }; standalone?: boolean };
  return {
    userAgent: navigator.userAgent,
    userAgentData: nav.userAgentData ? { brands: nav.userAgentData.brands, mobile: nav.userAgentData.mobile, platform: nav.userAgentData.platform } : null,
    telegramGlobals: Object.keys(w).filter((k) => /telegram/i.test(k)),
    proxyEvents: typeof proxy()?.postEvent,
    referrer: document.referrer,
    historyLength: history.length,
    standalone: nav.standalone ?? matchMedia("(display-mode: standalone)").matches,
    screen: { width: screen.width, height: screen.height, innerWidth, innerHeight, dpr: devicePixelRatio },
    touch: { maxTouchPoints: navigator.maxTouchPoints, coarse: matchMedia("(pointer: coarse)").matches },
    language: navigator.language,
  };
}

export function browserCheck({ device, commit }: { device: string; commit: string }): void {
  const detected = inTelegram();
  // Ask Telegram (if it listens) not to take swipes; harmless anywhere else.
  try {
    proxy()?.postEvent?.("web_app_setup_swipe_behavior", JSON.stringify({ allow_vertical_swipe: false }));
    proxy()?.postEvent?.("web_app_expand", "");
  } catch {
    // Not a Mini App: nothing to set.
  }

  // Every gesture, start to end: where, how long, and how it ended (up, cancel: taken by
  // the browser, or the page left mid-gesture).
  const gestures: Gesture[] = [];
  const events: Record<string, number> = {};
  const open = new Map<string, Gesture>();
  const start = performance.now();
  const count = (e: Event) => (events[e.type] = (events[e.type] ?? 0) + 1);
  const at = (e: PointerEvent | Touch) => [Math.round(e.clientX), Math.round(e.clientY)] as const;
  addEventListener("pointerdown", (e: PointerEvent) => {
    count(e);
    const [x, y] = at(e);
    open.set(`p${e.pointerId}`, { t: Math.round(e.timeStamp - start), kind: e.pointerType, x0: x, y0: y, x1: x, y1: y, ms: 0, moves: 0, end: "open" });
  }, { capture: true, passive: true });
  addEventListener("pointermove", (e: PointerEvent) => {
    const g = open.get(`p${e.pointerId}`);
    if (!g) return;
    [g.x1, g.y1] = at(e);
    g.moves++;
    g.ms = Math.round(e.timeStamp - start - g.t);
  }, { capture: true, passive: true });
  const finish = (id: string, end: string) => {
    const g = open.get(id);
    if (!g) return;
    g.end = end;
    open.delete(id);
    gestures.push(g);
    if (gestures.length > 40) gestures.shift();
  };
  addEventListener("pointerup", (e: PointerEvent) => { count(e); finish(`p${e.pointerId}`, "up"); }, { capture: true, passive: true });
  addEventListener("pointercancel", (e: PointerEvent) => { count(e); finish(`p${e.pointerId}`, "cancel"); }, { capture: true, passive: true });
  for (const type of ["touchstart", "touchend", "touchcancel", "visibilitychange", "blur", "focus", "popstate"]) addEventListener(type, count, { capture: true, passive: true });

  let answer: string | null = null;
  try {
    answer = localStorage.getItem(ANSWER_KEY);
  } catch {
    // No storage: ask every time.
  }
  const report = (why: string) => ({
    kind: "browser-check", why, sentAt: new Date().toISOString(), commit, device, detected, answer,
    secondsOnPage: Math.round((performance.now() - start) / 1000),
    facts: facts(), events, gestures: [...gestures, ...[...open.values()].map((g) => ({ ...g, end: "open at send" }))],
  });
  const sent = () => {
    try {
      return Number(localStorage.getItem(SENT_KEY) ?? 0);
    } catch {
      return MAX_REPORTS;
    }
  };
  const send = (why: string, beacon = false) => {
    if (sent() >= MAX_REPORTS) return;
    try {
      localStorage.setItem(SENT_KEY, String(sent() + 1));
    } catch {
      return;
    }
    const body = JSON.stringify(report(why));
    if (beacon) navigator.sendBeacon("play-data", new Blob([body], { type: "application/json" }));
    else void fetch("play-data", { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {});
  };
  // Leaving the page (a swipe that closed it, say): send what the last gestures were.
  let reporting = detected || answer === null;
  addEventListener("pagehide", () => reporting && send("page left", true));

  // The panel: shown in Telegram, and once on touch screens until answered.
  if (answer !== null && !detected) return;
  if (!detected && !matchMedia("(pointer: coarse)").matches) return;
  const panel = document.createElement("div");
  panel.id = "browser";
  const link = location.href;
  panel.innerHTML = detected
    ? `<p><b>You seem to be in Telegram's browser.</b> Swiping sideways there can close the game. It works best in your phone's own browser.</p>
       <p class="row"><button data-act="open">Open in browser</button><button data-act="copy">Copy link</button><button data-act="hide">✕</button></p>
       <p class="small">Or tap ⋮ (top right) and choose "Open in browser".</p>
       <p class="small">Is this Telegram? <button data-act="yes">Yes</button><button data-act="no">No</button></p>`
    : `<p class="small">Quick check: are you in Telegram's browser? Then swipe left and right on the board once.</p>
       <p class="row"><button data-act="yes">Yes, Telegram</button><button data-act="no">No</button><button data-act="close">✕</button></p>`;
  document.body.append(panel);
  panel.addEventListener("click", async (e) => {
    const act = (e.target as HTMLElement).closest("button")?.dataset.act;
    if (!act) return;
    if (act === "hide") return panel.remove();
    if (act === "open") {
      // Telegram may open it outside itself; on Android an intent asks the system.
      try {
        proxy()?.postEvent?.("web_app_open_link", JSON.stringify({ url: link, try_browser: "chrome" }));
      } catch {
        // Not handled: the intent below.
      }
      if (/Android/i.test(navigator.userAgent)) location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(link)};end`;
      send("open in browser");
      return;
    }
    if (act === "copy") {
      try {
        await navigator.clipboard.writeText(link);
        (e.target as HTMLElement).textContent = "Copied";
      } catch {
        prompt("Copy this link", link);
      }
      return;
    }
    if (act === "yes" || act === "no" || act === "close") {
      answer = act === "yes" ? "telegram" : act === "no" ? "not telegram" : "dismissed";
      try {
        localStorage.setItem(ANSWER_KEY, answer);
      } catch {
        // Not kept: asked again next time.
      }
      reporting = true;
      // Give a swipe or two time to land in the report, then send it.
      setTimeout(() => send("answered"), 8000);
    }
    if (!detected) panel.remove();
    else panel.querySelectorAll("p.small:last-child").forEach((p) => (p.textContent = "Thanks!"));
  });
}
