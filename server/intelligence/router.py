from fastapi import APIRouter, BackgroundTasks, HTTPException

from intelligence.analytics import analyze_note, compute_vault_analytics
from intelligence.insights import enrich_insights_with_ai, generate_insights, list_insights
from intelligence.link_discovery import discover_semantic_links, list_semantic_links
from intelligence.vault_agent import get_last_agent_report, run_vault_agent
from intelligence.metrics import compute_all_metrics, get_graph_data, get_landscape
from intelligence.rag import generate_ideas, rag_chat
from intelligence.vault_sync import enrich_vault_after_sync, push_notes_to_vault, sync_vault
from schemas import RagChatRequest, SyncRequest

router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])


@router.post("/sync")
async def run_sync(
    background_tasks: BackgroundTasks,
    body: SyncRequest | None = None,
):
    force = bool(body.force) if body else False
    result = sync_vault(force=force, enrich=False)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Sync failed"))

    push_result = push_notes_to_vault()
    result["pushedToVault"] = push_result.get("pushed", 0)
    result["pushSkipped"] = push_result.get("skipped", 0)
    if push_result.get("errors"):
        result["pushErrors"] = push_result["errors"]

    background_tasks.add_task(enrich_vault_after_sync)

    notes_count = result.get("notesCount") or 0
    if notes_count >= 2:
        background_tasks.add_task(discover_semantic_links)

    result["enrichmentQueued"] = True
    result["linkDiscoveryQueued"] = notes_count >= 2
    return result


@router.get("/status")
def intelligence_status():
    from database import get_connection, init_db
    from intelligence.markdown_utils import loads_json

    init_db()
    with get_connection() as conn:
        notes_count = conn.execute("SELECT COUNT(*) AS c FROM obsidian_notes").fetchone()["c"]
        links_count = conn.execute("SELECT COUNT(*) AS c FROM obsidian_links").fetchone()["c"]
        sync_row = conn.execute("SELECT value, updated_at FROM sync_state WHERE key = 'last_sync'").fetchone()

    last_sync = loads_json(sync_row["value"] if sync_row else None, {})
    return {
        "success": True,
        "notesCount": notes_count,
        "linksCount": links_count,
        "lastSyncAt": sync_row["updated_at"] if sync_row else None,
        "lastSyncMeta": last_sync,
    }


@router.get("/notes")
def list_notes():
    from database import get_connection, init_db
    from intelligence.markdown_utils import content_preview, format_display_title, is_user_facing_note

    init_db()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT path, title, folder, word_count, updated_at, content, vault_path
            FROM obsidian_notes
            ORDER BY updated_at DESC, title COLLATE NOCASE ASC
            """
        ).fetchall()

    notes = []
    for row in rows:
        if not is_user_facing_note(row["path"]):
            continue
        content = row["content"] or ""
        title = row["title"] or format_display_title(row["path"], "", content)
        notes.append(
            {
                "path": row["path"],
                "vaultPath": row["vault_path"] or row["path"],
                "title": title,
                "displayTitle": format_display_title(row["path"], title, content),
                "folder": row["folder"] or "general",
                "wordCount": row["word_count"] or 0,
                "preview": content_preview(content),
                "updatedAt": row["updated_at"],
            }
        )
    return {"success": True, "notes": notes}


@router.get("/notes/content")
def get_note_content(path: str):
    from database import get_connection, init_db
    from intelligence.markdown_utils import normalize_note_path

    init_db()
    clean = normalize_note_path(path)
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT path, title, content, vault_path
            FROM obsidian_notes
            WHERE path = ? OR vault_path = ? OR path = ?
            LIMIT 1
            """,
            (path, path, clean),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Заметка не найдена")

    return {
        "success": True,
        "path": row["path"],
        "vaultPath": row["vault_path"] or row["path"],
        "title": row["title"],
        "content": row["content"],
    }


@router.get("/analytics")
def get_analytics():
    analytics = compute_vault_analytics()
    if not analytics:
        return {"success": False, "message": "Нет данных. Выполните синхронизацию vault."}
    return {"success": True, "analytics": analytics}


@router.get("/notes/analysis")
def get_note_analysis(path: str):
    result = analyze_note(path)
    if not result:
        raise HTTPException(status_code=404, detail="Заметка не найдена в индексе")
    return {"success": True, "analysis": result}


@router.get("/metrics")
def get_metrics():
    metrics = compute_all_metrics()
    if not metrics:
        return {"success": False, "message": "Нет данных. Выполните синхронизацию vault."}
    return {"success": True, "metrics": metrics}


@router.post("/agent/analyze")
async def vault_agent_analyze():
    result = await run_vault_agent(analyze_links=True)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Agent failed"))
    return result


@router.get("/agent/report")
def vault_agent_report():
    report = get_last_agent_report()
    if not report:
        return {"success": False, "message": "Отчёт ещё не создан. Запустите AI-агента."}
    return {"success": True, **report}


@router.post("/links/discover")
async def discover_links():
    result = await discover_semantic_links()
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Discovery failed"))
    return result


@router.get("/links/semantic")
def get_semantic_links():
    return {"success": True, "links": list_semantic_links()}


@router.get("/graph")
def get_graph():
    return {"success": True, "graph": get_graph_data()}


@router.get("/landscape")
def get_cognitive_landscape():
    return {"success": True, "points": get_landscape()}


@router.get("/insights")
def get_insights():
    return {"success": True, "insights": list_insights()}


@router.post("/insights/ai")
async def get_ai_insights():
    metrics = compute_all_metrics()
    summary = await enrich_insights_with_ai(metrics)
    return {"success": True, "summary": summary, "metrics": metrics}


@router.post("/rag")
async def intelligence_rag(body: RagChatRequest):
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Сообщение пустое")
    result = await rag_chat(message)
    return {"success": True, **result}


@router.post("/ideas")
async def intelligence_ideas():
    result = await generate_ideas()
    return {"success": True, **result}


@router.post("/webhook")
def obsidian_webhook(payload: dict, background_tasks: BackgroundTasks):
    background_tasks.add_task(sync_vault, True)
    return {"success": True, "message": "Sync scheduled", "event": payload.get("event", "change")}
