import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from database import get_connection, init_db
from schemas import PrivateRoomRequest, SendMessageRequest

router = APIRouter(prefix="/api/messenger", tags=["messenger"])

UPLOAD_DIR = Path(__file__).parent / "uploads" / "chat"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".jpeg", ".jpg", ".png"}
MAX_FILE_SIZE = 10 * 1024 * 1024

MESSAGE_SELECT = """
    SELECT m.id, m.room_id AS roomId, m.user_id AS userId,
           m.content, m.messageType, m.fileName, m.fileUrl,
           m.createdAt, u.fullName AS senderName, u.avatarUrl AS avatarUrl
    FROM chat_messages m
    JOIN users u ON u.id = m.user_id
"""


def _user_exists(conn, user_id: int) -> bool:
    return (
        conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        is not None
    )


def _message_preview(row: dict) -> str:
    if row.get("messageType") == "file":
        name = row.get("fileName") or "файл"
        caption = (row.get("content") or "").strip()
        return caption or f"📎 {name}"
    return row.get("content") or ""


def _serialize_message(row) -> dict:
    data = dict(row)
    if not data.get("messageType"):
        data["messageType"] = "text"
    return data


def _get_last_read(conn, user_id: int, room_id: int) -> int:
    row = conn.execute(
        """
        SELECT last_read_message_id
        FROM room_read_state
        WHERE user_id = ? AND room_id = ?
        """,
        (user_id, room_id),
    ).fetchone()
    if row:
        return int(row["last_read_message_id"] or 0)

    max_row = conn.execute(
        "SELECT COALESCE(MAX(id), 0) AS max_id FROM chat_messages WHERE room_id = ?",
        (room_id,),
    ).fetchone()
    baseline = int(max_row["max_id"] or 0)
    # fix baseline once so new messages after this point count as unread
    _mark_read(conn, user_id, room_id, baseline)
    return baseline


def _mark_read(conn, user_id: int, room_id: int, message_id: int) -> None:
    if message_id < 0:
        return
    conn.execute(
        """
        INSERT INTO room_read_state (user_id, room_id, last_read_message_id, updatedAt)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, room_id) DO UPDATE SET
            last_read_message_id = CASE
                WHEN excluded.last_read_message_id > room_read_state.last_read_message_id
                THEN excluded.last_read_message_id
                ELSE room_read_state.last_read_message_id
            END,
            updatedAt = CURRENT_TIMESTAMP
        """,
        (user_id, room_id, message_id),
    )


def _unread_count(conn, user_id: int, room_id: int) -> int:
    last_read = _get_last_read(conn, user_id, room_id)
    row = conn.execute(
        """
        SELECT COUNT(*) AS cnt
        FROM chat_messages
        WHERE room_id = ? AND id > ? AND user_id != ?
        """,
        (room_id, last_read, user_id),
    ).fetchone()
    return int(row["cnt"] or 0)


def _accessible_rooms(conn, user_id: int) -> list[dict]:
    ensure_general_room(conn)
    general = conn.execute(
        "SELECT id, name FROM chat_rooms WHERE type = 'general' LIMIT 1"
    ).fetchone()
    rooms = [
        {
            "id": general["id"],
            "type": "general",
            "name": general["name"] or "Общий чат",
        }
    ]

    private_rows = conn.execute(
        """
        SELECT r.id, peer.fullName AS name
        FROM chat_rooms r
        JOIN room_members me ON me.room_id = r.id AND me.user_id = ?
        JOIN room_members them ON them.room_id = r.id AND them.user_id != ?
        JOIN users peer ON peer.id = them.user_id
        WHERE r.type = 'private'
          AND (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) = 2
        ORDER BY r.id DESC
        """,
        (user_id, user_id),
    ).fetchall()
    for row in private_rows:
        rooms.append({"id": row["id"], "type": "private", "name": row["name"]})
    return rooms


