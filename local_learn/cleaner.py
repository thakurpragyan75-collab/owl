from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

from config import MAX_CHARS, MIN_CHARS
from logging_setup import get_logger

log = get_logger("cleaner")

CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
WS = re.compile(r"[ \t]+")
MULTI_NL = re.compile(r"\n{3,}")
SCRIPT = re.compile(r"<(script|style|noscript|iframe)[\s\S]*?</\1>", re.I)
TAG = re.compile(r"<[^>]+>")
BOILER = re.compile(
    r"(cookie (policy|notice|settings)|subscribe to our newsletter|all rights reserved|advertisement)",
    re.I,
)


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = CTRL.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = WS.sub(" ", text)
    text = MULTI_NL.sub("\n\n", text)
    paras = []
    seen: set[str] = set()
    for p in text.split("\n"):
        p = p.strip()
        if not p:
            if paras and paras[-1] != "":
                paras.append("")
            continue
        key = p.lower()
        if key in seen:
            continue
        seen.add(key)
        paras.append(p)
    out = "\n".join(paras).strip()
    return out


def validate_text(text: str) -> str:
    t = normalize_text(text)
    if len(t) < MIN_CHARS:
        raise ValueError("document too short or empty")
    if len(t) > MAX_CHARS:
        t = t[:MAX_CHARS]
    return t


def parse_txt(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return validate_text(raw.decode(enc))
        except UnicodeDecodeError:
            continue
    return validate_text(raw.decode("utf-8", errors="replace"))


def parse_markdown(path: Path) -> str:
    return parse_txt(path)


def parse_html(path: Path) -> str:
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        html = path.read_text(encoding="utf-8", errors="replace")
        html = SCRIPT.sub(" ", html)
        return validate_text(TAG.sub(" ", html))
    soup = BeautifulSoup(path.read_bytes(), "lxml")
    for tag in soup(["script", "style", "noscript", "iframe", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()
    for sel in ("[class*='cookie']", "[id*='cookie']", "[class*='ad-']", "[id*='advert']"):
        for el in soup.select(sel):
            el.decompose()
    main = soup.find("article") or soup.find("main") or soup.body or soup
    text = main.get_text("\n", strip=True)
    lines = [ln for ln in text.splitlines() if not BOILER.search(ln)]
    return validate_text("\n".join(lines))


def parse_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as e:
        raise RuntimeError("pypdf is required for PDF parsing") from e
    reader = PdfReader(str(path))
    if getattr(reader, "is_encrypted", False):
        raise ValueError("encrypted PDF")
    pages = []
    for page in reader.pages:
        t = page.extract_text() or ""
        pages.append(t)
    joined = "\n".join(pages)
    if not joined.strip():
        raise ValueError("empty or scanned PDF (OCR not run locally; no cloud OCR)")
    # drop repeated headers/footers: lines appearing on >50% of pages
    by_page = [p.splitlines() for p in pages if p.strip()]
    if len(by_page) >= 3:
        from collections import Counter

        c: Counter[str] = Counter()
        for lines in by_page:
            for ln in {x.strip() for x in lines if x.strip()}:
                c[ln] += 1
        drop = {ln for ln, n in c.items() if n >= max(2, len(by_page) // 2) and len(ln) < 80}
        cleaned = []
        for lines in by_page:
            cleaned.extend([ln for ln in lines if ln.strip() not in drop])
        joined = "\n".join(cleaned)
    return validate_text(joined)


def _json_strings(obj, acc: list[str], depth: int = 0) -> None:
    if depth > 12:
        return
    if isinstance(obj, str):
        if len(obj) >= 20:
            acc.append(obj)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k.lower() in {"content", "text", "body", "title", "summary", "description", "article"}:
                _json_strings(v, acc, depth + 1)
            else:
                _json_strings(v, acc, depth + 1)
    elif isinstance(obj, list):
        for it in obj[:200]:
            _json_strings(it, acc, depth + 1)


def parse_json(path: Path) -> str:
    data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    acc: list[str] = []
    _json_strings(data, acc)
    if not acc:
        acc = [json.dumps(data)[:MAX_CHARS]]
    return validate_text("\n\n".join(acc))


def parse_rss_text(path: Path) -> str:
    # feeds should normally enqueue entry URLs; this is fallback text extract
    try:
        import feedparser
    except ImportError:
        return parse_txt(path)
    parsed = feedparser.parse(path.read_bytes())
    parts = []
    for e in parsed.entries[:50]:
        title = getattr(e, "title", "") or ""
        summary = getattr(e, "summary", "") or getattr(e, "description", "") or ""
        parts.append(f"{title}\n{TAG.sub(' ', summary)}")
    return validate_text("\n\n".join(parts))


SIGNATURES = {
    b"%PDF": "pdf",
    b"{": "json",
    b"[": "json",
    b"<!DO": "html",
    b"<!do": "html",
    b"<htm": "html",
    b"<HTM": "html",
    b"<?xml": "xml",
}


def sniff_type(path: Path, content_type: str | None = None) -> str:
    suffix = path.suffix.lower()
    mapping = {
        ".pdf": "pdf",
        ".html": "html",
        ".htm": "html",
        ".md": "md",
        ".markdown": "md",
        ".txt": "txt",
        ".json": "json",
        ".xml": "rss",
        ".rss": "rss",
        ".atom": "rss",
    }
    if suffix in mapping:
        return mapping[suffix]
    ct = (content_type or "").lower()
    if "pdf" in ct:
        return "pdf"
    if "html" in ct:
        return "html"
    if "json" in ct:
        return "json"
    if "rss" in ct or "atom" in ct or "xml" in ct:
        return "rss"
    head = path.read_bytes()[:16]
    for sig, kind in SIGNATURES.items():
        if head.startswith(sig):
            return kind
    return "txt"


def parse_file(path: Path, content_type: str | None = None) -> tuple[str, str]:
    kind = sniff_type(path, content_type)
    parsers = {
        "pdf": parse_pdf,
        "html": parse_html,
        "md": parse_markdown,
        "txt": parse_txt,
        "json": parse_json,
        "rss": parse_rss_text,
        "xml": parse_rss_text,
    }
    fn = parsers.get(kind, parse_txt)
    return fn(path), kind
