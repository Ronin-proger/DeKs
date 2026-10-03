import ipaddress
import json
import re
from datetime import datetime, timezone
from html import unescape
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException

from schemas import ParseRequest

router = APIRouter(prefix="/api/parser", tags=["parser"])

MAX_RESPONSE_BYTES = 2 * 1024 * 1024
REQUEST_TIMEOUT = 15.0
MAX_LINKS = 80
MAX_HEADINGS = 40
MAX_TABLES = 10
MAX_IMAGES = 30
TEXT_PREVIEW_LIMIT = 2000

USER_AGENT = (
    "Mozilla/5.0 (compatible; CorporateAnalyticsParser/1.0; +https://localhost)"
)


def _normalize_url(raw_url: str) -> str:
    url = raw_url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="Укажите URL")
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = f"https://{url}"
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Некорректный URL")
    return url


def _is_private_host(hostname: str) -> bool:
    host = hostname.lower().strip(".")
    if host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
        return True
    if host.endswith(".local") or host.endswith(".internal"):
        return True

    try:
        ip = ipaddress.ip_address(host)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False


def _validate_target_url(url: str) -> None:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    if _is_private_host(hostname):
        raise HTTPException(status_code=400, detail="Этот адрес недоступен для парсинга")


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(value or "")).strip()


def _extract_meta(soup: BeautifulSoup) -> dict:
    meta: dict[str, str] = {}

    if soup.title and soup.title.string:
        meta["title"] = _clean_text(soup.title.string)

    for tag in soup.find_all("meta"):
        name = (tag.get("name") or tag.get("property") or "").lower()
        content = _clean_text(tag.get("content") or "")
        if not name or not content:
            continue
        if name in {"description", "og:title", "og:description", "og:site_name"}:
            meta[name.replace(":", "_")] = content

    return meta


def _extract_headings(soup: BeautifulSoup) -> list[dict]:
    headings = []
    for tag in soup.find_all(re.compile(r"^h[1-6]$")):
        text = _clean_text(tag.get_text())
        if not text:
            continue
        headings.append({"level": int(tag.name[1]), "text": text})
        if len(headings) >= MAX_HEADINGS:
            break
    return headings


def _extract_links(soup: BeautifulSoup, base_url: str) -> list[dict]:
    links = []
    seen = set()
    for tag in soup.find_all("a", href=True):
        href = tag.get("href", "").strip()
        if not href or href.startswith("#") or href.lower().startswith("javascript:"):
            continue
        absolute = urljoin(base_url, href)
        if absolute in seen:
            continue
        seen.add(absolute)
        links.append({"text": _clean_text(tag.get_text()) or absolute, "href": absolute})
        if len(links) >= MAX_LINKS:
            break
    return links


def _extract_tables(soup: BeautifulSoup) -> list[list[list[str]]]:
    tables = []
    for table in soup.find_all("table"):
        rows = []
        for tr in table.find_all("tr"):
            cells = [_clean_text(cell.get_text()) for cell in tr.find_all(["th", "td"])]
            if any(cells):
                rows.append(cells)
        if rows:
            tables.append(rows)
        if len(tables) >= MAX_TABLES:
            break
    return tables


def _extract_images(soup: BeautifulSoup, base_url: str) -> list[dict]:
    images = []
    seen = set()
    for tag in soup.find_all("img", src=True):
        src = urljoin(base_url, tag.get("src", "").strip())
        if not src or src in seen:
            continue
        seen.add(src)
        images.append({"src": src, "alt": _clean_text(tag.get("alt") or "")})
        if len(images) >= MAX_IMAGES:
            break
    return images


def _extract_text_preview(soup: BeautifulSoup) -> str:
    body = soup.body or soup
    for tag in body.find_all(["script", "style", "noscript", "svg"]):
        tag.decompose()
    text = _clean_text(body.get_text(separator=" "))
    return text[:TEXT_PREVIEW_LIMIT]


