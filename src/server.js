import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { renderMarkdown, isMarkdown, VIEW_PREFIX, RAW_PREFIX } from "./render.js";
import { buildTree, countMarkdown, findDefaultDoc, flattenMarkdown } from "./tree.js";
import { renderSidebar, renderShell, renderEmptyState, renderBreadcrumbs } from "./html.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_PKG = path.join(__dirname, "..");
const ASSET_DIR = path.join(ROOT_PKG, "assets");
const require = createRequire(import.meta.url);

// Locate the mermaid browser bundle. Resolve it through the module system
// first (works regardless of how npm hoists the dependency), then fall back
// to the local node_modules path and finally a vendored copy in assets/.
function mermaidBundlePath() {
  try {
    return require.resolve("mermaid/dist/mermaid.min.js");
  } catch { /* not resolvable — try filesystem fallbacks */ }
  const candidates = [
    path.join(ROOT_PKG, "node_modules", "mermaid", "dist", "mermaid.min.js"),
    path.join(ASSET_DIR, "mermaid.min.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[candidates.length - 1];
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function mimeFor(p) {
  return MIME[path.extname(p).toLowerCase()] || "application/octet-stream";
}

// Applied to raw file responses. If a served file happens to be HTML, opening
// it directly must not run scripts in mdth's origin (it could then read the
// whole served tree via /raw/ and exfiltrate it). Images/PDF/video/text are
// unaffected — they don't need scripts.
const RAW_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "script-src 'none'; object-src 'none'; base-uri 'none'",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    // Baseline hardening on every response. These directives don't affect
    // mdth's own inline theme script or mermaid (which needs eval), so they're
    // safe to apply globally; sanitisation in render.js is the primary XSS
    // defence, this is defence in depth.
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    ...headers,
  });
  res.end(body);
}

/**
 * Resolve a URL-decoded, root-relative path to an absolute path inside root.
 * Returns null on traversal attempts or if the path escapes root.
 *
 * Containment is checked twice: lexically (blocks `../`) and, crucially, after
 * resolving symlinks with realpath — otherwise a symlink inside the served
 * directory pointing outside it (e.g. `leak -> /etc/passwd`) would be followed
 * and its target disclosed. Async because realpath touches the filesystem.
 */
async function safeResolve(root, relRaw) {
  let rel;
  try {
    rel = decodeURIComponent(relRaw);
  } catch {
    return null;
  }
  rel = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  const abs = path.resolve(root, rel);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) return null; // lexical guard

  let realRoot;
  try {
    realRoot = await fsp.realpath(root);
  } catch {
    return null;
  }
  let real;
  try {
    real = await fsp.realpath(abs);
  } catch (err) {
    // Path (or a symlink target) doesn't exist: let the caller produce its own
    // 404 for a genuinely missing file, but reject broken/dangling symlinks.
    if (err && err.code === "ENOENT") return abs;
    return null;
  }
  const realRootWithSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  if (real !== realRoot && !real.startsWith(realRootWithSep)) return null; // symlink escaped
  return real;
}

function notFound(res, msg = "Not found") {
  send(res, 404, `<!doctype html><meta charset=utf-8><title>404</title>` +
    `<body style="font:16px/1.6 system-ui;padding:3rem;max-width:40rem;margin:auto;color:#444">` +
    `<h1 style="font-size:1.4rem">404 — ${msg}</h1>` +
    `<p><a href="/" style="color:#0969da">← Back home</a></p>`,
    { "Content-Type": "text/html; charset=utf-8" });
}

