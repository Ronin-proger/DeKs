import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException, Request

from database import get_connection, init_db

COOKIE_NAME = "deks_session"
SESSION_DAYS = 14
SERVER_ERROR = "Не удалось выполнить запрос"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _is_hash(stored: str) -> bool:
    return stored.startswith("$2")


def password_matches(stored: str, password: str) -> bool:
    if _is_hash(stored):
        try:
            return bcrypt.checkpw(password.encode("utf-8"), stored.encode("utf-8"))
        except ValueError:
            return False
    return hmac.compare_digest(stored, password)


def upgrade_password_if_needed(user_id: int, stored: str, password: str) -> None:
    if _is_hash(stored):
        return
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET password = ? WHERE id = ?",
            (hash_password(password), user_id),
        )
        conn.commit()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_session(user_id: int) -> str:
    init_db()
    token = secrets.token_urlsafe(32)
    expires = (_utcnow() + timedelta(days=SESSION_DAYS)).isoformat()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user_id, expires),
        )
        conn.commit()
    return token


def delete_session(token: str | None) -> None:
    if not token:
        return
    init_db()
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()


def _token_from_request(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
        if token:
            return token
    return request.cookies.get(COOKIE_NAME)


def load_user(request: Request):
    token = _token_from_request(request)
    if not token:
        return None
    init_db()
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT u.*
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
        if not row:
            return None
        session = conn.execute(
            "SELECT expires_at FROM sessions WHERE token = ?",
            (token,),
        ).fetchone()
    expires_at = session["expires_at"] if session else ""
    try:
        expires = datetime.fromisoformat(expires_at)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
    except ValueError:
        expires = _utcnow() - timedelta(seconds=1)
    if expires <= _utcnow():
        delete_session(token)
        return None
    return row


def require_user(request: Request):
    user = load_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Нужно войти")
    return user


def require_self(request: Request, claimed_id: int):
    user = require_user(request)
    if int(user["id"]) != int(claimed_id):
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return user


def cookie_settings() -> dict:
    secure = os.getenv("COOKIE_SECURE", "").lower() in {"1", "true", "yes"}
    return {
        "key": COOKIE_NAME,
        "httponly": True,
        "samesite": "lax",
        "secure": secure,
        "path": "/",
        "max_age": SESSION_DAYS * 24 * 60 * 60,
    }
