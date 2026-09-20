#!/usr/bin/env python3
"""Loopback OWL mind. Binds 127.0.0.1 only. No public cloud inference."""

from __future__ import annotations

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from config import OWL_SERVICE_HOST, OWL_SERVICE_PORT  # noqa: E402
from conversation import converse  # noqa: E402
from health import health as pipeline_health  # noqa: E402
from llm.provider import load_provider  # noqa: E402
from logging_setup import get_logger  # noqa: E402
from tools import dispatch  # noqa: E402

log = get_logger("owl_service")
_provider = None
_lock = threading.Lock()


def get_provider():
    global _provider
    with _lock:
        if _provider is None:
            _provider = load_provider()
        return _provider


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        log.info("%s " + fmt, self.address_string(), *args)

    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if n > 2_000_000:
            raise ValueError("payload too large")
        raw = self.rfile.read(n) if n else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in {"/", "/health", "/v1/health"}:
            p = get_provider()
            code, lines = pipeline_health()
            self._json(200 if p.loaded else 503, {
                "ok": p.loaded,
                "provider": p.health(),
                "pipeline": lines,
                "pipeline_code": code,
            })
            return
        if path in {"/status", "/v1/status"}:
            from database import db
            from dataset_manager import corpus_stats

            self._json(200, {"provider": get_provider().health(), "stats": db.stats(), "corpus": corpus_stats()})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            data = self._read()
        except Exception as e:
            self._json(400, {"ok": False, "error": str(e)})
            return
        if path in {"/v1/chat", "/chat"}:
            p = get_provider()
            try:
                out = converse(
                    p,
                    prompt=str(data.get("prompt") or ""),
                    history=list(data.get("history") or []),
                    boss_name=str(data.get("bossName") or data.get("boss_name") or "Boss"),
                    personality=str(data.get("personality") or "warm"),
                    notes=list(data.get("notes") or []),
                    people=list(data.get("people") or []),
                    city=str(data.get("city") or ""),
                    favorite_song=str(data.get("favoriteSong") or data.get("favorite_song") or ""),
                    mode=str(data.get("mode") or "talk"),
                )
                self._json(200 if out.get("ok") else 503, out)
            except Exception as e:
                log.exception("chat")
                self._json(500, {"ok": False, "error": str(e), "engine": p.name})
            return
        if path in {"/v1/tools", "/tools"}:
            name = str(data.get("name") or "")
            args = data.get("args") or {}
            try:
                result = dispatch(name, args if isinstance(args, dict) else {})
                self._json(200, {"ok": True, "result": result})
            except Exception as e:
                self._json(400, {"ok": False, "error": str(e)})
            return
        self._json(404, {"error": "not found"})


def main() -> int:
    host = OWL_SERVICE_HOST
    if host not in {"127.0.0.1", "localhost", "::1"}:
        host = "127.0.0.1"
    log.info("loading provider…")
    get_provider()
    httpd = ThreadingHTTPServer((host, OWL_SERVICE_PORT), Handler)
    log.info("OWL local mind on %s:%s", host, OWL_SERVICE_PORT)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
