import logging
import math
from pathlib import Path

from intelligence.markdown_utils import (
    content_hash,
    extract_tags,
    extract_title,
    extract_wikilinks,
    is_user_facing_note,
    normalize_note_path,
    note_domain,
    resolve_link_target,
    utc_now,
    word_count,
    dumps_json,
)
from intelligence_config import OBSIDIAN_VAULT_PATH
from obsidian_client import fetch_notes_for_sync
from database import get_connection, init_db

logger = logging.getLogger(__name__)

IGNORE_DIRS = {".git", ".trash", "node_modules"}


def _scan_local_vault() -> list[dict]:
    notes = []
    vault = OBSIDIAN_VAULT_PATH
    if not vault.exists():
        return notes

    for file_path in vault.rglob("*.md"):
        if _should_skip_path(file_path):
            continue
        rel = file_path.relative_to(vault).as_posix()
        canonical = normalize_note_path(rel)
        if not is_user_facing_note(canonical):
            continue
        try:
            content = file_path.read_text(encoding="utf-8")
        except OSError:
            continue
        stat = file_path.stat()
        notes.append(
            {
                "path": canonical,
                "vault_path": rel,
                "content": content,
                "updated_at": datetime_from_ts(stat.st_mtime),
                "created_at": datetime_from_ts(stat.st_ctime),
                "source": "filesystem",
            }
        )
    return notes


def _should_skip_path(file_path: Path) -> bool:
    parts = set(file_path.parts)
    if ".trash" in parts or "node_modules" in parts or ".git" in parts:
        return True
    if ".obsidian" in parts and "HAC" not in parts:
        return True
    return False


def datetime_from_ts(value: float) -> str:
    from datetime import datetime, timezone

    return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()


def _fetch_obsidian_api() -> list[dict]:
    return fetch_notes_for_sync()


def enrich_vault_after_sync() -> dict:
    from intelligence.embeddings import rebuild_embeddings
    from intelligence.metrics import compute_all_metrics
    from intelligence.insights import generate_insights

    rebuild_embeddings()
    metrics = compute_all_metrics()
    insights = generate_insights(metrics)
    return {
        "metrics": metrics,
        "insightsCount": len(insights),
    }


def push_notes_to_vault() -> dict:
    """Write notes that exist in DB but not on disk into HAC/Obsidian."""
    from obsidian_client import normalize_vault_path, write_note
    from intelligence_config import OBSIDIAN_VAULT_PATH

    init_db()
    pushed = 0
    skipped = 0
    errors: list[dict] = []

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT path, vault_path, title, content FROM obsidian_notes"
        ).fetchall()

    for row in rows:
        rel = normalize_vault_path((row["vault_path"] or row["path"] or "").replace("\\", "/"))
        if not rel:
            continue
        file_path = OBSIDIAN_VAULT_PATH / rel
        if file_path.exists():
            skipped += 1
            continue

        content = (row["content"] or "").strip()
        if not content:
            title = row["title"] or Path(rel).stem
            content = f"# {title}\n"

        try:
            write_note(rel, content if content.endswith("\n") else content + "\n")
            pushed += 1
        except Exception as exc:
            errors.append({"path": rel, "error": str(exc)})

    return {
        "success": not errors,
        "pushed": pushed,
        "skipped": skipped,
        "errors": errors,
    }


