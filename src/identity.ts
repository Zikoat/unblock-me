// Who is playing, for testing how a player can be recognised across browsers (Telegram's in-app
// browser, the system browser, incognito, another browser). Two ids, shown as names under the
// fps counter: the device id this browser keeps in localStorage (lost when its storage is not
// carried over), and a fingerprint computed from the browser itself (kept across storage, but
// changing with the browser or screen). Nothing here is sent anywhere.

const ADJECTIVES = ["amber", "brave", "calm", "dusty", "eager", "fuzzy", "gentle", "happy", "icy", "jolly", "keen", "lucky", "misty", "noble", "odd", "proud", "quick", "rusty", "shy", "tidy", "urban", "vivid", "witty", "young", "zesty", "bold", "crisp", "dark", "fresh", "grand", "hollow", "lazy"];
const ANIMALS = ["otter", "fox", "heron", "lynx", "moose", "panda", "raven", "seal", "tiger", "wolf", "yak", "zebra", "badger", "camel", "dingo", "eagle", "ferret", "gecko", "hare", "ibis", "koala", "lemur", "mole", "newt", "owl", "puffin", "quail", "robin", "sloth", "toad", "viper", "wombat"];

/** A short readable name for an id: the same id always gives the same name. */
export function nameOf(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return `${ADJECTIVES[h % 32]} ${ANIMALS[(h >>> 5) % 32]} ${((h >>> 10) % 100).toString().padStart(2, "0")}`;
}

/** A fingerprint of this browser: what it says about itself, its screen and how it draws text. */
export async function fingerprint(): Promise<string> {
  const n = navigator as Navigator & { deviceMemory?: number };
  let canvas = "";
  try {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 40;
    const ctx = c.getContext("2d")!;
    ctx.textBaseline = "top";
    ctx.font = "16px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(10, 5, 80, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Unblock me ✓ 12", 2, 12);
    canvas = c.toDataURL();
  } catch { /* no canvas: leave it out */ }
  const parts = [
    n.userAgent, n.language, n.languages?.join(","), n.platform, n.hardwareConcurrency, n.deviceMemory,
    screen.width, screen.height, screen.colorDepth, devicePixelRatio,
    Intl.DateTimeFormat().resolvedOptions().timeZone, canvas,
  ].join("|");
  try {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
    return [...new Uint8Array(hash)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return parts; // no crypto.subtle (not a secure page): name the raw parts instead
  }
}
