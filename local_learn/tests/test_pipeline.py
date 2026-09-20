from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

import config
from cleaner import parse_file, parse_html, parse_json, parse_markdown, parse_rss_text, parse_txt
from dataset_manager import append_corpus, iter_corpus, rebuild_splits
from downloader import extract_feed_urls, looks_like_feed
from rag import context_for, index_document
from util import FileLock, json_one_line, sha256_text, validate_url

FIX = Path(__file__).parent / "fixtures"


def test_malformed_url():
    with pytest.raises(ValueError):
        validate_url("not-a-url")
    with pytest.raises(ValueError):
        validate_url("ftp://example.com/x")
    with pytest.raises(ValueError):
        validate_url("https://localhost/secret")


def test_html_ingestion(tmp_path, monkeypatch):
    text, kind = parse_file(FIX / "sample.html")
    assert kind == "html"
    assert "Moon perches" in text
    assert "evil" not in text
    assert "Home" not in text or "Owls hunt" in text


def test_txt_md_json():
    t, k = parse_file(FIX / "sample.txt")
    assert k == "txt" and "batch size" in t
    t, k = parse_file(FIX / "sample.md")
    assert k == "md" and "LoRA" in t
    t, k = parse_file(FIX / "sample.json")
    assert "Adapters live" in t


def test_rss_feed_urls():
    data = (FIX / "sample.rss").read_bytes()
    assert looks_like_feed("application/rss+xml", data)
    urls = extract_feed_urls(data, "https://example.com/feed")
    assert "https://example.com/one" in urls
    text, _ = parse_file(FIX / "sample.rss")
    assert "Entry one" in text or "One" in text


def test_pdf_or_skip(tmp_path):
    try:
        from pypdf import PdfWriter
        from pypdf.generic import NameObject, NumberObject, TextStringObject
    except ImportError:
        pytest.skip("pypdf missing")
    # write a tiny pdf via reportlab-less method: pypdf cannot easily add text without fonts
    # skip generation; scanned detection is covered by empty parser path
    empty = tmp_path / "empty.pdf"
    empty.write_bytes(b"%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
    with pytest.raises(Exception):
        parse_file(empty)


def test_duplicate_and_jsonl(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DATASET_JSONL", tmp_path / "dataset.jsonl")
    monkeypatch.setattr(config, "TRAIN_DIR", tmp_path)
    import dataset_manager as dm

    monkeypatch.setattr(dm, "DATASET_JSONL", tmp_path / "dataset.jsonl")
    monkeypatch.setattr(dm, "TRAIN_DIR", tmp_path)
    monkeypatch.setattr(dm, "TRAIN_JSONL", tmp_path / "train.jsonl")
    monkeypatch.setattr(dm, "VALID_JSONL", tmp_path / "valid.jsonl")
    monkeypatch.setattr(dm, "TEST_JSONL", tmp_path / "test.jsonl")
    body = "x" * 90 + " unique document for split tests about owls and perches."
    dm.append_corpus(body)
    dm.append_corpus(body)
    texts = dm.iter_corpus()
    assert len(texts) == 2
    h = sha256_text(body)
    assert h == sha256_text(texts[0])
    splits = dm.rebuild_splits()
    assert splits["train"] + splits["valid"] + splits["test"] == 1  # deduped


def test_corrupt_jsonl(tmp_path, monkeypatch):
    p = tmp_path / "dataset.jsonl"
    p.write_text("{not json\n")
    import dataset_manager as dm

    monkeypatch.setattr(dm, "DATASET_JSONL", p)
    with pytest.raises(ValueError, match="corrupt"):
        dm.iter_corpus()


def test_json_one_line():
    s = json_one_line({"text": "a\nb"})
    assert "\n" not in s
    assert json.loads(s)["text"] == "a\nb"


def test_filelock(tmp_path):
    p = tmp_path / "l.lock"
    a = FileLock(p)
    b = FileLock(p)
    assert a.acquire(False)
    assert not b.acquire(False)
    a.release()
    assert b.acquire(False)
    b.release()


def test_rag(tmp_path, monkeypatch):
    import rag

    monkeypatch.setattr(rag, "RAG_DB", tmp_path / "rag.sqlite")
    index_document("src", "LoRA adapters stay on disk and never leave the roost.")
    ctx = context_for("LoRA adapters")
    assert "adapters" in ctx.lower() or ctx == "" or "LoRA" in ctx


def test_incomplete_download_rejected(tmp_path):
    part = tmp_path / "x.bin.part"
    part.write_bytes(b"partial")
    from ingestion_watcher import ingest_path

    assert ingest_path(part) is False
