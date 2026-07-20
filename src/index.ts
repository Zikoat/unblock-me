import { runCli } from "./cli";

try {
  process.exitCode = await runCli(process.stdin, process.stdout);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
