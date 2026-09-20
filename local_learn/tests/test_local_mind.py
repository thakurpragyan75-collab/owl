from __future__ import annotations

import json
import os
import socket
import time
from pathlib import Path
from unittest.mock import patch

import pytest

os.environ["MODEL_ENGINE"] = "stub"

from conversation import converse
from llm.stub_provider import StubProvider
from tools import dispatch
from util import wait_stable


class Guard(socket.socket):
    def connect(self, addr, *a, **k):  # type: ignore[override]
        host = addr[0] if isinstance(addr, tuple) else addr
        if "x.ai" in str(host) or "openai" in str(host) or "anthropic" in str(host):
            raise AssertionError(f"cloud connect blocked: {addr}")
        return super().connect(addr, *a, **k)


def test_offline_conversation_no_cloud():
    with patch("socket.socket", Guard):
        out = converse(
            StubProvider(),
            prompt="Explain recursion.",
            history=[],
            boss_name="Boss",
            personality="warm",
            notes=[],
            people=[],
        )
    assert out["ok"]
    assert "recursion" in out["text"].lower()
    assert out["engine"] == "stub"


def test_hey_owl_local():
    out = converse(StubProvider(), prompt="Hey OWL", history=[], boss_name="Ada", personality="warm", notes=[], people=[])
    assert out["ok"]
    assert "cloud" in out["text"].lower() or "local" in out["text"].lower() or "awake" in out["text"].lower()


def test_tool_permission():
    with pytest.raises(PermissionError):
        dispatch("rm_rf", {})
    with pytest.raises(PermissionError):
        dispatch("run_python", {"code": "import os; os.system('echo hi')"})
    assert dispatch("calculate", {"expr": "1+2*3"}) == "7"


def test_wait_stable_requires_unchanged(tmp_path):
    p = tmp_path / "a.txt"
    p.write_text("hello world " * 20)
    assert wait_stable(p, seconds=0.35, polls=4)
    empty = tmp_path / "z.txt"
    empty.write_text("")
    assert wait_stable(empty, seconds=0.2, polls=3) is False


def test_rag_provenance(tmp_path, monkeypatch):
    import rag

    monkeypatch.setattr(rag, "RAG_DB", tmp_path / "rag.sqlite")
    rag.index_document(
        "https://example.com/paper",
        "Transformers use self-attention. This paper explains scaled dot product attention in depth.",
        doc_hash="abc",
        canonical_url="https://example.com/paper",
    )
    hits = rag.search("transformers attention")
    assert hits
    assert hits[0]["source"] == "https://example.com/paper"
    assert hits[0]["doc_hash"] == "abc"
    ctx = rag.context_for("transformers")
    assert "example.com" in ctx