def _parse_json_payload(content: str) -> dict | None:
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return None
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, list):
        return {"items": payload[:100], "total": len(payload)}
    return {"value": payload}


def _build_result(
    *,
    url: str,
    final_url: str,
    content_type: str,
    status_code: int,
    mode: str,
    html: str | None = None,
    json_payload: dict | None = None,
) -> dict:
    parsed_at = datetime.now(timezone.utc).isoformat()

    if json_payload is not None:
        preview = json.dumps(json_payload, ensure_ascii=False, indent=2)
        if len(preview) > TEXT_PREVIEW_LIMIT:
            preview = preview[:TEXT_PREVIEW_LIMIT] + "..."
        return {
            "url": url,
            "finalUrl": final_url,
            "contentType": content_type,
            "statusCode": status_code,
            "mode": mode,
            "kind": "json",
            "title": "JSON-ответ",
            "description": "",
            "meta": {},
            "headings": [],
            "links": [],
            "tables": [],
            "images": [],
            "textPreview": preview,
            "json": json_payload,
            "stats": {
                "links": 0,
                "tables": 0,
                "headings": 0,
                "images": 0,
                "chars": len(preview),
            },
            "parsedAt": parsed_at,
        }

    soup = BeautifulSoup(html or "", "html.parser")
    meta = _extract_meta(soup)
    headings = _extract_headings(soup)
    links = _extract_links(soup, final_url)
    tables = _extract_tables(soup)
    images = _extract_images(soup, final_url)
    text_preview = _extract_text_preview(soup)

    if mode == "links":
        headings, tables, images = [], [], []
        text_preview = ""
    elif mode == "tables":
        headings, links, images = [], [], []
        text_preview = ""
    elif mode == "text":
        links, tables, images = [], [], []

    return {
        "url": url,
        "finalUrl": final_url,
        "contentType": content_type,
        "statusCode": status_code,
        "mode": mode,
        "kind": "html",
        "title": meta.get("title") or meta.get("og_title") or "",
        "description": meta.get("description") or meta.get("og_description") or "",
        "meta": meta,
        "headings": headings,
        "links": links,
        "tables": tables,
        "images": images,
        "textPreview": text_preview,
        "json": None,
        "stats": {
            "links": len(links),
            "tables": len(tables),
            "headings": len(headings),
            "images": len(images),
            "chars": len(text_preview),
        },
        "parsedAt": parsed_at,
    }


@router.post("/scrape")
def scrape_url(body: ParseRequest):
    url = _normalize_url(body.url)
    _validate_target_url(url)
    mode = body.mode if body.mode in {"auto", "links", "tables", "text"} else "auto"

    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}

    try:
        with httpx.Client(
            follow_redirects=True,
            timeout=REQUEST_TIMEOUT,
            headers=headers,
        ) as client:
            response = client.get(url)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=408, detail="Сайт не ответил вовремя") from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="Не удалось загрузить страницу") from exc

    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    raw_bytes = response.content[:MAX_RESPONSE_BYTES]

    if content_type == "application/json" or url.lower().endswith(".json"):
        text = raw_bytes.decode("utf-8", errors="replace")
        payload = _parse_json_payload(text)
        if payload is None:
            raise HTTPException(status_code=400, detail="Ответ не является JSON")
        data = _build_result(
            url=url,
            final_url=str(response.url),
            content_type=content_type or "application/json",
            status_code=response.status_code,
            mode=mode,
            json_payload=payload,
        )
        return {"success": True, "data": data}

    if "html" not in content_type and "text/" not in content_type:
        raise HTTPException(
            status_code=400,
            detail=f"Формат не поддерживается: {content_type or 'unknown'}",
        )

    html = raw_bytes.decode(response.encoding or "utf-8", errors="replace")
    data = _build_result(
        url=url,
        final_url=str(response.url),
        content_type=content_type or "text/html",
        status_code=response.status_code,
        mode=mode,
        html=html,
    )
    return {"success": True, "data": data}
