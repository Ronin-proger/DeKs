from fastapi import APIRouter, HTTPException, Request, Response

from intelligence.vault_sync import remove_note_from_db, upsert_note_to_db, push_notes_to_vault
from obsidian_client import (
    check_status,
    delete_note,
    list_vault_files,
    normalize_vault_path,
    read_note,
    write_note,
)

router = APIRouter(prefix="/api/obsidian", tags=["obsidian"])


@router.get("/status")
def obsidian_status():
    status = check_status()
    return {"success": True, **status}


@router.get("/vault")
def obsidian_vault_list():
    try:
        files = list_vault_files()
        return {
            "success": True,
            "files": [f.replace("\\", "/") for f in files],
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/vault/{path:path}")
def obsidian_vault_read(path: str):
    try:
        content = read_note(path)
        return Response(content=content, media_type="text/markdown; charset=utf-8")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Note not found") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.put("/vault/{path:path}")
async def obsidian_vault_write(path: str, request: Request):
    body = await request.body()
    content = body.decode("utf-8")
    safe_path = normalize_vault_path(path)
    try:
        result = write_note(safe_path, content)
        indexed = upsert_note_to_db(result.get("path") or safe_path, content, result.get("path"))
        return {**result, "indexed": True, "db": indexed}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/push")
def obsidian_vault_push():
    result = push_notes_to_vault()
    if result.get("errors"):
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось экспортировать {len(result['errors'])} заметок",
        )
    return {"success": True, **result}


@router.delete("/vault/{path:path}")
def obsidian_vault_delete(path: str):
    try:
        delete_note(path)
        remove_note_from_db(path)
        return {"success": True}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Note not found") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
