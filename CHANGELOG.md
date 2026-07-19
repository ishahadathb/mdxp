# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Renamed the package from `mdxp` to `mdxplore` — npm rejected `mdxp` as too
  similar to the existing `md5` package. The installed command is now `mdxplore`.

## [0.1.0] - 2026-07-16

### Added
- On-demand Markdown rendering (`markdown-it`: GFM, tables, task lists, heading anchors).
- Directory explorer with a file-tree sidebar, breadcrumbs, and an "On this page" TOC with scroll-spy.
- Command palette (`⌘K` / `Ctrl+K`) with fuzzy filename matching and full-text content search with snippets.
- Live reload over Server-Sent Events; the open document reloads in place with scroll position preserved.
- Client-side Mermaid diagrams (theme-aware), syntax highlighting (`highlight.js`), and GitHub-style callouts.
- Copy-code buttons, prev/next pager, scroll-to-top, light/dark themes, and a sticky app-shell layout.
- Navigable relative links between documents, raw asset streaming with range support, and a path-traversal guard.
- Zero-residue operation: nothing is written to the served directory.
- Test suite on Node's built-in runner and CI across Node 18/20/22.

### Notes
- Published to npm as `mdxp`; the installed command is `mdxp`.

[Unreleased]: https://github.com/ishahadathb/mdxp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ishahadathb/mdxp/releases/tag/v0.1.0
