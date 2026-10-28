import os
import sys
from pathlib import Path

import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))

# Isolate tests from a developer's users.db
os.environ.setdefault("COOKIE_SECURE", "")
os.environ.setdefault("EMBEDDING_FALLBACK", "")


@pytest.fixture()
def tmp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    import database

    monkeypatch.setattr(database, "DB_PATH", db_path)
    database._init_done = False
    database.init_db()
    yield db_path
