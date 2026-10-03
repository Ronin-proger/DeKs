import json
import logging
import re

from openai import AsyncOpenAI

from database import get_connection, init_db
from intelligence.markdown_utils import utc_now, dumps_json
from intelligence.prompts import PROMPT_VAULT_INSIGHTS, SYSTEM_ANALYST
from intelligence_config import OLLAMA_BASE_URL, OLLAMA_CHAT_MODEL

logger = logging.getLogger(__name__)
ai_client = AsyncOpenAI(base_url=f"{OLLAMA_BASE_URL}/v1", api_key="ollama", timeout=120.0)


def polish_plain_text(text: str) -> str:
    cleaned = []
    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            cleaned.append("")
            continue
        line = re.sub(r"^#{1,6}\s*", "", line)
        line = re.sub(r"\*\*([^*]+)\*\*", r"\1", line)
        line = re.sub(r"\*([^*]+)\*", r"\1", line)
        line = re.sub(r"`([^`]+)`", r"\1", line)
        line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line)
        line = re.sub(r"\[\[([^\]]+)\]\]", r"\1", line)
        line = re.sub(r"(?<!\w)#([a-zA-Z0-9_\-/]+)", r"\1", line)
        line = line.replace("•", "-").replace("—", "-").replace("–", "-")
        if line.startswith("* "):
            line = f"- {line[2:].strip()}"
        cleaned.append(line)
    return "\n".join(cleaned).strip()


async def ask_llm(
    prompt: str,
    system: str = SYSTEM_ANALYST,
    temperature: float = 0.3,
    max_tokens: int = 900,
) -> str:
    completion = await ai_client.chat.completions.create(
        model=OLLAMA_CHAT_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        stream=False,
    )
    return completion.choices[0].message.content.strip()


async def _ask_qwen(prompt: str) -> str:
    return polish_plain_text(await ask_llm(prompt, system=SYSTEM_ANALYST))


def generate_insights(metrics: dict) -> list[dict]:
    if not metrics:
        return []

    insights = []
    cp = metrics.get("cognitivePulse", 0)
    synergy = metrics.get("synergyCoefficient", 0)
    risks = metrics.get("risks", {})
    projects = metrics.get("noteLoad", {})
    folders = projects.get("folders") or []

    if cp < 45:
        insights.append(
            _insight(
                "Когнитивный пульс просел",
                "Компания мало создаёт новых связей между знаниями. Запустите cross-team review заметок.",
                "high",
                "cognitive_pulse",
            )
        )
    elif cp > 70:
        insights.append(
            _insight(
                "Высокая скорость мышления",
                "Плотность новых связей выше нормы — хорошее время для запуска новых гипотез.",
                "medium",
                "cognitive_pulse",
            )
        )

    if synergy < 35:
        insights.append(
            _insight(
                "Скрытая синергия не используется",
                "Много потенциальных кросс-функциональных связей между доменами знаний ещё не оформлены в wikilinks.",
                "high",
                "synergy",
            )
        )

    low_load = [f for f in folders if f.get("load", 0) < 25 and f.get("notes", 0) >= 2]
    if low_load:
        item = low_load[0]
        insights.append(
            _insight(
                f"Низкая загруженность: {item['folder']}",
                "В этой папке давно не обновляли заметки. Стоит актуализировать материалы.",
                "medium",
                "note_load",
                {"folder": item["folder"]},
            )
        )

    init_db()
    with get_connection() as conn:
        conn.execute("DELETE FROM intelligence_insights")
        for item in insights:
            conn.execute(
                """
                INSERT INTO intelligence_insights (title, body, severity, category, payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    item["title"],
                    item["body"],
                    item["severity"],
                    item["category"],
                    dumps_json(item.get("payload", {})),
                    utc_now(),
                ),
            )
        conn.commit()
    return insights


async def enrich_insights_with_ai(metrics: dict) -> str:
    if not metrics:
        return "Нет данных для анализа. Выполните синхронизацию vault."
    prompt = PROMPT_VAULT_INSIGHTS.format(
        metrics=json.dumps(metrics, ensure_ascii=False)[:4000]
    )
    try:
        return await _ask_qwen(prompt)
    except Exception as exc:
        logger.warning("AI insight generation failed: %s", exc)
        return "AI-анализ временно недоступен. Проверьте Ollama."


def _insight(title, body, severity, category, payload=None) -> dict:
    return {
        "title": title,
        "body": body,
        "severity": severity,
        "category": category,
        "payload": payload or {},
    }


def list_insights() -> list[dict]:
    init_db()
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT title, body, severity, category, payload, created_at FROM intelligence_insights ORDER BY id DESC"
        ).fetchall()
    return [dict(row) for row in rows]
