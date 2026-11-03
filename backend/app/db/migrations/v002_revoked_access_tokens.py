"""Add persistent JWT revocations without altering existing records.

Run with:
    python -m app.db.migrations.v002_revoked_access_tokens --database PATH
"""

import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


REVISION = "v002_revoked_access_tokens"


def _table_exists(connection: sqlite3.Connection, table_name: str) -> bool:
    return connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone() is not None


def _columns(connection: sqlite3.Connection, table_name: str) -> set[str]:
    return {
        row[1]
        for row in connection.execute(f'PRAGMA table_info("{table_name}")')
    }


def upgrade(database_path: Path) -> bool:
    """Create the revocation table additively; return False if already applied."""
    if not database_path.is_file():
        raise FileNotFoundError(
            f"Database file does not exist: {database_path}"
        )

    connection = sqlite3.connect(database_path)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("BEGIN IMMEDIATE")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                revision TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
            """
        )

        applied = connection.execute(
            "SELECT 1 FROM schema_migrations WHERE revision = ?",
            (REVISION,),
        ).fetchone()
        if applied:
            connection.rollback()
            return False

        if not _table_exists(connection, "users"):
            raise RuntimeError("Required table 'users' does not exist.")

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS revoked_access_tokens (
                id INTEGER NOT NULL PRIMARY KEY,
                jti VARCHAR(128) NOT NULL,
                user_id INTEGER NOT NULL,
                expires_at DATETIME NOT NULL,
                revoked_at DATETIME NOT NULL,
                CONSTRAINT uq_revoked_access_tokens_jti UNIQUE (jti),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )

        required_columns = {
            "id",
            "jti",
            "user_id",
            "expires_at",
            "revoked_at",
        }
        missing = required_columns - _columns(connection, "revoked_access_tokens")
        if missing:
            raise RuntimeError(
                "Revocation table is missing required columns: "
                + ", ".join(sorted(missing))
            )

        connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS
                uq_revoked_access_tokens_jti
            ON revoked_access_tokens(jti)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_revoked_access_tokens_user_id
            ON revoked_access_tokens(user_id)
            """
        )
        connection.execute(
            "INSERT INTO schema_migrations (revision, applied_at) VALUES (?, ?)",
            (REVISION, datetime.now(timezone.utc).isoformat()),
        )
        connection.commit()
        return True
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database",
        required=True,
        type=Path,
        help="Existing SQLite database file to migrate.",
    )
    args = parser.parse_args()

    applied = upgrade(args.database)
    if applied:
        print(f"Applied {REVISION}.")
    else:
        print(f"{REVISION} is already applied; no changes made.")


if __name__ == "__main__":
    main()
