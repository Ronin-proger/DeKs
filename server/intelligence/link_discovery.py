import json
import logging
import re

from database import get_connection, init_db
from intelligence.embeddings import cosine_similarity, ollama_embeddings_enabled, reset_ollama_embed_state
from intelligence.graph_links import wiki_linked_paths
from intelligence.markdown_utils import jaccard_words
from intelligence.insights import ask_llm
from intelligence.markdown_utils import utc_now
from intelligence.prompts import PROMPT_LINK_BATCH, SYSTEM_LINK_FINDER

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.18
SIMILARITY_THRESHOLD_HASH = 0.08
JACCARD_THRESHOLD = 0.06
MAX_CANDIDATES = 40
MAX_LINKS_PER_RUN = 20
_CJK_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]")


def _normalize_link_reason(reason: str, strength: float) -> str:
    text = (reason or "").strip()
    if not text or _CJK_RE.search(text):
        return f"Семантическая близость ({strength:.0%})"
    return text


def _existing_pairs() -> set[tuple[str, str]]:
    init_db()
    pairs: set[tuple[str, str]] = set()
    with get_connection() as conn:
        for row in conn.execute(
            "SELECT source_path, target_path FROM obsidian_links WHERE target_path IS NOT NULL"
        ).fetchall():
            a, b = row["source_path"], row["target_path"]
            pairs.add((a, b))
            pairs.add((b, a))
        for row in conn.execute(
            "SELECT source_path, target_path FROM ai_note_links"
        ).fetchall():
            a, b = row["source_path"], row["target_path"]
            pairs.add((a, b))
            pairs.add((b, a))
    return pairs


def _candidate_pairs() -> list[tuple[float, dict, dict]]:
    init_db()
    threshold = SIMILARITY_THRESHOLD if ollama_embeddings_enabled() else SIMILARITY_THRESHOLD_HASH

    with get_connection() as conn:
        notes = [dict(r) for r in conn.execute(
            """
            SELECT path, title, content, word_count
            FROM obsidian_notes
            WHERE COALESCE(word_count, 0) >= 2
               OR length(trim(content)) >= 12
            """
        ).fetchall()]
        wiki_links = [dict(r) for r in conn.execute(
            "SELECT source_path, target_path FROM obsidian_links WHERE target_path IS NOT NULL"
        ).fetchall()]
        embeddings = {
            row["note_path"]: json.loads(row["embedding"])
            for row in conn.execute("SELECT note_path, embedding FROM note_embeddings").fetchall()
        }

    wiki_linked = wiki_linked_paths(wiki_links)
    linked = _existing_pairs()
    pairs: list[tuple[float, dict, dict]] = []
    for i, note_a in enumerate(notes):
        vec_a = embeddings.get(note_a["path"])
        if not vec_a:
            continue
        for note_b in notes[i + 1 :]:
            if (note_a["path"], note_b["path"]) in linked:
                continue
            vec_b = embeddings.get(note_b["path"])
            if not vec_b:
                continue
            score = cosine_similarity(vec_a, vec_b)
            text_score = jaccard_words(note_a.get("content") or "", note_b.get("content") or "")
            title_score = jaccard_words(note_a.get("title") or "", note_b.get("title") or "")
            combined = max(score, text_score * 0.85, title_score * 0.7)
            if combined >= threshold:
                pairs.append((combined, note_a, note_b))

    def sort_key(item: tuple[float, dict, dict]) -> tuple[int, float]:
        score, a, b = item
        touches_orphan = a["path"] not in wiki_linked or b["path"] not in wiki_linked
        return (0 if touches_orphan else 1, -score)

    pairs.sort(key=sort_key)
    return pairs[:MAX_CANDIDATES]


def _excerpt(content: str, limit: int = 280) -> str:
    text = (content or "").replace("\n", " ").strip()
    return text[:limit] + ("…" if len(text) > limit else "")


def _pairs_block(candidates: list[tuple[float, dict, dict]]) -> str:
    blocks = []
    for score, a, b in candidates:
        blocks.append(
            f"---\n"
            f"source: {a['path']}\n"
            f"target: {b['path']}\n"
            f"title_a: {a['title']}\n"
            f"title_b: {b['title']}\n"
            f"similarity: {score:.3f}\n"
            f"text_a: {_excerpt(a['content'])}\n"
            f"text_b: {_excerpt(b['content'])}"
        )
    return "\n".join(blocks)


