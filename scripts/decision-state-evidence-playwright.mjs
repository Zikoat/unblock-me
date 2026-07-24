import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

export async function runDecisionStateEvidence({ recordVideo = false, humanPace = false } = {}) {
  const record = JSON.parse(await readFile(join(root, "artifacts", "issue18-decision-state-validation.json"), "utf8"));
  const evidencePath = join(root, "artifacts", "issue18-decision-state-evidence.html");
  await writeFile(evidencePath, evidenceHtml(record));
  const videoDir = recordVideo ? await mkdtemp(join(tmpdir(), "unblock-me-decision-state-")) : undefined;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: edge, headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      recordVideo: videoDir ? { dir: videoDir, size: { width: 390, height: 844 } } : undefined,
    });
    const page = await context.newPage();
    const video = page.video();
    const screenshots = videoDir ? screenshotSet(videoDir) : [];
    await page.goto(new URL(`file:///${evidencePath.replaceAll("\\", "/")}`).href, { waitUntil: "domcontentloaded" });
    if (screenshots[0]) await page.screenshot({ path: screenshots[0].path, fullPage: true });
    await pause(page, humanPace, 900);
    await page.locator("[data-case='dependency-gate-counterexample']").tap();
    await pause(page, humanPace, 900);
    if (screenshots[1]) await page.screenshot({ path: screenshots[1].path, fullPage: true });
    await context.close();
    return { videoPath: video ? await video.path() : undefined, screenshots, videoDir };
  } catch (error) {
    if (videoDir) await rm(videoDir, { recursive: true, force: true });
    throw error;
  } finally {
    await browser?.close();
  }
}

function evidenceHtml(record) {
  const json = JSON.stringify(record).replaceAll("<", "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}body{margin:0;background:#10151d;color:#eef2f8;font:15px/1.4 system-ui,sans-serif}main{padding:14px;max-width:720px;margin:auto}
h1{font-size:1.8rem;line-height:1.05}.card{padding:12px;margin:10px 0;border:1px solid #44536a;border-radius:12px;background:#1b2430}
.tabs{display:flex;flex-wrap:wrap;gap:7px}.tabs button{padding:8px;border-radius:999px;border:1px solid #64748b;background:#202936;color:inherit}
.tabs button[aria-pressed=true]{background:#d8ff7a;color:#17210a}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px}.metric{padding:7px;background:#0d1219;border-radius:8px}
.boards{display:grid;grid-template-columns:1fr 1fr;gap:10px}.board{display:grid;gap:3px;padding:3px;background:#344154;border-radius:8px;aspect-ratio:var(--aspect)}
.cell{display:grid;place-items:center;min-width:0;border-radius:4px;background:#111923;font-weight:800;color:#111}.checkpoint{background:#a88b36}.block{background:#8fd3c7}.red{background:#ff624d}
.warn{color:#ffcf70}.pass{color:#d8ff7a}code{word-break:break-all}@media(max-width:360px){.boards{grid-template-columns:1fr}}
</style></head><body><main>
<h1>Decision State compression validation</h1>
<p>Exact search is the correctness oracle. Select a case to compare full positions with the candidate compression.</p>
<div class="tabs" id="tabs"></div>
<section class="card"><h2 id="case-name"></h2><p id="description"></p><div class="metrics" id="metrics"></div></section>
<section class="card"><div class="boards"><div><h3>Initial Exact State</h3><div class="board" id="initial"></div></div><div><h3>Oracle witness</h3><div class="board" id="witness"></div></div></div></section>
<section class="card"><h2>Domain reading</h2><p><strong>Interaction Region:</strong> positions one Block can occupy without changing consequential Blocker Dependencies. <strong>Event Boundary:</strong> a move that changes that region, a dependency, or Checkpoint reachability.</p><p id="conclusion"></p><p>Source <code>${record.sourceCommit}</code></p></section>
<script>
const record=${json};
const tabs=document.querySelector("#tabs");
for(const entry of record.cases){const button=document.createElement("button");button.textContent=entry.name;button.dataset.case=entry.name;button.addEventListener("click",()=>show(entry));tabs.append(button)}
function show(entry){for(const b of tabs.children)b.setAttribute("aria-pressed",String(b.dataset.case===entry.name));document.querySelector("#case-name").textContent=entry.name;document.querySelector("#description").textContent=entry.description;
const r=entry.result;document.querySelector("#metrics").innerHTML=[
["Exact States",r.exact.states],["Exact Decision States",r.exactDecisionStates],["Candidate states",r.compressed.states],["Exact duration",r.exact.durationMs+" ms"],["Candidate duration",r.compressed.durationMs+" ms"],["Interaction positions examined",r.compressed.interactionPositionsExamined],["Missing states",r.comparison.missingDecisionStates],["Spurious states",r.comparison.extraDecisionStates]
].map(([k,v])=>'<div class="metric"><strong>'+v+'</strong><br>'+k+'</div>').join("");
draw(document.querySelector("#initial"),entry.initialState);draw(document.querySelector("#witness"),r.counterexample?.witnessState??entry.initialState);
const ok=r.comparison.reachabilityMatches;const c=document.querySelector("#conclusion");c.className=ok?"pass":"warn";c.textContent=ok?"Exact and candidate reachability match for this case.":"Exact search rejected the candidate: independently reachable Block positions were recombined into "+r.comparison.extraDecisionStates+" spurious Decision States.";
}
function draw(root,state){root.replaceChildren();root.style.gridTemplateColumns='repeat('+state.width+',1fr)';root.style.gridTemplateRows='repeat('+state.height+',1fr)';root.style.setProperty("--aspect",state.width+"/"+state.height);const checkpoints=new Set(state.checkpoint.map(p=>p.x+","+p.y));const occupied=new Map();for(const b of state.blocks)for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++)occupied.set((b.x+x)+","+(b.y+y),b);for(let y=0;y<state.height;y++)for(let x=0;x<state.width;x++){const cell=document.createElement("div");const b=occupied.get(x+","+y);cell.className="cell"+(checkpoints.has(x+","+y)?" checkpoint":"")+(b?" block":"")+(b?.id==="R"?" red":"");cell.textContent=b?.id??"";root.append(cell)}}
show(record.cases[0]);
</script></main></body></html>`;
}

function screenshotSet(directory) {
  return [
    ["Independent translations collapse", "Sixteen Exact States correctly collapse to one Decision State", "issue18-independent.png"],
    ["Dependency Gate counterexample", "Exact search exposes two spurious states in the candidate compression", "issue18-counterexample.png"],
  ].map(([caption, alt, filename]) => ({ caption, alt, path: join(directory, filename) }));
}

function pause(page, enabled, milliseconds) {
  return enabled ? page.waitForTimeout(milliseconds) : Promise.resolve();
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1").replaceAll("/", "\\")) {
  const result = await runDecisionStateEvidence({
    recordVideo: process.argv.includes("--record"),
    humanPace: process.argv.includes("--human"),
  });
  if (process.argv.includes("--json")) console.log(JSON.stringify(result));
  else console.log("Decision State evidence cases rendered.");
}
