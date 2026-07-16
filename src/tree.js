import fs from "node:fs";
import path from "node:path";
import { isMarkdown } from "./render.js";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".svn", ".hg", ".mdth", ".next", ".cache",
  "dist", "build", ".vscode", ".idea",
]);

function ignored(name) {
  return name.startsWith(".") || IGNORE_DIRS.has(name);
}

/**
 * Walk the root directory and build a nested tree.
 * @param {string} root
 * @param {object} opts { showAll: boolean }
 * @returns {object} node: { name, rel, type: 'dir'|'file', children? }
 */
export function buildTree(root, opts = {}) {
  const showAll = !!opts.showAll;

  function walk(absDir, relDir) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return [];
    }
    const dirs = [];
    const files = [];
    for (const e of entries) {
      if (ignored(e.name)) continue;
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        const children = walk(path.join(absDir, e.name), rel);
        if (children.length > 0) dirs.push({ name: e.name, rel, type: "dir", children });
      } else if (e.isFile()) {
        const md = isMarkdown(e.name);
        if (md || showAll) {
          files.push({ name: e.name, rel, type: "file", md });
        }
      }
    }
    const cmp = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    dirs.sort(cmp);
    files.sort(cmp);
    return [...dirs, ...files];
  }

  return { name: path.basename(root) || root, rel: "", type: "dir", children: walk(root, "") };
}

/** Count markdown files in a tree (for the empty-state / header). */
export function countMarkdown(node) {
  if (node.type === "file") return node.md ? 1 : 0;
  return (node.children || []).reduce((n, c) => n + countMarkdown(c), 0);
}

/** Flatten the tree into an ordered list of markdown files (sidebar order). */
export function flattenMarkdown(node) {
  const out = [];
  (function dfs(n) {
    for (const c of n.children || []) {
      if (c.type === "file" && c.md) out.push({ rel: c.rel, name: c.name });
      else if (c.type === "dir") dfs(c);
    }
  })(node);
  return out;
}

/** Find the best default document to show at startup. */
export function findDefaultDoc(node) {
  // Prefer a root-level README.md / index.md.
  const preferred = ["readme.md", "index.md", "home.md"];
  const rootFiles = (node.children || []).filter((c) => c.type === "file" && c.md);
  for (const name of preferred) {
    const hit = rootFiles.find((f) => f.name.toLowerCase() === name);
    if (hit) return hit.rel;
  }
  if (rootFiles.length) return rootFiles[0].rel;
  // Otherwise first markdown file found in depth-first order.
  let found = null;
  (function dfs(n) {
    if (found) return;
    if (n.type === "file" && n.md) { found = n.rel; return; }
    for (const c of n.children || []) dfs(c);
  })(node);
  return found;
}
