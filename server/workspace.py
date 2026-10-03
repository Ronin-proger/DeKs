import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from database import get_connection, init_db

router = APIRouter(prefix="/api/workspace", tags=["workspace"])

FILES_DIR = Path(__file__).parent / "uploads" / "workspace"
FILES_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".pdf", ".docx", ".xlsx", ".txt", ".md", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024

LINK_ICONS = ["link", "palette", "list", "file", "chat", "chart", "globe", "zap", "folder", "tool"]

LEGACY_LINK_ICONS = {
    "\U0001f517": "link",
    "\U0001f3a8": "palette",
    "\U0001f4cb": "list",
    "\U0001f4c4": "file",
    "\U0001f4ac": "chat",
    "\U0001f4ca": "chart",
    "\U0001f310": "globe",
    "\u26a1": "zap",
    "\U0001f4c1": "folder",
    "\U0001f6e0\ufe0f": "tool",
}


class LinkBody(BaseModel):
    title: str
    url: str
    icon: str = "link"


class TaskBody(BaseModel):
    text: str
    priority: str = "medium"
    dueDate: str | None = None


class TaskPatch(BaseModel):
    done: bool | None = None
    text: str | None = None
    priority: str | None = None
    dueDate: str | None = None


class EventBody(BaseModel):
    title: str
    eventDate: str
    color: str = "#818cf8"
    note: str | None = None


class SalesPointBody(BaseModel):
    label: str
    value: float


class SalesChartBody(BaseModel):
    points: list[SalesPointBody]


DEFAULT_SALES_POINTS = [
    ("Окт", 42.0),
    ("Ноя", 48.5),
    ("Дек", 55.2),
    ("Янв", 61.0),
    ("Фев", 58.3),
    ("Мар", 67.8),
]


def _user_exists(conn, user_id: int) -> None:
    if not conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Пользователь не найден")


def _normalize_url(url: str) -> str:
    clean = url.strip()
    if not clean.startswith(("http://", "https://")):
        clean = f"https://{clean}"
    return clean


def _fetch_sales_points(conn, user_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, label, value, sort_order AS sortOrder
        FROM user_sales_points
        WHERE user_id = ?
        ORDER BY sort_order ASC, id ASC
        """,
        (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def _ensure_sales_defaults(conn, user_id: int) -> list[dict]:
    existing = _fetch_sales_points(conn, user_id)
    if existing:
        return existing

    for idx, (label, value) in enumerate(DEFAULT_SALES_POINTS):
        conn.execute(
            """
            INSERT INTO user_sales_points (user_id, label, value, sort_order)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, label, value, idx),
        )
    conn.commit()
    return _fetch_sales_points(conn, user_id)


def _fetch_shared_links(conn) -> list[dict]:
    rows = conn.execute(
        """
        SELECT l.id, l.title, l.url, l.icon, l.createdAt,
               l.user_id AS uploadedBy, u.fullName AS authorName
        FROM user_links l
        LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.id DESC
        """
    ).fetchall()
    return [dict(r) for r in rows]


def _fetch_shared_files(conn) -> list[dict]:
    rows = conn.execute(
        """
        SELECT f.id, f.originalName, f.fileUrl, f.size, f.mime, f.createdAt,
               f.user_id AS uploadedBy, u.fullName AS authorName
        FROM user_files f
        LEFT JOIN users u ON u.id = f.user_id
        ORDER BY f.id DESC
        """
    ).fetchall()
    return [dict(r) for r in rows]


def _fetch_shared_tasks(conn) -> list[dict]:
    rows = conn.execute(
        """
        SELECT t.id, t.text, t.done, t.priority, t.dueDate, t.createdAt,
               t.user_id AS uploadedBy, u.fullName AS authorName
        FROM user_tasks t
        LEFT JOIN users u ON u.id = t.user_id
        ORDER BY t.done ASC, t.id DESC
        """
    ).fetchall()
    tasks = [dict(r) for r in rows]
    for task in tasks:
        task["done"] = bool(task["done"])
    return tasks


