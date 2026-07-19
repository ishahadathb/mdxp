# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`mdxplore` — a zero-dependency-on-build CLI that serves a directory of Markdown as a browsable HTML explorer. It's a small local HTTP server that renders each `.md` on request; it **never writes to the directory it serves** (a stated product guarantee — don't break it).

History note: the project was previously named `mdxp` (and `mdth` before that); it was renamed because npm rejected `mdxp` as too similar to `md5`. Package, bin command, and GitHub repo (`ishahadathb/mdxplore`) all use the current name.

## Commands

```bash
npm test                          # full suite (Node's built-in node:test runner)
node --test test/render.test.js   # single test file
node --test --test-name-pattern="rewrites"   # tests matching a pattern
npm run test:watch
npm run demo                      # serve the bundled ./sample directory
node bin/mdxplore.js <dir>        # run the CLI directly
```

- Requires Node **>= 22.12** (engines field; CI runs Node 22 and 24).
- No build step, no bundler, no linter — plain ESM (`"type": "module"`) throughout, including the browser client.
- Release: `npm version patch|minor|major` (preversion runs tests; postversion pushes commit + tag), then `npm publish`. package.json is the single version source of truth — `src/version.js` reads it; never hardcode a version elsewhere.

## Architecture

Request flow: `bin/mdxplore.js` (arg parsing, port auto-bump from 4321, browser open) → `createServer({root, showAll, live})` in `src/server.js`, which returns a plain `node:http` server routing to:

- `/` and `/view/<rel>` — full reader page (shell + rendered doc)
- `/partial/<rel>` — JSON `{html, title, breadcrumbs}` for pjax navigation (client swaps content without reload)
- `/raw/<rel>` — streams any non-Markdown file with Range support
- `/assets/*` — mdxplore's own bundled CSS/JS; the mermaid bundle is resolved out of `node_modules` at runtime (with a vendored fallback in `assets/`)
- `/__events` — SSE stream for live reload (fs.watch, debounced 120ms)
- `/__tree`, `/__search`, `/__ping` — sidebar refresh JSON, full-text search, health check

Server-side modules split cleanly: `src/render.js` (Markdown → sanitized HTML), `src/tree.js` (directory walker, ignore rules), `src/html.js` (string-template rendering of shell/sidebar/breadcrumbs). The directory tree and search index are rebuilt rather than cached across changes — the tree is rebuilt per request, the search index lazily and invalidated on any fs event.

The browser client is `assets/app.js` + `app.css` (vanilla JS, no framework): pjax navigation, ⌘K command palette, SSE reconnect, theme toggle (localStorage key `mdxplore-theme`), Mermaid init. Boot data is embedded in the page as JSON in `<script id="mdxplore-data">` — these identifiers appear in both `src/html.js` and `assets/app.js` and must stay in sync.

Link rewriting is the glue between rendering and routing: `render.js` resolves relative links against the current file and rewrites them to `/view/` (Markdown) or `/raw/` (everything else) using the shared `VIEW_PREFIX`/`RAW_PREFIX` constants. Links that escape the served root are left untouched.

## Security invariants

These are deliberate, commented defenses spread across files — preserve all of them when touching rendering or file serving:

- **Path containment** (`safeResolve` in server.js): checked twice — lexically against `../`, then again after `realpath` so symlinks inside the served tree can't point outside it.
- **XSS**: Markdown may contain raw HTML (`html: true`), so all rendered output passes through the `sanitize-html` allow-list in render.js before reaching the browser. CSP headers go on every response; `/raw/` additionally gets `script-src 'none'` so a served HTML file can't run scripts in the app's origin.
- **Front-matter RCE**: gray-matter is forced to YAML with all executable engines (js/coffee) neutered — front-matter is data, never code.
- **DoS**: rendering and search-indexing both skip files over 3 MB (rendering is synchronous and would block the event loop).
- Errors are logged server-side only; no stack traces in responses.

## Testing patterns

Tests use `node:test` + `node:assert/strict`, no framework. `test/fixture.js` `makeFixture()` builds a throwaway directory tree under the OS temp dir (including files that must be ignored, like `node_modules/` and dotdirs). Server tests boot a real server on port 0 with `live: false` (no watcher) and hit it with `fetch`. Follow this shape for new tests: real server, real filesystem, no mocks.
