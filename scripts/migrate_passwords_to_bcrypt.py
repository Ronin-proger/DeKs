"""One-time migration: hash any leftover plaintext passwords with bcrypt.

Usage (from repo root):
  python scripts/migrate_passwords_to_bcrypt.py
  python scripts/migrate_passwords_to_bcrypt.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = ROOT / "server"
sys.path.insert(0, str(SERVER))

import bcrypt  # noqa: E402

from database import get_connection, init_db  # noqa: E402


def is_bcrypt(stored: str) -> bool:
    return bool(stored) and stored.startswith("$2")


def migrate(*, dry_run: bool) -> int:
    init_db()
    updated = 0
    with get_connection() as conn:
        rows = conn.execute("SELECT id, email, password FROM users").fetchall()
        for row in rows:
            stored = row["password"] or ""
            if is_bcrypt(stored):
                continue
            hashed = bcrypt.hashpw(stored.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            print(f"user {row['id']} ({row['email']}): plaintext -> bcrypt")
            if not dry_run:
                conn.execute(
                    "UPDATE users SET password = ? WHERE id = ?",
                    (hashed, row["id"]),
                )
            updated += 1
        if not dry_run and updated:
            conn.commit()
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report rows that would be updated without writing",
    )
    args = parser.parse_args()
    count = migrate(dry_run=args.dry_run)
    mode = "would update" if args.dry_run else "updated"
    print(f"{mode} {count} password(s)")


if __name__ == "__main__":
    main()
