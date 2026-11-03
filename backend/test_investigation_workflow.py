"""Case, finding, and report workflow API tests with isolated storage."""

import base64
import hashlib
import os
from pathlib import Path
import re
import sys
import tempfile
import unittest
import zlib
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_DIR = Path(__file__).resolve().parent
os.environ.setdefault(
    "CYBERFUSION_JWT_SECRET",
    "investigation-workflow-tests-only-secret",
)
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main
import app.reports.generator as report_generator
import app.reports.router as reports_router
from app.auth.security import create_access_token
from app.db.database import Base, get_db
from app.db.models import (
    Case,
    DetectionFinding,
    Evidence,
    IntegrityChain,
    IntegrityRecord,
    InvestigationReport,
    User,
)


class InvestigationWorkflowTests(unittest.TestCase):
    finding_data = {
        "module_name": "Phishing URL Detection",
        "input_summary": "Synthetic test URL",
        "prediction": "Phishing",
        "confidence_score": 0.97,
        "severity": "HIGH",
        "analysis_details": {"source": "workflow-test"},
    }

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
                username="workflow_test_owner",
                email="workflow-owner@example.test",
                password_hash="test-only",
                role="INVESTIGATOR",
                is_active=True,
            )
            self.other_owner = User(
                username="workflow_test_other",
                email="workflow-other@example.test",
                password_hash="test-only",
                role="INVESTIGATOR",
                is_active=True,
            )
            session.add_all([self.owner, self.other_owner])
            session.flush()

            self.owned_case = Case(
                case_number="CF-WORKFLOW-OWNED",
                title="Owned workflow case",
                description="Synthetic workflow case",
                status="OPEN",
                owner_id=self.owner.id,
            )
            self.other_case = Case(
                case_number="CF-WORKFLOW-OTHER",
                title="Other investigator case",
                description="Synthetic ownership case",
                status="OPEN",
                owner_id=self.other_owner.id,
            )
            session.add_all([self.owned_case, self.other_case])
            session.commit()
            self.owner_id = self.owner.id
            self.other_owner_id = self.other_owner.id
            self.owned_case_id = self.owned_case.id
            self.other_case_id = self.other_case.id

        self.temp_reports = tempfile.TemporaryDirectory(
            prefix="cyberfusion-workflow-reports-"
        )
        self.reports_dir = Path(self.temp_reports.name).resolve()
        self.generator_reports_patch = patch.object(
            report_generator,
            "REPORTS_DIR",
            self.reports_dir,
        )
        self.router_reports_patch = patch.object(
            reports_router,
            "REPORTS_DIR",
            self.reports_dir,
        )
        self.generator_reports_patch.start()
        self.router_reports_patch.start()

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
        self.owner_headers = self._headers(self.owner_id)
        self.other_headers = self._headers(self.other_owner_id)

    def tearDown(self):
        self.client.close()
        if self.previous_get_db_override is None:
            main.app.dependency_overrides.pop(get_db, None)
        else:
            main.app.dependency_overrides[get_db] = (
                self.previous_get_db_override
            )
        self.router_reports_patch.stop()
        self.generator_reports_patch.stop()
        self.engine.dispose()
        self.temp_reports.cleanup()

    @staticmethod
    def _headers(user_id):
        token = create_access_token(
            subject=str(user_id),
            role="INVESTIGATOR",
        )
        return {"Authorization": f"Bearer {token}"}

    def _create_finding(self, case_id=None, headers=None):
        return self.client.post(
            f"/api/findings/cases/{case_id or self.owned_case_id}",
            headers=headers or self.owner_headers,
            json=self.finding_data,
        )

    def _generate_report(self, case_id=None, headers=None):
        return self.client.post(
            f"/api/reports/generate/{case_id or self.owned_case_id}",
            headers=headers or self.owner_headers,
        )

    @staticmethod
    def _pdf_content_streams(pdf_bytes):
        content = []
        for match in re.finditer(
            rb"stream\r?\n(.*?)endstream",
            pdf_bytes,
            flags=re.DOTALL,
        ):
            stream = match.group(1).rstrip(b"\r\n")
            try:
                content.append(zlib.decompress(stream))
            except zlib.error:
                if stream.endswith(b"~>"):
                    stream = stream[:-2]
                content.append(zlib.decompress(base64.a85decode(stream)))
        return b"\n".join(content)

    def test_create_case_successfully(self):
        response = self.client.post(
            "/api/cases",
            headers=self.owner_headers,
            json={
                "title": "New investigation",
                "description": "Synthetic investigation description",
            },
        )

        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["title"], "New investigation")
        self.assertEqual(
            body["description"],
            "Synthetic investigation description",
        )
        self.assertEqual(body["status"], "OPEN")
        self.assertEqual(body["owner_id"], self.owner_id)
        self.assertTrue(body["case_number"].startswith("CF-"))

    def test_invalid_case_input_is_rejected(self):
        response = self.client.post(
            "/api/cases",
            headers=self.owner_headers,
            json={"title": "x", "description": ""},
        )

        self.assertEqual(response.status_code, 422, response.text)

    def test_case_listing_is_scoped_to_logged_in_investigator(self):
        response = self.client.get(
            "/api/cases",
            headers=self.owner_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        listed_ids = {case["id"] for case in response.json()}
        self.assertIn(self.owned_case_id, listed_ids)
        self.assertNotIn(self.other_case_id, listed_ids)

    def test_create_finding_for_owned_case(self):
        response = self._create_finding()

        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["case_id"], self.owned_case_id)
        self.assertEqual(body["investigator_id"], self.owner_id)
        self.assertEqual(body["module_name"], self.finding_data["module_name"])
        self.assertEqual(body["prediction"], self.finding_data["prediction"])
        self.assertEqual(body["severity"], self.finding_data["severity"])

    def test_finding_creation_rejects_another_investigators_case(self):
        response = self._create_finding(case_id=self.other_case_id)

        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(response.json()["detail"], "Case not found.")

    def test_retrieve_findings_for_owned_case(self):
        created = self._create_finding()
        self.assertEqual(created.status_code, 201, created.text)

        response = self.client.get(
            f"/api/findings/cases/{self.owned_case_id}",
            headers=self.owner_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            [finding["id"] for finding in response.json()],
            [created.json()["id"]],
        )

    def test_case_findings_are_not_visible_to_another_investigator(self):
        self.assertEqual(self._create_finding().status_code, 201)

        response = self.client.get(
            f"/api/findings/cases/{self.owned_case_id}",
            headers=self.other_headers,
        )

        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(response.json()["detail"], "Case not found.")

    def test_retrieve_existing_finding(self):
        created = self._create_finding()
        self.assertEqual(created.status_code, 201, created.text)
        finding_id = created.json()["id"]

        response = self.client.get(
            f"/api/findings/{finding_id}",
            headers=self.owner_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["id"], finding_id)
        self.assertEqual(response.json()["case_id"], self.owned_case_id)
        self.assertEqual(
            response.json()["module_name"],
            self.finding_data["module_name"],
        )

    def test_another_investigator_cannot_retrieve_finding(self):
        created = self._create_finding()
        self.assertEqual(created.status_code, 201, created.text)

        response = self.client.get(
            f"/api/findings/{created.json()['id']}",
            headers=self.other_headers,
        )

        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(
            response.json()["detail"],
            "Detection finding not found.",
        )

    def test_generate_pdf_with_findings_section(self):
        created = self._create_finding()
        self.assertEqual(created.status_code, 201, created.text)

        response = self._generate_report()

        self.assertEqual(response.status_code, 201, response.text)
        report = response.json()
        self.assertEqual(report["case_id"], self.owned_case_id)
        self.assertEqual(report["investigator_id"], self.owner_id)

        with self.session_factory() as session:
            saved_report = session.get(InvestigationReport, report["id"])
            self.assertIsNotNone(saved_report)
            pdf_bytes = Path(saved_report.report_path).read_bytes()

        pdf_content = self._pdf_content_streams(pdf_bytes)
        self.assertIn(b"5. AI Detection Findings", pdf_content)
        self.assertIn(b"Finding ", pdf_content)
        self.assertIn(b"Phishing URL Detection", pdf_content)

    def test_generate_pdf_shows_empty_findings_state(self):
        response = self._generate_report()

        self.assertEqual(response.status_code, 201, response.text)
        with self.session_factory() as session:
            saved_report = session.get(
                InvestigationReport,
                response.json()["id"],
            )
            self.assertIsNotNone(saved_report)
            pdf_bytes = Path(saved_report.report_path).read_bytes()

        pdf_content = self._pdf_content_streams(pdf_bytes)
        self.assertIn(b"5. AI Detection Findings", pdf_content)
        self.assertIn(
            b"No AI detection findings are saved for this case.",
            pdf_content,
        )

    def test_generate_pdf_displays_legacy_and_v2_integrity_records(self):
        content = b"Synthetic report integrity evidence"
        evidence_hash = hashlib.sha256(content).hexdigest()
        with self.session_factory() as session:
            evidence = Evidence(
                case_id=self.owned_case_id,
                uploaded_by=self.owner_id,
                original_filename="integrity-history.txt",
                storage_path="storage/evidence/integrity-history.txt",
                media_type="text/plain",
                file_size=len(content),
                sha256_hash=evidence_hash,
            )
            session.add(evidence)
            session.flush()

            legacy = IntegrityRecord(
                evidence_id=evidence.id,
                sha256_hash=evidence_hash,
                previous_record_hash="GENESIS",
                record_hash="a" * 64,
            )
            session.add(legacy)
            session.flush()

            chain = IntegrityChain(
                case_id=self.owned_case_id,
                head_sequence=1,
                head_record_hash="b" * 64,
            )
            session.add(chain)
            session.flush()
            v2 = IntegrityRecord(
                evidence_id=evidence.id,
                sha256_hash=evidence_hash,
                previous_record_hash="GENESIS",
                record_hash="b" * 64,
                chain_id=chain.id,
                sequence_number=1,
                hash_version="CASE_CHAIN_V2",
            )
            session.add(v2)
            session.commit()
            evidence_id = evidence.id
            chain_id = chain.id

        response = self._generate_report()
        self.assertEqual(response.status_code, 201, response.text)
        with self.session_factory() as session:
            report = session.get(InvestigationReport, response.json()["id"])
            pdf_bytes = Path(report.report_path).read_bytes()

        pdf_content = self._pdf_content_streams(pdf_bytes)
        self.assertIn(b"Chain ID", pdf_content)
        self.assertIn(b"Sequence", pdf_content)
        self.assertIn(b"Format", pdf_content)
        self.assertIn(b"Legacy", pdf_content)
        self.assertIn(b"CASE_CHAIN_V2", pdf_content)
        self.assertIn(str(evidence_id).encode(), pdf_content)
        self.assertIn(str(chain_id).encode(), pdf_content)

    def test_report_listing_is_scoped_to_logged_in_investigator(self):
        owner_report = self._generate_report(headers=self.owner_headers)
        other_report = self._generate_report(
            case_id=self.other_case_id,
            headers=self.other_headers,
        )
        self.assertEqual(owner_report.status_code, 201, owner_report.text)
        self.assertEqual(other_report.status_code, 201, other_report.text)

        response = self.client.get(
            "/api/reports",
            headers=self.owner_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        listed_ids = {report["id"] for report in response.json()}
        self.assertIn(owner_report.json()["id"], listed_ids)
        self.assertNotIn(other_report.json()["id"], listed_ids)

    def test_download_authorized_report(self):
        generated = self._generate_report()
        self.assertEqual(generated.status_code, 201, generated.text)
        report = generated.json()

        response = self.client.get(
            f"/api/reports/{report['id']}/download",
            headers=self.owner_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF-"))
        self.assertIn(
            f'filename="{report["report_number"]}.pdf"',
            response.headers["content-disposition"],
        )

    def test_another_investigator_cannot_access_or_download_report(self):
        generated = self._generate_report()
        self.assertEqual(generated.status_code, 201, generated.text)
        report_id = generated.json()["id"]

        get_response = self.client.get(
            f"/api/reports/{report_id}",
            headers=self.other_headers,
        )
        download_response = self.client.get(
            f"/api/reports/{report_id}/download",
            headers=self.other_headers,
        )

        self.assertEqual(get_response.status_code, 404, get_response.text)
        self.assertEqual(
            get_response.json()["detail"],
            "Report not found.",
        )
        self.assertEqual(
            download_response.status_code,
            404,
            download_response.text,
        )
        self.assertEqual(
            download_response.json()["detail"],
            "Report not found.",
        )


if __name__ == "__main__":
    unittest.main()
