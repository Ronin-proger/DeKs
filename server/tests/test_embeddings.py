import math
import os

import pytest

from intelligence.embeddings import (
    EmbeddingUnavailable,
    _hash_embedding,
    cosine_similarity,
    embedding_backend,
    get_embedding,
    reset_ollama_embed_state,
)


def test_cosine_identical_vectors():
    vec = [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    assert cosine_similarity(vec, vec) == pytest.approx(1.0)


def test_cosine_orthogonal_truncated():
    a = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    b = [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    assert cosine_similarity(a, b) == pytest.approx(0.0)


def test_hash_embedding_normalized():
    vec = _hash_embedding("alpha beta gamma alpha")
    norm = math.sqrt(sum(v * v for v in vec))
    assert norm == pytest.approx(1.0)
    assert len(vec) == 256


def test_get_embedding_requires_backend(monkeypatch):
    reset_ollama_embed_state()
    monkeypatch.delenv("EMBEDDING_FALLBACK", raising=False)
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:9")

    import intelligence.embeddings as emb

    monkeypatch.setattr(emb, "OLLAMA_BASE_URL", "http://127.0.0.1:9")

    with pytest.raises(EmbeddingUnavailable):
        get_embedding("hello world")
    assert embedding_backend() == "unavailable"


def test_hash_fallback_labeled(monkeypatch):
    reset_ollama_embed_state()
    monkeypatch.setenv("EMBEDDING_FALLBACK", "hash")

    import intelligence.embeddings as emb

    monkeypatch.setattr(emb, "OLLAMA_BASE_URL", "http://127.0.0.1:9")
    vec = get_embedding("hello world tokens")
    assert len(vec) == 256
    assert embedding_backend() == "hash"
