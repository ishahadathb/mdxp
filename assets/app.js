/* mdth client: navigation, filtering, theming, mermaid. */

const layout = document.querySelector(".layout");
const scroll = document.getElementById("scroll");
const doc = document.getElementById("doc");
const breadcrumbs = document.getElementById("breadcrumbs");
const treeWrap = document.getElementById("treeWrap");
const filter = document.getElementById("filter");
const progress = document.getElementById("progress");
const tocEl = document.getElementById("toc");
const tocList = document.getElementById("tocList");
const pager = document.getElementById("pager");

/* ---------- Boot data ---------- */
const BOOT = (() => {
  try { return JSON.parse(document.getElementById("mdth-data").textContent); }
  catch { return { rel: "", files: [], rootName: "" }; }
})();
let currentRel = BOOT.rel || "";
const FILES = Array.isArray(BOOT.files) ? BOOT.files : [];

function encRel(rel) {
  return rel.split("/").map(encodeURIComponent).join("/");
}

/* ---------- Theme ---------- */
function currentTheme() {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("mdth-theme", t); } catch {}
  renderMermaid(true);
}
document.getElementById("themeBtn")?.addEventListener("click", () => {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
});

/* ---------- Sidebar toggle (mobile + collapse) ---------- */
function backdrop() {
  let el = layout.querySelector(".backdrop");
  if (!el) {
    el = document.createElement("div");
    el.className = "backdrop";
    el.addEventListener("click", () => layout.classList.add("sidebar-hidden"));
    layout.appendChild(el);
  }
  return el;
}
backdrop();
document.getElementById("sidebarClose")?.addEventListener("click", () => layout.classList.add("sidebar-hidden"));
document.getElementById("sidebarOpen")?.addEventListener("click", () => layout.classList.remove("sidebar-hidden"));

/* ---------- File filter ---------- */
function applyFilter(q) {
  const query = q.trim().toLowerCase();
  const nodes = treeWrap.querySelectorAll(".node");
  if (!query) {
    nodes.forEach((n) => n.classList.remove("filtered-out"));
    treeWrap.classList.remove("filtering", "no-hits");
    return;
  }
  treeWrap.classList.add("filtering");
  let hits = 0;
  // Hide everything first.
  nodes.forEach((n) => n.classList.add("filtered-out"));
  // Show files that match, plus their ancestor dirs.
  treeWrap.querySelectorAll("a.file").forEach((a) => {
    const rel = (a.dataset.rel || "").toLowerCase();
    const name = a.textContent.toLowerCase();
    if (name.includes(query) || rel.includes(query)) {
      hits++;
      let li = a.closest(".node");
      while (li && treeWrap.contains(li)) {
        li.classList.remove("filtered-out");
        const details = li.querySelector(":scope > details");
        if (details) details.open = true;
        li = li.parentElement?.closest(".node");
      }
    }
  });
  treeWrap.classList.toggle("no-hits", hits === 0);
  ensureNoResults();
}
function ensureNoResults() {
  if (!treeWrap.querySelector(".no-results")) {
    const d = document.createElement("div");
    d.className = "no-results";
    d.textContent = "No files match.";
    treeWrap.appendChild(d);
  }
}
filter?.addEventListener("input", (e) => applyFilter(e.target.value));

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
  if (e.key === "/" && !typing) { e.preventDefault(); filter?.focus(); filter?.select(); }
  else if (e.key === "Escape") {
    if (document.activeElement === filter) { filter.value = ""; applyFilter(""); filter.blur(); }
    else if (window.matchMedia("(max-width: 820px)").matches) layout.classList.add("sidebar-hidden");
  }
});

/* ---------- Mermaid ---------- */
let mermaidReady = false;
function initMermaid() {
  if (typeof window.mermaid === "undefined") return false;
  if (!mermaidReady) {
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      fontFamily: "inherit",
    });
    mermaidReady = true;
  }
  return true;
}
async function renderMermaid(rerenderAll = false) {
  if (!initMermaid()) {
    // mermaid script may still be loading; try again shortly.
    return void setTimeout(() => renderMermaid(rerenderAll), 120);
  }
  const theme = currentTheme() === "dark" ? "dark" : "default";
  window.mermaid.initialize({ startOnLoad: false, securityLevel: "loose", fontFamily: "inherit", theme });

  const blocks = Array.from(doc.querySelectorAll("pre.mermaid"));
  for (const el of blocks) {
    // Preserve source so we can re-render on theme change.
    if (!el.dataset.src) el.dataset.src = el.textContent;
    if (el.dataset.processed && !rerenderAll) continue;
    el.removeAttribute("data-processed");
    el.innerHTML = el.dataset.src;
  }
  const pending = blocks.filter((el) => !el.dataset.processed || rerenderAll);
  if (!pending.length) return;
  try {
    await window.mermaid.run({ nodes: pending });
    pending.forEach((el) => el.setAttribute("data-processed", "1"));
  } catch (err) {
    console.warn("mermaid render error", err);
  }
}

