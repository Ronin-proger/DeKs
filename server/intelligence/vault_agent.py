import json
import logging

from database import get_connection, init_db
from intelligence.insights import ask_llm, polish_plain_text
from intelligence.link_discovery import discover_semantic_links
from intelligence.markdown_utils import content_preview, note_domain, loads_json, utc_now, dumps_json
from intelligence.prompts import SYSTEM_ANALYST

logger = logging.getLogger(__name__)

PROMPT_VAULT_AGENT = (
    "Ты — AI-агент базы знаний Obsidian (NeuroVault). Проанализируй ВСЕ заметки vault.\n\n"
    "Статистика: {stats}\n\n"
    "Каталог заметок (path | домен | слова | превью):\n{catalog}\n\n"
    "Существующие связи Ollama:\n{links}\n\n"
    "Дай структурированный отчёт на русском:\n"
    "## Обзор vault\n(общая картина знаний)\n\n"
    "## Ключевые темы\n(3–5 кластеров)\n\n"
    "## Пробелы и риски\n(изолированные темы, дубли)\n\n"
    "## Рекомендуемые связи\n(какие заметки связать [[wikilink]] и почему)\n\n"
    "## Следующие шаги\n(3 конкретных действия)"
)


def _build_catalog(limit: int = 40) -> tuple[str, dict]:
    init_db()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT path, title, content, folder, word_count, tags
            FROM obsidian_notes
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    lines = []
    for row in rows:
        tags = loads_json(row["tags"], [])
        domain = row["folder"] or note_domain(row["path"], tags)
        preview = content_preview(row["content"] or "", 100)
        lines.append(f"- {row['path']} | {domain} | {row['word_count']} сл. | {preview}")

    stats = {
        "notesInReport": len(rows),
        "totalWords": sum(r["word_count"] or 0 for r in rows),
    }
    return "\n".join(lines) or "Нет заметок", stats


async def run_vault_agent(analyze_links: bool = True) -> dict:
    init_db()
    with get_connection() as conn:
        notes_count = conn.execute("SELECT COUNT(*) AS c FROM obsidian_notes").fetchone()["c"]
        links_count = conn.execute("SELECT COUNT(*) AS c FROM obsidian_links WHERE target_path IS NOT NULL").fetchone()["c"]
        ai_links = conn.execute("SELECT COUNT(*) AS c FROM ai_note_links").fetchone()["c"]

    if notes_count == 0:
        return {"success": False, "message": "Vault пуст. Выполните Sync vault."}

    catalog, partial_stats = _build_catalog()
    stats = {**partial_stats, "notesTotal": notes_count, "wikilinks": links_count, "aiLinks": ai_links}

    from intelligence.link_discovery import list_semantic_links
    semantic = list_semantic_links()[:12]
    links_text = "\n".join(
        f"- {l['source_path']} ↔ {l['target_path']}: {l.get('reason', '')}"
        for l in semantic
    ) or "Пока нет — запустите поиск связей"

    prompt = PROMPT_VAULT_AGENT.format(
        stats=json.dumps(stats, ensure_ascii=False),
        catalog=catalog[:8000],
        links=links_text,
    )

    discovered = 0
    if analyze_links:
        try:
            link_result = await discover_semantic_links()
            discovered = link_result.get("discovered", 0)
            semantic = link_result.get("links", semantic)
        except Exception as exc:
            logger.warning("Link discovery during agent run failed: %s", exc)

    try:
        report = polish_plain_text(
            await ask_llm(prompt, system=SYSTEM_ANALYST, temperature=0.25, max_tokens=1400)
        )
    except Exception as exc:
        logger.warning("Vault agent LLM failed: %s", exc)
        return {
            "success": False,
            "message": "Ollama недоступна. Запустите ollama serve и модель qwen.",
        }

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO sync_state (key, value, updated_at)
            VALUES ('last_agent_report', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """,
            (dumps_json({"report": report, "discovered": discovered}), utc_now()),
        )
        conn.commit()

    return {
        "success": True,
        "report": report,
        "stats": stats,
        "discoveredLinks": discovered,
        "semanticLinks": semantic[:20],
    }


def get_last_agent_report() -> dict | None:
    init_db()
    from intelligence.markdown_utils import loads_json as load_json
    with get_connection() as conn:
        row = conn.execute("SELECT value, updated_at FROM sync_state WHERE key = 'last_agent_report'").fetchone()
    if not row:
        return None
    payload = load_json(row["value"], {})
    return {"report": payload.get("report"), "updatedAt": row["updated_at"], "discovered": payload.get("discovered", 0)}
