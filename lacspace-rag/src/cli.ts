import { stdout, stderr, argv, exit, env } from "node:process";
import {
  chunkText,
  embed,
  embedOne,
  chat,
  search,
  buildPrompt,
  createIndex,
  addToIndex,
  walkFiles,
  readTextFile,
  saveIndex,
  loadIndex,
  RagError,
} from "./lib.js";
import type { EmbedOptions, ChatOptions, Provider, SearchHit } from "./lib.js";

const VERSION = "0.1.0";
const DEFAULT_INDEX = "./.lacspace-rag/index.json";
const DEFAULT_BASE = "http://localhost:11434";

const useColor = !env["NO_COLOR"] && stdout.isTTY !== false;
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof C, s: string): string => (useColor ? `${C[k]}${s}${C.reset}` : s);
const log = (s = ""): void => void stderr.write(s + "\n");
const out = (s: string): void => void stdout.write(s);

interface Args {
  positional: string[];
  baseUrl: string;
  provider: Provider;
  apiKey?: string;
  model?: string;
  embedModel?: string;
  index: string;
  k: number;
  size: number;
  overlap: number;
  json: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    positional: [],
    baseUrl: DEFAULT_BASE,
    provider: "ollama",
    index: DEFAULT_INDEX,
    k: 4,
    size: 800,
    overlap: 100,
    json: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const nextVal = (): string => list[++i] ?? "";
    if (arg === "--base-url") a.baseUrl = nextVal();
    else if (arg === "--provider") {
      const v = nextVal();
      if (v !== "ollama" && v !== "openai") fail(`Unknown provider "${v}" (ollama|openai)`, false);
      a.provider = v as Provider;
    }
    else if (arg === "--api-key") a.apiKey = nextVal();
    else if (arg === "--model" || arg === "-m") a.model = nextVal();
    else if (arg === "--embed-model") a.embedModel = nextVal();
    else if (arg === "--index" || arg === "-i") a.index = nextVal();
    else if (arg === "--k" || arg === "-k") a.k = Math.max(1, Number(nextVal()) || 4);
    else if (arg === "--size") a.size = Math.max(1, Number(nextVal()) || 800);
    else if (arg === "--overlap") a.overlap = Math.max(0, Number(nextVal()) || 0);
    else if (arg === "--json") a.json = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (arg.startsWith("--") && arg.includes("=")) {
      const eq = arg.indexOf("=");
      list.splice(i + 1, 0, arg.slice(eq + 1));
      list[i] = arg.slice(0, eq);
      i--;
    } else a.positional.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-rag"))} ${c("dim", "— keyless local RAG: index docs, then query & ask, grounded")}

${c("bold", "Usage")}
  npx lacspace-rag <command> [args] [flags]

${c("bold", "Commands")}
  ${c("cyan", "index")} <path>          Walk a folder, chunk + embed every text file, save an index
  ${c("cyan", "query")} "<question>"    Embed the question and print the top-k matching chunks + scores
  ${c("cyan", "ask")}   "<question>"    Retrieve, build a grounded prompt, and print the model's answer

${c("bold", "Flags")}
      --provider <p>    ${c("dim", "ollama | openai")} (default ${c("green", "ollama")}, 100% free & local)
      --base-url <url>  API base URL (default ${c("dim", DEFAULT_BASE)})
      --model <name>    Chat model (default ${c("dim", "llama3.2")} for Ollama)
      --embed-model <n> Embedding model (default ${c("dim", "nomic-embed-text")})
      --api-key <key>   Key for OpenAI-compatible providers ${c("dim", "(or $LACSPACE_RAG_API_KEY / $OPENAI_API_KEY)")}
  -i, --index <file>    Index file (default ${c("dim", DEFAULT_INDEX)})
  -k, --k <n>           Number of chunks to retrieve (default 4)
      --size <n>        Chunk size in characters (default 800, index only)
      --overlap <n>     Chunk overlap in characters (default 100, index only)
      --json            Machine-readable JSON output
  -h, --help            Show this help
  -v, --version         Print the version

${c("bold", "Free by default")} ${c("dim", "(Ollama — no key, no cloud)")}
  ${c("dim", "curl -fsSL https://ollama.com/install.sh | sh")}
  ${c("dim", "ollama pull nomic-embed-text")}   ${c("dim", "# embeddings")}
  ${c("dim", "ollama pull llama3.2")}            ${c("dim", "# chat")}

${c("bold", "Examples")}
  npx lacspace-rag index ./docs
  npx lacspace-rag query "how do I configure the port?"
  npx lacspace-rag ask "what's the install command?" -k 6
  npx lacspace-rag ask "summarise the API" --provider openai --model gpt-4o-mini
`;

function fail(msg: string, json: boolean, extra: Record<string, unknown> = {}): never {
  if (json) out(JSON.stringify({ ok: false, error: msg, ...extra }) + "\n");
  else log(c("red", `\n✗ ${msg}\n`));
  exit(1);
}

/** Friendly, actionable message for provider/network errors. */
function reportError(err: unknown, a: Args): never {
  if (err instanceof RagError && err.code === "connection" && a.provider === "ollama") {
    if (a.json) fail(err.message, true, { code: err.code });
    log(c("red", `\n✗ ${err.message}`));
    log(c("yellow", "\nCan't reach Ollama. Is it installed and running?"));
    log(c("dim", "  1. Install:  curl -fsSL https://ollama.com/install.sh | sh"));
    log(c("dim", `  2. Pull models:  ollama pull ${a.embedModel ?? "nomic-embed-text"}  &&  ollama pull ${a.model ?? "llama3.2"}`));
    log(c("dim", "  3. Ollama serves on http://localhost:11434 by default.\n"));
    log(c("dim", "Or use a cloud provider:  --provider openai --api-key <key>\n"));
    exit(1);
  }
  const msg = err instanceof Error ? err.message : String(err);
  const code = err instanceof RagError ? err.code : "error";
  fail(msg, a.json, { code });
}

function resolveApiKey(a: Args): string | undefined {
  return a.apiKey ?? env["LACSPACE_RAG_API_KEY"] ?? env["OPENAI_API_KEY"];
}

function embedOpts(a: Args): EmbedOptions {
  const o: EmbedOptions = { provider: a.provider, baseUrl: a.baseUrl };
  if (a.embedModel) o.model = a.embedModel;
  const key = resolveApiKey(a);
  if (key) o.apiKey = key;
  return o;
}

function chatOpts(a: Args): ChatOptions {
  const o: ChatOptions = { provider: a.provider, baseUrl: a.baseUrl };
  if (a.model) o.model = a.model;
  const key = resolveApiKey(a);
  if (key) o.apiKey = key;
  return o;
}

// --- commands --------------------------------------------------------------

async function cmdIndex(a: Args): Promise<void> {
  const path = a.positional[1];
  if (!path) fail("index needs a path: lacspace-rag index <folder>", a.json);

  let files;
  try { files = walkFiles(path!); }
  catch (err) { reportError(err, a); }

  if (files!.length === 0) fail(`No indexable text files found under "${path}"`, a.json);

  if (!a.json) log(`\n${c("bold", c("magenta", "◆ lacspace-rag index"))} ${c("dim", `· ${files!.length} file${files!.length === 1 ? "" : "s"}`)}\n`);

  const embedModel = a.embedModel ?? (a.provider === "openai" ? "text-embedding-3-small" : "nomic-embed-text");
  const index = createIndex(a.provider, embedModel);
  let totalChunks = 0;

  for (const file of files!) {
    let text: string;
    try { text = readTextFile(file.path); } catch { continue; }
    const parts = chunkText(text, { size: a.size, overlap: a.overlap });
    if (parts.length === 0) continue;
    let vectors: number[][];
    try { vectors = await embed(parts, embedOpts(a)); }
    catch (err) { reportError(err, a); }
    addToIndex(index, parts!.map((chunkTextValue, i) => ({
      id: `${file.rel}#${i}`,
      text: chunkTextValue,
      source: file.rel,
      vector: vectors![i]!,
    })));
    totalChunks += parts.length;
    if (!a.json) log(`  ${c("green", "✓")} ${c("cyan", file.rel)} ${c("dim", `· ${parts.length} chunk${parts.length === 1 ? "" : "s"}`)}`);
  }

  try { saveIndex(a.index, index); }
  catch (err) { reportError(err, a); }

  if (a.json) {
    out(JSON.stringify({
      ok: true,
      files: files!.length,
      chunks: totalChunks,
      dimension: index.dimension,
      provider: a.provider,
      embedModel,
      index: a.index,
    }) + "\n");
  } else {
    log(`\n${c("green", "✓ indexed")} ${c("dim", `· ${totalChunks} chunks · dim ${index.dimension} · ${embedModel}`)}`);
    log(c("dim", `  saved to ${a.index}\n`));
  }
}

