# mdth

**Markdown, browsable.** Point `mdth` at a folder and it opens a fast, readable HTML explorer for every `.md` file inside — rendered live, on demand. Nothing is written to your files.

```bash
npx mdth ./docs
```

That's it. Your default browser opens on a clean reader with a file tree, search, dark mode, Mermaid diagrams, and working links between documents.

## Why

Most Markdown tools *convert* your files into a pile of `.html` you have to manage. `mdth` doesn't. It's a tiny local server that reads each `.md` when you open it and renders it in the browser. Close it and there's no residue — the directory you served is exactly as you left it.

## Install & run

Run without installing:

```bash
npx mdth               # serve the current directory
npx mdth ./docs        # serve ./docs
npx mdth ./docs -p 8080
```

Or install globally:

```bash
npm install -g mdth
mdth ./notes
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --port <n>` | Preferred port (auto-bumps if taken) | `4321` |
| `-h, --host <addr>` | Bind address | `127.0.0.1` |
| `--no-open` | Don't open the browser automatically | opens |
| `--no-live` | Disable live reload (file watching) | live on |
| `--all` | Show non-Markdown files in the sidebar too | md only |
| `-v, --version` | Print version | |
| `--help` | Show help | |

## Features

- **On-demand rendering** — files are read and rendered per request; nothing is pre-built.
- **Live reload** — edit any `.md` and the page updates itself instantly, keeping your scroll position; new or deleted files update the sidebar automatically.
- **Directory structure preserved** — the sidebar mirrors your folders exactly.
- **Command palette + full-text search** — press <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> to fuzzy-jump by filename *and* search inside document contents, with highlighted snippets.
- **On this page** — a live table of contents tracks your scroll position on long docs.
- **Prev / next** — a pager at the foot of each doc walks through files in order.
- **Callouts** — GitHub-style `> [!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!IMPORTANT]`, `[!CAUTION]`, and more render as colored admonitions.
- **Copy code** — every code block gets a one-click copy button.
- **Navigable cross-references** — a link to `../guide/setup.md` or `./diagram.png` in one document just works; Markdown links open in the reader, other files open directly.
- **Mermaid diagrams** — fenced ` ```mermaid ` blocks render as diagrams, and re-render when you switch themes.
- **Readable by default** — a typography-first layout with a comfortable measure, real heading hierarchy, and syntax-highlighted code.
- **Light / dark** — follows your OS, with a manual toggle that sticks.
- **Instant navigation** — internal links load without a full page reload; the sidebar and your place are preserved.
- **Filter & keyboard** — <kbd>/</kbd> filters the tree, <kbd>⌘K</kbd> opens search, <kbd>Esc</kbd> closes; the palette is fully arrow-key driven.
- **Accessible** — skip-link, visible focus rings, reduced-motion support, and keyboard-navigable throughout.
- **Zero residue** — `mdth` never writes into the directory it serves.

## How it works

`mdth` starts a local HTTP server bound to `127.0.0.1`. Requests map to routes:

- `/view/<path>` renders a Markdown file as a full reader page.
- `/partial/<path>` returns just the rendered document (used for instant in-app navigation).
- `/raw/<path>` streams any other file (images, PDFs, video) straight from disk, with range support.
- `/__events` is a Server-Sent Events stream that pushes live-reload notifications when files change.
- `/__search?q=` runs full-text search over a lazily-built in-memory index (rebuilt when files change).
- `/assets/*` serves mdth's own bundled CSS/JS and Mermaid — never from your folder.

Markdown is parsed with `markdown-it` (CommonMark + tables, task lists, typographer), headings get anchor links, code is highlighted with `highlight.js`, and relative links/images are rewritten to the routes above. Path traversal outside the served directory is blocked.

## Requirements

Node.js 18 or newer.

## Development

```bash
npm install
npm run demo      # serves the bundled ./sample directory
```

To use the `mdth` command from any folder while developing, link it once:

```bash
npm link          # then run `mdth ./any/folder` anywhere
```

### Testing

Tests use Node's built-in runner — no extra dependencies:

```bash
npm test          # run the suite once
npm run test:watch
```

Coverage spans the rendering pipeline (link rewriting, mermaid, callouts, titles), the directory walker (ignore rules, ordering, default doc), and the HTTP server (all routes, full-text search, and the path-traversal guard). CI runs the suite on Node 18, 20, and 22 via GitHub Actions (`.github/workflows/ci.yml`).

## License

MIT