def _parse_link_json(raw: str) -> list[dict]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        pass
    return []


def _save_links(links: list[dict]) -> int:
    init_db()
    saved = 0
    with get_connection() as conn:
        for item in links:
            if not item.get("connect"):
                continue
            source = item.get("source")
            target = item.get("target")
            if not source or not target or source == target:
                continue
            strength = float(item.get("strength") or 0.5)
            reason = _normalize_link_reason(str(item.get("reason") or ""), strength)
            conn.execute(
                """
                INSERT INTO ai_note_links (source_path, target_path, reason, strength, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(source_path, target_path) DO UPDATE SET
                    reason = excluded.reason,
                    strength = excluded.strength,
                    created_at = excluded.created_at
                """,
                (source, target, reason, strength, utc_now()),
            )
            saved += 1
        conn.commit()
    return saved


def list_semantic_links() -> list[dict]:
    init_db()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT l.source_path, l.target_path, l.reason, l.strength, l.created_at,
                   a.title AS source_title, b.title AS target_title
            FROM ai_note_links l
            LEFT JOIN obsidian_notes a ON a.path = l.source_path
            LEFT JOIN obsidian_notes b ON b.path = l.target_path
            ORDER BY l.strength DESC
            """
        ).fetchall()
        result = []
        dirty = False
        for row in rows:
            item = dict(row)
            strength = float(item.get("strength") or 0.5)
            fixed = _normalize_link_reason(item.get("reason") or "", strength)
            if fixed != item.get("reason"):
                conn.execute(
                    """
                    UPDATE ai_note_links
                    SET reason = ?
                    WHERE source_path = ? AND target_path = ?
                    """,
                    (fixed, item["source_path"], item["target_path"]),
                )
                dirty = True
            item["reason"] = fixed
            result.append(item)
        if dirty:
            conn.commit()
    return result


async def discover_semantic_links() -> dict:
    reset_ollama_embed_state()
    candidates = _candidate_pairs()
    if not candidates:
        return {
            "success": True,
            "discovered": 0,
            "candidates": 0,
            "links": list_semantic_links(),
            "message": (
                "Кандидатов нет. Нажмите Sync vault (пересчитает embeddings), "
                "добавьте заметки с осмысленным текстом (не случайные символы)."
            ),
        }

    prompt = PROMPT_LINK_BATCH.format(
        pairs_block=_pairs_block(candidates),
        max_links=MAX_LINKS_PER_RUN,
    )
    try:
        raw = await ask_llm(prompt, system=SYSTEM_LINK_FINDER, temperature=0.2, max_tokens=1200)
        parsed = _parse_link_json(raw)
    except Exception as exc:
        logger.warning("Link discovery LLM failed: %s", exc)
        # fallback: top embedding pairs without LLM validation
        parsed = [
            {
                "source": a["path"],
                "target": b["path"],
                "connect": score >= 0.38,
                "strength": round(score, 2),
                "reason": f"Семантическая близость ({score:.0%})",
            }
            for score, a, b in candidates[:8]
        ]

    valid_paths = {a["path"] for _, a, _ in candidates} | {b["path"] for _, _, b in candidates}
    filtered = []
    for item in parsed:
        if item.get("source") in valid_paths and item.get("target") in valid_paths:
            filtered.append(item)

    saved = _save_links(filtered[:MAX_LINKS_PER_RUN])

    if saved == 0 and candidates:
        fallback = [
            {
                "source": a["path"],
                "target": b["path"],
                "connect": True,
                "strength": round(min(score, 0.95), 2),
                "reason": f"Семантическая близость ({score:.0%})",
            }
            for score, a, b in candidates[:5]
            if score >= (0.12 if ollama_embeddings_enabled() else 0.06)
        ]
        saved = _save_links(fallback)

    from intelligence.metrics import compute_all_metrics
    from intelligence.insights import generate_insights

    metrics = compute_all_metrics()
    generate_insights(metrics)

    return {
        "success": True,
        "discovered": saved,
        "candidates": len(candidates),
        "links": list_semantic_links(),
        "message": f"Ollama нашёл {saved} смысловых связей",
    }
