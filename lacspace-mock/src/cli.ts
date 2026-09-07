import { stdout, stderr, argv, exit, env } from "node:process";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { start } from "./server.js";
import type { HandlerOptions, MountedRoute } from "./server.js";
import { loadDb, loadConfig, loadOpenApi, readJson } from "./config.js";
import type { Db } from "./db.js";
import type { Cassette, ProxyConfig } from "./proxy.js";

const VERSION = "0.2.0";

const useColor = !env["NO_COLOR"] && stdout.isTTY !== false;
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof C, s: string): string => (useColor ? `${C[k]}${s}${C.reset}` : s);
const log = (s = ""): void => void stderr.write(s + "\n");

interface Args {
  db?: string;
  config?: string;
  openapi?: string;
  port?: number;
  host?: string;
  delay?: number | [number, number];
  errorRate?: number;
  errorStatuses?: number[];
  proxy?: string;
  record: boolean;
  replay: boolean;
  recordings?: string;
  cors: boolean;
  write: boolean;
  seed?: string;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

function parseDelay(raw: string): number | [number, number] {
  const m = raw.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) return [Number(m[1]), Number(m[2])];
  return Number(raw);
}

function parseArgs(list: string[]): Args {
  const a: Args = { cors: true, write: false, record: false, replay: false, quiet: false, help: false, version: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const nextVal = (): string => list[++i] ?? "";
    if (arg === "--db" || arg === "-d") a.db = nextVal();
    else if (arg === "--config" || arg === "-c") a.config = nextVal();
    else if (arg === "--openapi" || arg === "-o") a.openapi = nextVal();
    else if (arg === "--port" || arg === "-p") a.port = Number(nextVal());
    else if (arg === "--host") a.host = nextVal();
    else if (arg === "--delay") a.delay = parseDelay(nextVal());
    else if (arg === "--error-rate" || arg === "-e") a.errorRate = Number(nextVal());
    else if (arg === "--error-statuses") a.errorStatuses = nextVal().split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    else if (arg === "--proxy") a.proxy = nextVal();
    else if (arg === "--record") a.record = true;
    else if (arg === "--replay") a.replay = true;
    else if (arg === "--recordings") a.recordings = nextVal();
    else if (arg === "--no-cors") a.cors = false;
    else if (arg === "--write" || arg === "-w") a.write = true;
    else if (arg === "--seed") a.seed = nextVal();
    else if (arg === "--quiet" || arg === "-q") a.quiet = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-") && !a.db && !a.config) a.db = arg; // bare path = db
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-mock"))} ${c("dim", "— a keyless local mock REST + GraphQL API server")}

${c("bold", "Usage")}
  npx lacspace-mock --db db.json [options]
  npx lacspace-mock --config mock.config.json [options]
  npx lacspace-mock --openapi openapi.json [options]
  npx lacspace-mock --proxy https://api.example.com --record [options]
  npx lacspace-mock db.json                 ${c("dim", "# bare path = --db")}

${c("bold", "Options")}
  -d, --db <file>          JSON db (json-server shape: { users:[…], posts:[…] })
  -c, --config <file>      mock.config.json (custom routes + db + options)
  -o, --openapi <file>     Import routes + example responses from an OpenAPI 3 spec
  -p, --port <n>           Port to listen on (default 4000)
      --host <addr>        Bind address (default 127.0.0.1 — local only)
      --delay <ms|a-b>     Delay every response by ms (or a random ms in [a,b])
  -e, --error-rate <p>     Randomly fail p (0..1) of responses (chaos)
      --error-statuses <l> Comma list of chaos statuses to pick from (default 500)
      --proxy <url>        Forward unknown routes to an upstream (record & replay)
      --record             Proxy: hit upstream and save responses to --recordings
      --replay             Proxy: serve only from --recordings (offline)
      --recordings <file>  Cassette file for --proxy record/replay
      --no-cors            Disable the permissive CORS headers (on by default)
  -w, --write              Persist CRUD mutations back to the --db file
      --seed <str>         Seed the {{fake.*}} generator (stable data)
  -q, --quiet              Do not log each request
  -h, --help               Show this help
  -v, --version            Print the version

${c("bold", "Auto REST routes (per db collection, e.g. users)")}
  ${c("dim", "GET    /users            list (+ ?_page &_limit &_sort &_order & filters & q)")}
  ${c("dim", "GET    /users/:id        one (404 if missing)")}
  ${c("dim", "POST   /users            create (assigns id, 201 + Location)")}
  ${c("dim", "PUT    /users/:id        replace   ·   PATCH /users/:id  merge")}
  ${c("dim", "DELETE /users/:id        remove")}
  ${c("dim", "POST   /graphql          minimal GraphQL over the collections")}

${c("bold", "List query params")}
  ${c("dim", "?role=admin        ?age_gte=18&age_lte=30      ?name_like=al")}
  ${c("dim", "?q=text            ?_sort=age,name&_order=desc  ?_page=2&_limit=10")}

${c("bold", "Examples")}
  npx lacspace-mock --db db.json --port 4000
  npx lacspace-mock db.json --delay 200 --error-rate 0.1     ${c("dim", "# slow + flaky")}
  npx lacspace-mock db.json --error-rate 0.2 --error-statuses 429,503
  npx lacspace-mock --openapi openapi.json                   ${c("dim", "# mock straight from a spec")}
  npx lacspace-mock --db db.json --proxy https://api.example.com --record --recordings tape.json
  npx lacspace-mock --proxy https://api.example.com --replay --recordings tape.json  ${c("dim", "# offline")}
  npx lacspace-mock --config mock.config.json --write
  curl localhost:4000/users?role=admin
  curl -X POST localhost:4000/posts -d '{"title":"hi"}' -H content-type:application/json
  curl -X POST localhost:4000/graphql -d '{"query":"{ users { id name } }"}'
`;

function banner(url: string, mounted: MountedRoute[], args: Args): void {
  log(`\n${c("bold", c("magenta", "◆ lacspace-mock"))} ${c("dim", "— serving")}`);
  log(`  ${c("green", "▶")} ${c("bold", url)}`);
  if (args.delay !== undefined) {
    const d = Array.isArray(args.delay) ? `${args.delay[0]}-${args.delay[1]}ms` : `${args.delay}ms`;
    log(`  ${c("yellow", "◷")} ${c("dim", `delay ${d}`)}`);
  }
  if (args.errorRate) {
    const pool = args.errorStatuses?.length ? args.errorStatuses.join("/") : "500";
    log(`  ${c("red", "⚡")} ${c("dim", `chaos: ${Math.round(args.errorRate * 100)}% of responses fail (${pool})`)}`);
  }
  if (args.proxy) {
    const mode = args.replay ? "replay" : args.record ? "record" : "auto";
    log(`  ${c("magenta", "⇄")} ${c("dim", `proxy [${mode}] → ${args.proxy}${args.recordings ? ` (tape: ${args.recordings})` : ""}`)}`);
  }
  if (args.write) log(`  ${c("cyan", "▤")} ${c("dim", `persisting mutations → ${args.db}`)}`);
  if (!args.cors) log(`  ${c("dim", "CORS disabled")}`);
  const custom = mounted.filter((m) => m.kind === "custom");
  const crud = mounted.filter((m) => m.kind !== "custom");
  if (custom.length) {
    log(`\n  ${c("bold", "Custom routes")}`);
    for (const m of custom) log(`    ${c("cyan", m.method.padEnd(18))} ${m.path}`);
  }
  if (crud.length) {
    log(`\n  ${c("bold", "Auto routes")}`);
    for (const m of crud) log(`    ${c("cyan", m.method.padEnd(24))} ${m.path}`);
  }
  log(c("dim", "\n  Ctrl-C to stop.\n"));
}

function statusColor(status: number): keyof typeof C {
  if (status >= 500) return "red";
  if (status >= 400) return "yellow";
  if (status >= 300) return "cyan";
  return "green";
}

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(VERSION + "\n"); return; }
  if (args.help || (!args.db && !args.config && !args.openapi && !args.proxy)) { stdout.write(HELP + "\n"); return; }

  // Build the config from --config and/or --db (flags override the file).
  let opts: HandlerOptions = { cors: args.cors };
  let filePort: number | undefined;
  let fileHost: string | undefined;
  let dbPath: string | undefined = args.db;

  if (args.config) {
    const { config, port, host } = loadConfig(args.config);
    opts = { ...config, cors: args.cors };
    filePort = port;
    fileHost = host;
  }
  if (args.openapi) {
    opts.routes = [...(opts.routes ?? []), ...loadOpenApi(args.openapi).routes];
  }
  if (args.db) {
    opts.db = loadDb(args.db);
  }
  if (args.delay !== undefined) opts.delay = args.delay;
  if (args.errorRate !== undefined) opts.errorRate = args.errorRate;
  if (args.errorStatuses !== undefined) opts.errorStatuses = args.errorStatuses;
  if (args.seed !== undefined) opts.seed = args.seed;

  // Record-and-replay proxy for unknown routes.
  if (args.proxy) {
    const mode = args.replay ? "replay" : args.record ? "record" : "auto";
    const tapePath = args.recordings ? resolve(args.recordings) : undefined;
    let recordings: Cassette | undefined;
    if (tapePath && existsSync(tapePath)) recordings = readJson(tapePath) as Cassette;
    const proxy: ProxyConfig = { target: args.proxy, mode };
    if (recordings) proxy.recordings = recordings;
    if (tapePath && (mode === "record" || mode === "auto")) {
      proxy.onRecord = (cassette): void => {
        try {
          writeFileSync(tapePath, JSON.stringify(cassette, null, 2) + "\n");
        } catch (err) {
          log(c("red", `  ✗ could not persist recordings to ${args.recordings}: ${(err as Error).message}`));
        }
      };
    }
    opts.proxy = proxy;
  }

  // Persist mutations back to the db file when --write.
  if (args.write) {
    if (!dbPath) throw new Error("--write needs a --db file to write back to");
    const target = resolve(dbPath);
    opts.onChange = (db: Db): void => {
      try {
        writeFileSync(target, JSON.stringify(db, null, 2) + "\n");
      } catch (err) {
        log(c("red", `  ✗ could not persist to ${dbPath}: ${(err as Error).message}`));
      }
    };
  }

  if (!args.quiet) {
    opts.logger = ({ method, path, status, ms }): void => {
      const st = c(statusColor(status), String(status));
      log(`  ${c("dim", new Date().toISOString().slice(11, 19))} ${c("bold", method.padEnd(6))} ${path} ${st} ${c("dim", `${ms}ms`)}`);
    };
  }

  const port = args.port ?? filePort ?? 4000;
  const host = args.host ?? fileHost ?? "127.0.0.1";

  let running;
  try {
    running = await start({ ...opts, port, host });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EADDRINUSE") log(c("red", `\n✗ Port ${port} is already in use. Try --port <other>.\n`));
    else log(c("red", `\n✗ ${e.message}\n`));
    exit(1);
    return;
  }

  banner(running.url, running.server ? mountedFrom(opts) : [], args);

  const shutdown = (): void => {
    log(c("dim", "\n  stopping…\n"));
    void running.close().then(() => exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

// Recompute the mounted-routes list for the banner (engine is internal to start()).
function mountedFrom(opts: HandlerOptions): MountedRoute[] {
  const out: MountedRoute[] = [];
  for (const r of opts.routes ?? []) out.push({ method: (r.method ?? "ANY").toUpperCase(), path: r.path, kind: "custom" });
  if (opts.db) {
    for (const name of Object.keys(opts.db).filter((k) => Array.isArray((opts.db as Record<string, unknown>)[k]))) {
      out.push({ method: "GET|POST", path: `/${name}`, kind: "crud" });
      out.push({ method: "GET|PUT|PATCH|DELETE", path: `/${name}/:id`, kind: "crud" });
    }
    out.push({ method: "POST", path: "/graphql", kind: "graphql" });
  }
  return out;
}

main().catch((err) => {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
});
