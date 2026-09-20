from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import shutil
import signal
import socket
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator
from urllib.parse import urlparse

from logging_setup import get_logger

log = get_logger("util")

URL_RE = re.compile(r"^https?://", re.I)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def validate_url(url: str) -> str:
    u = (url or "").strip()
    if not URL_RE.match(u):
        raise ValueError(f"malformed URL: {url!r}")
    p = urlparse(u)
    if p.scheme not in ("http", "https") or not p.netloc:
        raise ValueError(f"malformed URL: {url!r}")
    if p.username or p.password:
        raise ValueError("credentials in URL are not allowed")
    host = p.hostname or ""
    if host in {"localhost", "127.0.0.1", "::1"} or host.endswith(".local"):
        raise ValueError("loopback/local URLs are blocked")
    try:
        infos = socket.getaddrinfo(host, None)
        for info in infos:
            ip = info[4][0]
            if ip.startswith("10.") or ip.startswith("192.168.") or ip.startswith("127.") or ip.startswith("169.254."):
                raise ValueError("private-network URLs are blocked")
            if ip.startswith("172."):
                second = int(ip.split(".")[1])
                if 16 <= second <= 31:
                    raise ValueError("private-network URLs are blocked")
    except socket.gaierror as e:
        raise ValueError(f"cannot resolve host: {host}") from e
    return u


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    with tmp.open("wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def atomic_write_text(path: Path, text: str) -> None:
    atomic_write(path, text.encode("utf-8"))


def json_one_line(obj: dict) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def free_disk_mb(path: Path) -> int:
    usage = shutil.disk_usage(path)
    return usage.free // (1024 * 1024)


def available_ram_mb() -> int | None:
    try:
        import psutil

        return int(psutil.virtual_memory().available / (1024 * 1024))
    except Exception:
        pass
    if Path("/proc/meminfo").exists():
        txt = Path("/proc/meminfo").read_text()
        for line in txt.splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) // 1024
    return None


def load_average() -> float:
    try:
        return os.getloadavg()[0] / max(1, os.cpu_count() or 1)
    except OSError:
        return 0.0


def is_idle(threshold: float) -> bool:
    return load_average() < threshold


class FileLock:
    def __init__(self, path: Path):
        self.path = path
        self._fh = None

    def acquire(self, blocking: bool = False) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = self.path.open("a+")
        try:
            fcntl.flock(self._fh.fileno(), fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
            self._fh.seek(0)
            self._fh.truncate()
            self._fh.write(str(os.getpid()))
            self._fh.flush()
            return True
        except BlockingIOError:
            self._fh.close()
            self._fh = None
            return False

    def release(self) -> None:
        if self._fh:
            try:
                fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
            finally:
                self._fh.close()
                self._fh = None

    def __enter__(self):
        if not self.acquire(True):
            raise RuntimeError(f"could not lock {self.path}")
        return self

    def __exit__(self, *exc):
        self.release()


@contextmanager
def graceful_signals(handler) -> Iterator[None]:
    prev_int = signal.getsignal(signal.SIGINT)
    prev_term = signal.getsignal(signal.SIGTERM)
    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)
    try:
        yield
    finally:
        signal.signal(signal.SIGINT, prev_int)
        signal.signal(signal.SIGTERM, prev_term)


def wait_stable(path: Path, seconds: float = 1.5, polls: int = 4) -> bool:
    """True only if size+mtime stay unchanged for `seconds` and size > 0."""
    try:
        st = path.stat()
    except FileNotFoundError:
        return False
    last = (st.st_size, st.st_mtime_ns)
    if st.st_size <= 0:
        return False
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        time.sleep(min(0.2, seconds / max(polls, 1)))
        try:
            st = path.stat()
        except FileNotFoundError:
            return False
        cur = (st.st_size, st.st_mtime_ns)
        if cur != last:
            last = cur
            deadline = time.monotonic() + seconds
            if st.st_size <= 0:
                return False
    return last[0] > 0