def _unread_notifications(conn, user_id: int, limit: int = 15) -> list[dict]:
    items = []
    for room in _accessible_rooms(conn, user_id):
        last_read = _get_last_read(conn, user_id, room["id"])
        rows = conn.execute(
            f"""
            {MESSAGE_SELECT}
            WHERE m.room_id = ? AND m.id > ? AND m.user_id != ?
            ORDER BY m.id DESC
            LIMIT ?
            """,
            (room["id"], last_read, user_id, limit),
        ).fetchall()
        for row in rows:
            data = _serialize_message(row)
            items.append(
                {
                    "id": data["id"],
                    "roomId": room["id"],
                    "roomName": room["name"],
                    "roomType": room["type"],
                    "senderName": data.get("senderName") or "Пользователь",
                    "preview": _message_preview(data),
                    "createdAt": data.get("createdAt"),
                }
            )

    items.sort(key=lambda item: item["id"], reverse=True)
    return items[:limit]


def ensure_general_room(conn) -> int:
    row = conn.execute(
        "SELECT id FROM chat_rooms WHERE type = 'general' LIMIT 1"
    ).fetchone()
    if row:
        return row["id"]

    cursor = conn.execute(
        "INSERT INTO chat_rooms (type, name) VALUES ('general', 'Общий чат')"
    )
    return cursor.lastrowid


def _last_message(conn, room_id: int) -> dict | None:
    row = conn.execute(
        f"""
        {MESSAGE_SELECT}
        WHERE m.room_id = ?
        ORDER BY m.id DESC
        LIMIT 1
        """,
        (room_id,),
    ).fetchone()
    if not row:
        return None
    data = _serialize_message(row)
    data["content"] = _message_preview(data)
    return data


def _can_access_room(conn, room_id: int, user_id: int) -> bool:
    room = conn.execute(
        "SELECT type FROM chat_rooms WHERE id = ?", (room_id,)
    ).fetchone()
    if not room:
        return False
    if room["type"] == "general":
        return _user_exists(conn, user_id)

    if room["type"] != "private":
        return False

    members = conn.execute(
        "SELECT user_id FROM room_members WHERE room_id = ?",
        (room_id,),
    ).fetchall()
    member_ids = {row["user_id"] for row in members}
    if len(member_ids) != 2:
        return False
    return user_id in member_ids


def _get_or_create_private_room(conn, user_id: int, target_user_id: int) -> int:
    if user_id == target_user_id:
        raise HTTPException(status_code=400, detail="Нельзя создать чат с самим собой")

    if not _user_exists(conn, target_user_id):
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    existing = conn.execute(
        """
        SELECT r.id
        FROM chat_rooms r
        JOIN room_members m1 ON m1.room_id = r.id AND m1.user_id = ?
        JOIN room_members m2 ON m2.room_id = r.id AND m2.user_id = ?
        WHERE r.type = 'private'
        LIMIT 1
        """,
        (user_id, target_user_id),
    ).fetchone()
    if existing:
        return existing["id"]

    cursor = conn.execute(
        "INSERT INTO chat_rooms (type, name) VALUES ('private', NULL)"
    )
    room_id = cursor.lastrowid
    conn.execute(
        "INSERT INTO room_members (room_id, user_id) VALUES (?, ?), (?, ?)",
        (room_id, user_id, room_id, target_user_id),
    )
    return room_id


def _validate_extension(filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Формат не поддерживается. Разрешены: {allowed}",
        )
    return ext


def _unlink_chat_file(file_url: str | None) -> None:
    if not file_url or not file_url.startswith("/uploads/chat/"):
        return
    stored_name = Path(file_url).name
    if stored_name:
        (UPLOAD_DIR / stored_name).unlink(missing_ok=True)


