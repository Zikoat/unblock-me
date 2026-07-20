import { runCli } from "./cli";

export function formatFatalError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const firstLine = rawMessage.split(/\r?\n/, 1)[0].trim();
  const message = (firstLine || "Unexpected internal failure")
    .replace(/[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]+/g, "<path>")
    .replace(/\/(?:[^/\s]+\/)+[^/\s]+/g, "<path>");
  return `Fatal: ${message}`;
}

export async function runEntrypoint(
  run: () => Promise<number>,
  writeError: (message: string) => void,
): Promise<number> {
  try {
    return await run();
  } catch (error) {
    writeError(formatFatalError(error));
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runEntrypoint(
    () => runCli(process.stdin, process.stdout),
    (message) => console.error(message),
  );
}