def _fetch_task_by_id(conn, task_id: int) -> dict | None:
    row = conn.execute(
        """
        SELECT t.id, t.text, t.done, t.priority, t.dueDate, t.createdAt,
               t.user_id AS uploadedBy, u.fullName AS authorName
        FROM user_tasks t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.id = ?
        """,
        (task_id,),
    ).fetchone()
    if not row:
        return None
    task = dict(row)
    task["done"] = bool(task["done"])
    return task


@router.get("/{user_id}")
def get_workspace(user_id: int):
    init_db()
    with get_connection() as conn:
        _user_exists(conn, user_id)
        links = _fetch_shared_links(conn)
        tasks = _fetch_shared_tasks(conn)
        events = [dict(r) for r in conn.execute(
            "SELECT id, title, eventDate, color, note, createdAt FROM user_events WHERE user_id = ? ORDER BY eventDate ASC",
            (user_id,),
        ).fetchall()]
        files = _fetch_shared_files(conn)
        sales_points = _ensure_sales_defaults(conn, user_id)
    return {
        "success": True,
        "links": links,
        "tasks": tasks,
        "events": events,
        "files": files,
        "salesPoints": sales_points,
    }


@router.post("/{user_id}/links")
def add_link(user_id: int, body: LinkBody):
    title = body.title.strip()
    url = _normalize_url(body.url)
    if not title or not url:
        raise HTTPException(status_code=400, detail="Укажите название и URL")
    icon = body.icon if body.icon in LINK_ICONS else LEGACY_LINK_ICONS.get(body.icon, "link")
    init_db()
    with get_connection() as conn:
        _user_exists(conn, user_id)
        cur = conn.execute(
            "INSERT INTO user_links (user_id, title, url, icon) VALUES (?, ?, ?, ?)",
            (user_id, title, url, icon),
        )
        conn.commit()
        link_id = cur.lastrowid
        row = conn.execute(
            """
            SELECT l.id, l.title, l.url, l.icon, l.createdAt,
                   l.user_id AS uploadedBy, u.fullName AS authorName
            FROM user_links l
            LEFT JOIN users u ON u.id = l.user_id
            WHERE l.id = ?
            """,
            (link_id,),
        ).fetchone()
    return {"success": True, "link": dict(row)}


