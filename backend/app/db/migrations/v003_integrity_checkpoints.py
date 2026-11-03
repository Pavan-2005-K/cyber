"""Add per-case Ed25519 checkpoint storage without changing existing records.

Run with:
    python -m app.db.migrations.v003_integrity_checkpoints --database PATH
"""

import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


REVISION = "v003_integrity_checkpoints"


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
    """Apply the additive checkpoint migration; return False if already applied."""
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

        if not _table_exists(connection, "integrity_chains"):
            raise RuntimeError(
                "Required table 'integrity_chains' does not exist."
            )
        if not _table_exists(connection, "cases"):
            raise RuntimeError("Required table 'cases' does not exist.")

        chain_columns = _columns(connection, "integrity_chains")
        if "checkpoint_start_sequence" not in chain_columns:
            connection.execute(
                """
                ALTER TABLE integrity_chains
                ADD COLUMN checkpoint_start_sequence INTEGER
                """
            )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS integrity_checkpoints (
                id INTEGER NOT NULL PRIMARY KEY,
                chain_id INTEGER NOT NULL,
                case_id INTEGER NOT NULL,
                sequence_number INTEGER NOT NULL,
                head_record_hash VARCHAR(64) NOT NULL,
                checkpoint_version VARCHAR(64) NOT NULL,
                key_id VARCHAR(128) NOT NULL,
                signature VARCHAR(128) NOT NULL,
                created_at DATETIME NOT NULL,
                CONSTRAINT uq_integrity_checkpoints_chain_sequence
                    UNIQUE (chain_id, sequence_number),
                FOREIGN KEY(chain_id) REFERENCES integrity_chains(id),
                FOREIGN KEY(case_id) REFERENCES cases(id)
            )
            """
        )

        required_columns = {
            "id",
            "chain_id",
            "case_id",
            "sequence_number",
            "head_record_hash",
            "checkpoint_version",
            "key_id",
            "signature",
            "created_at",
        }
        missing = required_columns - _columns(
            connection,
            "integrity_checkpoints",
        )
        if missing:
            raise RuntimeError(
                "Checkpoint table is missing required columns: "
                + ", ".join(sorted(missing))
            )

        connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS
                uq_integrity_checkpoints_chain_sequence
            ON integrity_checkpoints(chain_id, sequence_number)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_integrity_checkpoints_case_id
            ON integrity_checkpoints(case_id)
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
