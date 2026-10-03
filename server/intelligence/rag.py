import logging
import re

from intelligence.embeddings import search_notes
from intelligence.insights import ask_llm, polish_plain_text
from intelligence.prompts import PROMPT_IDEA_PAIR, PROMPT_RAG, SYSTEM_IDEAS, SYSTEM_RAG

logger = logging.getLogger(__name__)


async def rag_chat(message: str) -> dict:
    hits = search_notes(message, limit=6)
    if not hits:
        answer = await ask_llm(
            f"В vault нет релевантных заметок.\nВопрос: {message}\n"
            "Ответь честно и предложи: 1) Sync vault 2) добавить заметки 3) уточнить вопрос.",
            system=SYSTEM_RAG,
            max_tokens=1000,
        )
        return {"answer": polish_plain_text(answer), "sources": []}

    context_blocks = []
    for hit in hits:
        context_blocks.append(f"[{hit['path']}] {hit['title']}\n{hit['excerpt']}")
    context = "\n\n---\n\n".join(context_blocks)
    prompt = PROMPT_RAG.format(context=context, question=message)
    answer = await ask_llm(prompt, system=SYSTEM_RAG, max_tokens=1200)
    return {"answer": polish_plain_text(answer), "sources": hits}


async def generate_ideas() -> dict:
    from database import get_connection, init_db
    from intelligence.embeddings import cosine_similarity
    import json

    init_db()
    with get_connection() as conn:
        notes = conn.execute("SELECT path, title, content FROM obsidian_notes").fetchall()
        links = {
            (row["source_path"], row["target_path"])
            for row in conn.execute(
                "SELECT source_path, target_path FROM obsidian_links WHERE target_path IS NOT NULL"
            ).fetchall()
        }
        for row in conn.execute("SELECT source_path, target_path FROM ai_note_links").fetchall():
            links.add((row["source_path"], row["target_path"]))
            links.add((row["target_path"], row["source_path"]))
        embeddings = {
            row["note_path"]: json.loads(row["embedding"])
            for row in conn.execute("SELECT note_path, embedding FROM note_embeddings").fetchall()
        }

    pairs = []
    note_list = list(notes)
    for i, note_a in enumerate(note_list):
        vec_a = embeddings.get(note_a["path"])
        if not vec_a:
            continue
        for note_b in note_list[i + 1 :]:
            if (note_a["path"], note_b["path"]) in links:
                continue
            vec_b = embeddings.get(note_b["path"])
            if not vec_b:
                continue
            score = cosine_similarity(vec_a, vec_b)
            if score >= 0.32:
                pairs.append((score, note_a, note_b))

    pairs.sort(key=lambda item: item[0], reverse=True)
    if not pairs:
        return {"ideas": [], "message": "Пока не найдено пересечений. Запустите «Найти связи (Ollama)» на вкладке Граф."}

    ideas = []
    for score, a, b in pairs[:3]:
        prompt = PROMPT_IDEA_PAIR.format(
            score=f"{score:.0%}",
            path_a=a["path"],
            path_b=b["path"],
            excerpt_a=(a["content"] or "")[:500],
            excerpt_b=(b["content"] or "")[:500],
        )
        try:
            text = polish_plain_text(await ask_llm(prompt, system=SYSTEM_IDEAS, max_tokens=500))
        except Exception as exc:
            logger.warning("Idea generation failed: %s", exc)
            text = f"Объединить «{a['title']}» и «{b['title']}» в общий эксперимент."
        ideas.append(
            {
                "score": round(score, 3),
                "sources": [a["path"], b["path"]],
                "text": text,
            }
        )
    return {"ideas": ideas}
