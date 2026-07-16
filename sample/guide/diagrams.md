# Diagrams with Mermaid

Fenced `mermaid` blocks render as diagrams in the browser.

## Flowchart

```mermaid
flowchart LR
    A[Markdown file] -->|request| B(mdth server)
    B --> C{Markdown?}
    C -->|yes| D[Render HTML]
    C -->|no| E[Stream raw file]
    D --> F[Reader]
    E --> F
```

## Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser
    participant S as mdth
    U->>B: click a link
    B->>S: GET /partial/guide/diagrams.md
    S-->>B: rendered HTML
    B-->>U: instant page swap
```

Switch between light and dark mode — the diagrams re-render to match.

Back to [getting started](getting-started.md).
