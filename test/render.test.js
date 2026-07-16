import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, isMarkdown } from "../src/render.js";

test("isMarkdown recognizes markdown extensions", () => {
  assert.equal(isMarkdown("a.md"), true);
  assert.equal(isMarkdown("a.markdown"), true);
  assert.equal(isMarkdown("a.MD"), true);
  assert.equal(isMarkdown("a.txt"), false);
  assert.equal(isMarkdown("a.png"), false);
});

test("rewrites relative .md links to /view/", () => {
  const { html } = renderMarkdown("[x](guide/intro.md)", "README.md");
  assert.match(html, /href="\/view\/guide\/intro\.md"/);
});

test("resolves ../ links relative to the current file", () => {
  const { html } = renderMarkdown("[home](../README.md)", "guide/intro.md");
  assert.match(html, /href="\/view\/README\.md"/);
});

test("rewrites relative asset links to /raw/", () => {
  const { html } = renderMarkdown("[dl](assets/data.csv)", "README.md");
  assert.match(html, /href="\/raw\/assets\/data\.csv"/);
});

test("rewrites image src to /raw/", () => {
  const { html } = renderMarkdown("![pic](assets/pic.svg)", "README.md");
  assert.match(html, /src="\/raw\/assets\/pic\.svg"/);
});

test("leaves external links untouched and marks them", () => {
  const { html } = renderMarkdown("[site](https://example.com)", "README.md");
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("does not rewrite links that escape the root", () => {
  const { html } = renderMarkdown("[x](../../etc/passwd.md)", "README.md");
  assert.doesNotMatch(html, /\/view\//);
  assert.match(html, /href="\.\.\/\.\.\/etc\/passwd\.md"/);
});

test("preserves in-page anchors", () => {
  const { html } = renderMarkdown("[s](#section)", "README.md");
  assert.match(html, /href="#section"/);
});

test("emits mermaid fences as client-side pre.mermaid", () => {
  const { html, hasMermaid } = renderMarkdown("```mermaid\ngraph TD; A-->B;\n```", "README.md");
  assert.equal(hasMermaid, true);
  assert.match(html, /<pre class="mermaid">/);
  assert.doesNotMatch(html, /hljs/); // not syntax-highlighted
});

test("highlights normal code fences", () => {
  const { html } = renderMarkdown("```js\nconst x = 1;\n```", "README.md");
  assert.match(html, /class="hljs/);
});

test("renders GitHub-style callouts", () => {
  const { html } = renderMarkdown("> [!NOTE]\n> Something.", "README.md");
  assert.match(html, /class="callout callout-note"/);
  assert.match(html, /data-callout="Note"/);
});

test("derives title from first H1", () => {
  assert.equal(renderMarkdown("# My Title\n\ntext", "a.md").title, "My Title");
});

test("front-matter title overrides H1", () => {
  const src = "---\ntitle: FM Title\n---\n\n# Other\n";
  assert.equal(renderMarkdown(src, "a.md").title, "FM Title");
});

test("falls back to filename when no title", () => {
  assert.equal(renderMarkdown("just text", "docs/readme.md").title, "readme.md");
});

test("adds heading anchor ids for the TOC", () => {
  const { html } = renderMarkdown("## Section One", "a.md");
  assert.match(html, /id="section-one"/);
});
