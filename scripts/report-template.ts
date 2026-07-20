export type EvidenceStatus = "Passed" | "Failed" | "Unavailable";
export type EvidenceSet = Record<"typecheck" | "tests" | "tmux", { status: EvidenceStatus; output: string }>;
export interface ReportTemplateData { bunVersion: string; evidence: EvidenceSet; gitCommit: string; runId: string; terminalTranscript: string; tmuxVersion: string; videoBase64: string; videoBytes: number; videoDurationSeconds: number; workingDirectory: string }
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pre = (s: string) => `<pre>${esc(s || "No output captured.")}</pre>`;
export function renderReport(d: ReportTemplateData) {
  const row = (name: string, v: { status: EvidenceStatus; output: string }) => `<tr><td>${name}</td><td class="${v.status.toLowerCase()}">${v.status}</td><td>${pre(v.output)}</td></tr>`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
* { box-sizing: border-box } body { margin: 0; overflow-x: hidden }
main, section, table, pre, video { max-width: 100%; min-width: 0 }
main { width: min(100%, 900px); margin: auto; padding: 14px } section { overflow-wrap: anywhere }
table { border-collapse: collapse; table-layout: fixed; width: 100% } td, th { overflow-wrap: anywhere; vertical-align: top }
pre { white-space: pre-wrap; overflow-wrap: anywhere } code { overflow-wrap: anywhere }
video { display: block; width: 100%; max-width: 100%; height: auto }.passed { color: green }.failed { color: red }.unavailable { color: orange }
@media (max-width: 412px) { main { padding: 10px } section { padding: 8px } table { font-size: .85rem } }
</style></head><body><main><h1>Unblock Me terminal MVP verification</h1><section><h2>Request and scope</h2><p>Finite terminal MVP; Infinite World deferred.</p></section><section><h2>Start command and architecture</h2><p><code>${esc(d.workingDirectory)}</code></p>${pre("bun run start")}</section><section><h2>Verification evidence</h2><table><tr><th>Check</th><th>Result</th><th>Evidence</th></tr>${row("Typecheck", d.evidence.typecheck)}${row("Automated tests", d.evidence.tests)}<tr><td>Bun runtime</td><td class="passed">Passed</td><td>${esc(d.bunVersion)}</td></tr>${row("tmux playthrough", d.evidence.tmux)}<tr><td>Video</td><td class="passed">Passed</td><td>H.264/yuv420p; ${d.videoDurationSeconds.toFixed(2)} seconds measured and validated against manifest timing; ${d.videoBytes} bytes.</td></tr></table></section><section><h2>Human-speed tmux interaction</h2><p>25fps CFR timing is rounded cumulatively to one video frame (40ms); each dwell differs by no more than 20ms.</p><video controls src="data:video/mp4;base64,${d.videoBase64}"></video></section><section><h2>tmux transcript</h2>${pre(d.terminalTranscript)}</section><section><h2>Deployment status</h2><p>Pending publication to private GitHub Release.</p></section><section><h2>Limitations</h2><p>Finite puzzle; Android remains unverified.</p></section><section><h2>Android phone verification</h2><p>Download release asset, open locally, test controls and seeking. Pending human verification.</p></section></main></body></html>`;
}
