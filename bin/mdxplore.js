#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "../src/server.js";
import { VERSION } from "../src/version.js";

const HELP = `
  mdxplore — browse a directory of Markdown as HTML, rendered on demand.

  Usage
    mdxplore [directory] [options]

  Arguments
    directory            Folder to serve (default: current directory)

  Options
    -p, --port <n>       Preferred port (default: 4321, auto-bumps if taken)
    -h, --host <addr>    Bind address (default: 127.0.0.1)
        --no-open        Don't open the browser automatically
        --no-live        Disable live reload (file watching)
        --all            Show non-Markdown files in the sidebar too
    -v, --version        Print version
        --help           Show this help

  Examples
    mdxplore                 Serve the current directory
    mdxplore ./docs          Serve ./docs
    npx mdxplore ./docs -p 8080

  mdxplore never writes to the directory it serves.
`;

function parseArgs(argv) {
  const opts = {
    dir: null,
    port: 4321,
    host: "127.0.0.1",
    open: true,
    all: false,
    live: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help") return { help: true };
    else if (a === "-v" || a === "--version") return { version: true };
    else if (a === "-p" || a === "--port") opts.port = parseInt(argv[++i], 10);
    else if (a === "-h" || a === "--host") opts.host = argv[++i];
    else if (a === "--no-open") opts.open = false;
    else if (a === "--no-live") opts.live = false;
    else if (a === "--all") opts.all = true;
    else if (a.startsWith("-")) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    } else if (opts.dir === null) {
      opts.dir = a;
    }
  }
  return opts;
}

function openBrowser(url) {
  const cmd =
    process.platform === "darwin" ? "open" :
    process.platform === "win32" ? "cmd" :
    "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* opening the browser is best-effort */
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(HELP); return; }
  if (opts.version) { console.log(VERSION); return; }

  const root = path.resolve(process.cwd(), opts.dir || ".");
  let stat;
  try {
    stat = fs.statSync(root);
  } catch {
    console.error(`\n  ✗ Not found: ${root}\n`);
    process.exit(1);
  }
  if (!stat.isDirectory()) {
    console.error(`\n  ✗ Not a directory: ${root}\n`);
    process.exit(1);
  }

  const server = createServer({ root, showAll: opts.all, live: opts.live });

  // Try the requested port; bump on conflict up to +50.
  let port = Number.isFinite(opts.port) ? opts.port : 4321;
  const maxTries = 50;
  let tries = 0;

  const isLoopback = (h) =>
    h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";

  const listen = () => {
    server.listen(port, opts.host, () => {
      const url = `http://${opts.host}:${port}/`;
      const name = path.basename(root) || root;
      process.stdout.write(
        `\n  mdxplore  ·  serving \x1b[1m${name}\x1b[0m\n` +
        `  ➜  \x1b[36m${url}\x1b[0m\n` +
        `  ➜  ${root}\n\n` +
        `  Press Ctrl+C to stop.\n\n`
      );
      if (!isLoopback(opts.host)) {
        process.stdout.write(
          `  \x1b[33m⚠  Bound to ${opts.host} — this exposes ${name} to your network\n` +
          `     with no authentication. Anyone who can reach this port can read\n` +
          `     every file mdxplore serves. Use the default 127.0.0.1 unless you\n` +
          `     specifically intend to share it.\x1b[0m\n\n`
        );
      }
      if (opts.open) openBrowser(url);
    });
  };

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && tries < maxTries) {
      tries++;
      port++;
      listen();
    } else {
      console.error(`\n  ✗ ${err.message}\n`);
      process.exit(1);
    }
  });

  listen();

  const shutdown = () => {
    process.stdout.write("\n  Stopped.\n");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
