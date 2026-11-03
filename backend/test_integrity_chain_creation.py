"""Per-case integrity-chain append tests using isolated SQLite databases."""

import hashlib
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parent
os.environ["CYBERFUSION_JWT_SECRET"] = (
    "integrity-chain-stage-two-tests-secret"
)
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main
import app.integrity.router as integrity_router
from app.auth.security import create_access_token
from app.db.database import Base, get_db
from app.db.models import (
    AuditLog,
    Case,
    Evidence,
    IntegrityChain,
    IntegrityCheckpoint,
    IntegrityRecord,
    User,
)
from integrity_test_helpers import configure_test_signing, restore_test_signing


class PerCaseIntegrityChainCreationTests(unittest.TestCase):
    def setUp(self):
        self.temp_root = tempfile.TemporaryDirectory(
            prefix="cyberfusion-chain-create-"
        )
        self.root = Path(self.temp_root.name).resolve()
        (
            self.previous_signing_environment,
            self.signing_private_key,
            self.signing_private_path,
            self.trusted_public_keys_path,
        ) = configure_test_signing(self.root)
        self.evidence_dir = self.root / "storage" / "evidence"
        self.evidence_dir.mkdir(parents=True)

        self.database_path = self.root / "isolated.db"
        self.engine = create_engine(
            f"sqlite:///{self.database_path.as_posix()}",
            connect_args={
                "check_same_thread": False,
                "timeout": 10,
            },
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
        )

        with self.session_factory() as session:
            self.owner = User(
                username="chain_owner",
                email="chain-owner@example.test",
                password_hash="test-only",
                role="INVESTIGATOR",
                is_active=True,
            )
            self.other_owner = User(
                username="chain_other",
                email="chain-other@example.test",
                password_hash="test-only",
                role="INVESTIGATOR",
                is_active=True,
            )
            session.add_all([self.owner, self.other_owner])
            session.flush()

            self.owner_case_one = Case(
                case_number="CF-CHAIN-OWNER-1",
                title="Owner case one",
                status="OPEN",
                owner_id=self.owner.id,
            )
            self.owner_case_two = Case(
                case_number="CF-CHAIN-OWNER-2",
                title="Owner case two",
                status="OPEN",
                owner_id=self.owner.id,
            )
            self.other_case = Case(
                case_number="CF-CHAIN-OTHER",
                title="Other investigator case",
                status="OPEN",
                owner_id=self.other_owner.id,
            )
            session.add_all(
                [self.owner_case_one, self.owner_case_two, self.other_case]
            )
            session.flush()

            self.evidence_ids = {}
            for key, case, content in (
                ("owner_one", self.owner_case_one, b"case one evidence"),
                ("owner_two", self.owner_case_two, b"case two evidence"),
                ("other", self.other_case, b"other investigator evidence"),
            ):
                relative_path = Path("storage") / "evidence" / f"{key}.txt"
                (self.root / relative_path).write_bytes(content)
                evidence = Evidence(
                    case_id=case.id,
                    uploaded_by=case.owner_id,
                    original_filename=f"{key}.txt",
                    storage_path=str(relative_path),
                    media_type="text/plain",
                    file_size=len(content),
                    sha256_hash=hashlib.sha256(content).hexdigest(),
                )
                session.add(evidence)
                session.flush()
                self.evidence_ids[key] = evidence.id

            self.owner_id = self.owner.id
            self.other_owner_id = self.other_owner.id
            self.owner_case_one_id = self.owner_case_one.id
            self.owner_case_two_id = self.owner_case_two.id
            self.other_case_id = self.other_case.id
            session.commit()

        self.previous_get_db_override = main.app.dependency_overrides.get(
            get_db
        )

        def override_get_db():
            session = self.session_factory()
            try:
                yield session
            finally:
                session.close()

        main.app.dependency_overrides[get_db] = override_get_db
        self.base_patch = patch.object(
            integrity_router,
            "BASE_DIR",
            self.root,
        )
        self.evidence_dir_patch = patch.object(
            integrity_router,
            "EVIDENCE_DIR",
            self.evidence_dir,
        )
        self.base_patch.start()
        self.evidence_dir_patch.start()

        self.owner_headers = self._headers(self.owner_id)
        self.other_headers = self._headers(self.other_owner_id)
        self.client = TestClient(main.app)

    def tearDown(self):
        self.client.close()
        if self.previous_get_db_override is None:
            main.app.dependency_overrides.pop(get_db, None)
        else:
            main.app.dependency_overrides[get_db] = (
                self.previous_get_db_override
            )
        self.evidence_dir_patch.stop()
        self.base_patch.stop()
        self.engine.dispose()
        restore_test_signing(self.previous_signing_environment)
        self.temp_root.cleanup()

    @staticmethod
    def _headers(user_id):
        token = create_access_token(
            subject=str(user_id),
            role="INVESTIGATOR",
        )
        return {"Authorization": f"Bearer {token}"}

    def _create_record(self, evidence_id, headers=None, client=None):
        request_client = client or self.client
        return request_client.post(
            f"/api/integrity/evidence/{evidence_id}/record",
            headers=headers or self.owner_headers,
        )

    def test_append_uses_case_chain_and_preserves_legacy_record(self):
        evidence_id = self.evidence_ids["owner_one"]
        recorded_at = datetime.now(timezone.utc)
        recorded_at_text = integrity_router.timestamp_string(recorded_at)
        legacy_hash = integrity_router.calculate_record_hash(
            evidence_id=evidence_id,
            sha256_hash=hashlib.sha256(b"legacy evidence").hexdigest(),
            previous_record_hash="GENESIS",
            recorded_at=recorded_at_text,
        )
        with self.session_factory() as session:
            legacy = IntegrityRecord(
                evidence_id=evidence_id,
                sha256_hash=hashlib.sha256(b"legacy evidence").hexdigest(),
                previous_record_hash="GENESIS",
                record_hash=legacy_hash,
                recorded_at=recorded_at,
            )
            session.add(legacy)
            session.commit()
            legacy_id = legacy.id
            legacy_timestamp = legacy.recorded_at

        response = self._create_record(evidence_id)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["previous_record_hash"], "GENESIS")
        self.assertEqual(body["sequence_number"], 1)
        self.assertEqual(body["hash_version"], "CASE_CHAIN_V2")
        self.assertIsInstance(body["chain_id"], int)

        with self.session_factory() as session:
            legacy = session.get(IntegrityRecord, legacy_id)
            self.assertIsNone(legacy.chain_id)
            self.assertIsNone(legacy.sequence_number)
            self.assertIsNone(legacy.hash_version)
            self.assertEqual(legacy.record_hash, legacy_hash)
            self.assertEqual(legacy.previous_record_hash, "GENESIS")
            self.assertEqual(legacy.recorded_at, legacy_timestamp)

            record = session.get(IntegrityRecord, body["record_id"])
            self.assertEqual(record.chain_id, body["chain_id"])
            self.assertEqual(record.sequence_number, 1)
            self.assertEqual(record.hash_version, "CASE_CHAIN_V2")

            chain = session.get(IntegrityChain, body["chain_id"])
            self.assertEqual(chain.case_id, self.owner_case_one_id)
            self.assertEqual(chain.head_sequence, 1)
            self.assertEqual(chain.head_record_hash, record.record_hash)
            self.assertEqual(chain.checkpoint_start_sequence, 1)
            checkpoint = (
                session.query(IntegrityCheckpoint)
                .filter(
                    IntegrityCheckpoint.chain_id == chain.id,
                    IntegrityCheckpoint.sequence_number == 1,
                )
                .one()
            )
            self.assertEqual(checkpoint.head_record_hash, record.record_hash)
            self.assertEqual(checkpoint.key_id, "integrity-test-key")
            self.assertEqual(body["checkpoint_id"], checkpoint.id)
            self.assertEqual(body["key_id"], checkpoint.key_id)

        expected_hash = integrity_router.calculate_case_chain_v2_hash(
            chain_id=body["chain_id"],
            case_id=self.owner_case_one_id,
            sequence_number=body["sequence_number"],
            evidence_id=evidence_id,
            sha256_hash=body["sha256_hash"],
            previous_record_hash=body["previous_record_hash"],
            recorded_at=body["recorded_at"],
        )
        self.assertEqual(body["record_hash"], expected_hash)

        listing = self.client.get(
            f"/api/integrity/evidence/{evidence_id}/records",
            headers=self.owner_headers,
        )
        self.assertEqual(listing.status_code, 200, listing.text)
        listed_legacy, listed_new = listing.json()
        self.assertIsNone(listed_legacy["chain_id"])
        self.assertIsNone(listed_legacy["sequence_number"])
        self.assertEqual(listed_new["chain_id"], body["chain_id"])
        self.assertEqual(listed_new["sequence_number"], 1)
        self.assertEqual(listed_new["hash_version"], "CASE_CHAIN_V2")
        self.assertEqual(
            listed_new["checkpoint"]["key_id"],
            "integrity-test-key",
        )

    def test_signing_failure_rolls_back_record_chain_and_checkpoint(self):
        with patch.object(
            integrity_router,
            "sign_checkpoint",
            side_effect=integrity_router.SigningConfigurationError(
                "test signing failure"
            ),
        ):
            response = self._create_record(self.evidence_ids["owner_one"])

        self.assertEqual(response.status_code, 503, response.text)
        with self.session_factory() as session:
            self.assertEqual(session.query(IntegrityRecord).count(), 0)
            self.assertEqual(session.query(IntegrityCheckpoint).count(), 0)
            self.assertEqual(session.query(IntegrityChain).count(), 0)

    def test_each_case_and_investigator_gets_an_independent_genesis_chain(self):
        created = []
        for key, headers in (
            ("owner_one", self.owner_headers),
            ("owner_two", self.owner_headers),
            ("other", self.other_headers),
        ):
            response = self._create_record(self.evidence_ids[key], headers)
            self.assertEqual(response.status_code, 200, response.text)
            created.append(response.json())

        self.assertEqual(
            len({item["chain_id"] for item in created}),
            len(created),
        )
        for item in created:
            self.assertEqual(item["sequence_number"], 1)
            self.assertEqual(item["previous_record_hash"], "GENESIS")
            self.assertEqual(item["hash_version"], "CASE_CHAIN_V2")

        with self.session_factory() as session:
            chains = (
                session.query(IntegrityChain)
                .order_by(IntegrityChain.case_id)
                .all()
            )
            self.assertEqual(len(chains), 3)
            self.assertEqual(
                {chain.case_id for chain in chains},
                {
                    self.owner_case_one_id,
                    self.owner_case_two_id,
                    self.other_case_id,
                },
            )

    def test_non_owner_cannot_create_or_observe_case_chain(self):
        response = self._create_record(
            self.evidence_ids["owner_one"],
            headers=self.other_headers,
        )
        self.assertEqual(response.status_code, 404, response.text)

        with self.session_factory() as session:
            self.assertEqual(session.query(IntegrityChain).count(), 0)
            self.assertEqual(session.query(IntegrityRecord).count(), 0)

    def test_concurrent_appends_are_serialized_on_real_sqlite_file_database(
        self,
    ):
        evidence_id = self.evidence_ids["owner_one"]
        hash_file = integrity_router.calculate_file_sha256

        def deliberately_slow_hash(path):
            result = hash_file(path)
            time.sleep(0.03)
            return result

        def send_request():
            with TestClient(main.app) as client:
                return self._create_record(
                    evidence_id,
                    headers=self.owner_headers,
                    client=client,
                )

        with patch.object(
            integrity_router,
            "calculate_file_sha256",
            side_effect=deliberately_slow_hash,
        ):
            with ThreadPoolExecutor(max_workers=8) as executor:
                responses = list(executor.map(lambda _: send_request(), range(8)))

        for response in responses:
            self.assertEqual(response.status_code, 200, response.text)

        response_sequences = sorted(
            response.json()["sequence_number"]
            for response in responses
        )
        self.assertEqual(response_sequences, list(range(1, 9)))

        with self.session_factory() as session:
            chain = (
                session.query(IntegrityChain)
                .filter(IntegrityChain.case_id == self.owner_case_one_id)
                .one()
            )
            records = (
                session.query(IntegrityRecord)
                .filter(IntegrityRecord.chain_id == chain.id)
                .order_by(IntegrityRecord.sequence_number)
                .all()
            )
            self.assertEqual(chain.head_sequence, 8)
            self.assertEqual(len(records), 8)
            self.assertEqual(
                [record.sequence_number for record in records],
                list(range(1, 9)),
            )
            checkpoints = (
                session.query(IntegrityCheckpoint)
                .filter(IntegrityCheckpoint.chain_id == chain.id)
                .order_by(IntegrityCheckpoint.sequence_number)
                .all()
            )
            self.assertEqual(len(checkpoints), 8)
            self.assertEqual(
                [checkpoint.sequence_number for checkpoint in checkpoints],
                list(range(1, 9)),
            )
            self.assertEqual(records[0].previous_record_hash, "GENESIS")
            for previous, current in zip(records, records[1:]):
                self.assertEqual(
                    current.previous_record_hash,
                    previous.record_hash,
                )
            self.assertEqual(
                chain.head_record_hash,
                records[-1].record_hash,
            )
            self.assertEqual(
                session.query(AuditLog)
                .filter(AuditLog.action == "INTEGRITY_RECORD_CREATED")
                .count(),
                8,
            )

    def test_concurrent_appends_to_different_cases_stay_independent(self):
        requests = [
            ("owner_one", self.owner_headers),
            ("owner_two", self.owner_headers),
        ] * 3

        def send_request(request):
            evidence_key, headers = request
            with TestClient(main.app) as client:
                return self._create_record(
                    self.evidence_ids[evidence_key],
                    headers=headers,
                    client=client,
                )

        with ThreadPoolExecutor(max_workers=6) as executor:
            responses = list(executor.map(send_request, requests))

        for response in responses:
            self.assertEqual(response.status_code, 200, response.text)

        with self.session_factory() as session:
            chains = (
                session.query(IntegrityChain)
                .filter(
                    IntegrityChain.case_id.in_(
                        [self.owner_case_one_id, self.owner_case_two_id]
                    )
                )
                .order_by(IntegrityChain.case_id)
                .all()
            )
            self.assertEqual(len(chains), 2)
            self.assertEqual(
                [chain.head_sequence for chain in chains],
                [3, 3],
            )

            for chain in chains:
                records = (
                    session.query(IntegrityRecord)
                    .filter(IntegrityRecord.chain_id == chain.id)
                    .order_by(IntegrityRecord.sequence_number)
                    .all()
                )
                self.assertEqual(
                    [record.sequence_number for record in records],
                    [1, 2, 3],
                )
                self.assertEqual(records[0].previous_record_hash, "GENESIS")
                for previous, current in zip(records, records[1:]):
                    self.assertEqual(
                        current.previous_record_hash,
                        previous.record_hash,
                    )
                self.assertEqual(chain.head_record_hash, records[-1].record_hash)

    def test_failed_record_insert_rolls_back_new_chain_and_audit(self):
        def fail_integrity_record_insert(
            connection,
            cursor,
            statement,
            parameters,
            context,
            executemany,
        ):
            if statement.lstrip().upper().startswith(
                "INSERT INTO INTEGRITY_RECORDS"
            ):
                raise sqlite3.IntegrityError("injected record insert failure")

        event.listen(
            self.engine,
            "before_cursor_execute",
            fail_integrity_record_insert,
        )
        try:
            response = self._create_record(self.evidence_ids["owner_one"])
        finally:
            event.remove(
                self.engine,
                "before_cursor_execute",
                fail_integrity_record_insert,
            )

        self.assertEqual(response.status_code, 500, response.text)
        with self.session_factory() as session:
            self.assertEqual(session.query(IntegrityChain).count(), 0)
            self.assertEqual(session.query(IntegrityRecord).count(), 0)
            self.assertEqual(
                session.query(AuditLog)
                .filter(AuditLog.action == "INTEGRITY_RECORD_CREATED")
                .count(),
                0,
            )

    def test_failed_head_update_rolls_back_record_and_chain(self):
        def fail_integrity_chain_update(
            connection,
            cursor,
            statement,
            parameters,
            context,
            executemany,
        ):
            normalized = statement.lstrip().upper()
            if normalized.startswith("UPDATE INTEGRITY_CHAINS"):
                raise sqlite3.IntegrityError("injected head update failure")

        event.listen(
            self.engine,
            "before_cursor_execute",
            fail_integrity_chain_update,
        )
        try:
            response = self._create_record(self.evidence_ids["owner_one"])
        finally:
            event.remove(
                self.engine,
                "before_cursor_execute",
                fail_integrity_chain_update,
            )

        self.assertEqual(response.status_code, 500, response.text)
        with self.session_factory() as session:
            self.assertEqual(session.query(IntegrityRecord).count(), 0)
            self.assertEqual(
                session.query(AuditLog)
                .filter(AuditLog.action == "INTEGRITY_RECORD_CREATED")
                .count(),
                0,
            )
            chain = (
                session.query(IntegrityChain)
                .filter(
                    IntegrityChain.case_id == self.owner_case_one_id
                )
                .one_or_none()
            )
            self.assertIsNone(chain)


if __name__ == "__main__":
    unittest.main()
