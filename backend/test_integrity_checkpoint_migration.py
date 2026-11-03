"""Additive SQLite migration tests for signed integrity checkpoints."""

from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest


BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.migrations.v003_integrity_checkpoints import upgrade


class IntegrityCheckpointMigrationTests(unittest.TestCase):
    def test_migration_preserves_existing_rows_and_is_idempotent(self):
        with tempfile.TemporaryDirectory(
            prefix="cyberfusion-checkpoint-migration-"
        ) as directory:
            database_path = Path(directory) / "existing.db"
            connection = sqlite3.connect(database_path)
            try:
                connection.executescript(
                    """
                    CREATE TABLE cases (id INTEGER PRIMARY KEY);
                    CREATE TABLE integrity_chains (
                        id INTEGER PRIMARY KEY,
                        case_id INTEGER NOT NULL,
                        head_sequence INTEGER NOT NULL,
                        head_record_hash VARCHAR(64) NOT NULL
                    );
                    CREATE TABLE integrity_records (
                        id INTEGER PRIMARY KEY,
                        record_hash VARCHAR(64) NOT NULL
                    );
                    INSERT INTO cases (id) VALUES (10);
                    INSERT INTO integrity_chains
                        (id, case_id, head_sequence, head_record_hash)
                        VALUES (20, 10, 1, 'existing-head');
                    INSERT INTO integrity_records (id, record_hash)
                        VALUES (30, 'legacy-record-hash');
                    """
                )
            finally:
                connection.close()

            self.assertTrue(upgrade(database_path))
            self.assertFalse(upgrade(database_path))

            connection = sqlite3.connect(database_path)
            try:
                record = connection.execute(
                    "SELECT record_hash FROM integrity_records WHERE id = 30"
                ).fetchone()
                chain_columns = {
                    row[1]
                    for row in connection.execute(
                        "PRAGMA table_info('integrity_chains')"
                    )
                }
                checkpoint_table = connection.execute(
                    """
                    SELECT 1 FROM sqlite_master
                    WHERE type = 'table' AND name = 'integrity_checkpoints'
                    """
                ).fetchone()
                migration = connection.execute(
                    "SELECT revision FROM schema_migrations"
                ).fetchone()
            finally:
                connection.close()

            self.assertEqual(record, ("legacy-record-hash",))
            self.assertIn("checkpoint_start_sequence", chain_columns)
            self.assertIsNotNone(checkpoint_table)
            self.assertEqual(migration, ("v003_integrity_checkpoints",))


if __name__ == "__main__":
    unittest.main()