/* ---------- On this page (TOC) + scroll-spy ---------- */
let tocObserver = null;
function buildToc() {
  if (!tocEl || !tocList) return;
  const headings = Array.from(doc.querySelectorAll("h2, h3")).filter((h) => h.id);
  tocList.innerHTML = "";
  if (tocObserver) { tocObserver.disconnect(); tocObserver = null; }
  if (headings.length < 2) {
    tocEl.classList.add("empty");
    return;
  }
  tocEl.classList.remove("empty");
  const links = new Map();
  for (const h of headings) {
    const a = document.createElement("a");
    a.href = "#" + h.id;
    a.textContent = h.textContent.replace(/#$/, "").trim();
    a.className = h.tagName === "H3" ? "lvl-3" : "lvl-2";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      h.scrollIntoView();
      history.replaceState(history.state, "", location.pathname + "#" + h.id);
    });
    tocList.appendChild(a);
    links.set(h.id, a);
  }
  // Scroll-spy: highlight the heading nearest the top of the viewport.
  const visible = new Set();
  tocObserver = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) visible.add(en.target.id);
        else visible.delete(en.target.id);
      }
      let activeId = null;
      for (const h of headings) {
        if (visible.has(h.id)) { activeId = h.id; break; }
      }
      if (!activeId) {
        // fall back to last heading above the fold
        for (const h of headings) {
          if (h.getBoundingClientRect().top < 120) activeId = h.id;
        }
      }
      links.forEach((a, id) => a.classList.toggle("active", id === activeId));
    },
    { root: scroll, rootMargin: "-80px 0px -70% 0px", threshold: 0 }
  );
  headings.forEach((h) => tocObserver.observe(h));
}

/* ---------- Copy-code buttons ---------- */
const COPY_ICON = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L1.72 8.78a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>';
function addCopyButtons() {
  doc.querySelectorAll("pre.code").forEach((pre) => {
    if (pre.parentElement.classList.contains("code-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "code-wrap";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.type = "button";
    btn.innerHTML = COPY_ICON + "<span>Copy</span>";
    btn.addEventListener("click", async () => {
      const codeEl = pre.querySelector("code") || pre;
      const code = codeEl.textContent.replace(/\n$/, "");
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = code; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch {}
        ta.remove();
      }
      btn.classList.add("copied");
      btn.innerHTML = CHECK_ICON + "<span>Copied</span>";
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.innerHTML = COPY_ICON + "<span>Copy</span>";
      }, 1600);
    });
    wrap.appendChild(btn);
  });
}

/* ---------- Prev / Next pager ---------- */
function buildPager() {
  if (!pager) return;
  pager.innerHTML = "";
  if (!currentRel || !FILES.length) return;
  const idx = FILES.findIndex((f) => f.rel === currentRel);
  if (idx === -1) return;
  const prev = FILES[idx - 1];
  const next = FILES[idx + 1];
  const make = (f, dir) => {
    const a = document.createElement("a");
    a.className = dir;
    a.href = "/view/" + encRel(f.rel);
    a.innerHTML = `<span class="dir">${dir === "prev" ? "← Previous" : "Next →"}</span>` +
      `<span class="name"></span>`;
    a.querySelector(".name").textContent = f.name.replace(/\.(md|markdown|mdown|mkd|mdx)$/i, "");
    return a;
  };
  // Keep grid columns aligned even with only one neighbor.
  if (prev) pager.appendChild(make(prev, "prev")); else pager.appendChild(document.createElement("span"));
  if (next) pager.appendChild(make(next, "next"));
}

