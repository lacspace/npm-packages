/**
 * The stdio transport: JSON-RPC messages, one per line, on stdin/stdout.
 * Nothing but protocol goes to stdout; diagnostics go to stderr.
 */
import type { Readable, Writable } from "node:stream";
import { LineDecoder, encode } from "./jsonrpc";
import type { McpServer } from "./server";

export interface StdioOptions {
  input?: Readable;
  output?: Writable;
}

/** Serve until the input stream ends. Resolves when it does. */
export function serveStdio(server: McpServer, opts: StdioOptions = {}): Promise<void> {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const decoder = new LineDecoder();
  let pending = 0;
  let ended = false;

  return new Promise((resolve) => {
    const finishIfDone = () => {
      if (ended && pending === 0) resolve();
    };
    const answer = (line: string) => {
      pending++;
      server
        .handleLine(line)
        .then((response) => {
          if (response !== undefined) output.write(encode(response));
        })
        .catch((err) => {
          process.stderr.write(`lacspace-mcp: unhandled ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
        })
        .finally(() => {
          pending--;
          finishIfDone();
        });
    };
    input.setEncoding("utf8");
    input.on("data", (chunk: string) => {
      for (const line of decoder.push(chunk)) answer(line);
    });
    input.on("end", () => {
      const rest = decoder.flush();
      if (rest) answer(rest);
      ended = true;
      finishIfDone();
    });
    input.on("error", () => {
      ended = true;
      finishIfDone();
    });
  });
}
