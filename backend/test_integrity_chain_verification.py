"""Legacy and CASE_CHAIN_V2 verification tests with isolated storage."""

import base64
import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parent
os.environ["CYBERFUSION_JWT_SECRET"] = (
    "integrity-chain-verification-tests-secret"
)
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main
import app.integrity.router as integrity_router
from app.auth.security import create_access_token
from app.db.database import Base, get_db
from app.db.models import (
    Case,
    Evidence,
    IntegrityChain,
    IntegrityCheckpoint,
    IntegrityRecord,
    User,
)
from app.integrity.signing import (
    KEY_ID_ENV,
    SIGNATURE_INVALID,
    SIGNATURE_UNKNOWN_KEY,
)
from integrity_test_helpers import (
    configure_test_signing,
    restore_test_signing,
)


class IntegrityChainVerificationTests(unittest.TestCase):
    def setUp(self):
        self.temp_root = tempfile.TemporaryDirectory(
            prefix="cyberfusion-chain-verify-"
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

        self.engine = create_engine(
            f"sqlite:///{(self.root / 'isolated.db').as_posix()}",
            connect_args={"check_same_thread": False, "timeout": 10},
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
        )

        with self.session_factory() as session:
            self.owner_a = User(
                username="verify_owner_a",
                email="verify-owner-a@example.test",
                password_hash="test-only",
                role="INVESTIGATOR",
                is_active=True,
            )
            self.owner_b = User(
                username="verify_owner_b",
                email="verify-owner-b@example.test",
                password_hash="test-only",
                role="INVESTIGATOR",
                is_active=True,
            )
            session.add_all([self.owner_a, self.owner_b])
            session.flush()

            self.case_a1 = Case(
                case_number="CF-VERIFY-A1",
                title="Owner A case one",
                status="OPEN",
                owner_id=self.owner_a.id,
            )
            self.case_a2 = Case(
                case_number="CF-VERIFY-A2",
                title="Owner A case two",
                status="OPEN",
                owner_id=self.owner_a.id,
            )
            self.case_b = Case(
                case_number="CF-VERIFY-B",
                title="Owner B case",
                status="OPEN",
                owner_id=self.owner_b.id,
            )
            session.add_all([self.case_a1, self.case_a2, self.case_b])
            session.flush()

            self.evidence_ids = {}
            for name, case, content in (
                ("a1", self.case_a1, b"evidence for A case one"),
                ("a2", self.case_a2, b"evidence for A case two"),
                ("b", self.case_b, b"evidence for B"),
            ):
                relative_path = Path("storage") / "evidence" / f"{name}.txt"
                (self.root / relative_path).write_bytes(content)
                item = Evidence(
                    case_id=case.id,
                    uploaded_by=case.owner_id,
                    original_filename=f"{name}.txt",
                    storage_path=str(relative_path),
                    media_type="text/plain",
                    file_size=len(content),
                    sha256_hash=hashlib.sha256(content).hexdigest(),
                )
                session.add(item)
                session.flush()
                self.evidence_ids[name] = item.id

            self.owner_a_id = self.owner_a.id
            self.owner_b_id = self.owner_b.id
            self.case_a1_id = self.case_a1.id
            self.case_a2_id = self.case_a2.id
            self.case_b_id = self.case_b.id
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

        self.client = TestClient(main.app)
        self.headers_a = self._headers(self.owner_a_id)
        self.headers_b = self._headers(self.owner_b_id)

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

    def _append_v2(self, evidence_key, headers=None):
        return self.client.post(
            f"/api/integrity/evidence/{self.evidence_ids[evidence_key]}/record",
            headers=headers or self.headers_a,
        )

    def _verify_case(self, case_id, headers=None):
        return self.client.get(
            f"/api/integrity/cases/{case_id}/verify-chain",
            headers=headers or self.headers_a,
        )

    def _add_legacy_record(
        self,
        *,
        evidence_key,
        previous_hash,
        record_hash_override=None,
        recorded_at=None,
    ):
        evidence_id = self.evidence_ids[evidence_key]
        with self.session_factory() as session:
            evidence = session.get(Evidence, evidence_id)
            timestamp = recorded_at or (
                datetime.now(timezone.utc)
                + timedelta(microseconds=evidence_id)
            )
            hash_value = integrity_router.calculate_record_hash(
                evidence_id=evidence_id,
                sha256_hash=evidence.sha256_hash,
                previous_record_hash=previous_hash,
                recorded_at=integrity_router.timestamp_string(timestamp),
            )
            record = IntegrityRecord(
                evidence_id=evidence_id,
                sha256_hash=evidence.sha256_hash,
                previous_record_hash=previous_hash,
                record_hash=record_hash_override or hash_value,
                recorded_at=timestamp,
            )
            session.add(record)
            session.commit()
            return record.id, record.record_hash, record.recorded_at

    def _create_v2_chain(self, evidence_keys, headers=None):
        responses = []
        for key in evidence_keys:
            response = self._append_v2(key, headers=headers)
            self.assertEqual(response.status_code, 200, response.text)
            responses.append(response.json())
        return responses

    def _add_unsigned_v2_record(self, evidence_key):
        with self.session_factory() as session:
            evidence = session.get(Evidence, self.evidence_ids[evidence_key])
            chain = IntegrityChain(
                case_id=evidence.case_id,
                head_sequence=0,
                head_record_hash="GENESIS",
            )
            session.add(chain)
            session.flush()
            recorded_at = datetime.now(timezone.utc)
            record_hash = integrity_router.calculate_case_chain_v2_hash(
                chain_id=chain.id,
                case_id=evidence.case_id,
                sequence_number=1,
                evidence_id=evidence.id,
                sha256_hash=evidence.sha256_hash,
                previous_record_hash="GENESIS",
                recorded_at=integrity_router.timestamp_string(recorded_at),
            )
            session.add(
                IntegrityRecord(
                    evidence_id=evidence.id,
                    sha256_hash=evidence.sha256_hash,
                    previous_record_hash="GENESIS",
                    record_hash=record_hash,
                    recorded_at=recorded_at,
                    chain_id=chain.id,
                    sequence_number=1,
                    hash_version=integrity_router.CASE_CHAIN_HASH_VERSION,
                )
            )
            chain.head_sequence = 1
            chain.head_record_hash = record_hash
            session.commit()
            return chain.id

    def test_interleaved_legacy_records_verify_in_global_order(self):
        _, hash_a1, _ = self._add_legacy_record(
            evidence_key="a1",
            previous_hash="GENESIS",
        )
        _, hash_b, _ = self._add_legacy_record(
            evidence_key="b",
            previous_hash=hash_a1,
        )
        _, _, _ = self._add_legacy_record(
            evidence_key="a2",
            previous_hash=hash_b,
        )

        result_a = self.client.get(
            "/api/integrity/verify-chain",
            headers=self.headers_a,
        )
        result_b = self.client.get(
            "/api/integrity/verify-chain",
            headers=self.headers_b,
        )
        self.assertEqual(result_a.status_code, 200, result_a.text)
        self.assertEqual(result_b.status_code, 200, result_b.text)
        self.assertTrue(result_a.json()["legacy_chain_valid"])
        self.assertTrue(result_b.json()["legacy_chain_valid"])
        self.assertEqual(result_a.json()["legacy_records_checked"], 2)
        self.assertEqual(result_b.json()["legacy_records_checked"], 1)
        self.assertEqual(result_a.json()["legacy_errors"], [])
        self.assertEqual(result_b.json()["legacy_errors"], [])

    def test_legacy_tamper_is_reported_without_exposing_other_owner_record(self):
        _, hash_a1, _ = self._add_legacy_record(
            evidence_key="a1",
            previous_hash="GENESIS",
        )
        hidden_id, _, _ = self._add_legacy_record(
            evidence_key="b",
            previous_hash=hash_a1,
            record_hash_override="f" * 64,
        )
        visible_id, _, _ = self._add_legacy_record(
            evidence_key="a2",
            previous_hash="f" * 64,
        )

        response = self.client.get(
            "/api/integrity/verify-chain",
            headers=self.headers_a,
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertFalse(body["legacy_chain_valid"])
        self.assertNotIn(hidden_id, {item.get("record_id") for item in body["errors"]})
        self.assertIn(
            visible_id,
            {item.get("record_id") for item in body["errors"]},
        )
        self.assertNotIn(
            f'"record_id":{hidden_id}',
            response.text,
        )
        self.assertTrue(
            any(
                item["problem"]
                == "A preceding legacy record cannot be verified."
                for item in body["legacy_errors"]
            )
        )

    def test_legacy_records_are_not_modified_by_verification(self):
        first_id, first_hash, first_timestamp = self._add_legacy_record(
            evidence_key="a1",
            previous_hash="GENESIS",
        )
        second_id, second_hash, second_timestamp = self._add_legacy_record(
            evidence_key="a2",
            previous_hash=first_hash,
        )

        with self.session_factory() as session:
            before = [
                (
                    row.id,
                    row.sha256_hash,
                    row.previous_record_hash,
                    row.record_hash,
                    row.recorded_at,
                    row.chain_id,
                    row.sequence_number,
                )
                for row in session.query(IntegrityRecord)
                .order_by(IntegrityRecord.id)
                .all()
            ]
        response = self.client.get(
            f"/api/integrity/cases/{self.case_a1_id}/verify-chain",
            headers=self.headers_a,
        )
        self.assertEqual(response.status_code, 200, response.text)
        with self.session_factory() as session:
            after = [
                (
                    row.id,
                    row.sha256_hash,
                    row.previous_record_hash,
                    row.record_hash,
                    row.recorded_at,
                    row.chain_id,
                    row.sequence_number,
                )
                for row in session.query(IntegrityRecord)
                .order_by(IntegrityRecord.id)
                .all()
            ]
        self.assertEqual(before, after)
        self.assertEqual(
            [(first_id, first_hash, first_timestamp), (second_id, second_hash, second_timestamp)],
            [
                (row[0], row[3], row[4])
                for row in after
            ],
        )

    def test_valid_v2_chain_and_independent_cases(self):
        self._create_v2_chain(["a1", "a1", "a2"])

        first_case = self._verify_case(self.case_a1_id)
        second_case = self._verify_case(self.case_a2_id)
        self.assertEqual(first_case.status_code, 200, first_case.text)
        self.assertEqual(second_case.status_code, 200, second_case.text)

        first_body = first_case.json()
        second_body = second_case.json()
        self.assertTrue(first_body["chain_valid"], first_body)
        self.assertTrue(second_body["chain_valid"], second_body)
        self.assertEqual(first_body["chain_id"] != second_body["chain_id"], True)
        self.assertEqual(first_body["v2_records_checked"], 2)
        self.assertEqual(second_body["v2_records_checked"], 1)
        self.assertEqual(first_body["errors"], [])
        self.assertEqual(second_body["errors"], [])

        with self.session_factory() as session:
            first_chain = session.get(IntegrityChain, first_body["chain_id"])
            second_chain = session.get(IntegrityChain, second_body["chain_id"])
            self.assertEqual(first_chain.head_sequence, 2)
            self.assertEqual(second_chain.head_sequence, 1)

    def test_modified_evidence_hash_and_record_hash_are_detected(self):
        created = self._create_v2_chain(["a1"])
        record_id = created[0]["record_id"]
        with self.session_factory() as session:
            record = session.get(IntegrityRecord, record_id)
            evidence = session.get(Evidence, record.evidence_id)
            evidence_path = self.root / evidence.storage_path
            evidence.sha256_hash = "e" * 64
            record.record_hash = "f" * 64
            session.commit()
        evidence_path.write_bytes(b"modified evidence bytes")

        response = self._verify_case(self.case_a1_id)
        self.assertEqual(response.status_code, 200, response.text)
        errors = response.json()["errors"]
        problems = {error["problem"] for error in errors}
        self.assertIn(
            "Evidence hash does not match the integrity record.",
            problems,
        )
        self.assertIn(
            "Evidence file hash does not match the record.",
            problems,
        )
        self.assertIn("Record hash does not match its contents.", problems)
        self.assertFalse(response.json()["chain_valid"])

    def test_modified_predecessor_hash_is_detected(self):
        created = self._create_v2_chain(["a1", "a1"])
        second_id = created[1]["record_id"]
        with self.session_factory() as session:
            second = session.get(IntegrityRecord, second_id)
            second.previous_record_hash = "d" * 64
            session.commit()

        response = self._verify_case(self.case_a1_id)
        self.assertEqual(response.status_code, 200, response.text)
        errors = response.json()["errors"]
        self.assertFalse(response.json()["chain_valid"])
        self.assertIn(
            "Previous record hash does not match the case chain.",
            {error["problem"] for error in errors},
        )
        self.assertIn(
            "Record hash does not match its contents.",
            {error["problem"] for error in errors},
        )

    def test_modified_timestamp_is_detected_by_canonical_hash(self):
        created = self._create_v2_chain(["a1"])
        with self.session_factory() as session:
            record = session.get(IntegrityRecord, created[0]["record_id"])
            record.recorded_at = record.recorded_at + timedelta(seconds=1)
            session.commit()

        response = self._verify_case(self.case_a1_id)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["chain_valid"])
        self.assertIn(
            "Record hash does not match its contents.",
            {error["problem"] for error in response.json()["errors"]},
        )

    def test_missing_middle_record_and_sequence_gap_are_detected(self):
        created = self._create_v2_chain(["a1", "a1", "a1"])
        missing_record_id = created[1]["record_id"]
        with self.session_factory() as session:
            session.delete(session.get(IntegrityRecord, missing_record_id))
            session.commit()

        response = self._verify_case(self.case_a1_id)
        self.assertEqual(response.status_code, 200, response.text)
        problems = {error["problem"] for error in response.json()["errors"]}
        self.assertFalse(response.json()["chain_valid"])
        self.assertIn(
            "Sequence number gap or out-of-order record detected.",
            problems,
        )
        self.assertIn(
            "Previous record hash does not match the case chain.",
            problems,
        )
        self.assertEqual(response.json()["chain_id"], created[0]["chain_id"])

    def test_incorrect_chain_head_is_detected(self):
        created = self._create_v2_chain(["a1"])
        with self.session_factory() as session:
            chain = session.get(IntegrityChain, created[0]["chain_id"])
            chain.head_sequence = 0
            chain.head_record_hash = "GENESIS"
            session.commit()

        response = self._verify_case(self.case_a1_id)
        self.assertEqual(response.status_code, 200, response.text)
        problems = {error["problem"] for error in response.json()["errors"]}
        self.assertFalse(response.json()["chain_valid"])
        self.assertIn(
            "Chain head sequence does not match its records.",
            problems,
        )
        self.assertIn(
            "Chain head hash does not match its latest record.",
            problems,
        )

    def test_empty_chain_is_valid_at_genesis(self):
        with self.session_factory() as session:
            chain = IntegrityChain(
                case_id=self.case_a1_id,
                head_sequence=0,
                head_record_hash="GENESIS",
            )
            session.add(chain)
            session.commit()
            chain_id = chain.id

        response = self._verify_case(self.case_a1_id)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["chain_valid"], body)
        self.assertEqual(body["chain_id"], chain_id)
        self.assertEqual(body["records_checked"], 0)
        self.assertEqual(body["errors"], [])
        self.assertEqual(body["verification"]["case_chain_v2"], "VALID")

    def test_empty_chain_with_non_genesis_head_is_invalid(self):
        with self.session_factory() as session:
            session.add(
                IntegrityChain(
                    case_id=self.case_a1_id,
                    head_sequence=0,
                    head_record_hash="f" * 64,
                )
            )
            session.commit()

        response = self._verify_case(self.case_a1_id)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["chain_valid"])
        self.assertIn(
            "Chain head hash does not match its latest record.",
            {error["problem"] for error in response.json()["errors"]},
        )

    def test_case_verification_rejects_another_investigator(self):
        self._create_v2_chain(["b"], headers=self.headers_b)
        response = self._verify_case(
            self.case_b_id,
            headers=self.headers_a,
        )
        self.assertEqual(response.status_code, 404, response.text)
        self.assertNotIn("chain_id", response.json())
        self.assertNotIn(str(self.case_b_id), response.text)

    def test_case_endpoint_distinguishes_legacy_and_v2_results(self):
        self._add_legacy_record(
            evidence_key="a1",
            previous_hash="GENESIS",
        )
        self._create_v2_chain(["a1"])

        response = self._verify_case(self.case_a1_id)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["chain_valid"], body)
        self.assertTrue(body["legacy_chain_valid"])
        self.assertTrue(body["v2_chain_valid"])
        self.assertEqual(body["legacy_records_checked"], 1)
        self.assertEqual(body["v2_records_checked"], 1)
        self.assertEqual(body["verification"]["legacy"], "VALID")
        self.assertEqual(body["verification"]["case_chain_v2"], "VALID")
        self.assertIn("chain_valid", body)
        self.assertIn("records_checked", body)
        self.assertIn("errors", body)
        self.assertIn("chain_id", body)

    def test_signed_checkpoint_is_reported_as_valid_with_key_id(self):
        created = self._create_v2_chain(["a1"])
        response = self._verify_case(self.case_a1_id)

        self.assertEqual(response.status_code, 200, response.text)
        checkpoint_status = response.json()["checkpoint_verification"]
        self.assertEqual(checkpoint_status["status"], "VALID")
        self.assertEqual(checkpoint_status["checkpoints_checked"], 1)
        self.assertFalse(checkpoint_status["independently_anchored"])
        self.assertEqual(
            checkpoint_status["checkpoints"][0]["key_id"],
            "integrity-test-key",
        )
        self.assertEqual(
            checkpoint_status["checkpoints"][0]["signature_status"],
            "VALID",
        )
        self.assertEqual(
            checkpoint_status["checkpoints"][0]["sequence_number"],
            created[0]["sequence_number"],
        )

    def test_modified_checkpoint_payload_and_head_are_detected(self):
        created = self._create_v2_chain(["a1"])
        with self.session_factory() as session:
            checkpoint = (
                session.query(IntegrityCheckpoint)
                .filter_by(chain_id=created[0]["chain_id"])
                .one()
            )
            session.execute(
                IntegrityCheckpoint.__table__.update()
                .where(IntegrityCheckpoint.id == checkpoint.id)
                .values(head_record_hash="f" * 64)
            )
            session.commit()

        response = self._verify_case(self.case_a1_id)
        verification = response.json()["checkpoint_verification"]
        self.assertEqual(verification["status"], SIGNATURE_INVALID)
        self.assertEqual(
            verification["checkpoints"][0]["signature_status"],
            SIGNATURE_INVALID,
        )
        self.assertIn(
            "Checkpoint head hash does not match its integrity record.",
            {error["problem"] for error in verification["errors"]},
        )

    def test_invalid_signature_is_reported(self):
        created = self._create_v2_chain(["a1"])
        with self.session_factory() as session:
            checkpoint = (
                session.query(IntegrityCheckpoint)
                .filter_by(chain_id=created[0]["chain_id"])
                .one()
            )
            session.execute(
                IntegrityCheckpoint.__table__.update()
                .where(IntegrityCheckpoint.id == checkpoint.id)
                .values(
                    signature=base64.b64encode(b"x" * 64).decode("ascii")
                )
            )
            session.commit()

        response = self._verify_case(self.case_a1_id)
        self.assertEqual(
            response.json()["checkpoint_verification"]["status"],
            SIGNATURE_INVALID,
        )
        self.assertEqual(
            response.json()["checkpoint_verification"]["checkpoints"][0][
                "signature_status"
            ],
            SIGNATURE_INVALID,
        )

    def test_unknown_checkpoint_key_id_is_reported(self):
        created = self._create_v2_chain(["a1"])
        with self.session_factory() as session:
            checkpoint = (
                session.query(IntegrityCheckpoint)
                .filter_by(chain_id=created[0]["chain_id"])
                .one()
            )
            session.execute(
                IntegrityCheckpoint.__table__.update()
                .where(IntegrityCheckpoint.id == checkpoint.id)
                .values(key_id="untrusted-key")
            )
            session.commit()

        response = self._verify_case(self.case_a1_id)
        self.assertEqual(
            response.json()["checkpoint_verification"]["status"],
            SIGNATURE_UNKNOWN_KEY,
        )

    def test_missing_checkpoint_and_sequence_gap_are_reported(self):
        created = self._create_v2_chain(["a1", "a1", "a1"])
        with self.session_factory() as session:
            checkpoint = (
                session.query(IntegrityCheckpoint)
                .filter_by(
                    chain_id=created[0]["chain_id"],
                    sequence_number=2,
                )
                .one()
            )
            session.execute(
                IntegrityCheckpoint.__table__.delete().where(
                    IntegrityCheckpoint.id == checkpoint.id
                )
            )
            session.commit()

        response = self._verify_case(self.case_a1_id)
        verification = response.json()["checkpoint_verification"]
        self.assertEqual(verification["status"], "MISSING_CHECKPOINT")
        self.assertIn(
            2,
            {
                error["sequence_number"]
                for error in verification["errors"]
                if error["problem"] == "Signed checkpoint is missing."
            },
        )

    def test_checkpoint_sequence_mismatch_is_reported(self):
        created = self._create_v2_chain(["a1"])
        with self.session_factory() as session:
            checkpoint = (
                session.query(IntegrityCheckpoint)
                .filter_by(chain_id=created[0]["chain_id"])
                .one()
            )
            session.execute(
                IntegrityCheckpoint.__table__.update()
                .where(IntegrityCheckpoint.id == checkpoint.id)
                .values(sequence_number=2)
            )
            session.commit()

        response = self._verify_case(self.case_a1_id)
        verification = response.json()["checkpoint_verification"]
        self.assertEqual(verification["status"], "MISSING_CHECKPOINT")
        problems = {error["problem"] for error in verification["errors"]}
        self.assertIn("Signed checkpoint is missing.", problems)
        self.assertIn(
            "Checkpoint sequence is outside the signed chain range.",
            problems,
        )

    def test_checkpoint_head_must_match_corresponding_record(self):
        created = self._create_v2_chain(["a1"])
        with self.session_factory() as session:
            checkpoint = (
                session.query(IntegrityCheckpoint)
                .filter_by(chain_id=created[0]["chain_id"])
                .one()
            )
            session.execute(
                IntegrityCheckpoint.__table__.update()
                .where(IntegrityCheckpoint.id == checkpoint.id)
                .values(head_record_hash="e" * 64)
            )
            session.commit()

        response = self._verify_case(self.case_a1_id)
        self.assertIn(
            "Checkpoint head hash does not match its integrity record.",
            {
                error["problem"]
                for error in response.json()["checkpoint_verification"][
                    "errors"
                ]
            },
        )

    def test_latest_checkpoint_must_match_current_chain_head(self):
        created = self._create_v2_chain(["a1"])
        with self.session_factory() as session:
            chain = session.get(IntegrityChain, created[0]["chain_id"])
            chain.head_record_hash = "f" * 64
            session.commit()

        response = self._verify_case(self.case_a1_id)
        verification = response.json()["checkpoint_verification"]
        self.assertEqual(verification["status"], "INVALID_CHECKPOINT")
        self.assertIn(
            "Latest checkpoint does not match the stored chain head.",
            {error["problem"] for error in verification["errors"]},
        )

    def test_existing_unsigned_v2_chain_remains_valid_as_historical(self):
        self._add_unsigned_v2_record("a1")

        response = self._verify_case(self.case_a1_id)
        body = response.json()
        self.assertTrue(body["v2_chain_valid"])
        self.assertEqual(
            body["checkpoint_verification"]["status"],
            "HISTORICAL_UNSIGNED",
        )
        self.assertEqual(
            body["checkpoint_verification"]["historical_unsigned_records"],
            1,
        )

    def test_first_signed_checkpoint_preserves_unsigned_v2_prefix(self):
        self._add_unsigned_v2_record("a1")

        second_append = self._append_v2("a1")
        self.assertEqual(second_append.status_code, 200, second_append.text)
        response = self._verify_case(self.case_a1_id)
        verification = response.json()["checkpoint_verification"]
        self.assertEqual(verification["status"], "VALID_WITH_HISTORICAL_UNSIGNED")
        self.assertEqual(verification["historical_unsigned_records"], 1)
        self.assertEqual(verification["checkpoints_checked"], 1)
        self.assertEqual(verification["checkpoints"][0]["sequence_number"], 2)

    def test_key_rotation_keeps_historical_public_key_trusted(self):
        first = self._create_v2_chain(["a1"])[0]
        rotated_private_key = Ed25519PrivateKey.generate()
        rotated_private_path = (
            self.root / "signing" / "rotated-private.pem"
        )
        rotated_private_path.write_bytes(
            rotated_private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        rotated_private_path.chmod(0o600)
        trusted_keys = {
            "integrity-test-key": self.signing_private_key,
            "integrity-test-key-rotated": rotated_private_key,
        }
        encoded_keys = {}
        for key_id, private_key in trusted_keys.items():
            raw_public_key = private_key.public_key().public_bytes(
                encoding=serialization.Encoding.Raw,
                format=serialization.PublicFormat.Raw,
            )
            encoded_keys[key_id] = base64.b64encode(raw_public_key).decode(
                "ascii"
            )
        self.trusted_public_keys_path.write_text(
            json.dumps(encoded_keys),
            encoding="utf-8",
        )
        os.environ[KEY_ID_ENV] = "integrity-test-key-rotated"
        from app.integrity.signing import PRIVATE_KEY_FILE_ENV

        os.environ[PRIVATE_KEY_FILE_ENV] = str(rotated_private_path.resolve())

        second_response = self._append_v2("a1")
        self.assertEqual(second_response.status_code, 200, second_response.text)
        verification = self._verify_case(self.case_a1_id).json()[
            "checkpoint_verification"
        ]
        self.assertEqual(verification["status"], "VALID")
        self.assertEqual(verification["checkpoints_checked"], 2)
        self.assertEqual(
            {checkpoint["key_id"] for checkpoint in verification["checkpoints"]},
            {"integrity-test-key", "integrity-test-key-rotated"},
        )
        self.assertEqual(first["sequence_number"], 1)

    def test_missing_signing_configuration_rejects_append_without_changes(self):
        from app.integrity.signing import PRIVATE_KEY_FILE_ENV

        os.environ.pop(PRIVATE_KEY_FILE_ENV, None)
        response = self._append_v2("a1")

        self.assertEqual(response.status_code, 503, response.text)
        with self.session_factory() as session:
            self.assertEqual(session.query(IntegrityRecord).count(), 0)
            self.assertEqual(session.query(IntegrityCheckpoint).count(), 0)
            self.assertEqual(session.query(IntegrityChain).count(), 0)


if __name__ == "__main__":
    unittest.main()
