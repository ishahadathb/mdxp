import path from "node:path";
import { VIEW_PREFIX } from "./render.js";
import { VERSION } from "./version.js";

// A token that changes every server start, appended to bundled asset URLs so a
// browser can never serve a stale copy of mdxp's own CSS/JS after an update.
const ASSET_VERSION = Date.now().toString(36);

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function encPath(rel) {
  return rel.split("/").map(encodeURIComponent).join("/");
}

const fileIcon = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M4 1.75C4 .784 4.784 0 5.75 0h4.586a1.75 1.75 0 0 1 1.237.513l2.914 2.914A1.75 1.75 0 0 1 15 4.664V14.25A1.75 1.75 0 0 1 13.25 16H5.75A1.75 1.75 0 0 1 4 14.25V1.75Zm7 .5V4.25c0 .414.336.75.75.75h1.75L11 2.25Z"/></svg>`;
const dirIcon = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" class="chev"><path fill="currentColor" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/></svg>`;

/** Render the collapsible sidebar tree. */
export function renderSidebar(node, activeRel) {
  function renderNodes(nodes, depth) {
    let out = "";
    for (const n of nodes) {
      if (n.type === "dir") {
        const open = activeRel && (activeRel === n.rel || activeRel.startsWith(n.rel + "/"));
        out += `<li class="node dir">` +
          `<details${open ? " open" : ""}>` +
          `<summary style="--depth:${depth}"><span class="tw">${dirIcon}</span><span class="label">${esc(n.name)}</span></summary>` +
          `<ul>${renderNodes(n.children || [], depth + 1)}</ul>` +
          `</details></li>`;
      } else {
        const active = n.rel === activeRel;
        const href = n.md ? VIEW_PREFIX + encPath(n.rel) : "/raw/" + encPath(n.rel);
        const cls = "file" + (n.md ? " md" : " other") + (active ? " active" : "");
        const target = n.md ? "" : ` target="_blank" rel="noopener"`;
        out += `<li class="node"><a class="${cls}" href="${href}"${target}` +
          ` data-rel="${esc(n.rel)}" style="--depth:${depth}">` +
          `<span class="ico">${fileIcon}</span><span class="label">${esc(n.name)}</span></a></li>`;
      }
    }
    return out;
  }
  return `<ul class="tree">${renderNodes(node.children || [], 0)}</ul>`;
}

/** Breadcrumb trail for the current file. */
export function renderBreadcrumbs(rel) {
  if (!rel) return `<span class="crumb current">Home</span>`;
  const parts = rel.split("/");
  let out = `<a class="crumb" href="/">Home</a>`;
  let acc = "";
  parts.forEach((part, i) => {
    acc = acc ? `${acc}/${part}` : part;
    out += `<span class="sep">/</span>`;
    if (i === parts.length - 1) {
      out += `<span class="crumb current">${esc(part)}</span>`;
    } else {
      out += `<span class="crumb dir">${esc(part)}</span>`;
    }
  });
  return out;
}

