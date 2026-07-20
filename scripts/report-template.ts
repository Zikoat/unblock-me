export type EvidenceStatus = "Passed" | "Failed" | "Unavailable";
export type EvidenceSet = Record<"typecheck" | "tests" | "tmux", {
  output: string;
  status: EvidenceStatus;
}>;

export interface TimingEvidence {
  captureSpanMs: number;
  commandPauseCaptureDeltasMs: number[];
  initialHoldMs: number;
  interCharacterCaptureDeltasMs: number[];
  interCharacterSendDeltasMs: number[];
  winningHoldMs: number;
}

export interface ReportTemplateData {
  bunVersion: string;
  evidence: EvidenceSet;
  gitCommit: string;
  paneCommand: string;
  repositoryWslPath: string;
  runId: string;
  solution: string[];
  terminalTranscript: string;
  timing: TimingEvidence;
  tmuxCommandSequence: string;
  tmuxVersion: string;
  videoBase64: string;
  videoBytes: number;
  videoDurationSeconds: number;
  workingDirectory: string;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]!);

const pre = (value: string): string => `<pre>${escapeHtml(value || "No output captured.")}</pre>`;

function statistics(values: number[]): string {
  if (values.length === 0) return "no samples";
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const percentile95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
  return `n=${values.length}, min=${sorted[0].toFixed(1)} ms, mean=${mean.toFixed(1)} ms, p95=${percentile95.toFixed(1)} ms, max=${sorted.at(-1)!.toFixed(1)} ms`;
}

