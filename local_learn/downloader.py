from __future__ import annotations

import time
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests

from config import (
    CONNECT_TIMEOUT,
    MAX_DOWNLOAD_BYTES,
    MAX_REDIRECTS,
    MAX_RETRIES,
    RAW_DIR,
    READ_TIMEOUT,
    RESPECT_ROBOTS,
    USER_AGENT,
)
from database import db
from logging_setup import get_logger
from util import atomic_write, sha256_bytes, validate_url

log = get_logger("downloader")

_robots_cache: dict[str, RobotFileParser] = {}


def allowed_by_robots(url: str) -> bool:
    if not RESPECT_ROBOTS:
        return True
    p = urlparse(url)
    root = f"{p.scheme}://{p.netloc}/robots.txt"
    rp = _robots_cache.get(root)
    if rp is None:
        rp = RobotFileParser()
        try:
            r = requests.get(root, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT), headers={"User-Agent": USER_AGENT})
            if r.status_code == 200:
                rp.parse(r.text.splitlines())
            else:
                rp.parse([])
        except requests.RequestException:
            rp.parse([])
        _robots_cache[root] = rp
    return rp.can_fetch(USER_AGENT, url)


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept": "*/*"})
    s.max_redirects = MAX_REDIRECTS
    return s


def download_url(url: str) -> dict:
    url = validate_url(url)
    if not allowed_by_robots(url):
        raise PermissionError(f"robots.txt disallows {url}")

    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            return _download_once(url)
        except (requests.Timeout, requests.ConnectionError) as e:
            last_err = e
            sleep = min(30, 2 ** attempt)
            log.warning("retry %s in %ss: %s", attempt + 1, sleep, e)
            time.sleep(sleep)
        except requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else 0
            if 400 <= code < 500 and code != 429:
                raise
            last_err = e
            time.sleep(min(30, 2 ** attempt))
    raise RuntimeError(f"download failed after retries: {last_err}")


def _download_once(url: str) -> dict:
    with _session() as s:
        with s.get(url, stream=True, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT), allow_redirects=True) as r:
            r.raise_for_status()
            if len(r.history) > MAX_REDIRECTS:
                raise RuntimeError("too many redirects")
            final = r.url
            validate_url(final)
            ctype = r.headers.get("Content-Type", "").split(";")[0].strip()
            clen = r.headers.get("Content-Length")
            if clen and int(clen) > MAX_DOWNLOAD_BYTES:
                raise RuntimeError("remote file exceeds max size")
            buf = bytearray()
            for chunk in r.iter_content(64 * 1024):
                if not chunk:
                    continue
                buf.extend(chunk)
                if len(buf) > MAX_DOWNLOAD_BYTES:
                    raise RuntimeError("download exceeded max size")
            data = bytes(buf)
            if not data:
                raise RuntimeError("empty download")
            digest = sha256_bytes(data)
            existing = db.find_download_hash(digest)
            if existing and existing["status"] == "ok":
                log.info("duplicate bytes %s", digest[:12])
                return {
                    "duplicate": True,
                    "sha256": digest,
                    "canonical_url": final,
                    "content_type": ctype,
                    "byte_size": len(data),
                    "path": existing["path"],
                }
            ext = _ext(ctype, final, data)
            dest = RAW_DIR / f"{digest}{ext}"
            RAW_DIR.mkdir(parents=True, exist_ok=True)
            atomic_write(dest, data)
            if dest.stat().st_size != len(data):
                dest.unlink(missing_ok=True)
                raise RuntimeError("incomplete write")
            return {
                "duplicate": False,
                "sha256": digest,
                "canonical_url": final,
                "content_type": ctype,
                "byte_size": len(data),
                "path": str(dest),
                "data": data,
            }


def _ext(ctype: str, url: str, data: bytes) -> str:
    if data[:4] == b"%PDF" or "pdf" in ctype:
        return ".pdf"
    if "html" in ctype or data[:15].lower().startswith(b"<!doctype html") or data[:6].lower().startswith(b"<html"):
        return ".html"
    if "json" in ctype or (data[:1] in (b"{", b"[")):
        return ".json"
    if "xml" in ctype or "rss" in ctype or "atom" in ctype:
        return ".xml"
    path = urlparse(url).path.lower()
    for e in (".md", ".txt", ".html", ".htm", ".pdf", ".json", ".xml"):
        if path.endswith(e):
            return e if e != ".htm" else ".html"
    return ".bin"


def extract_feed_urls(data: bytes, base: str) -> list[str]:
    try:
        import feedparser
    except ImportError:
        return []
    parsed = feedparser.parse(data)
    if not getattr(parsed, "entries", None):
        return []
    urls = []
    for e in parsed.entries:
        link = getattr(e, "link", None) or (e.get("id") if isinstance(e, dict) else None)
        if link:
            urls.append(urljoin(base, link))
    return urls


def looks_like_feed(ctype: str, data: bytes) -> bool:
    head = data[:400].lower()
    if "rss" in ctype or "atom" in ctype:
        return True
    return b"<rss" in head or b"<feed" in head or b"xmlns=\"http://www.w3.org/2005/atom\"" in head


def process_queue_item() -> bool:
    row = db.next_queued()
    if not row:
        return False
    url = row["url"]
    qid = row["id"]
    try:
        result = download_url(url)
        if result.get("duplicate"):
            db.record_download(
                url=url,
                canonical_url=result["canonical_url"],
                path=result.get("path"),
                content_type=result.get("content_type"),
                sha256=result["sha256"],
                byte_size=result["byte_size"],
                status="duplicate",
            )
            db.queue_done(qid)
            db.event("info", f"duplicate skip {url}")
            return True
        data = result["data"]
        if looks_like_feed(result["content_type"], data):
            urls = extract_feed_urls(data, result["canonical_url"])
            n = 0
            for u in urls:
                try:
                    validate_url(u)
                except ValueError:
                    continue
                if db.enqueue(u):
                    n += 1
            Path(result["path"]).unlink(missing_ok=True)
            db.record_download(
                url=url,
                canonical_url=result["canonical_url"],
                path=None,
                content_type=result["content_type"],
                sha256=result["sha256"],
                byte_size=result["byte_size"],
                status="ok",
            )
            db.queue_done(qid)
            db.event("info", f"feed {url} queued {n} entries")
            return True
        db.record_download(
            url=url,
            canonical_url=result["canonical_url"],
            path=result["path"],
            content_type=result["content_type"],
            sha256=result["sha256"],
            byte_size=result["byte_size"],
            status="ok",
        )
        db.queue_done(qid)
        db.event("info", f"downloaded {url}")
        return True
    except Exception as e:
        log.exception("download error %s", url)
        db.event("error", f"{url}: {e}")
        db.record_download(url=url, status="failed", error=str(e)[:1000])
        retries = row["retries"]
        db.queue_fail(qid, str(e), retry=retries < MAX_RETRIES - 1)
        return True
