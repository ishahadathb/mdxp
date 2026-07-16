# API Reference

A tiny reference page to demonstrate deep-linkable headings.

## render

Renders a Markdown string to HTML.

```ts
function render(source: string, currentRel: string): {
  html: string;
  title: string;
  hasMermaid: boolean;
};
```

Relative links inside `source` are resolved against `currentRel`.

## serve

Starts the local server.

```ts
function serve(opts: { root: string; port?: number }): void;
```

Return to [home](../README.md).
