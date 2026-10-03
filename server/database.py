import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "users.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


_init_done = False

def init_db() -> None:
    global _init_done
    if _init_done:
        return
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fullName TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL CHECK(type IN ('general', 'private')),
                name TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS room_members (
                room_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (room_id, user_id),
                FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_id) REFERENCES chat_rooms(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        general = conn.execute(
            "SELECT id FROM chat_rooms WHERE type = 'general' LIMIT 1"
        ).fetchone()
        if not general:
            conn.execute(
                "INSERT INTO chat_rooms (type, name) VALUES ('general', 'Общий чат')"
            )

        columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(chat_messages)").fetchall()
        }
        if "messageType" not in columns:
            conn.execute(
                "ALTER TABLE chat_messages ADD COLUMN messageType TEXT DEFAULT 'text'"
            )
        if "fileName" not in columns:
            conn.execute(
                "ALTER TABLE chat_messages ADD COLUMN fileName TEXT"
            )
        if "fileUrl" not in columns:
            conn.execute(
                "ALTER TABLE chat_messages ADD COLUMN fileUrl TEXT"
            )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS room_read_state (
                user_id INTEGER NOT NULL,
                room_id INTEGER NOT NULL,
                last_read_message_id INTEGER NOT NULL DEFAULT 0,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, room_id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (room_id) REFERENCES chat_rooms(id)
            )
            """
        )

        user_columns = {
            row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()
        }
        if "avatarUrl" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN avatarUrl TEXT")
        if "position" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN position TEXT DEFAULT ''")
        if "birthYear" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN birthYear INTEGER")
        if "birthDate" not in user_columns:
            conn.execute("ALTER TABLE users ADD COLUMN birthDate TEXT")

        note_columns = {
            row[1] for row in conn.execute("PRAGMA table_info(obsidian_notes)").fetchall()
        }
        if "vault_path" not in note_columns:
            conn.execute("ALTER TABLE obsidian_notes ADD COLUMN vault_path TEXT")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS obsidian_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                content_hash TEXT,
                word_count INTEGER DEFAULT 0,
                tags TEXT DEFAULT '[]',
                folder TEXT DEFAULT '',
                author TEXT DEFAULT 'company',
                created_at TEXT,
                updated_at TEXT,
                synced_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS obsidian_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_path TEXT NOT NULL,
                target_path TEXT,
                target_title TEXT,
                link_type TEXT DEFAULT 'wikilink',
                is_new INTEGER DEFAULT 0,
                created_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS note_embeddings (
                note_path TEXT PRIMARY KEY,
                embedding TEXT NOT NULL,
                updated_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS metric_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_key TEXT NOT NULL,
                scope TEXT NOT NULL,
                value REAL NOT NULL,
                payload TEXT,
                computed_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS intelligence_insights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                severity TEXT NOT NULL,
                category TEXT NOT NULL,
                payload TEXT,
                created_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sync_state (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TEXT
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_note_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_path TEXT NOT NULL,
                target_path TEXT NOT NULL,
                reason TEXT NOT NULL DEFAULT '',
                strength REAL DEFAULT 0.5,
                created_at TEXT,
                UNIQUE(source_path, target_path)
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                icon TEXT DEFAULT '🔗',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                done INTEGER DEFAULT 0,
                priority TEXT DEFAULT 'medium',
                dueDate TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                eventDate TEXT NOT NULL,
                color TEXT DEFAULT '#818cf8',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                originalName TEXT NOT NULL,
                storedName TEXT NOT NULL,
                fileUrl TEXT NOT NULL,
                size INTEGER DEFAULT 0,
                mime TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_sales_points (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                value REAL NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )

        conn.commit()

        # migrate calendar notes column
        try:
            conn.execute("ALTER TABLE user_events ADD COLUMN note TEXT DEFAULT ''")
        except Exception:
            pass

        conn.commit()
        
        _init_done = True
