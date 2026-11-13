#!/usr/bin/env python3
"""Build the Physics Web.

Reads every docs/*.tex (except files starting with "_"), then
  1. compiles each one to web/pdf/<Tag>.pdf,
  2. compiles book.tex to web/pdf/book.pdf,
A document containing only its \\smalldoc line (and optionally \\uses etc.)
counts as "not written yet": it gets a node with its real name but no PDF.
  3. writes web/graph.json (nodes = documents, edges = \\uses).

You never need to edit this. Run locally with:   python3 build.py
Graph only, no compiling:                          python3 build.py --no-pdf
"""
import json
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DOCS = ROOT / "docs"
BUILD = ROOT / "build"
WEB = ROOT / "web"
PDF = WEB / "pdf"


def strip_comments(tex: str) -> str:
    """Remove LaTeX comments (an unescaped % to end of line)."""
    return re.sub(r"(?<!\\)%.*", "", tex)


def braced_args(tex: str, command: str, n: int):
    """Return the first n {...} arguments of the first \\command, or None."""
    m = re.search(r"\\" + command + r"(?![A-Za-z])", tex)
    if not m:
        return None
    i, args = m.end(), []
    for _ in range(n):
        while i < len(tex) and tex[i].isspace():
            i += 1
        if i >= len(tex) or tex[i] != "{":
            return None
        depth, start = 0, i + 1
        while i < len(tex):
            if tex[i] == "{" and tex[i - 1] != "\\":
                depth += 1
            elif tex[i] == "}" and tex[i - 1] != "\\":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        args.append(tex[start:i].strip())
        i += 1
    return args


def remove_command(tex: str, command: str, n: int) -> str:
    """Delete the first \\command and its n {...} arguments."""
    m = re.search(r"\\" + command + r"(?![A-Za-z])", tex)
    if not m:
        return tex
    i = m.end()
    for _ in range(n):
        while i < len(tex) and tex[i].isspace():
            i += 1
        if i >= len(tex) or tex[i] != "{":
            break
        depth = 0
        while i < len(tex):
            if tex[i] == "{" and tex[i - 1] != "\\":
                depth += 1
            elif tex[i] == "}" and tex[i - 1] != "\\":
                depth -= 1
                if depth == 0:
                    i += 1
                    break
            i += 1
    return tex[:m.start()] + tex[i:]


def read_docs():
    docs, problems = [], []
    for path in sorted(DOCS.glob("*.tex")):
        if path.name.startswith("_"):
            continue
        tex = strip_comments(path.read_text(encoding="utf-8"))
        head = braced_args(tex, "smalldoc", 2)
        if not head or not head[1]:
            problems.append(f"{path.name}: no \\smalldoc{{Title}}{{Tag}} line, skipped")
            continue
        title, tag = head
        uses = braced_args(tex, "uses", 1)
        status = braced_args(tex, "status", 1)
        body = tex
        for cmd, n in (("smalldoc", 2), ("uses", 1), ("assumes", 1), ("status", 1)):
            body = remove_command(body, cmd, n)
        docs.append({
            "unwritten": not body.strip(),
            "file": path.name,
            "title": title,
            "tag": tag,
            "uses": [u.strip() for u in uses[0].split(",") if u.strip()] if uses else [],
            "status": status[0] if status else "",
        })
    seen = {}
    for d in docs:
        if d["tag"] in seen:
            problems.append(f"tag {d['tag']} used by both {seen[d['tag']]} and {d['file']}")
        seen[d["tag"]] = d["file"]
    return docs, problems


def latexmk(texfile: Path, jobname: str, outdir: Path) -> bool:
    outdir.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["latexmk", "-pdf", "-interaction=nonstopmode", "-halt-on-error",
         f"-jobname={jobname}", f"-outdir={outdir}", str(texfile)],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def compile_doc(doc) -> bool:
    tag = doc["tag"]
    outdir = BUILD / tag
    outdir.mkdir(parents=True, exist_ok=True)
    wrapper = outdir / "wrap.tex"
    wrapper.write_text(
        "\\documentclass[11pt]{article}\n\\input{preamble}\n\\begin{document}\n"
        f"\\input{{docs/{doc['file'][:-4]}}}\n\\end{{document}}\n",
        encoding="utf-8",
    )
    ok = latexmk(wrapper, tag, outdir)
    if ok:
        shutil.copy(outdir / f"{tag}.pdf", PDF / f"{tag}.pdf")
    return ok


def main():
    make_pdfs = "--no-pdf" not in sys.argv
    docs, problems = read_docs()
    PDF.mkdir(parents=True, exist_ok=True)

    failed = set()
    if make_pdfs:
        written = [d for d in docs if not d["unwritten"]]
        with ThreadPoolExecutor() as pool:
            for doc, ok in zip(written, pool.map(compile_doc, written)):
                if not ok:
                    failed.add(doc["tag"])
                    problems.append(f"{doc['file']}: failed to compile (see build/{doc['tag']}/)")
        if (ROOT / "book.tex").exists() and latexmk(ROOT / "book.tex", "book", BUILD / "book"):
            shutil.copy(BUILD / "book" / "book.pdf", PDF / "book.pdf")

    tags = {d["tag"] for d in docs}
    nodes = [{
        "id": d["tag"], "label": d["title"], "status": d["status"],
        "url": None if d["unwritten"] else f"pdf/{d['tag']}.pdf",
        "ghost": d["unwritten"], "failed": d["tag"] in failed,
    } for d in docs]
    ghosts = sorted({u for d in docs for u in d["uses"]} - tags)
    for g in ghosts:
        problems.append(f"{g} is used but has no file; add docs/<name>.tex with just "
                        f"\\smalldoc{{Its name}}{{{g}}} to give it a name")
    nodes += [{"id": g, "label": g, "status": "", "url": None, "ghost": True, "failed": False}
              for g in ghosts]
    edges = [{"from": u, "to": d["tag"]} for d in docs for u in d["uses"]]

    (WEB / "graph.json").write_text(json.dumps({"nodes": nodes, "edges": edges}, indent=1),
                                    encoding="utf-8")
    n_unwritten = sum(d["unwritten"] for d in docs) + len(ghosts)
    print(f"{len(docs) + len(ghosts)} documents ({n_unwritten} not written yet), {len(edges)} links")
    for p in problems:
        print("  !", p)


if __name__ == "__main__":
    main()
