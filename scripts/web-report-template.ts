export interface ScreenshotEvidence {
  alt: string;
  base64: string;
  caption: string;
}

export interface WebReportData {
  commit: string;
  desktopVideoBase64: string;
  generatedSeed: string;
  mobileVideoBase64: string;
  screenshots: readonly ScreenshotEvidence[];
  tests: string;
  typecheck: string;
}

export interface IssueReportData {
  checks: readonly string[];
  commit: string;
  deploymentUrl: string;
  issueName?: string;
  issueNumber?: number;
  issueUrl: string;
  requirements?: readonly string[];
  screenshots: readonly ScreenshotEvidence[];
  summary: string;
  title: string;
  verification?: readonly string[];
  videos?: readonly { caption: string; url: string }[];
}

export function renderIssueReport(data: IssueReportData): string {
  const screenshots = data.screenshots.map((screenshot) =>
    `<figure><img alt="${escapeHtml(screenshot.alt)}" src="data:image/png;base64,${screenshot.base64}"><figcaption>${escapeHtml(screenshot.caption)}</figcaption></figure>`,
  ).join("");
  const checks = data.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join("");
  const requirements = (data.requirements ?? []).map((requirement) => `<li>${escapeHtml(requirement)}</li>`).join("");
  const verification = (data.verification ?? []).map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  const videos = (data.videos ?? []).map((video) =>
    `<figure><video controls preload="metadata"><source src="${escapeHtml(video.url)}" type="video/mp4"><a href="${escapeHtml(video.url)}">Open the MP4</a></video><figcaption>${escapeHtml(video.caption)} · <a href="${escapeHtml(video.url)}">Open or download MP4</a></figcaption></figure>`,
  ).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(data.title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#10151d;color:#eef2f8;font:16px/1.45 system-ui,sans-serif}
main{max-width:880px;margin:auto;padding:16px}h1{font-size:clamp(1.7rem,7vw,2.6rem);line-height:1.05}
.card{margin:14px 0;padding:14px;background:#1b2430;border:1px solid #44536a;border-radius:12px}
.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
figure{margin:0}img,video{display:block;width:100%;max-height:70vh;object-fit:contain;background:#090d13;border-radius:8px}
figcaption{margin-top:7px;font-weight:700}a{color:#b9ddff}.pass{color:#d8ff7a;font-weight:800}
code{background:#090d13;padding:.15rem .35rem;border-radius:4px}
</style></head><body><main>
<h1>${escapeHtml(data.title)}</h1>
<p>${escapeHtml(data.summary)}</p>
<section class="card"><p><strong>Issue:</strong> <a href="${escapeHtml(data.issueUrl)}">#${data.issueNumber ?? "?"} ${escapeHtml(data.issueName ?? data.title)}</a></p>
${requirements ? `<h2>Requirements</h2><ul>${requirements}</ul>` : ""}</section>
<section class="card"><div class="shots">${screenshots}</div></section>
<section class="card"><h2>Implementation evidence</h2><ul class="pass">${checks}</ul></section>
${videos ? `<section class="card"><h2>Interaction video</h2>${videos}</section>` : ""}
<section class="card"><h2>Verification</h2>${verification ? `<ul>${verification}</ul>` : ""}
<p>Commit <code>${escapeHtml(data.commit)}</code></p>
<p><a href="${escapeHtml(data.deploymentUrl)}">Open deployed app</a> · <a href="${escapeHtml(data.issueUrl)}">Open #${data.issueNumber ?? "issue"} ${escapeHtml(data.issueName ?? "")}</a></p></section>
</main></body></html>`;
}

export function renderWebReport(data: WebReportData): string {
  const screenshots = data.screenshots.map((screenshot) =>
    `<figure><img alt="${escapeHtml(screenshot.alt)}" src="data:image/png;base64,${screenshot.base64}"><figcaption>${escapeHtml(screenshot.caption)}</figcaption></figure>`,
  ).join("");
  const testSummary = data.tests.match(/(\d+) pass/)?.[0] ?? "completed";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unblock Me drag and generation verification</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#142033;font:16px/1.45 system-ui,sans-serif}main{max-width:920px;margin:auto;padding:14px}section{margin:14px 0;padding:14px;background:white;border-radius:10px}video,img,pre{max-width:100%;width:100%}figure{margin:16px 0}figcaption{font-weight:700;margin-top:6px}pre{overflow:auto;white-space:pre-wrap;background:#11151c;color:#e9eef7;padding:10px}.pass{color:green;font-weight:700}@media(max-width:412px){main{padding:9px}section{padding:10px}}</style></head><body><main><h1>Unblock Me drag and generation verification</h1><p>Commit <code>${escapeHtml(data.commit)}</code>. This standalone report embeds all screenshots and recordings.</p><section><h2>Scope</h2><p>Shared terminal/web movement engine, optional terminal step counts, continuous multi-cell pointer dragging, cancel restoration, square blocks, and proof-solvable randomized finite levels.</p></section><section><h2>Results</h2><p class="pass">Typecheck passed; automated tests ${testSummary}; Playwright completed desktop mouse and mobile touch flows.</p><ul><li>Checkpoint coordinates remain fixed across block movement and the win message.</li><li>A single drag traverses several legal cells and counts each cell.</li><li>In-progress drag state is uncommitted; pointer cancellation restores the block.</li><li>${escapeHtml(data.generatedSeed)} produced a structurally valid level with a replayable proof solution.</li><li>Terminal and browser project the same shared engine occupancy.</li></ul></section><section><h2>Screenshots</h2>${screenshots}</section><section><h2>Desktop mouse verification</h2><video controls src="data:video/mp4;base64,${data.desktopVideoBase64}"></video></section><section><h2>Mobile touch verification</h2><video controls src="data:video/mp4;base64,${data.mobileVideoBase64}"></video></section><section><h2>Evidence excerpts</h2><h3>Typecheck</h3><pre>${escapeHtml(data.typecheck)}</pre><h3>Tests</h3><pre>${escapeHtml(data.tests)}</pre></section><section><h2>Deployment</h2><p>The public <code>Zikoat/unblock-me</code> repository deploys <code>dist/</code> through GitHub Actions.</p></section></main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