/** Full page shell. */
export function renderShell({ rootName, sidebar, contentHtml, title, rel, mdCount, showAll, files = [] }) {
  const pageTitle = title ? `${esc(title)} · ${esc(rootName)}` : esc(rootName);
  const breadcrumbs = renderBreadcrumbs(rel);
  const bootData = JSON.stringify({ rel: rel || "", files, rootName }).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en" data-theme="">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle}</title>
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/assets/favicon.svg">
<link rel="stylesheet" href="/assets/app.css?v=${ASSET_VERSION}">
<script>
  // Apply saved theme before paint to avoid flash.
  try {
    var t = localStorage.getItem("mdth-theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
</script>
</head>
<body>
<a class="skip-link" href="#doc">Skip to content</a>
<div class="layout">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-head">
      <a class="brand" href="/" title="${esc(rootName)}">
        <span class="brand-mark">md</span>
        <span class="brand-name">${esc(rootName)}</span>
      </a>
      <button class="icon-btn sidebar-toggle" id="sidebarClose" title="Hide sidebar" aria-label="Hide sidebar">
        <svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M10.78 4.22a.75.75 0 0 1 0 1.06L8.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L6.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z"/></svg>
      </button>
    </div>
    <div class="search-wrap">
      <svg class="search-ico" viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-1.06 1.06l-3.04-3.04ZM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0Z"/></svg>
      <input type="search" id="filter" placeholder="Filter files…" autocomplete="off" spellcheck="false" aria-label="Filter files">
      <kbd class="kbd-hint">/</kbd>
    </div>
    <nav class="tree-wrap" id="treeWrap" aria-label="File tree">
      ${sidebar}
    </nav>
    <div class="sidebar-foot">
      <span>${mdCount} doc${mdCount === 1 ? "" : "s"}</span>
      <button class="theme-btn" id="themeBtn" title="Toggle theme" aria-label="Toggle theme">
        <svg class="ico-sun" viewBox="0 0 16 16" width="15" height="15"><path fill="currentColor" d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8 0a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 8 0Zm0 13a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 8 13Zm8-5a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1A.75.75 0 0 1 16 8ZM3 8a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1A.75.75 0 0 1 3 8Zm10.657-5.657a.75.75 0 0 1 0 1.061l-.708.708a.75.75 0 1 1-1.06-1.061l.707-.708a.75.75 0 0 1 1.06 0ZM4.111 11.889a.75.75 0 0 1 0 1.06l-.707.708a.75.75 0 0 1-1.061-1.06l.708-.708a.75.75 0 0 1 1.06 0ZM13.657 13.657a.75.75 0 0 1-1.06 0l-.708-.708a.75.75 0 0 1 1.06-1.06l.708.707a.75.75 0 0 1 0 1.06ZM4.111 4.111a.75.75 0 0 1-1.06 0l-.708-.707A.75.75 0 0 1 3.404 2.344l.707.708a.75.75 0 0 1 0 1.06Z"/></svg>
        <svg class="ico-moon" viewBox="0 0 16 16" width="15" height="15"><path fill="currentColor" d="M9.598 1.591a.749.749 0 0 1 .785-.175 7.001 7.001 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Z"/></svg>
      </button>
    </div>
  </aside>

  <main class="main" id="main">
    <header class="topbar">
      <button class="icon-btn sidebar-open" id="sidebarOpen" title="Show sidebar" aria-label="Show sidebar">
        <svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1 3.75A.75.75 0 0 1 1.75 3h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 3.75Zm0 4A.75.75 0 0 1 1.75 7h12.5a.75.75 0 0 1 0 1.5H1.75A.75.75 0 0 1 1 7.75Zm0 4a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1-.75-.75Z"/></svg>
      </button>
      <nav class="breadcrumbs" id="breadcrumbs" aria-label="Breadcrumb">${breadcrumbs}</nav>
      <button class="cmdk-btn" id="cmdkBtn" aria-label="Search files (Command or Control K)">
        <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-1.06 1.06l-3.04-3.04ZM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0Z"/></svg>
        <span>Search…</span>
        <kbd>⌘K</kbd>
      </button>
    </header>
    <div class="progress" id="progress" aria-hidden="true"></div>
    <button class="to-top" id="toTop" title="Back to top" aria-label="Back to top">
      <svg viewBox="0 0 16 16" width="17" height="17"><path fill="currentColor" d="M3.47 7.78a.75.75 0 0 1 0-1.06l4-4a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1-1.06 1.06L8.75 4.81v8.44a.75.75 0 0 1-1.5 0V4.81L4.53 7.78a.75.75 0 0 1-1.06 0Z"/></svg>
    </button>
    <div class="scroll" id="scroll">
      <div class="doc-layout">
        <div class="doc-main">
          <article class="doc" id="doc">
            ${contentHtml}
          </article>
          <nav class="pager" id="pager" aria-label="Previous and next document"></nav>
          <footer class="doc-foot">
            <span>Rendered by <strong>mdxp</strong> <span class="version">v${VERSION}</span></span>
          </footer>
        </div>
        <aside class="toc" id="toc" aria-label="On this page">
          <div class="toc-title">On this page</div>
          <nav class="toc-list" id="tocList"></nav>
        </aside>
      </div>
    </div>
  </main>
</div>

<div class="cmdk" id="cmdk" hidden aria-hidden="true">
  <div class="cmdk-backdrop" id="cmdkBackdrop"></div>
  <div class="cmdk-panel" role="dialog" aria-modal="true" aria-label="Search files">
    <div class="cmdk-input-row">
      <svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-1.06 1.06l-3.04-3.04ZM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0Z"/></svg>
      <input type="text" id="cmdkInput" placeholder="Jump to a document…" autocomplete="off" spellcheck="false" aria-label="Search files">
      <kbd>Esc</kbd>
    </div>
    <ul class="cmdk-results" id="cmdkResults" role="listbox"></ul>
    <div class="cmdk-foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
      <span><kbd>↵</kbd> open</span>
    </div>
  </div>
</div>

<script id="mdth-data" type="application/json">${bootData}</script>
<script src="/assets/mermaid.min.js?v=${ASSET_VERSION}" defer></script>
<script type="module" src="/assets/app.js?v=${ASSET_VERSION}"></script>
</body>
</html>`;
}

/** Landing content when no document is selected / directory has no markdown. */
export function renderEmptyState(rootName, mdCount) {
  if (mdCount === 0) {
    return `<div class="empty">
      <h1>No Markdown here yet</h1>
      <p>mdxp didn't find any <code>.md</code> files in <strong>${esc(rootName)}</strong>.
      Drop some Markdown into this folder and refresh.</p>
    </div>`;
  }
  return `<div class="empty">
    <h1>${esc(rootName)}</h1>
    <p>Pick a document from the sidebar to start reading.</p>
  </div>`;
}