@router.delete("/{user_id}/links/{link_id}")
def delete_link(user_id: int, link_id: int):
    init_db()
    with get_connection() as conn:
        _user_exists(conn, user_id)
        row = conn.execute("SELECT id FROM user_links WHERE id = ?", (link_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Ссылка не найдена")
        conn.execute("DELETE FROM user_links WHERE id = ?", (link_id,))
        conn.commit()
    return {"success": True}


@router.post("/{user_id}/tasks")
def add_task(user_id: int, body: TaskBody):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст задачи обязателен")
    priority = body.priority if body.priority in ("low", "medium", "high") else "medium"
    init_db()
    with get_connection() as conn:
        _user_exists(conn, user_id)
        cur = conn.execute(
            "INSERT INTO user_tasks (user_id, text, done, priority, dueDate) VALUES (?, ?, 0, ?, ?)",
            (user_id, text, priority, body.dueDate),
        )
        conn.commit()
        task_id = cur.lastrowid
        task = _fetch_task_by_id(conn, task_id)
    return {"success": True, "task": task}


@router.patch("/{user_id}/tasks/{task_id}")
def patch_task(user_id: int, task_id: int, body: TaskPatch):
    init_db()
    with get_connection() as conn:
        _user_exists(conn, user_id)
        row = conn.execute("SELECT * FROM user_tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Задача не найдена")
        text = body.text.strip() if body.text is not None else row["text"]
        priority = body.priority if body.priority in ("low", "medium", "high") else row["priority"]
        done = int(body.done) if body.done is not None else row["done"]
        due = body.dueDate if body.dueDate is not None else row["dueDate"]
        conn.execute(
            "UPDATE user_tasks SET text = ?, done = ?, priority = ?, dueDate = ? WHERE id = ?",
            (text, done, priority, due, task_id),
        )
        conn.commit()
    return {"success": True}


@router.delete("/{user_id}/tasks/{task_id}")
def delete_task(user_id: int, task_id: int):
    init_db()
    with get_connection() as conn:
        _user_exists(conn, user_id)
        row = conn.execute("SELECT id FROM user_tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Задача не найдена")
        conn.execute("DELETE FROM user_tasks WHERE id = ?", (task_id,))
        conn.commit()
    return {"success": True}


@router.post("/{user_id}/events")
def add_event(user_id: int, body: EventBody):
    title = body.title.strip()
    if not title or not body.eventDate:
        raise HTTPException(status_code=400, detail="Укажите название и дату")
    init_db()
    with get_connection() as conn:
        _user_exists(conn, user_id)
        cur = conn.execute(
            "INSERT INTO user_events (user_id, title, eventDate, color, note) VALUES (?, ?, ?, ?, ?)",
            (user_id, title, body.eventDate, body.color or "#818cf8", (body.note or "").strip()),
        )
        conn.commit()
        event_id = cur.lastrowid
    return {
        "success": True,
        "event": {
            "id": event_id,
            "title": title,
            "eventDate": body.eventDate,
            "color": body.color,
            "note": (body.note or "").strip(),
        },
    }


@router.delete("/{user_id}/events/{event_id}")
def delete_event(user_id: int, event_id: int):
    init_db()
    with get_connection() as conn:
        conn.execute("DELETE FROM user_events WHERE id = ? AND user_id = ?", (event_id, user_id))
        conn.commit()
    return {"success": True}


@router.post("/{user_id}/files")
async def upload_file(user_id: int, file: UploadFile = File(...)):
    init_db()
    filename = file.filename or "file"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Неподдерживаемый формат файла")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Файл больше 10 МБ")

    stored = f"{user_id}_{uuid.uuid4().hex}{ext}"
    path = FILES_DIR / stored
    path.write_bytes(content)

    file_url = f"/uploads/workspace/{stored}"
    mime = file.content_type or "application/octet-stream"

    with get_connection() as conn:
        _user_exists(conn, user_id)
        cur = conn.execute(
            """
            INSERT INTO user_files (user_id, originalName, storedName, fileUrl, size, mime)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, filename, stored, file_url, len(content), mime),
        )
        conn.commit()
        file_id = cur.lastrowid
        row = conn.execute(
            """
            SELECT f.id, f.originalName, f.fileUrl, f.size, f.mime, f.createdAt,
                   f.user_id AS uploadedBy, u.fullName AS authorName
            FROM user_files f
            LEFT JOIN users u ON u.id = f.user_id
            WHERE f.id = ?
            """,
            (file_id,),
        ).fetchone()

    return {"success": True, "file": dict(row)}


@router.delete("/{user_id}/files/{file_id}")
def delete_file(user_id: int, file_id: int):
    init_db()
    with get_connection() as conn:
        _user_exists(conn, user_id)
        row = conn.execute(
            "SELECT storedName FROM user_files WHERE id = ?",
            (file_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Файл не найден")
        stored = FILES_DIR / row["storedName"]
        if stored.exists():
            stored.unlink()
        conn.execute("DELETE FROM user_files WHERE id = ?", (file_id,))
        conn.commit()
    return {"success": True}


@router.put("/{user_id}/sales-chart")
def save_sales_chart(user_id: int, body: SalesChartBody):
    if not body.points:
        raise HTTPException(status_code=400, detail="Добавьте хотя бы одну точку")

    cleaned: list[tuple[str, float]] = []
    for point in body.points:
        label = point.label.strip()
        if not label:
            raise HTTPException(status_code=400, detail="Укажите подпись для каждой точки")
        cleaned.append((label, float(point.value)))

    init_db()
    with get_connection() as conn:
        _user_exists(conn, user_id)
        conn.execute("DELETE FROM user_sales_points WHERE user_id = ?", (user_id,))
        for idx, (label, value) in enumerate(cleaned):
            conn.execute(
                """
                INSERT INTO user_sales_points (user_id, label, value, sort_order)
                VALUES (?, ?, ?, ?)
                """,
                (user_id, label, value, idx),
            )
        conn.commit()
        sales_points = _fetch_sales_points(conn, user_id)

    return {"success": True, "salesPoints": sales_points}