export function renderReport(data: ReportTemplateData): string {
  const evidenceRow = (name: string, value: { output: string; status: EvidenceStatus }): string =>
    `<tr><td>${escapeHtml(name)}</td><td class="${value.status.toLowerCase()}">${value.status}</td><td>${pre(value.output)}</td></tr>`;
  const solution = data.solution.map((command) => `<li><code>${escapeHtml(command)}</code></li>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Unblock Me terminal MVP verification</title>
  <style>
    * { box-sizing:border-box }
    body { margin:0; overflow-x:hidden; color:#142033; background:#f5f7fb; font:16px/1.45 system-ui,sans-serif }
    main,section,table,pre,video { max-width:100%; min-width:0 }
    main { width:min(100%,900px); margin:auto; padding:14px }
    section { margin:14px 0; padding:14px; border-radius:8px; background:white }
    section,code,td,th,pre { overflow-wrap:anywhere }
    table { border-collapse:collapse; table-layout:fixed; width:100% }
    td,th { padding:8px; border:1px solid #ccd4e0; vertical-align:top; text-align:left }
    pre { padding:10px; overflow-x:auto; white-space:pre-wrap; background:#090d14; color:#d8f6e5 }
    video { display:block; width:100%; max-width:100%; height:auto }
    .passed { color:green } .failed { color:red } .unavailable { color:#9a6000 }
    @media (max-width: 412px) { main { padding:10px } section { padding:8px } table { font-size:.85rem } }
  </style>
</head>
<body>
<main>
  <h1>Unblock Me terminal MVP verification</h1>
  <p>Run <code>${escapeHtml(data.runId)}</code>, commit <code>${escapeHtml(data.gitCommit)}</code></p>

  <section>
    <h2>Request and scope</h2>
    <p>This capture verifies the first finite, terminal-playable Unblock Me milestone.</p>
    <h3>Approved scope</h3>
    <ul>
      <li>One hard-coded, solvable puzzle on a 7×5 board.</li>
      <li>Axis-locked rectangular blocks, Walls, a two-cell Red Block, and a two-cell Checkpoint.</li>
      <li>One-cell atomic moves through a long-running, line-oriented stdin/stdout command interface.</li>
      <li>In-memory state, move counting, specific invalid-move feedback, terminal win state, automated tests, a real tmux playthrough, and this embedded-video report.</li>
    </ul>
    <h3>Deferred scope</h3>
    <p>Cursor selection, raw keyboard controls, mouse, touch, web UI, persistence, puzzle loading, puzzle generation, and every Infinite World mechanic remain deferred.</p>
  </section>

  <section>
    <h2>Start command and architecture</h2>
    <p>Windows working directory: <code>${escapeHtml(data.workingDirectory)}</code></p>
    <p>WSL working directory: <code>${escapeHtml(data.repositoryWslPath)}</code></p>
    ${pre("bun run start")}
    <p><strong>Pure rules engine:</strong> <code>src/game.ts</code> owns immutable state transitions, while <code>src/puzzle.ts</code> creates the fixed puzzle. The parser, renderer, and readline CLI form a thin terminal adapter; the rules engine performs no terminal I/O.</p>
    <p><strong>Puzzle:</strong> the left 5×5 area opens into a two-cell exit corridor. The horizontal Red Block starts at row three, vertical blocks A and B obstruct its path, and both Red cells must fully occupy the Checkpoint to win.</p>
    <p>Known seven-move solution:</p><ol>${solution}</ol>
  </section>

  <section>
    <h2>Verification evidence</h2>
    <table>
      <tr><th>Check</th><th>Result</th><th>Evidence</th></tr>
      ${evidenceRow("Typecheck", data.evidence.typecheck)}
      ${evidenceRow("Automated tests", data.evidence.tests)}
      <tr><td>Bun runtime</td><td class="passed">Passed</td><td>${escapeHtml(data.bunVersion)}</td></tr>
      ${evidenceRow("tmux playthrough", data.evidence.tmux)}
      <tr><td>Video</td><td class="passed">Passed</td><td>H.264/yuv420p; ${data.videoDurationSeconds.toFixed(2)} seconds encoded from measured frame intervals; ${data.videoBytes} bytes.</td></tr>
    </table>
  </section>

  <section>
    <h2>Actual tmux verification and interaction sequence</h2>
    <p>The pane command was exactly:</p>${pre(data.paneCommand)}
    <p>The verifier used one persistent WSL-side worker, monotonic key deadlines, and this tmux command sequence:</p>
    ${pre(data.tmuxCommandSequence)}
  </section>

  <section>
    <h2>Human-speed tmux interaction</h2>
    <p>Clock: CLOCK_MONOTONIC. Initial hold: ${data.timing.initialHoldMs.toFixed(1)} ms. Winning hold: ${data.timing.winningHoldMs.toFixed(1)} ms. Observed capture span: ${data.timing.captureSpanMs.toFixed(1)} ms.</p>
    <ul>
      <li>Inter-character send deltas: ${statistics(data.timing.interCharacterSendDeltasMs)}</li>
      <li>Inter-character capture deltas: ${statistics(data.timing.interCharacterCaptureDeltasMs)}</li>
      <li>Post-command capture pauses: ${statistics(data.timing.commandPauseCaptureDeltasMs)}</li>
    </ul>
    <p>25fps CFR timing is rounded cumulatively to one video frame (40ms); the MP4 duration is validated against the sum of the observed frame intervals.</p>
    <video controls src="data:video/mp4;base64,${data.videoBase64}"></video>
  </section>

  <section><h2>tmux transcript</h2>${pre(data.terminalTranscript)}</section>

  <section>
    <h2>Deployment status</h2>
    <p>At capture time, publication to a private GitHub Release was pending. This statement records capture-time status and remains accurate if the asset is uploaded later.</p>
  </section>

  <section>
    <h2>Limitations</h2>
    <p>This report covers only the finite terminal puzzle. A live 412px rendered overflow check and physical Android download, rendering, seeking, and playback remain pending human verification.</p>
  </section>

  <section>
    <h2>Android phone verification</h2>
    <ol>
      <li>Sign in to GitHub on Android with an account authorized for the private repository.</li>
      <li>Open the private repository release page supplied with the handoff, expand its Assets, and download <code>terminal-mvp-verification.html</code>.</li>
      <li>Open Android Files or Downloads, tap the downloaded file, and choose Chrome or an HTML-capable viewer. If Chrome does not appear, use “Open with” and select an installed HTML viewer.</li>
      <li>Confirm the page reflows without horizontal page scrolling, then play, pause, and seek the embedded video through the winning frame.</li>
    </ol>
    <p><strong>Pending human verification.</strong></p>
  </section>
</main>
</body>
</html>`;
}
