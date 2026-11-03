"""Add per-case integrity-chain schema without altering legacy records.

Run with:
    python -m app.db.migrations.v001_per_case_integrity_chains --database PATH
"""

import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


REVISION = "v001_per_case_integrity_chains"


def _table_exists(connection: sqlite3.Connection, table_name: str) -> bool:
    return connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone() is not None


def _columns(
    connection: sqlite3.Connection,
    table_name: str,
) -> set[str]:
    return {
        row[1]
        for row in connection.execute(
            f'PRAGMA table_info("{table_name}")'
        )
    }


def upgrade(database_path: Path) -> bool:
    """Apply the additive schema migration; return False if already applied."""
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

        if not _table_exists(connection, "cases"):
            raise RuntimeError("Required table 'cases' does not exist.")
        if not _table_exists(connection, "integrity_records"):
            raise RuntimeError(
                "Required table 'integrity_records' does not exist."
            )

        record_columns = _columns(connection, "integrity_records")
        required_legacy_columns = {
            "id",
            "evidence_id",
            "sha256_hash",
            "previous_record_hash",
            "record_hash",
            "recorded_at",
        }
        missing = required_legacy_columns - record_columns
        if missing:
            raise RuntimeError(
                "Integrity-record schema is missing required columns: "
                + ", ".join(sorted(missing))
            )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS integrity_chains (
                id INTEGER NOT NULL PRIMARY KEY,
                case_id INTEGER NOT NULL UNIQUE,
                head_sequence INTEGER NOT NULL DEFAULT 0,
                head_record_hash VARCHAR(64) NOT NULL DEFAULT 'GENESIS',
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                FOREIGN KEY(case_id) REFERENCES cases(id)
            )
            """
        )

        if "chain_id" not in record_columns:
            connection.execute(
                """
                ALTER TABLE integrity_records
                ADD COLUMN chain_id INTEGER
                REFERENCES integrity_chains(id)
                """
            )
        if "sequence_number" not in record_columns:
            connection.execute(
                """
                ALTER TABLE integrity_records
                ADD COLUMN sequence_number INTEGER
                """
            )
        if "hash_version" not in record_columns:
            connection.execute(
                """
                ALTER TABLE integrity_records
                ADD COLUMN hash_version VARCHAR(32)
                """
            )

        non_legacy_count = connection.execute(
            """
            SELECT COUNT(*)
            FROM integrity_records
            WHERE chain_id IS NOT NULL OR sequence_number IS NOT NULL
            """
        ).fetchone()[0]
        if non_legacy_count:
            raise RuntimeError(
                "Existing integrity records already contain chain metadata; "
                "refusing to alter or reclassify them."
            )

        connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS
                uq_integrity_records_chain_sequence
            ON integrity_records(chain_id, sequence_number)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_integrity_records_chain_id
            ON integrity_records(chain_id)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_integrity_chains_id
            ON integrity_chains(id)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS ix_integrity_chains_case_id
            ON integrity_chains(case_id)
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