def sync_vault(force: bool = False, enrich: bool = True) -> dict:
    init_db()
    api_notes = _fetch_obsidian_api()
    local_notes = _scan_local_vault()

    merged: dict[str, dict] = {}
    for note in api_notes + local_notes:
        key = note["path"]
        current = merged.get(key)
        if not current or note.get("source") == "obsidian_api":
            merged[key] = note

    merged = {path: note for path, note in merged.items() if is_user_facing_note(path)}

    if not merged:
        return {
            "success": False,
            "message": "Vault пуст или недоступен. Проверьте OBSIDIAN_VAULT_PATH и Obsidian REST API.",
            "notesCount": 0,
        }

    path_index = {extract_title(n["path"], n["content"]): n["path"] for n in merged.values()}
    for path in merged:
        stem = Path(path).stem
        path_index[stem] = path
        path_index[path] = path

    existing_links = set()
    with get_connection() as conn:
        for row in conn.execute("SELECT source_path, target_path FROM obsidian_links").fetchall():
            existing_links.add((row["source_path"], row["target_path"]))

        synced = 0
        for path, note in merged.items():
            content = note["content"]
            tags = extract_tags(content)
            title = extract_title(path, content)
            folder = note_domain(path, tags)
            digest = content_hash(content)
            vault_path = note.get("vault_path") or path

            conn.execute(
                """
                INSERT INTO obsidian_notes (
                    path, title, content, content_hash, word_count, tags, folder,
                    author, created_at, updated_at, synced_at, vault_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    title = excluded.title,
                    content = excluded.content,
                    content_hash = excluded.content_hash,
                    word_count = excluded.word_count,
                    tags = excluded.tags,
                    folder = excluded.folder,
                    updated_at = excluded.updated_at,
                    synced_at = excluded.synced_at,
                    vault_path = excluded.vault_path
                """,
                (
                    path,
                    title,
                    content,
                    digest,
                    word_count(content),
                    dumps_json(tags),
                    folder,
                    "company",
                    note.get("created_at") or utc_now(),
                    note.get("updated_at") or utc_now(),
                    utc_now(),
                    vault_path,
                ),
            )
            synced += 1

        hidden = [
            row["path"]
            for row in conn.execute("SELECT path FROM obsidian_notes").fetchall()
            if not is_user_facing_note(row["path"])
        ]
        for hidden_path in hidden:
            conn.execute("DELETE FROM obsidian_links WHERE source_path = ? OR target_path = ?", (hidden_path, hidden_path))
            conn.execute("DELETE FROM obsidian_notes WHERE path = ?", (hidden_path,))

        conn.execute("DELETE FROM obsidian_links")
        new_links = 0
        for path, note in merged.items():
            for raw_target in extract_wikilinks(note["content"]):
                resolved = resolve_link_target(raw_target, path_index)
                is_new = 0
                if resolved and (path, resolved) not in existing_links:
                    is_new = 1
                    new_links += 1
                conn.execute(
                    """
                    INSERT INTO obsidian_links (
                        source_path, target_path, target_title, link_type, is_new, created_at
                    ) VALUES (?, ?, ?, 'wikilink', ?, ?)
                    """,
                    (path, resolved, raw_target, is_new, utc_now()),
                )

        conn.execute(
            """
            INSERT INTO sync_state (key, value, updated_at)
            VALUES ('last_sync', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """,
            (dumps_json({"notes": synced, "newLinks": new_links}), utc_now()),
        )
        conn.commit()

    result = {
        "success": True,
        "message": f"Синхронизировано заметок: {synced}",
        "notesCount": synced,
        "newLinks": new_links,
        "source": "obsidian_api" if api_notes else "filesystem",
    }
    if enrich:
        result.update(enrich_vault_after_sync())
    return result


def _build_path_index(conn) -> dict[str, str]:
    path_index: dict[str, str] = {}
    for row in conn.execute("SELECT path, title, content FROM obsidian_notes").fetchall():
        path_index[extract_title(row["path"], row["content"])] = row["path"]
        stem = Path(row["path"]).stem
        path_index[stem] = row["path"]
        path_index[row["path"]] = row["path"]
    return path_index


def upsert_note_to_db(path: str, content: str, vault_path: str | None = None) -> dict:
    init_db()
    canonical = normalize_note_path(path.replace("\\", "/").lstrip("/"))
    tags = extract_tags(content)
    title = extract_title(canonical, content)
    folder = note_domain(canonical, tags)
    digest = content_hash(content)
    now = utc_now()
    stored_vault_path = vault_path or canonical

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO obsidian_notes (
                path, title, content, content_hash, word_count, tags, folder,
                author, created_at, updated_at, synced_at, vault_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                title = excluded.title,
                content = excluded.content,
                content_hash = excluded.content_hash,
                word_count = excluded.word_count,
                tags = excluded.tags,
                folder = excluded.folder,
                updated_at = excluded.updated_at,
                synced_at = excluded.synced_at,
                vault_path = excluded.vault_path
            """,
            (
                canonical,
                title,
                content,
                digest,
                word_count(content),
                dumps_json(tags),
                folder,
                "company",
                now,
                now,
                now,
                stored_vault_path,
            ),
        )

        conn.execute("DELETE FROM obsidian_links WHERE source_path = ?", (canonical,))
        path_index = _build_path_index(conn)
        path_index[title] = canonical
        path_index[Path(canonical).stem] = canonical
        path_index[canonical] = canonical

        for raw_target in extract_wikilinks(content):
            resolved = resolve_link_target(raw_target, path_index)
            conn.execute(
                """
                INSERT INTO obsidian_links (
                    source_path, target_path, target_title, link_type, is_new, created_at
                ) VALUES (?, ?, ?, 'wikilink', 0, ?)
                """,
                (canonical, resolved, raw_target, now),
            )
        conn.commit()

    from intelligence.embeddings import upsert_note_embedding

    upsert_note_embedding(canonical, content)
    return {"path": canonical, "title": title}


def remove_note_from_db(path: str) -> None:
    init_db()
    canonical = normalize_note_path(path.replace("\\", "/").lstrip("/"))
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM obsidian_links WHERE source_path = ? OR target_path = ?",
            (canonical, canonical),
        )
        conn.execute("DELETE FROM note_embeddings WHERE note_path = ?", (canonical,))
        conn.execute("DELETE FROM obsidian_notes WHERE path = ?", (canonical,))
        conn.commit()
