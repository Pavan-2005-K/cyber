"""Evidence and integrity API tests with isolated database and file storage."""

import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_DIR = Path(__file__).resolve().parent
os.environ["CYBERFUSION_JWT_SECRET"] = (
    "evidence-tests-only-secret-with-sufficient-key-length"
)
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main
import app.evidence.router as evidence_router
import app.integrity.router as integrity_router
from app.auth.security import create_access_token
from app.db.database import Base, get_db
from app.db.models import Case, Evidence, IntegrityRecord, User
from integrity_test_helpers import configure_test_signing, restore_test_signing
from storage_test_helpers import FakeStorage


class EvidenceEndpointTests(unittest.TestCase):
    evidence_content = b"Synthetic evidence content for API tests.\n"

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
        )

        with self.session_factory() as session:
            self.owner = User(
                username="evidence_test_owner",
                email="evidence-owner@example.test",
                password_hash="test-only",
                role="INVESTIGATOR",
                is_active=True,
            )
            self.other_owner = User(
                username="evidence_test_other",
                email="evidence-other@example.test",
                password_hash="test-only",
                role="INVESTIGATOR",
                is_active=True,
            )
            session.add_all([self.owner, self.other_owner])
            session.flush()

            self.owned_case = Case(
                case_number="CF-EVIDENCE-OWNED",
                title="Owned evidence test case",
                description="Synthetic test case",
                status="OPEN",
                owner_id=self.owner.id,
            )
            self.other_case = Case(
                case_number="CF-EVIDENCE-OTHER",
                title="Other investigator test case",
                description="Synthetic ownership test case",
                status="OPEN",
                owner_id=self.other_owner.id,
            )
            session.add_all([self.owned_case, self.other_case])
            session.commit()
            self.owner_id = self.owner.id
            self.owned_case_id = self.owned_case.id
            self.other_case_id = self.other_case.id

        self.temp_storage = tempfile.TemporaryDirectory(
            prefix="cyberfusion-evidence-tests-"
        )
        self.storage_root = Path(self.temp_storage.name).resolve()
        (
            self.previous_signing_environment,
            _,
            _,
            _,
        ) = configure_test_signing(self.storage_root)
        self.evidence_dir = self.storage_root / "storage" / "evidence"
        self.fake_storage = FakeStorage()

        self.evidence_base_patch = patch.object(
            evidence_router,
            "BASE_DIR",
            self.storage_root,
        )
        self.evidence_dir_patch = patch.object(
            evidence_router,
            "EVIDENCE_DIR",
            self.evidence_dir,
        )
        self.integrity_base_patch = patch.object(
            integrity_router,
            "BASE_DIR",
            self.storage_root,
        )
        self.integrity_dir_patch = patch.object(
            integrity_router,
            "EVIDENCE_DIR",
            self.evidence_dir,
        )
        self.evidence_base_patch.start()
        self.evidence_dir_patch.start()
        self.integrity_base_patch.start()
        self.integrity_dir_patch.start()
        self.storage_patches = [
            patch.object(
                evidence_router,
                "upload_file",
                self.fake_storage.upload_file,
            ),
            patch.object(
                evidence_router,
                "download_file",
                self.fake_storage.download_file,
            ),
            patch.object(
                evidence_router,
                "delete_file",
                self.fake_storage.delete_file,
            ),
            patch.object(
                integrity_router,
                "download_file",
                self.fake_storage.download_file,
            ),
        ]
        for storage_patch in self.storage_patches:
            storage_patch.start()

        def override_get_db():
            session = self.session_factory()
            try:
                yield session
            finally:
                session.close()

        self.previous_get_db_override = main.app.dependency_overrides.get(
            get_db
        )
        main.app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(main.app)
        self.auth_headers = {
            "Authorization": (
                "Bearer "
                + create_access_token(
                    subject=str(self.owner_id),
                    role="INVESTIGATOR",
                )
            )
        }

    def tearDown(self):
        for storage_patch in reversed(self.storage_patches):
            storage_patch.stop()
        if self.previous_get_db_override is None:
            main.app.dependency_overrides.pop(get_db, None)
        else:
            main.app.dependency_overrides[get_db] = (
                self.previous_get_db_override
            )

        self.integrity_dir_patch.stop()
        self.integrity_base_patch.stop()
        self.evidence_dir_patch.stop()
        self.evidence_base_patch.stop()
        self.engine.dispose()
        restore_test_signing(self.previous_signing_environment)
        self.temp_storage.cleanup()

    def _upload(self, case_id=None, filename="evidence.txt", content=None):
        return self.client.post(
            "/api/evidence/upload",
            params={"case_id": case_id or self.owned_case_id},
            headers=self.auth_headers,
            files={
                "file": (
                    filename,
                    self.evidence_content if content is None else content,
                    "text/plain",
                )
            },
        )

    def _upload_evidence(self):
        response = self._upload()
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def _get_evidence(self, evidence_id):
        with self.session_factory() as session:
            evidence = session.get(Evidence, evidence_id)
            self.assertIsNotNone(evidence)
            return {
                "id": evidence.id,
                "storage_bucket": evidence.storage_bucket,
                "storage_object_key": evidence.storage_object_key,
                "storage_path": evidence.storage_path,
            }

    def test_valid_evidence_upload(self):
        response = self._upload()

        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        expected_hash = hashlib.sha256(self.evidence_content).hexdigest()
        self.assertEqual(body["message"], "Evidence uploaded successfully.")
        self.assertEqual(body["case_id"], self.owned_case_id)
        self.assertEqual(body["original_filename"], "evidence.txt")
        self.assertEqual(body["file_size"], len(self.evidence_content))
        self.assertEqual(body["sha256_hash"], expected_hash)

        evidence = self._get_evidence(body["evidence_id"])
        self.assertEqual(
            evidence["storage_bucket"],
            evidence_router.EVIDENCE_BUCKET,
        )
        self.assertTrue(evidence["storage_object_key"])
        self.assertTrue(evidence["storage_path"].startswith("supabase://"))
        self.assertEqual(
            self.fake_storage.download_file(
                evidence["storage_bucket"],
                evidence["storage_object_key"],
            ),
            self.evidence_content,
        )

    def test_disallowed_file_extension(self):
        response = self._upload(filename="payload.exe")

        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(response.json()["detail"], "Unsupported file type.")
        self.assertEqual(list(self.evidence_dir.glob("*")), [])

    def test_empty_file_upload(self):
        response = self._upload(content=b"")

        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(
            response.json()["detail"],
            "Empty files are not allowed.",
        )
        self.assertEqual(list(self.evidence_dir.glob("*")), [])

    def test_upload_exceeding_configured_size_limit(self):
        response = self._upload(
            content=b"x" * (evidence_router.MAX_FILE_SIZE + 1)
        )

        self.assertEqual(response.status_code, 413, response.text)
        self.assertEqual(
            response.json()["detail"],
            "File exceeds the 10 MB limit.",
        )
        self.assertEqual(list(self.evidence_dir.glob("*")), [])
        with self.session_factory() as session:
            self.assertEqual(session.query(Evidence).count(), 0)

    def test_upload_to_another_investigators_case(self):
        response = self._upload(case_id=self.other_case_id)

        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(response.json()["detail"], "Case not found.")

    def test_evidence_listing_for_owned_case(self):
        uploaded = self._upload_evidence()

        response = self.client.get(
            f"/api/evidence/case/{self.owned_case_id}",
            headers=self.auth_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            [item["id"] for item in response.json()],
            [uploaded["evidence_id"]],
        )
        self.assertEqual(response.json()[0]["case_id"], self.owned_case_id)

    def test_evidence_listing_for_another_investigators_case(self):
        response = self.client.get(
            f"/api/evidence/case/{self.other_case_id}",
            headers=self.auth_headers,
        )

        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(response.json()["detail"], "Case not found.")

    def test_successful_sha256_verification(self):
        uploaded = self._upload_evidence()

        response = self.client.post(
            f"/api/evidence/{uploaded['evidence_id']}/verify",
            headers=self.auth_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["integrity_verified"])
        self.assertEqual(body["status"], "INTEGRITY_VERIFIED")
        self.assertEqual(body["stored_sha256_hash"], uploaded["sha256_hash"])
        self.assertEqual(body["current_sha256_hash"], uploaded["sha256_hash"])

    def test_modified_evidence_is_detected(self):
        uploaded = self._upload_evidence()
        evidence = self._get_evidence(uploaded["evidence_id"])
        self.fake_storage.objects[
            (evidence["storage_bucket"], evidence["storage_object_key"])
        ] = b"Modified evidence content.\n"

        response = self.client.post(
            f"/api/evidence/{uploaded['evidence_id']}/verify",
            headers=self.auth_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertFalse(body["integrity_verified"])
        self.assertEqual(body["status"], "HASH_MISMATCH")
        self.assertNotEqual(
            body["current_sha256_hash"],
            body["stored_sha256_hash"],
        )
        record_response = self.client.post(
            f"/api/integrity/evidence/{uploaded['evidence_id']}/record",
            headers=self.auth_headers,
        )
        self.assertEqual(record_response.status_code, 409, record_response.text)

    def test_missing_evidence_file_is_reported(self):
        uploaded = self._upload_evidence()
        evidence = self._get_evidence(uploaded["evidence_id"])
        self.fake_storage.delete_file(
            evidence["storage_bucket"],
            evidence["storage_object_key"],
        )

        response = self.client.post(
            f"/api/evidence/{uploaded['evidence_id']}/verify",
            headers=self.auth_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json(),
            {
                "evidence_id": uploaded["evidence_id"],
                "status": "FILE_MISSING",
                "integrity_verified": False,
                "message": "The stored evidence file could not be found.",
            },
        )
        record_response = self.client.post(
            f"/api/integrity/evidence/{uploaded['evidence_id']}/record",
            headers=self.auth_headers,
        )
        self.assertEqual(record_response.status_code, 404, record_response.text)

    def test_integrity_record_creation_and_retrieval(self):
        uploaded = self._upload_evidence()

        create_response = self.client.post(
            f"/api/integrity/evidence/{uploaded['evidence_id']}/record",
            headers=self.auth_headers,
        )

        self.assertEqual(create_response.status_code, 200, create_response.text)
        created = create_response.json()
        self.assertEqual(
            created["message"],
            "Integrity record created successfully.",
        )
        self.assertEqual(created["evidence_id"], uploaded["evidence_id"])
        self.assertEqual(created["sha256_hash"], uploaded["sha256_hash"])
        self.assertEqual(created["previous_record_hash"], "GENESIS")
        self.assertTrue(created["record_hash"])

        list_response = self.client.get(
            f"/api/integrity/evidence/{uploaded['evidence_id']}/records",
            headers=self.auth_headers,
        )

        self.assertEqual(list_response.status_code, 200, list_response.text)
        self.assertEqual(
            list_response.json(),
            [
                {
                    "record_id": created["record_id"],
                    "evidence_id": uploaded["evidence_id"],
                    "sha256_hash": uploaded["sha256_hash"],
                    "previous_record_hash": "GENESIS",
                    "record_hash": created["record_hash"],
                    "recorded_at": created["recorded_at"],
                    "chain_id": created["chain_id"],
                    "sequence_number": created["sequence_number"],
                    "hash_version": created["hash_version"],
                    "checkpoint": {
                        "checkpoint_id": created["checkpoint_id"],
                        "checkpoint_version": created["checkpoint_version"],
                        "key_id": created["key_id"],
                        "signature": created["signature"],
                    },
                }
            ],
        )

    def test_incomplete_cloud_metadata_is_rejected(self):
        uploaded = self._upload_evidence()
        with self.session_factory() as session:
            evidence = session.get(Evidence, uploaded["evidence_id"])
            evidence.storage_object_key = None
            session.commit()

        verify_response = self.client.post(
            f"/api/evidence/{uploaded['evidence_id']}/verify",
            headers=self.auth_headers,
        )
        record_response = self.client.post(
            f"/api/integrity/evidence/{uploaded['evidence_id']}/record",
            headers=self.auth_headers,
        )

        self.assertEqual(verify_response.status_code, 400, verify_response.text)
        self.assertEqual(record_response.status_code, 400, record_response.text)

    def test_unexpected_cloud_bucket_is_rejected(self):
        uploaded = self._upload_evidence()
        with self.session_factory() as session:
            evidence = session.get(Evidence, uploaded["evidence_id"])
            evidence.storage_bucket = "unexpected-bucket"
            session.commit()

        verify_response = self.client.post(
            f"/api/evidence/{uploaded['evidence_id']}/verify",
            headers=self.auth_headers,
        )
        record_response = self.client.post(
            f"/api/integrity/evidence/{uploaded['evidence_id']}/record",
            headers=self.auth_headers,
        )

        self.assertEqual(verify_response.status_code, 400, verify_response.text)
        self.assertEqual(record_response.status_code, 400, record_response.text)

    def test_supabase_uri_without_metadata_is_rejected(self):
        uploaded = self._upload_evidence()
        with self.session_factory() as session:
            evidence = session.get(Evidence, uploaded["evidence_id"])
            evidence.storage_bucket = None
            evidence.storage_object_key = None
            session.commit()

        response = self.client.post(
            f"/api/integrity/evidence/{uploaded['evidence_id']}/record",
            headers=self.auth_headers,
        )

        self.assertEqual(response.status_code, 400, response.text)

    def test_storage_service_failure_is_not_verified(self):
        uploaded = self._upload_evidence()
        created = self.client.post(
            f"/api/integrity/evidence/{uploaded['evidence_id']}/record",
            headers=self.auth_headers,
        )
        self.assertEqual(created.status_code, 200, created.text)
        self.fake_storage.fail("download")

        verify_response = self.client.post(
            f"/api/evidence/{uploaded['evidence_id']}/verify",
            headers=self.auth_headers,
        )
        record_response = self.client.post(
            f"/api/integrity/evidence/{uploaded['evidence_id']}/record",
            headers=self.auth_headers,
        )

        self.assertEqual(verify_response.status_code, 503, verify_response.text)
        self.assertEqual(record_response.status_code, 503, record_response.text)
        chain_response = self.client.get(
            "/api/integrity/verify-chain",
            headers=self.auth_headers,
        )
        self.assertEqual(chain_response.status_code, 200, chain_response.text)
        self.assertFalse(chain_response.json()["chain_valid"])
        self.assertTrue(chain_response.json()["errors"])

    def test_legacy_local_evidence_verification_and_integrity_record(self):
        legacy_content = b"Legacy local evidence."
        legacy_path = self.evidence_dir / "legacy.txt"
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_bytes(legacy_content)
        with self.session_factory() as session:
            evidence = Evidence(
                case_id=self.owned_case_id,
                uploaded_by=self.owner_id,
                original_filename="legacy.txt",
                storage_path="storage/evidence/legacy.txt",
                media_type="text/plain",
                file_size=len(legacy_content),
                sha256_hash=hashlib.sha256(legacy_content).hexdigest(),
            )
            session.add(evidence)
            session.commit()
            evidence_id = evidence.id

        verify_response = self.client.post(
            f"/api/evidence/{evidence_id}/verify",
            headers=self.auth_headers,
        )
        record_response = self.client.post(
            f"/api/integrity/evidence/{evidence_id}/record",
            headers=self.auth_headers,
        )

        self.assertEqual(verify_response.status_code, 200, verify_response.text)
        self.assertTrue(verify_response.json()["integrity_verified"])
        self.assertEqual(record_response.status_code, 200, record_response.text)

    def test_case_chain_verification_reads_supabase_evidence(self):
        uploaded = self._upload_evidence()
        created = self.client.post(
            f"/api/integrity/evidence/{uploaded['evidence_id']}/record",
            headers=self.auth_headers,
        )
        self.assertEqual(created.status_code, 200, created.text)

        response = self.client.get(
            "/api/integrity/verify-chain",
            headers=self.auth_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["chain_valid"])
        self.assertEqual(response.json()["errors"], [])

    def test_integrity_chain_detects_tampered_record(self):
        uploaded = self._upload_evidence()
        recorded_at = datetime.now(timezone.utc)
        recorded_at_text = integrity_router.timestamp_string(recorded_at)
        legacy_record_hash = integrity_router.calculate_record_hash(
            evidence_id=uploaded["evidence_id"],
            sha256_hash=uploaded["sha256_hash"],
            previous_record_hash="GENESIS",
            recorded_at=recorded_at_text,
        )
        with self.session_factory() as session:
            legacy_record = IntegrityRecord(
                evidence_id=uploaded["evidence_id"],
                sha256_hash=uploaded["sha256_hash"],
                previous_record_hash="GENESIS",
                record_hash=legacy_record_hash,
                recorded_at=recorded_at,
            )
            session.add(legacy_record)
            session.commit()
            record_id = legacy_record.id

        valid_response = self.client.get(
            "/api/integrity/verify-chain",
            headers=self.auth_headers,
        )
        self.assertEqual(valid_response.status_code, 200, valid_response.text)
        self.assertTrue(valid_response.json()["chain_valid"])
        self.assertEqual(valid_response.json()["records_checked"], 1)
        self.assertEqual(valid_response.json()["errors"], [])

        with self.session_factory() as session:
            record = session.get(IntegrityRecord, record_id)
            self.assertIsNotNone(record)
            record.record_hash = "0" * 64
            session.commit()

        tampered_response = self.client.get(
            "/api/integrity/verify-chain",
            headers=self.auth_headers,
        )

        self.assertEqual(
            tampered_response.status_code,
            200,
            tampered_response.text,
        )
        body = tampered_response.json()
        self.assertFalse(body["chain_valid"])
        self.assertEqual(body["records_checked"], 1)
        self.assertEqual(
            body["errors"],
            [
                {
                    "record_id": record_id,
                    "problem": "Record hash does not match its contents.",
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
