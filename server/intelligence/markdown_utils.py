import hashlib
import json
import re
from datetime import datetime, timezone

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]")
TAG_RE = re.compile(r"(?<!\w)#([a-zA-Z0-9_\-/]+)")
HEADING_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def extract_title(path: str, content: str) -> str:
    match = HEADING_RE.search(content)
    if match:
        return match.group(1).strip()

    stem = normalize_note_path(path).rsplit("/", 1)[-1]
    if stem.lower().endswith(".md"):
        stem = stem[:-3]
    stem = stem.replace("-", " ").replace("_", " ").strip()

    for line in content.splitlines():
        text = line.strip()
        if not text or text == "---":
            continue
        if text.startswith("#"):
            continue
        cleaned = re.sub(r"^[-*>\s]+", "", text)
        if len(cleaned) >= 4:
            return cleaned[:100]

    if re.fullmatch(r"[a-z0-9]{1,14}", stem, re.IGNORECASE):
        return "Безымянная заметка"

    return stem or "Заметка"


def normalize_note_path(path: str) -> str:
    normalized = path.replace("\\", "/").lstrip("./")
    prefixes = (".obsidian/HAC/", ".obsidian/hac/", "HAC/", "hac/")
    changed = True
    while changed:
        changed = False
        for prefix in prefixes:
            if normalized.lower().startswith(prefix.lower()):
                normalized = normalized[len(prefix) :]
                changed = True
    return normalized


SYSTEM_PATH_PARTS = frozenset({".obsidian", "node_modules", ".git", ".trash", ".cursor", ".venv"})
CODE_PATH_PARTS = frozenset({"server", "client", "dist", "build", "__pycache__", "uploads"})


def is_user_facing_note(path: str) -> bool:
    normalized = normalize_note_path(path).replace("\\", "/")
    if not normalized or normalized.startswith("."):
        return False
    parts = [part.lower() for part in normalized.split("/")]
    if any(part in SYSTEM_PATH_PARTS for part in parts):
        return False
    if any(part in CODE_PATH_PARTS for part in parts):
        return False
    return normalized.lower().endswith(".md") or "." not in normalized.rsplit("/", 1)[-1]


def display_folder(path: str, tags: list[str] | None = None) -> str:
    tags = tags or []
    if tags:
        label = tags[0].strip()
        if label and label.lower() not in SYSTEM_PATH_PARTS:
            return label
    parts = normalize_note_path(path).replace("\\", "/").split("/")
    if len(parts) > 1:
        folder = parts[0]
        if folder.lower() not in SYSTEM_PATH_PARTS and folder.lower() not in CODE_PATH_PARTS:
            return folder
    return "Общее"


def format_display_title(path: str, title: str, content: str) -> str:
    clean_path = normalize_note_path(path)
    file_stem = clean_path.rsplit("/", 1)[-1]
    if file_stem.lower().endswith(".md"):
        file_stem = file_stem[:-3]

    if title and title not in {file_stem, path, clean_path}:
        return title
    if title == "Безымянная заметка" and clean_path:
        return f"Безымянная заметка ({file_stem})"
    return title or extract_title(path, content)


def content_preview(content: str, limit: int = 90) -> str:
    for line in content.splitlines():
        text = line.strip()
        if not text or text == "---" or text.startswith("#"):
            continue
        cleaned = re.sub(r"^[-*>\s]+", "", text)
        if len(cleaned) >= 3:
            return cleaned[:limit]
    return ""


def obsidian_api_paths(path: str) -> list[str]:
    clean = normalize_note_path(path)
    candidates = []
    for variant in (path, clean, f".obsidian/HAC/{clean}", f"HAC/{clean}"):
        if variant and variant not in candidates:
            candidates.append(variant)
    return candidates


def extract_wikilinks(content: str) -> list[str]:
    links = []
    for match in WIKILINK_RE.finditer(content):
        target = match.group(1).strip()
        if target:
            links.append(target)
    return links


def extract_tags(content: str) -> list[str]:
    return sorted(set(TAG_RE.findall(content)))


def normalize_link_target(raw: str) -> str:
    value = raw.strip()
    if value.lower().endswith(".md"):
        value = value[:-3]
    return value


def resolve_link_target(target: str, path_index: dict[str, str]) -> str | None:
    normalized = normalize_link_target(target)
    lower_map = {key.lower(): value for key, value in path_index.items()}

    if normalized in path_index:
        return path_index[normalized]
    if normalized.lower() in lower_map:
        return lower_map[normalized.lower()]

    basename = normalized.rsplit("/", 1)[-1].lower()
    for path in path_index.values():
        file_stem = path.rsplit("/", 1)[-1]
        if file_stem.lower().endswith(".md"):
            file_stem = file_stem[:-3]
        if file_stem.lower() == basename.lower():
            return path
    return None


def note_domain(path: str, tags: list[str]) -> str:
    if tags:
        return tags[0]
    parts = path.replace("\\", "/").split("/")
    if len(parts) > 1:
        return parts[0]
    return "general"


def word_count(content: str) -> int:
    return len(re.findall(r"\w+", content, flags=re.UNICODE))


def jaccard_words(a: str, b: str) -> float:
    words_a = set(re.findall(r"\w{3,}", a.lower(), flags=re.UNICODE))
    words_b = set(re.findall(r"\w{3,}", b.lower(), flags=re.UNICODE))
    if not words_a or not words_b:
        return 0.0
    return len(words_a & words_b) / len(words_a | words_b)


def dumps_json(value) -> str:
    return json.dumps(value, ensure_ascii=False)

def loads_json(value: str | None, default=None):
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default
