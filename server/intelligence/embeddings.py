import hashlib
import json
import logging
import math
import re

import httpx

from database import get_connection, init_db
from intelligence.markdown_utils import utc_now
from intelligence_config import OLLAMA_BASE_URL, OLLAMA_EMBED_MODEL

logger = logging.getLogger(__name__)
EMBED_DIM = 256
EMBED_TIMEOUT = 120.0
_ollama_embed_enabled: bool | None = None


def reset_ollama_embed_state() -> None:
    global _ollama_embed_enabled
    _ollama_embed_enabled = None


def ollama_embeddings_enabled() -> bool:
    return _ollama_embed_enabled is True


def _hash_embedding(text: str) -> list[float]:
    tokens = re.findall(r"\w{3,}", text.lower())
    vector = [0.0] * EMBED_DIM
    if not tokens:
        return vector
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % EMBED_DIM
        vector[index] += 1.0
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / norm for v in vector]


def get_embedding(text: str) -> list[float]:
    global _ollama_embed_enabled
    snippet = text[:4000]
    if not snippet.strip():
        return _hash_embedding("empty")

    try:
        response = httpx.post(
            f"{OLLAMA_BASE_URL}/api/embeddings",
            json={"model": OLLAMA_EMBED_MODEL, "prompt": snippet},
            timeout=EMBED_TIMEOUT,
        )
        if response.status_code == 200:
            payload = response.json()
            embedding = payload.get("embedding")
            if isinstance(embedding, list) and embedding:
                _ollama_embed_enabled = True
                return [float(v) for v in embedding]
        if response.status_code == 404:
            _ollama_embed_enabled = False
            logger.warning("Ollama embed model not found: %s", OLLAMA_EMBED_MODEL)
    except Exception as exc:
        logger.warning("Ollama embeddings unavailable: %s", exc)
    return _hash_embedding(snippet)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    if len(a) != len(b):
        size = min(len(a), len(b))
        if size < 8:
            return 0.0
        a, b = a[:size], b[:size]
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a)) or 1.0
    norm_b = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (norm_a * norm_b)


def upsert_note_embedding(note_path: str, content: str) -> None:
    init_db()
    embedding = get_embedding(content or "")
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO note_embeddings (note_path, embedding, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(note_path) DO UPDATE SET
                embedding = excluded.embedding,
                updated_at = excluded.updated_at
            """,
            (note_path, json.dumps(embedding), utc_now()),
        )
        conn.commit()


def rebuild_embeddings() -> int:
    init_db()
    reset_ollama_embed_state()
    count = 0
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT path, content FROM obsidian_notes"
        ).fetchall()
        for row in rows:
            embedding = get_embedding(row["content"] or "")
            conn.execute(
                """
                INSERT INTO note_embeddings (note_path, embedding, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(note_path) DO UPDATE SET
                    embedding = excluded.embedding,
                    updated_at = excluded.updated_at
                """,
                (row["path"], json.dumps(embedding), utc_now()),
            )
            count += 1
        conn.commit()
    return count


def search_notes(query: str, limit: int = 5) -> list[dict]:
    init_db()
    query_vec = get_embedding(query)
    results = []
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT n.path, n.title, n.content, e.embedding
            FROM obsidian_notes n
            JOIN note_embeddings e ON e.note_path = n.path
            """
        ).fetchall()
        for row in rows:
            try:
                vec = json.loads(row["embedding"])
            except json.JSONDecodeError:
                continue
            score = cosine_similarity(query_vec, vec)
            content = row["content"] or ""
            excerpt = content[:400].replace("\n", " ")
            results.append(
                {
                    "path": row["path"],
                    "title": row["title"],
                    "score": round(score, 4),
                    "excerpt": excerpt,
                }
            )
    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:limit]
