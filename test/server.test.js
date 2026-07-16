import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.js";
import { makeFixture, cleanup } from "./fixture.js";

let fixture;
let server;
let base;

before(async () => {
  fixture = makeFixture();
  server = createServer({ root: fixture, live: false }); // no watcher in tests
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  cleanup(fixture);
});

test("GET /__ping returns ok", async () => {
  const res = await fetch(base + "/__ping");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ok");
});

test("GET / renders the default document with stylesheet", async () => {
  const res = await fetch(base + "/");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /\/assets\/app\.css/);
  assert.match(html, /Home/); // README H1
});

test("GET /view renders a nested doc with rewritten links", async () => {
  const res = await fetch(base + "/view/guide/intro.md");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /href="\/view\/README\.md"/);
});

test("GET /partial returns JSON payload", async () => {
  const res = await fetch(base + "/partial/guide/intro.md");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.title, "Intro");
  assert.ok(data.html.includes("pomegranate"));
  assert.equal(typeof data.breadcrumbs, "string");
});

test("GET /raw streams a non-markdown file with correct type", async () => {
  const res = await fetch(base + "/raw/assets/pic.svg");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /image\/svg\+xml/);
});

test("GET /assets/app.css serves bundled CSS with no-store", async () => {
  const res = await fetch(base + "/assets/app.css");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/css/);
  assert.match(res.headers.get("cache-control"), /no-store/);
});

test("GET /__tree returns sidebar and file list", async () => {
  const res = await fetch(base + "/__tree?p=README.md");
  const data = await res.json();
  assert.equal(data.files.length, 3);
  assert.match(data.sidebar, /class="tree"/);
  assert.equal(data.mdCount, 3);
});

test("GET /__search finds content matches", async () => {
  const res = await fetch(base + "/__search?q=pomegranate");
  const data = await res.json();
  assert.equal(data.results.length, 1);
  assert.equal(data.results[0].rel, "guide/intro.md");
  assert.ok(data.results[0].snippet.toLowerCase().includes("pomegranate"));
});

test("GET /__search ignores very short queries", async () => {
  const res = await fetch(base + "/__search?q=a");
  const data = await res.json();
  assert.deepEqual(data.results, []);
});

test("missing document returns 404", async () => {
  const res = await fetch(base + "/view/does-not-exist.md");
  assert.equal(res.status, 404);
});

test("path traversal is blocked", async () => {
  const res = await fetch(base + "/raw/%2e%2e/%2e%2e/etc/passwd");
  assert.equal(res.status, 404);
});

test("SSE endpoint responds when live reload is disabled", async () => {
  const res = await fetch(base + "/__events");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/event-stream/);
  // With live:false the server sends a ready event and closes.
  const body = await res.text();
  assert.match(body, /event: ready/);
});