def _delete_private_room(conn, room_id: int, user_id: int) -> None:
    room = conn.execute(
        "SELECT type FROM chat_rooms WHERE id = ?", (room_id,)
    ).fetchone()
    if not room:
        raise HTTPException(status_code=404, detail="Чат не найден")
    if room["type"] != "private":
        raise HTTPException(status_code=400, detail="Можно удалить только личный чат")
    if not _can_access_room(conn, room_id, user_id):
        raise HTTPException(status_code=403, detail="Нет доступа к чату")

    file_rows = conn.execute(
        """
        SELECT fileUrl FROM chat_messages
        WHERE room_id = ? AND fileUrl IS NOT NULL AND fileUrl != ''
        """,
        (room_id,),
    ).fetchall()
    for row in file_rows:
        _unlink_chat_file(row["fileUrl"])

    conn.execute("DELETE FROM chat_messages WHERE room_id = ?", (room_id,))
    conn.execute("DELETE FROM room_members WHERE room_id = ?", (room_id,))

    has_read_state = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'room_read_state'"
    ).fetchone()
    if has_read_state:
        conn.execute("DELETE FROM room_read_state WHERE room_id = ?", (room_id,))

    conn.execute("DELETE FROM chat_rooms WHERE id = ?", (room_id,))


@router.get("/rooms")
def list_rooms(userId: int = Query(..., ge=1)):
    init_db()
    with get_connection() as conn:
        if not _user_exists(conn, userId):
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        general_id = ensure_general_room(conn)
        general = conn.execute(
            "SELECT id, name FROM chat_rooms WHERE id = ?", (general_id,)
        ).fetchone()

        rooms = [
            {
                "id": general["id"],
                "type": "general",
                "name": general["name"] or "Общий чат",
                "peer": None,
                "lastMessage": _last_message(conn, general["id"]),
                "unreadCount": _unread_count(conn, userId, general["id"]),
            }
        ]

        private_rows = conn.execute(
            """
            SELECT r.id,
                   peer.id AS peerId,
                   peer.fullName AS peerName,
                   peer.avatarUrl AS peerAvatarUrl
            FROM chat_rooms r
            JOIN room_members me ON me.room_id = r.id AND me.user_id = ?
            JOIN room_members them ON them.room_id = r.id AND them.user_id != ?
            JOIN users peer ON peer.id = them.user_id
            WHERE r.type = 'private'
              AND (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) = 2
            ORDER BY r.id DESC
            """,
            (userId, userId),
        ).fetchall()

        for row in private_rows:
            rooms.append(
                {
                    "id": row["id"],
                    "type": "private",
                    "name": row["peerName"],
                    "peer": {
                        "id": row["peerId"],
                        "fullName": row["peerName"],
                        "avatarUrl": row["peerAvatarUrl"] or None,
                    },
                    "lastMessage": _last_message(conn, row["id"]),
                    "unreadCount": _unread_count(conn, userId, row["id"]),
                }
            )

        conn.commit()
        return {"success": True, "rooms": rooms}


@router.post("/rooms/private")
def create_private_room(body: PrivateRoomRequest):
    init_db()
    with get_connection() as conn:
        if not _user_exists(conn, body.userId):
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        room_id = _get_or_create_private_room(conn, body.userId, body.targetUserId)
        peer = conn.execute(
            "SELECT id, fullName, email, avatarUrl FROM users WHERE id = ?",
            (body.targetUserId,),
        ).fetchone()
        conn.commit()

        return {
            "success": True,
            "room": {
                "id": room_id,
                "type": "private",
                "name": peer["fullName"],
                "peer": {
                    "id": peer["id"],
                    "fullName": peer["fullName"],
                    "email": peer["email"],
                    "avatarUrl": peer["avatarUrl"] or None,
                },
            },
        }


@router.get("/rooms/{room_id}/messages")
def get_messages(
    room_id: int,
    userId: int = Query(..., ge=1),
    after: int = Query(0, ge=0),
):
    init_db()
    with get_connection() as conn:
        if not _can_access_room(conn, room_id, userId):
            raise HTTPException(status_code=403, detail="Нет доступа к чату")

        rows = conn.execute(
            f"""
            {MESSAGE_SELECT}
            WHERE m.room_id = ? AND m.id > ?
            ORDER BY m.id ASC
            LIMIT 200
            """,
            (room_id, after),
        ).fetchall()

        return {
            "success": True,
            "messages": [_serialize_message(row) for row in rows],
        }