/* ---------- Reading progress ---------- */
function updateProgress() {
  if (!progress) return;
  const max = scroll.scrollHeight - scroll.clientHeight;
  const pct = max > 0 ? Math.min(100, (scroll.scrollTop / max) * 100) : 0;
  progress.classList.add("active");
  progress.style.width = pct + "%";
  if (pct >= 99.5 || max <= 0) {
    clearTimeout(updateProgress._t);
    updateProgress._t = setTimeout(() => progress.classList.remove("active"), 400);
  }
}
/* ---------- Scroll-to-top ---------- */
const toTop = document.getElementById("toTop");
function updateToTop() {
  if (!toTop) return;
  toTop.classList.toggle("visible", scroll.scrollTop > 400);
}
toTop?.addEventListener("click", () => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroll.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
});

scroll?.addEventListener("scroll", () => {
  if (!navPending) requestAnimationFrame(updateProgress);
  updateToTop();
}, { passive: true });

/* ---------- Post-render orchestration ---------- */
function afterRender(hasMermaid) {
  buildToc();
  addCopyButtons();
  buildPager();
  if (hasMermaid !== false) renderMermaid(true);
  requestAnimationFrame(updateProgress);
  updateToTop();
}

/* ---------- pjax navigation ---------- */
let navPending = false;
function showProgress() {
  progress.classList.add("active");
  progress.style.width = "40%";
  requestAnimationFrame(() => { progress.style.width = "72%"; });
}
function endProgress() {
  progress.style.width = "100%";
  setTimeout(() => { progress.classList.remove("active"); progress.style.width = "0"; }, 220);
}

function setActive(rel) {
  treeWrap.querySelectorAll("a.file.active").forEach((a) => a.classList.remove("active"));
  const link = treeWrap.querySelector(`a.file[data-rel="${cssEscape(rel)}"]`);
  if (link) {
    link.classList.add("active");
    let li = link.closest(".node");
    while (li && treeWrap.contains(li)) {
      const details = li.querySelector(":scope > details");
      if (details) details.open = true;
      li = li.parentElement?.closest(".node");
    }
    link.scrollIntoView({ block: "nearest" });
  }
}
function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
}

async function navigate(rel, hash, push = true) {
  navPending = true;
  showProgress();
  try {
    const res = await fetch("/partial/" + encRel(rel));
    if (!res.ok) throw new Error("not found");
    const data = await res.json();
    doc.innerHTML = data.html;
    breadcrumbs.innerHTML = data.breadcrumbs;
    document.title = data.title;
    currentRel = rel;
    setActive(rel);
    if (push) {
      const url = "/view/" + encRel(rel) + (hash || "");
      history.pushState({ rel, hash }, "", url);
    }
    afterRender(data.hasMermaid);
    // Scroll to anchor or top.
    if (hash) {
      const target = doc.querySelector(hash);
      if (target) target.scrollIntoView();
      else scroll.scrollTop = 0;
    } else {
      scroll.scrollTop = 0;
    }
    if (window.matchMedia("(max-width: 820px)").matches) layout.classList.add("sidebar-hidden");
  } catch {
    // Fall back to a hard navigation.
    window.location.href = "/view/" + encRel(rel) + (hash || "");
  } finally {
    navPending = false;
    endProgress();
  }
}

// Intercept internal links (both sidebar and in-document).
document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest("a");
  if (!a) return;
  const href = a.getAttribute("href");
  if (!href) return;
  if (a.target === "_blank") return;

  // In-page anchor within current doc.
  if (href.startsWith("#")) {
    const target = doc.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView();
      history.replaceState(history.state, "", location.pathname + href);
    }
    return;
  }

  // Internal markdown view links.
  if (href.startsWith("/view/")) {
    e.preventDefault();
    const raw = href.slice("/view/".length);
    const [pathPart, ...h] = raw.split("#");
    const relDecoded = pathPart.split("/").map(decodeURIComponent).join("/");
    navigate(relDecoded, h.length ? "#" + h.join("#") : "");
  }
  // /raw/ and external links: let the browser handle them.
});

window.addEventListener("popstate", (e) => {
  const st = e.state;
  if (st && st.rel) navigate(st.rel, st.hash || "", false);
  else {
    // Reconstruct from URL.
    const m = location.pathname.match(/^\/view\/(.+)$/);
    if (m) {
      const rel = m[1].split("/").map(decodeURIComponent).join("/");
      navigate(rel, location.hash || "", false);
    }
  }
});

/* ---------- Command palette (⌘K) ---------- */
const cmdk = document.getElementById("cmdk");
const cmdkInput = document.getElementById("cmdkInput");
const cmdkResults = document.getElementById("cmdkResults");
let cmdkMatches = [];
let cmdkSel = 0;

