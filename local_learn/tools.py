from __future__ import annotations

import ast
import json
import math
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from config import ROOT, SANDBOX_DIR
from rag import search as rag_search
from util import available_ram_mb, free_disk_mb

ALLOWED = {
    "search_files",
    "read_file",
    "list_directory",
    "search_knowledge",
    "inspect_project",
    "calculate",
    "system_status",
    "run_python",
}

ROOT_RESOLVED = ROOT.resolve()
MAX_READ = 80_000


def _safe_path(rel: str) -> Path:
    raw = Path(rel)
    p = (SANDBOX_DIR / raw).resolve() if not raw.is_absolute() else raw.resolve()
    sandbox = SANDBOX_DIR.resolve()
    if sandbox in p.parents or p == sandbox:
        return p
    if ROOT_RESOLVED in p.parents or p == ROOT_RESOLVED:
        if any(part.startswith(".") for part in p.relative_to(ROOT_RESOLVED).parts):
            raise PermissionError("hidden paths blocked")
        return p
    raise PermissionError("path outside roost")


def search_files(query: str, directory: str = ".") -> str:
    q = (query or "").lower()
    root = _safe_path(directory)
    hits = []
    for p in root.rglob("*"):
        if p.is_file() and q in p.name.lower():
            hits.append(str(p.relative_to(ROOT_RESOLVED) if ROOT_RESOLVED in p.parents else p))
        if len(hits) >= 40:
            break
    return "\n".join(hits) or "(none)"


def read_file(path: str) -> str:
    p = _safe_path(path)
    if p.suffix.lower() in {".py", ".sh", ".bin", ".gguf", ".safetensors"} and "run_python" not in path:
        if p.stat().st_size > MAX_READ:
            raise PermissionError("file too large")
    data = p.read_text(encoding="utf-8", errors="replace")
    return data[:MAX_READ]


def list_directory(path: str = ".") -> str:
    p = _safe_path(path)
    names = []
    for c in sorted(p.iterdir())[:80]:
        names.append(c.name + ("/" if c.is_dir() else ""))
    return "\n".join(names)


def search_knowledge(query: str) -> str:
    hits = rag_search(query, k=5)
    if not hits:
        return "(no local knowledge)"
    return "\n\n".join(f"source={h['source']} id={h['id']}\n{h['body']}" for h in hits)


def inspect_project() -> str:
    return f"roost={ROOT}\nsandbox={SANDBOX_DIR}\n"


def calculate(expr: str) -> str:
    node = ast.parse(expr, mode="eval")
    allowed = (
        ast.Expression,
        ast.BinOp,
        ast.UnaryOp,
        ast.Num,
        ast.Constant,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.Pow,
        ast.Mod,
        ast.USub,
        ast.UAdd,
        ast.FloorDiv,
        ast.Load,
        ast.Call,
        ast.Name,
    )
    for n in ast.walk(node):
        if not isinstance(n, allowed):
            raise ValueError("expression not allowed")
        if isinstance(n, ast.Call):
            raise ValueError("calls not allowed")
        if isinstance(n, ast.Name):
            raise ValueError("names not allowed")
    val = eval(compile(node, "<calc>", "eval"), {"__builtins__": {}}, {})
    return str(val)


def system_status() -> str:
    return json.dumps({"ram_mb": available_ram_mb(), "disk_mb": free_disk_mb(ROOT)})


def run_python(code: str) -> str:
    if re.search(r"\b(os\.system|subprocess|socket|requests|http|eval|exec|__import__|open\()", code):
        raise PermissionError("code uses blocked primitives")
    SANDBOX_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".py", dir=SANDBOX_DIR, delete=False, encoding="utf-8") as f:
        f.write(code)
        tmp = f.name
    try:
        proc = subprocess.run(
            [sys.executable, tmp],
            cwd=str(SANDBOX_DIR),
            capture_output=True,
            text=True,
            timeout=5,
            env={"PATH": os.environ.get("PATH", ""), "PYTHONPATH": ""},
        )
        out = (proc.stdout or "")[-4000:]
        err = (proc.stderr or "")[-2000:]
        return f"exit={proc.returncode}\n{out}\n{err}".strip()
    finally:
        Path(tmp).unlink(missing_ok=True)


def dispatch(name: str, args: dict) -> str:
    if name not in ALLOWED:
        raise PermissionError(f"tool not allowed: {name}")
    args = args or {}
    if name == "search_files":
        return search_files(str(args.get("query", "")), str(args.get("directory", ".")))
    if name == "read_file":
        return read_file(str(args.get("path", "")))
    if name == "list_directory":
        return list_directory(str(args.get("path", ".")))
    if name == "search_knowledge":
        return search_knowledge(str(args.get("query", "")))
    if name == "inspect_project":
        return inspect_project()
    if name == "calculate":
        return calculate(str(args.get("expr", "0")))
    if name == "system_status":
        return system_status()
    if name == "run_python":
        return run_python(str(args.get("code", "")))
    raise PermissionError(name)