@router.get("/unread")
def get_unread(userId: int = Query(..., ge=1)):
    init_db()
    with get_connection() as conn:
        if not _user_exists(conn, userId):
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        room_stats = []
        total = 0
        for room in _accessible_rooms(conn, userId):
            count = _unread_count(conn, userId, room["id"])
            total += count
            if count > 0:
                room_stats.append(
                    {
                        "roomId": room["id"],
                        "roomName": room["name"],
                        "roomType": room["type"],
                        "unreadCount": count,
                    }
                )

        conn.commit()
        return {
            "success": True,
            "total": total,
            "rooms": room_stats,
            "notifications": _unread_notifications(conn, userId),
        }


@router.post("/rooms/{room_id}/read")
def mark_room_read(
    room_id: int,
    userId: int = Query(..., ge=1),
    lastMessageId: int = Query(0, ge=0),
):
    init_db()
    with get_connection() as conn:
        if not _can_access_room(conn, room_id, userId):
            raise HTTPException(status_code=403, detail="Нет доступа к чату")

        if lastMessageId <= 0:
            max_row = conn.execute(
                "SELECT COALESCE(MAX(id), 0) AS max_id FROM chat_messages WHERE room_id = ?",
                (room_id,),
            ).fetchone()
            lastMessageId = int(max_row["max_id"] or 0)
        else:
            exists = conn.execute(
                "SELECT id FROM chat_messages WHERE id = ? AND room_id = ?",
                (lastMessageId, room_id),
            ).fetchone()
            if not exists:
                raise HTTPException(status_code=400, detail="Сообщение не найдено")

        _mark_read(conn, userId, room_id, lastMessageId)
        conn.commit()
        return {
            "success": True,
            "unreadCount": _unread_count(conn, userId, room_id),
        }


@router.delete("/rooms/{room_id}")
def delete_private_room(room_id: int, userId: int = Query(..., ge=1)):
    init_db()
    with get_connection() as conn:
        if not _user_exists(conn, userId):
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        _delete_private_room(conn, room_id, userId)
        conn.commit()
        return {"success": True}


@router.post("/rooms/{room_id}/messages")
def send_message(room_id: int, body: SendMessageRequest):
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Сообщение пустое")

    init_db()
    with get_connection() as conn:
        if not _can_access_room(conn, room_id, body.userId):
            raise HTTPException(status_code=403, detail="Нет доступа к чату")

        cursor = conn.execute(
            """
            INSERT INTO chat_messages (room_id, user_id, content, messageType)
            VALUES (?, ?, ?, 'text')
            """,
            (room_id, body.userId, content),
        )
        message_id = cursor.lastrowid

        row = conn.execute(
            f"{MESSAGE_SELECT} WHERE m.id = ?",
            (message_id,),
        ).fetchone()
        conn.commit()

        return {"success": True, "message": _serialize_message(row)}


@router.post("/rooms/{room_id}/files")
async def send_file(
    room_id: int,
    userId: int = Form(...),
    file: UploadFile = File(...),
    caption: str = Form(""),
):
    init_db()
    ext = _validate_extension(file.filename or "")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Файл больше 10 МБ")

    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / stored_name
    file_path.write_bytes(content)

    file_url = f"/uploads/chat/{stored_name}"
    caption_text = caption.strip()
    original_name = Path(file.filename or stored_name).name

    with get_connection() as conn:
        if not _can_access_room(conn, room_id, userId):
            file_path.unlink(missing_ok=True)
            raise HTTPException(status_code=403, detail="Нет доступа к чату")

        cursor = conn.execute(
            """
            INSERT INTO chat_messages
            (room_id, user_id, content, messageType, fileName, fileUrl)
            VALUES (?, ?, ?, 'file', ?, ?)
            """,
            (room_id, userId, caption_text, original_name, file_url),
        )
        message_id = cursor.lastrowid

        row = conn.execute(
            f"{MESSAGE_SELECT} WHERE m.id = ?",
            (message_id,),
        ).fetchone()
        conn.commit()

        return {"success": True, "message": _serialize_message(row)}
