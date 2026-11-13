# Physics Web

Small LaTeX documents → a clickable web of PDFs, plus an optional book.

## Daily use (in Overleaf)

**New document**
1. New file in `docs/` (any name, e.g. `docs/twisting.tex`).
2. First line: `\smalldoc{Topological twisting}{Twist}`. Optionally add `\uses{SUSY, Spin}`, `\assumes{...}`, `\status{draft}`. Then just write.
3. In `desk.tex`, change the one `\input{docs/...}` line to your file. Recompile.

**Publish**: Menu → GitHub → Push to GitHub. A few minutes later, the web has the new node.

**Book**: add `\input{docs/twisting}` under a `\spine{...}` in `book.tex`. Move the line to move the document.

## The rules (all of them)

- The tag (`Twist`) is the document's name everywhere: equation numbers (Twist.3), links, PDF file, web node. Keep it short and unique.
- `\uses{...}` = direct dependencies only. These are the only links on the web.
  A tag that doesn't exist yet appears as a grey dashed "not written yet" node.
- `\docref{Tag}` links to another document inside the text.
- Files starting with `_` are ignored.
- Shared packages/macros go in `preamble.tex`.

## One-time setup

1. Put these files in a GitHub repo (or into your existing Physics Web repo).
2. GitHub repo → Settings → Pages → Source: **GitHub Actions**.
3. Overleaf → New Project → Import from GitHub → pick the repo.
   (GitHub sync is an Overleaf premium feature; many universities provide it.)
4. In Overleaf, Menu → Main document → `desk.tex`.

`build.py` and `.github/workflows/build.yml` do the rest; you never edit them.
To build locally: `python3 build.py` (needs latexmk), then open `web/index.html` via a local server.
