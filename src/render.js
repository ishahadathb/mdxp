import path from "node:path";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import matter from "gray-matter";

// Route helpers shared with the server.
export const VIEW_PREFIX = "/view/";
export const RAW_PREFIX = "/raw/";

const MD_EXT = new Set([".md", ".markdown", ".mdown", ".mkd", ".mdx"]);

// Supported callout/admonition types and their display labels.
const CALLOUTS = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
  danger: "Danger",
  info: "Info",
  success: "Success",
};

export function isMarkdown(p) {
  return MD_EXT.has(path.extname(p).toLowerCase());
}

function isExternal(href) {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

// Encode a repo-relative POSIX path for use in a URL, preserving slashes.
function encodePath(rel) {
  return rel.split("/").map(encodeURIComponent).join("/");
}

/**
 * Build a MarkdownIt instance whose link/image resolvers are aware of the
 * file currently being rendered, so relative references stay navigable.
 *
 * @param {string} currentRel  POSIX path of the current file, relative to root.
 */
function buildMd(currentRel) {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight(str, lang) {
      // Mermaid blocks are handed to the browser untouched.
      if (lang && lang.trim().toLowerCase() === "mermaid") {
        return `<pre class="mermaid">${md.utils.escapeHtml(str)}</pre>`;
      }
      const language = lang && hljs.getLanguage(lang) ? lang : null;
      try {
        const code = language
          ? hljs.highlight(str, { language, ignoreIllegals: true }).value
          : md.utils.escapeHtml(str);
        const cls = language ? ` language-${md.utils.escapeHtml(lang)}` : "";
        return `<pre class="code"><code class="hljs${cls}">${code}</code></pre>`;
      } catch {
        return `<pre class="code"><code class="hljs">${md.utils.escapeHtml(str)}</code></pre>`;
      }
    },
  });

  md.use(anchor, {
    permalink: anchor.permalink.linkInsideHeader({
      symbol: "#",
      placement: "before",
      class: "header-anchor",
      ariaHidden: true,
    }),
    slugify: (s) =>
      encodeURIComponent(
        String(s).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\wÀ-￿-]/g, "")
      ),
  });
  md.use(taskLists, { enabled: true, label: true });

  // GitHub-style callouts: > [!NOTE], [!TIP], [!WARNING], etc.
  md.core.ruler.before("inline", "callouts", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "blockquote_open") continue;
      let j = i + 1;
      while (j < tokens.length && tokens[j].type !== "inline" && tokens[j].type !== "blockquote_close") j++;
      if (j >= tokens.length || tokens[j].type !== "inline") continue;
      const m = tokens[j].content.match(/^\[!(\w+)\][ \t]*\r?\n?/);
      if (!m) continue;
      const type = m[1].toLowerCase();
      const label = CALLOUTS[type];
      if (!label) continue;
      tokens[i].attrJoin("class", `callout callout-${type}`);
      tokens[i].attrSet("data-callout", label);
      tokens[j].content = tokens[j].content.slice(m[0].length);
    }
  });

  const curDir = path.posix.dirname(currentRel);

  // Resolve a relative reference (from the current file) into a root-relative
  // POSIX path plus its anchor, or null if it escapes the root or is external.
  const resolveRel = (href) => {
    const [pathPart, ...hashParts] = href.split("#");
    const hash = hashParts.length ? "#" + hashParts.join("#") : "";
    if (!pathPart) return { hashOnly: hash }; // pure "#anchor"
    let joined = path.posix.normalize(path.posix.join(curDir, pathPart));
    if (joined.startsWith("..") || joined === "." ) return null; // escapes root
    joined = joined.replace(/^\.\//, "");
    return { rel: joined, hash };
  };

  const rewriteLink = (href) => {
    if (!href) return href;
    if (href.startsWith("#")) return href; // in-page anchor
    if (isExternal(href)) return href; // http(s), mailto, etc.
    const r = resolveRel(href);
    if (!r) return href;
    if (r.hashOnly) return r.hashOnly;
    const prefix = isMarkdown(r.rel) ? VIEW_PREFIX : RAW_PREFIX;
    return prefix + encodePath(r.rel) + r.hash;
  };

  const rewriteSrc = (src) => {
    if (!src || src.startsWith("#") || isExternal(src) || src.startsWith("data:")) return src;
    const r = resolveRel(src);
    if (!r || r.hashOnly) return src;
    return RAW_PREFIX + encodePath(r.rel);
  };

  // Override link_open to rewrite hrefs and flag external links.
  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const hrefIdx = token.attrIndex("href");
    if (hrefIdx >= 0) {
      const original = token.attrs[hrefIdx][1];
      token.attrs[hrefIdx][1] = rewriteLink(original);
      if (isExternal(original) && /^https?:/i.test(original)) {
        token.attrSet("target", "_blank");
        token.attrSet("rel", "noopener noreferrer");
        token.attrJoin("class", "external");
      }
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  // Override image src.
  const defaultImage =
    md.renderer.rules.image ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const srcIdx = token.attrIndex("src");
    if (srcIdx >= 0) token.attrs[srcIdx][1] = rewriteSrc(token.attrs[srcIdx][1]);
    token.attrJoin("loading", "lazy");
    return defaultImage(tokens, idx, options, env, self);
  };

  return md;
}

/**
 * Render Markdown source to HTML for a given file.
 * @returns {{ html: string, title: string, hasMermaid: boolean, frontmatter: object }}
 */
export function renderMarkdown(source, currentRel) {
  const parsed = matter(source);
  const body = parsed.content;
  const md = buildMd(currentRel);
  const html = md.render(body);

  // Title: front-matter title, else first H1, else filename.
  let title = parsed.data && parsed.data.title ? String(parsed.data.title) : null;
  if (!title) {
    const m = body.match(/^\s*#\s+(.+?)\s*#*\s*$/m);
    if (m) title = m[1].replace(/[*_`]/g, "").trim();
  }
  if (!title) title = path.posix.basename(currentRel);

  return {
    html,
    title,
    hasMermaid: /class="mermaid"/.test(html),
    frontmatter: parsed.data || {},
  };
}
