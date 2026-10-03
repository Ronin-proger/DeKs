import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from database import get_connection, init_db
from schemas import ProfileUpdateRequest

from user_utils import serialize_user_public

router = APIRouter(prefix="/api/profile", tags=["profile"])

AVATAR_DIR = Path(__file__).parent / "uploads" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_AVATAR_EXT = {".jpg", ".jpeg", ".png", ".webp"}
MAX_AVATAR_SIZE = 2 * 1024 * 1024


def _serialize_user(row) -> dict:
    return serialize_user_public(row)


def _get_user(conn, user_id: int):
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return row


@router.get("/{user_id}")
def get_profile(user_id: int):
    init_db()
    with get_connection() as conn:
        user = _get_user(conn, user_id)
        return {"success": True, "user": _serialize_user(user)}


def _normalize_birth_date(value: str | None) -> str | None:
    if not value or not value.strip():
        return None

    birth_date = value.strip()
    try:
        parsed = datetime.strptime(birth_date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Некорректная дата рождения") from exc

    if parsed.year < 1900 or parsed.date() > datetime.now().date():
        raise HTTPException(status_code=400, detail="Некорректная дата рождения")

    return birth_date


@router.put("/{user_id}")
def update_profile(user_id: int, body: ProfileUpdateRequest):
    init_db()
    with get_connection() as conn:
        _get_user(conn, user_id)

        position = body.position.strip() if body.position else ""
        birth_date = _normalize_birth_date(body.birthDate)

        conn.execute(
            """
            UPDATE users
            SET position = ?, birthDate = ?
            WHERE id = ?
            """,
            (position, birth_date, user_id),
        )
        conn.commit()
        user = _get_user(conn, user_id)
        return {"success": True, "user": _serialize_user(user)}


@router.post("/{user_id}/avatar")
async def upload_avatar(user_id: int, file: UploadFile = File(...)):
    init_db()
    filename = file.filename or ""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_AVATAR_EXT:
        raise HTTPException(
            status_code=400,
            detail="Разрешены только JPG, JPEG, PNG, WEBP",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой")
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Файл больше 2 МБ")

    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = AVATAR_DIR / stored_name
    file_path.write_bytes(content)
    avatar_url = f"/uploads/avatars/{stored_name}"

    with get_connection() as conn:
        user = _get_user(conn, user_id)
        old_url = user["avatarUrl"]
        conn.execute(
            "UPDATE users SET avatarUrl = ? WHERE id = ?",
            (avatar_url, user_id),
        )
        conn.commit()
        user = _get_user(conn, user_id)

        if old_url and old_url.startswith("/uploads/avatars/"):
            old_path = Path(__file__).parent / old_url.lstrip("/")
            if old_path.is_file():
                old_path.unlink(missing_ok=True)

        return {"success": True, "user": _serialize_user(user)}