// Lightweight subsequence fuzzy match returning a score + match indices.
function fuzzy(query, text) {
  if (!query) return { score: 0, hits: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0, score = 0, streak = 0;
  const hits = [];
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      hits.push(ti);
      streak++;
      score += 1 + streak;
      if (ti === 0 || /[/\-_. ]/.test(t[ti - 1])) score += 3;
      qi++;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? { score, hits } : null;
}
function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function highlight(text, hits) {
  if (!hits || !hits.length) return escapeHtml(text);
  let out = "", h = 0;
  for (let i = 0; i < text.length; i++) {
    if (h < hits.length && hits[h] === i) { out += "<mark>" + escapeHtml(text[i]) + "</mark>"; h++; }
    else out += escapeHtml(text[i]);
  }
  return out;
}
function highlightText(text, q) {
  if (!q) return escapeHtml(text);
  const lower = text.toLowerCase(), ql = q.toLowerCase();
  let out = "", i = 0;
  for (;;) {
    const at = lower.indexOf(ql, i);
    if (at === -1) { out += escapeHtml(text.slice(i)); break; }
    out += escapeHtml(text.slice(i, at)) + "<mark>" + escapeHtml(text.slice(at, at + ql.length)) + "</mark>";
    i = at + ql.length;
  }
  return out;
}
let cmdkToken = 0;
function renderCmdk(query) {
  const q = query.trim();
  const token = ++cmdkToken;
  // 1) Filename fuzzy matches — synchronous, instant.
  let fileMatches;
  if (!q) {
    fileMatches = FILES.slice(0, 50).map((f) => ({ f, hits: [], kind: "file" }));
  } else {
    fileMatches = [];
    for (const f of FILES) {
      const byName = fuzzy(q, f.name);
      const byRel = fuzzy(q, f.rel);
      const best = byName && byRel ? (byName.score >= byRel.score ? byName : byRel) : (byName || byRel);
      if (best) fileMatches.push({ f, hits: byName ? byName.hits : [], score: best.score, kind: "file" });
    }
    fileMatches.sort((a, b) => b.score - a.score);
    fileMatches = fileMatches.slice(0, 50);
  }
  paintCmdk(fileMatches, [], q, true);
  // 2) Full-text content matches — async, appended when they arrive.
  if (q.length >= 2) {
    fetch("/__search?q=" + encodeURIComponent(q))
      .then((r) => r.json())
      .then((data) => {
        if (token !== cmdkToken) return; // a newer query superseded this
        const seen = new Set(fileMatches.map((m) => m.f.rel));
        const content = (data.results || [])
          .filter((r) => !seen.has(r.rel))
          .map((r) => ({ f: { rel: r.rel, name: r.name }, title: r.title, snippet: r.snippet, count: r.count, kind: "content" }));
        paintCmdk(fileMatches, content, q, false);
      })
      .catch(() => {});
  }
}
function paintCmdk(fileMatches, contentMatches, q, resetSel) {
  const parts = [];
  const grouped = fileMatches.length && contentMatches.length;
  if (fileMatches.length) {
    if (grouped) parts.push('<li class="cmdk-group" aria-hidden="true">Files</li>');
    for (const m of fileMatches) {
      const f = m.f;
      const dir = f.rel.includes("/") ? f.rel.slice(0, f.rel.lastIndexOf("/")) : "";
      parts.push(`<li role="option" data-rel="${escapeHtml(f.rel)}">` +
        `<span class="fname">${highlight(f.name, m.hits)}</span>` +
        `<span class="path">${escapeHtml(dir)}</span></li>`);
    }
  }
  if (contentMatches.length) {
    parts.push('<li class="cmdk-group" aria-hidden="true">In content</li>');
    for (const m of contentMatches) {
      parts.push(`<li role="option" data-rel="${escapeHtml(m.f.rel)}">` +
        `<div class="cmdk-content"><span class="fname">${escapeHtml(m.title || m.f.name)}` +
        `${m.count > 1 ? `<span class="hits">${m.count}</span>` : ""}</span>` +
        `<span class="snippet">${highlightText(m.snippet || "", q)}</span></div></li>`);
    }
  }
  if (!parts.length) {
    cmdkResults.innerHTML = q.length >= 2
      ? '<li class="cmdk-empty">No matches in names or content</li>'
      : '<li class="cmdk-empty">No matching documents</li>';
    cmdkMatches = [];
    return;
  }
  cmdkResults.innerHTML = parts.join("");
  cmdkMatches = [...fileMatches, ...contentMatches];
  const opts = Array.from(cmdkResults.querySelectorAll('li[role="option"]'));
  opts.forEach((li, i) => {
    li.addEventListener("mousemove", () => setSel(i));
    li.addEventListener("click", () => openMatch(i));
  });
  if (resetSel) cmdkSel = 0;
  setSel(cmdkSel);
}
function setSel(i) {
  const opts = Array.from(cmdkResults.querySelectorAll('li[role="option"]'));
  if (!opts.length) return;
  cmdkSel = Math.max(0, Math.min(i, opts.length - 1));
  opts.forEach((li, idx) => li.setAttribute("aria-selected", idx === cmdkSel ? "true" : "false"));
  opts[cmdkSel].scrollIntoView({ block: "nearest" });
}
function openMatch(i) {
  const item = cmdkMatches[i];
  if (!item) return;
  closeCmdk();
  navigate(item.f.rel, "");
}
function openCmdk() {
  if (!cmdk) return;
  cmdk.hidden = false;
  cmdk.setAttribute("aria-hidden", "false");
  cmdkInput.value = "";
  renderCmdk("");
  setTimeout(() => cmdkInput.focus(), 0);
}
function closeCmdk() {
  if (!cmdk) return;
  cmdk.hidden = true;
  cmdk.setAttribute("aria-hidden", "true");
}
document.getElementById("cmdkBtn")?.addEventListener("click", () => {
  if (cmdk && cmdk.hidden) openCmdk(); else closeCmdk();
});
document.getElementById("cmdkBackdrop")?.addEventListener("click", closeCmdk);
cmdkInput?.addEventListener("input", (e) => renderCmdk(e.target.value));
cmdkInput?.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); setSel(Math.min(cmdkSel + 1, cmdkMatches.length - 1)); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setSel(Math.max(cmdkSel - 1, 0)); }
  else if (e.key === "Enter") { e.preventDefault(); openMatch(cmdkSel); }
  else if (e.key === "Escape") { e.preventDefault(); closeCmdk(); }
});
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    if (cmdk && cmdk.hidden) openCmdk(); else closeCmdk();
  } else if (e.key === "Escape" && cmdk && !cmdk.hidden) {
    closeCmdk();
  }
});

