import { expect, test } from "bun:test";
import { Readable, Writable } from "node:stream";
import { runCli } from "../src/cli";

class OutputCollector extends Writable {
  text = "";

  _write(chunk: Uint8Array, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.text += Buffer.from(chunk).toString();
    callback();
  }
}

async function play(lines: readonly string[]) {
  const output = new OutputCollector();
  const exitCode = await runCli(Readable.from(lines.map((line) => `${line}\n`)), output);
  return { exitCode, output: output.text };
}

test("prints the title, instructions, and initial frame on startup", async () => {
  const { exitCode, output } = await play([]);

  expect(exitCode).toBe(0);
  expect(output).toStartWith("Unblock Me\n\nEnter <block-id> <direction> [steps] (left, right, up, down), help, or quit.\n\n. . . . . # #");
  expect(output).toContain("moves=0 won=false");
});

test("keeps the current state after invalid input", async () => {
  const { output } = await play(["A up", "nonsense", "quit"]);

  expect(output).toEndWith(
    "Enter a block and direction, or help or quit.\n\n" +
      ". . A . . # #\n" +
      ". . A . . # #\n" +
      "R R . . B * *\n" +
      ". . . . B # #\n" +
      ". . . . . # #\n\n" +
      "Legend: R/A/B=blocks #=Wall *=Checkpoint .=empty\n" +
      "moves=1 won=false\n",
  );
});

test("prints instructions and the shared legend for help", async () => {
  const { exitCode, output } = await play(["help", "quit"]);

  expect(exitCode).toBe(0);
  expect(output.match(/Enter <block-id> <direction> \[steps\] \(left, right, up, down\), help, or quit\./g)).toHaveLength(2);
  expect(output.match(/Legend: R\/A\/B=blocks #=Wall \*=Checkpoint \.=empty/g)).toHaveLength(2);
});

test("returns zero for quit and EOF", async () => {
  expect((await play(["quit"])).exitCode).toBe(0);
  expect((await play([])).exitCode).toBe(0);
});

test("renders the winning frame after the known solution", async () => {
  const { exitCode, output } = await play(["A up", "B down", "R right", "R right", "R right", "R right", "R right"]);

  expect(exitCode).toBe(0);
  expect(output).toContain("moves=7 won=true");
  expect(output).toContain("YOU WIN");
});

test("moves multiple cells and reports a partial request", async () => {
  const { output } = await play(["A up", "B down", "R right 9"]);

  expect(output).toContain("Moved 5 of 9 cells before already won.");
  expect(output).toContain("moves=7 won=true");
});

test("the start script accepts the known solution on stdin", async () => {
  const child = Bun.spawn(["bun", "run", "start"], {
    cwd: import.meta.dir + "/..",
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  child.stdin.write("A up\nB down\nR right\nR right\nR right\nR right\nR right\n");
  child.stdin.end();

  const [exitCode, stdout] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
  ]);

  expect(exitCode).toBe(0);
  expect(stdout).toContain("moves=7 won=true");
  expect(stdout).toContain("YOU WIN");
});

test("the start script exits after winning while stdin remains open", async () => {
  const child = Bun.spawn(["bun", "run", "start"], {
    cwd: import.meta.dir + "/..",
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  child.stdin.write("A up\nB down\nR right\nR right\nR right\nR right\nR right\n");

  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  const exitCode = await Promise.race([
    child.exited,
    Bun.sleep(2000).then(() => null),
  ]);
  const timedOut = exitCode === null;
  if (timedOut) {
    child.kill();
    await child.exited;
  }
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (timedOut) throw new Error(`start process did not exit within 2000ms; stderr: ${stderr}`);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("moves=7 won=true");
  expect(stdout).toContain("YOU WIN");
});
