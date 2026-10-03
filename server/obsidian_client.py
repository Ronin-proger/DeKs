import logging
import re
import time
from pathlib import Path
from urllib.parse import quote

import httpx

from intelligence.markdown_utils import is_user_facing_note, obsidian_api_paths
from intelligence_config import (
    OBSIDIAN_API_KEY,
    OBSIDIAN_API_URL,
    OBSIDIAN_INSECURE_URL,
    OBSIDIAN_TRY_INSECURE,
    OBSIDIAN_VAULT_PATH,
)

logger = logging.getLogger(__name__)


def _api_urls() -> list[str]:
    urls = [OBSIDIAN_API_URL.rstrip("/")]
    if OBSIDIAN_TRY_INSECURE and OBSIDIAN_INSECURE_URL:
        insecure = OBSIDIAN_INSECURE_URL.rstrip("/")
        if insecure not in urls:
            urls.append(insecure)
    return urls


def _headers(extra: dict | None = None) -> dict:
    base = {"Authorization": f"Bearer {OBSIDIAN_API_KEY}"}
    if extra:
        base.update(extra)
    return base


def _encode_path(path: str) -> str:
    return "/".join(quote(part, safe="") for part in path.replace("\\", "/").split("/"))


def _request(method: str, path: str, **kwargs):
    last_error = None
    for base_url in _api_urls():
        url = f"{base_url}{path}"
        try:
            with httpx.Client(verify=False, timeout=4.0) as client:
                response = client.request(method, url, headers=_headers(kwargs.pop("headers", None)), **kwargs)
            return response, base_url
        except Exception as exc:
            last_error = exc
            logger.debug("Obsidian %s %s failed: %s", method, url, exc)
    raise ConnectionError(str(last_error or "Obsidian API unreachable"))


def check_status() -> dict:
    last_error = None
    for base_url in _api_urls():
        try:
            response = httpx.get(
                f"{base_url}/",
                headers=_headers(),
                verify=False,
                timeout=3.0,
                follow_redirects=True,
            )
            if response.status_code < 500:
                connected = response.status_code == 200
                message = None
                if response.status_code == 401:
                    message = "Неверный OBSIDIAN_API_KEY в .env"
                elif not connected:
                    message = f"Obsidian ответил HTTP {response.status_code}"
                return {
                    "connected": connected,
                    "url": base_url,
                    "status": response.status_code,
                    "message": message,
                }
        except Exception as exc:
            last_error = str(exc)
            logger.debug("Obsidian status check failed for %s: %s", base_url, exc)
    return {
        "connected": False,
        "url": OBSIDIAN_API_URL,
        "status": 0,
        "message": last_error or "Obsidian не запущен или REST API выключен",
    }


def list_local_vault_files() -> list[str]:
    files: list[str] = []
    if not OBSIDIAN_VAULT_PATH.exists():
        return files
    for file_path in OBSIDIAN_VAULT_PATH.rglob("*.md"):
        parts = set(file_path.parts)
        if ".trash" in parts or "node_modules" in parts or ".git" in parts:
            continue
        if ".obsidian" in parts:
            continue
        rel = file_path.relative_to(OBSIDIAN_VAULT_PATH).as_posix()
        if not is_user_facing_note(rel):
            continue
        files.append(rel)
    return sorted(set(files))


def list_vault_files() -> list[str]:
    try:
        response, _ = _request("GET", "/vault/")
        if response.status_code != 200:
            raise RuntimeError(f"Vault list failed: HTTP {response.status_code}")

        payload = response.json()
        if isinstance(payload, list):
            return [
                str(item.get("path") or item.get("name"))
                for item in payload
                if isinstance(item, dict) and str(item.get("path") or item.get("name", "")).endswith(".md")
            ]
        if isinstance(payload, dict):
            return [f for f in payload.get("files") or [] if str(f).endswith(".md")]
        return []
    except Exception as exc:
        logger.warning("Obsidian API list failed, using local vault: %s", exc)
        if OBSIDIAN_VAULT_PATH.exists():
            return list_local_vault_files()
        raise RuntimeError(str(exc)) from exc


def read_note(path: str) -> str:
    rel = path.replace("\\", "/").lstrip("/")
    file_path = OBSIDIAN_VAULT_PATH / rel
    if file_path.exists():
        return file_path.read_text(encoding="utf-8")

    for candidate in obsidian_api_paths(path):
        try:
            response, _ = _request("GET", f"/vault/{_encode_path(candidate)}")
            if response.status_code == 200:
                return response.text
        except Exception as exc:
            logger.debug("Obsidian API read failed for %s: %s", candidate, exc)

    raise FileNotFoundError(path)