export function createServer({ root, showAll = false, live = true }) {
  // Build the tree fresh per request so newly added files show up without restart.
  const buildContext = () => {
    const tree = buildTree(root, { showAll });
    return { tree, mdCount: countMarkdown(tree), rootName: path.basename(root) || root };
  };

  // --- Live reload + search state ---
  const sseClients = new Set();
  let searchIndex = null; // lazily built { rel, title, text }[]
  let watcher = null;
  let broadcastTimer = null;
  const pendingPaths = new Set();

  function broadcast(paths) {
    const payload = `event: change\ndata: ${JSON.stringify({ paths })}\n\n`;
    for (const res of sseClients) {
      try { res.write(payload); } catch { /* client gone */ }
    }
  }
  function onFsChange(filename) {
    searchIndex = null; // content changed — rebuild index on next search
    if (filename) pendingPaths.add(String(filename).split(path.sep).join("/"));
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(() => {
      const paths = [...pendingPaths];
      pendingPaths.clear();
      broadcast(paths);
    }, 120);
  }
  if (live) {
    try {
      watcher = fs.watch(root, { recursive: true }, (_event, filename) => onFsChange(filename));
      watcher.on("error", () => {});
    } catch {
      // Recursive watch unsupported on this platform; live reload disabled silently.
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      let pathname = url.pathname;

      // --- Static assets bundled with mdth ---
      if (pathname.startsWith("/assets/")) {
        return await serveAsset(res, pathname.slice("/assets/".length));
      }

      // --- Health check ---
      if (pathname === "/__ping") return send(res, 200, "ok", { "Content-Type": "text/plain" });

      // --- Live-reload event stream (SSE) ---
      if (pathname === "/__events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        res.write(`event: ready\ndata: ${JSON.stringify({ live })}\n\n`);
        if (live) {
          sseClients.add(res);
          const keepAlive = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 25000);
          req.on("close", () => { clearInterval(keepAlive); sseClients.delete(res); });
        } else {
          res.end();
        }
        return;
      }

      // --- Fresh sidebar tree + file list (used after live-reload changes) ---
      if (pathname === "/__tree") {
        const rel = url.searchParams.get("p") || "";
        const tree = buildTree(root, { showAll });
        return send(res, 200, JSON.stringify({
          sidebar: renderSidebar(tree, rel),
          files: flattenMarkdown(tree),
          mdCount: countMarkdown(tree),
        }), { "Content-Type": "application/json; charset=utf-8" });
      }

      // --- Full-text search ---
      if (pathname === "/__search") {
        const q = (url.searchParams.get("q") || "").trim();
        const results = await runSearch(q);
        return send(res, 200, JSON.stringify({ q, results }), {
          "Content-Type": "application/json; charset=utf-8",
        });
      }

      // --- Raw (non-markdown) files from the served directory ---
      if (pathname.startsWith(RAW_PREFIX)) {
        return await serveRaw(res, root, pathname.slice(RAW_PREFIX.length), req);
      }

      // --- Partial render (pjax) ---
      if (pathname.startsWith("/partial/")) {
        return await servePartial(res, root, showAll, pathname.slice("/partial/".length));
      }

      // --- Document view ---
      let rel = "";
      if (pathname.startsWith(VIEW_PREFIX)) {
        rel = pathname.slice(VIEW_PREFIX.length);
      } else if (pathname === "/") {
        const { tree } = buildContext();
        rel = findDefaultDoc(tree) || "";
      } else {
        // Bare path like /docs/intro.md — treat as a view request.
        rel = pathname.replace(/^\/+/, "");
      }

      return await serveView(res, root, showAll, rel);
    } catch (err) {
      // Log the detail server-side; never leak stack traces (internal paths,
      // versions) to the client.
      console.error("mdth: request error:", err && err.stack || err);
      send(res, 500, "Internal server error", { "Content-Type": "text/plain; charset=utf-8" });
    }
  });

  async function buildSearchIndex() {
    const files = flattenMarkdown(buildTree(root, { showAll }));
    const index = [];
    for (const f of files) {
      const abs = await safeResolve(root, f.rel);
      if (!abs) continue;
      try {
        const stat = await fsp.stat(abs);
        if (stat.size > 3_000_000) continue; // skip very large files
        const raw = await fsp.readFile(abs, "utf8");
        index.push({ rel: f.rel, name: f.name, title: quickTitle(raw, f.name), text: raw });
      } catch { /* unreadable — skip */ }
    }
    return index;
  }
  async function runSearch(q) {
    if (!q || q.length < 2) return [];
    if (!searchIndex) searchIndex = await buildSearchIndex();
    const needle = q.toLowerCase();
    const out = [];
    for (const doc of searchIndex) {
      const hay = doc.text.toLowerCase();
      let idx = hay.indexOf(needle);
      if (idx === -1) continue;
      let count = 0;
      while (idx !== -1) { count++; idx = hay.indexOf(needle, idx + needle.length); }
      out.push({
        rel: doc.rel,
        name: doc.name,
        title: doc.title,
        count,
        snippet: makeSnippet(doc.text, needle),
      });
    }
    // Rank: more occurrences first, then title/name matches, then shorter path.
    out.sort((a, b) =>
      (b.name.toLowerCase().includes(needle) - a.name.toLowerCase().includes(needle)) ||
      (b.count - a.count) ||
      (a.rel.length - b.rel.length));
    return out.slice(0, 40);
  }

  server.on("close", () => { try { watcher && watcher.close(); } catch {} });
  return server;
}