/* ---------- Live reload ---------- */
function refreshTree() {
  return fetch("/__tree?p=" + encRel(currentRel))
    .then((r) => r.json())
    .then((data) => {
      if (treeWrap && data.sidebar) treeWrap.innerHTML = data.sidebar;
      FILES.length = 0;
      (data.files || []).forEach((f) => FILES.push(f));
      const count = document.querySelector(".sidebar-foot span");
      if (count && typeof data.mdCount === "number") count.textContent = data.mdCount + (data.mdCount === 1 ? " doc" : " docs");
      if (filter && filter.value.trim()) applyFilter(filter.value);
      buildPager();
    })
    .catch(() => {});
}
function reloadCurrent() {
  if (!currentRel) return;
  const keepTop = scroll.scrollTop;
  fetch("/partial/" + encRel(currentRel))
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      doc.innerHTML = data.html;
      document.title = data.title;
      breadcrumbs.innerHTML = data.breadcrumbs;
      afterRender(data.hasMermaid);
      scroll.scrollTop = keepTop; // keep the reader's place across edits
    })
    .catch(() => {});
}
function connectLive() {
  if (!window.EventSource) return;
  let es;
  try { es = new EventSource("/__events"); } catch { return; }
  es.addEventListener("change", (e) => {
    let paths = [];
    try { paths = (JSON.parse(e.data).paths) || []; } catch {}
    refreshTree();
    const base = currentRel ? currentRel.split("/").pop() : "";
    const affected = !paths.length || paths.some((p) => p === currentRel || p.split("/").pop() === base);
    if (affected) reloadCurrent();
  });
}

/* ---------- Boot ---------- */
(function seed() {
  history.replaceState({ rel: currentRel, hash: location.hash || "" }, "", location.href);
  if (location.hash) {
    const target = doc.querySelector(location.hash);
    if (target) setTimeout(() => target.scrollIntoView(), 60);
  }
})();

afterRender();
connectLive();