def write_note_local(path: str, content: str) -> str:
    rel = path.replace("\\", "/").lstrip("/")
    file_path = OBSIDIAN_VAULT_PATH / rel
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")
    return rel


def delete_note_local(path: str) -> bool:
    rel = path.replace("\\", "/").lstrip("/")
    file_path = OBSIDIAN_VAULT_PATH / rel
    if file_path.exists():
        file_path.unlink()
        return True
    return False


def normalize_vault_path(path: str) -> str:
    raw = path.replace("\\", "/").strip().strip("/")
    parts = []
    for part in raw.split("/"):
        cleaned = re.sub(r'[<>:"|?*]', "-", part).strip().strip(".")
        if cleaned:
            parts.append(cleaned)
    if not parts:
        return f"note-{int(time.time())}.md"
    if not parts[-1].lower().endswith(".md"):
        parts[-1] = f"{parts[-1]}.md"
    return "/".join(parts)


def write_note(path: str, content: str, allow_local_fallback: bool = True) -> dict:
    sources: list[str] = []
    saved_path = normalize_vault_path(path)
    last_error = None

    if allow_local_fallback and OBSIDIAN_VAULT_PATH.exists():
        try:
            saved_path = write_note_local(saved_path, content)
            sources.append("filesystem")
        except Exception as exc:
            last_error = exc
            logger.warning("Vault filesystem write failed: %s", exc)

    status = check_status()
    if status.get("connected"):
        try:
            encoded = _encode_path(saved_path)
            response, base_url = _request(
                "PUT",
                f"/vault/{encoded}",
                content=content.encode("utf-8"),
                headers={"Content-Type": "text/markdown"},
            )
            if response.status_code in (200, 201, 204):
                if "obsidian_api" not in sources:
                    sources.append("obsidian_api")
            else:
                detail = response.text[:300] if response.text else f"HTTP {response.status_code}"
                last_error = RuntimeError(f"Obsidian API write failed: {detail}")
                logger.warning("Obsidian API write HTTP %s: %s", response.status_code, detail)
        except Exception as exc:
            last_error = exc
            logger.warning("Obsidian API write failed: %s", exc)
    elif not sources:
        last_error = RuntimeError(
            status.get("message") or "Obsidian не запущен и папка vault недоступна"
        )

    if not sources:
        raise RuntimeError(str(last_error or "Note write failed"))

    return {
        "success": True,
        "path": saved_path,
        "source": "+".join(sources),
        "obsidianSynced": "obsidian_api" in sources,
        "vaultSaved": "filesystem" in sources,
        "vaultPath": str((OBSIDIAN_VAULT_PATH / saved_path).resolve()),
        "url": OBSIDIAN_API_URL if "obsidian_api" in sources else None,
        "obsidianMessage": None if status.get("connected") else status.get("message"),
    }


def delete_note(path: str) -> None:
    deleted = False
    for candidate in obsidian_api_paths(path):
        try:
            response, _ = _request("DELETE", f"/vault/{_encode_path(candidate)}")
            if response.status_code in (200, 204, 404):
                deleted = True
        except Exception as exc:
            logger.debug("Obsidian API delete failed: %s", exc)

    if OBSIDIAN_VAULT_PATH.exists() and delete_note_local(path):
        deleted = True

    if not deleted:
        raise FileNotFoundError(path)


def fetch_notes_for_sync() -> list[dict]:
    from intelligence.markdown_utils import is_user_facing_note, normalize_note_path, utc_now

    if not check_status().get("connected"):
        return []

    notes = []
    try:
        files = list_vault_files()
    except Exception as exc:
        logger.warning("Obsidian API sync failed: %s", exc)
        return notes

    for path in files:
        if not path:
            continue
        raw_path = path.replace("\\", "/")
        canonical = normalize_note_path(raw_path)
        if not is_user_facing_note(canonical):
            continue
        try:
            content = read_note(path)
        except FileNotFoundError:
            continue
        notes.append(
            {
                "path": canonical,
                "vault_path": raw_path,
                "content": content,
                "updated_at": utc_now(),
                "created_at": utc_now(),
                "source": "obsidian_api",
            }
        )
    return notes