/** Extract a cheap title from markdown source (front-matter title or first H1). */
function quickTitle(raw, fallback) {
  const fm = raw.match(/^---\s*[\r\n]([\s\S]*?)[\r\n]---/);
  if (fm) {
    const t = fm[1].match(/^\s*title:\s*(.+?)\s*$/m);
    if (t) return t[1].replace(/^["']|["']$/g, "").trim();
  }
  const h1 = raw.match(/^\s*#\s+(.+?)\s*#*\s*$/m);
  if (h1) return h1[1].replace(/[*_`]/g, "").trim();
  return fallback;
}

/** Build a plain-text snippet around the first match. */
function makeSnippet(text, needle) {
  const plain = text.replace(/`{1,3}/g, "").replace(/[#>*_~]/g, "").replace(/\s+/g, " ").trim();
  const lower = plain.toLowerCase();
  const at = lower.indexOf(needle);
  if (at === -1) return plain.slice(0, 140);
  const start = Math.max(0, at - 50);
  const end = Math.min(plain.length, at + needle.length + 90);
  let s = plain.slice(start, end);
  if (start > 0) s = "… " + s;
  if (end < plain.length) s = s + " …";
  return s;
}

async function serveAsset(res, name) {
  const safe = path.normalize(name).replace(/^(\.\.[/\\])+/, "");
  if (safe === "mermaid.min.js") {
    try {
      const data = await fsp.readFile(mermaidBundlePath());
      return send(res, 200, data, {
        "Content-Type": "text/javascript; charset=utf-8",
        // Revalidate rather than trust a stale copy, so upgrades take effect.
        "Cache-Control": "no-cache",
      });
    } catch {
      return notFound(res, "Mermaid bundle not found");
    }
  }
  const abs = path.join(ASSET_DIR, safe);
  if (abs !== ASSET_DIR && !abs.startsWith(ASSET_DIR + path.sep)) return notFound(res);
  try {
    const data = await fsp.readFile(abs);
    send(res, 200, data, {
      "Content-Type": mimeFor(abs),
      // mdth's own JS/CSS must never be served stale after an update.
      "Cache-Control": "no-store",
    });
  } catch {
    notFound(res, "Asset not found");
  }
}

async function serveRaw(res, root, relRaw, req) {
  const abs = await safeResolve(root, relRaw);
  if (!abs) return notFound(res, "Forbidden path");
  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    return notFound(res, "File not found");
  }
  if (!stat.isFile()) return notFound(res, "Not a file");

  const type = mimeFor(abs);
  const range = req.headers.range;
  // Support range requests for media (video/audio scrubbing).
  if (range && /^bytes=/.test(range)) {
    const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
    let start = parseInt(startStr, 10);
    let end = endStr ? parseInt(endStr, 10) : stat.size - 1;
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
    if (start > end) return send(res, 416, "", { "Content-Range": `bytes */${stat.size}` });
    res.writeHead(206, {
      "Content-Type": type,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Cache-Control": "no-store",
      ...RAW_SECURITY_HEADERS,
    });
    return fs.createReadStream(abs, { start, end }).pipe(res);
  }

  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    ...RAW_SECURITY_HEADERS,
  });
  fs.createReadStream(abs).pipe(res);
}

async function readDoc(root, showAll, rel) {
  const tree = buildTree(root, { showAll });
  const mdCount = countMarkdown(tree);
  const rootName = path.basename(root) || root;

  let contentHtml, title, hasMermaid = false, ok = true;
  const effectiveRel = rel;

  if (!rel) {
    contentHtml = renderEmptyState(rootName, mdCount);
    title = rootName;
  } else {
    const abs = await safeResolve(root, rel);
    if (!abs || !isMarkdown(rel)) {
      ok = false;
    } else {
      try {
        const src = await fsp.readFile(abs, "utf8");
        const r = renderMarkdown(src, rel.replace(/\\/g, "/"));
        contentHtml = r.html;
        title = r.title;
        hasMermaid = r.hasMermaid;
      } catch {
        ok = false;
      }
    }
  }

  return { ok, tree, mdCount, rootName, contentHtml, title, hasMermaid, effectiveRel };
}

async function serveView(res, root, showAll, rel) {
  const d = await readDoc(root, showAll, rel);
  if (!d.ok) return notFound(res, "Document not found");
  const sidebar = renderSidebar(d.tree, d.effectiveRel);
  const html = renderShell({
    rootName: d.rootName,
    sidebar,
    contentHtml: d.contentHtml,
    title: d.title,
    rel: d.effectiveRel,
    mdCount: d.mdCount,
    showAll,
    files: flattenMarkdown(d.tree),
  });
  send(res, 200, html, { "Content-Type": "text/html; charset=utf-8" });
}

async function servePartial(res, root, showAll, rel) {
  const abs = await safeResolve(root, rel);
  if (!abs || !isMarkdown(rel)) return send(res, 404, JSON.stringify({ error: "not found" }), { "Content-Type": "application/json" });
  let src;
  try {
    src = await fsp.readFile(abs, "utf8");
  } catch {
    return send(res, 404, JSON.stringify({ error: "not found" }), { "Content-Type": "application/json" });
  }
  const r = renderMarkdown(src, rel.replace(/\\/g, "/"));
  const payload = {
    rel,
    title: r.title,
    html: r.html,
    hasMermaid: r.hasMermaid,
    breadcrumbs: renderBreadcrumbs(rel),
  };
  send(res, 200, JSON.stringify(payload), { "Content-Type": "application/json; charset=utf-8" });
}