async function cmdQuery(a: Args): Promise<void> {
  const question = a.positional[1];
  if (!question) fail('query needs a question: lacspace-rag query "<question>"', a.json);

  let index;
  try { index = loadIndex(a.index); } catch (err) { reportError(err, a); }

  let qvec: number[];
  try { qvec = await embedOne(question!, embedOpts(a)); } catch (err) { reportError(err, a); }

  const hits = search(index!, qvec!, a.k);

  if (a.json) {
    out(JSON.stringify({
      ok: true,
      question,
      k: a.k,
      hits: hits.map((h) => ({ score: h.score, source: h.chunk.source, id: h.chunk.id, text: h.chunk.text })),
    }) + "\n");
    return;
  }
  log(`\n${c("bold", c("magenta", "◆ lacspace-rag query"))} ${c("dim", `· top ${hits.length}`)}\n`);
  if (hits.length === 0) { log(c("yellow", "  (no chunks in the index)\n")); return; }
  hits.forEach((h, i) => {
    log(`${c("cyan", `[${i + 1}]`)} ${c("green", h.score.toFixed(4))} ${c("dim", h.chunk.source)}`);
    log(`    ${preview(h.chunk.text)}\n`);
  });
}

async function cmdAsk(a: Args): Promise<void> {
  const question = a.positional[1];
  if (!question) fail('ask needs a question: lacspace-rag ask "<question>"', a.json);

  let index;
  try { index = loadIndex(a.index); } catch (err) { reportError(err, a); }

  let qvec: number[];
  try { qvec = await embedOne(question!, embedOpts(a)); } catch (err) { reportError(err, a); }

  const hits = search(index!, qvec!, a.k);
  const messages = buildPrompt(question!, hits);

  let answer: string;
  try { answer = await chat(messages, chatOpts(a)); } catch (err) { reportError(err, a); }

  const sources = uniqueSources(hits);
  if (a.json) {
    out(JSON.stringify({
      ok: true,
      question,
      answer: answer!.trim(),
      sources,
      hits: hits.map((h) => ({ score: h.score, source: h.chunk.source, id: h.chunk.id })),
    }) + "\n");
    return;
  }
  log(`\n${c("bold", c("magenta", "◆ lacspace-rag ask"))}\n`);
  out(answer!.trim() + "\n");
  if (sources.length > 0) {
    log(`\n${c("bold", "Sources")}`);
    for (const s of sources) log(`  ${c("dim", "•")} ${c("cyan", s)}`);
  }
  log("");
}

function uniqueSources(hits: SearchHit[]): string[] {
  const seen = new Set<string>();
  const out2: string[] = [];
  for (const h of hits) {
    if (!seen.has(h.chunk.source)) { seen.add(h.chunk.source); out2.push(h.chunk.source); }
  }
  return out2;
}

function preview(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return c("dim", oneLine.length > 160 ? oneLine.slice(0, 157) + "…" : oneLine);
}

// --- dispatch --------------------------------------------------------------

const COMMANDS = new Set(["index", "query", "ask"]);

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.version) { out(VERSION + "\n"); return; }
  const cmd = args.positional[0];
  if (args.help || !cmd || !COMMANDS.has(cmd)) {
    if (cmd && !COMMANDS.has(cmd)) { log(c("red", `\n✗ Unknown command "${cmd}"`)); }
    out(HELP + "\n");
    if (cmd && !COMMANDS.has(cmd)) exit(1);
    return;
  }
  switch (cmd) {
    case "index": await cmdIndex(args); return;
    case "query": await cmdQuery(args); return;
    case "ask": await cmdAsk(args); return;
  }
}

main().catch((err) => {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
});
