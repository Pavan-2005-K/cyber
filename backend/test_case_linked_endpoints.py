"""Integration tests for case-linked AI endpoints.

These tests load and run the real model artifacts from ``backend/models``.
Inputs other than APKs are generated inline and do not require external
datasets. Set ``CYBERFUSION_TEST_APK`` to a valid APK to exercise the real APK
feature extractor; otherwise only that extractor is stubbed for a synthetic
multipart APK while the real APK model is still exercised.
"""

import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parent
MODEL_ARTIFACTS = (
    "fake_email_detection/fake_email_detection_model.joblib",
    "fake_email_detection/threshold_config.json",
    "phishing_url/phishing_model.joblib",
    "phishing_url/feature_columns.json",
    "fake_profile/fake_profile_model.joblib",
    "fake_profile/fake_profile_feature_columns.json",
    "fake_profile/fake_profile_label_mapping.json",
    "scam_detection/scam_spam_detection_model.joblib",
    "scam_detection/threshold_config.json",
    "apk_static_analysis/apk_malware_model.joblib",
    "apk_static_analysis/feature_columns.json",
    "apk_static_analysis/label_mapping.json",
    "image_forgery/image_forgery_model.keras",
    "image_forgery/threshold_config.json",
    "chat_email_forensics/chat_email_spam_model.joblib",
    "chat_email_forensics/label_mapping.json",
    "credit_card_fraud/credit_card_fraud_model.joblib",
    "credit_card_fraud/feature_columns.json",
    "credit_card_fraud/threshold_config.json",
    "network_intrusion/network_intrusion_model.joblib",
    "network_intrusion/feature_info.json",
    "network_intrusion/model_info.json",
    "server_log_analysis/server_log_analysis_model.joblib",
    "server_log_analysis/feature_info.json",
    "server_log_analysis/model_info.json",
    "server_log_analysis/threshold_config.json",
)
MISSING_MODEL_ARTIFACTS = [
    str(BACKEND_DIR / "models" / artifact)
    for artifact in MODEL_ARTIFACTS
    if not (BACKEND_DIR / "models" / artifact).is_file()
]

if MISSING_MODEL_ARTIFACTS:
    raise unittest.SkipTest(
        "Real model artifacts required for these integration tests are missing: "
        + ", ".join(MISSING_MODEL_ARTIFACTS)
    )

os.environ.setdefault(
    "CYBERFUSION_JWT_SECRET",
    "case-linked-endpoint-tests-only-secret",
)
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main
from app.auth.security import create_access_token
from app.db.database import Base, get_db
from app.db.models import AuditLog, Case, DetectionFinding, User


APK_FIXTURE = os.getenv("CYBERFUSION_TEST_APK")
APK_FIXTURE_PATH = Path(APK_FIXTURE).expanduser() if APK_FIXTURE else None
if APK_FIXTURE_PATH and (
    not APK_FIXTURE_PATH.is_file()
    or APK_FIXTURE_PATH.suffix.lower() != ".apk"
):
    raise RuntimeError(
        "CYBERFUSION_TEST_APK must point to an existing .apk file."
    )
APK_FIXTURE_AVAILABLE = APK_FIXTURE_PATH is not None


def _image_upload():
    from PIL import Image

    image_buffer = io.BytesIO()
    Image.new("RGB", (160, 160), color=(125, 80, 175)).save(
        image_buffer,
        format="PNG",
    )
    return (
        "case-linked-test-image.png",
        image_buffer.getvalue(),
        "image/png",
    )


def _eml_upload():
    content = (
        "From: sender@example.test\r\n"
        "To: recipient@example.test\r\n"
        "Subject: Synthetic case-linked analysis\r\n"
        "MIME-Version: 1.0\r\n"
        "Content-Type: text/plain; charset=utf-8\r\n"
        "\r\n"
        "Synthetic message body for endpoint integration testing.\r\n"
    )
    return ("case-linked-test.eml", content.encode("utf-8"), "message/rfc822")


def _apk_upload():
    if not APK_FIXTURE_AVAILABLE:
        return (
            "synthetic-case-linked-test.apk",
            b"Synthetic APK payload; feature extraction is stubbed in this test.",
            "application/vnd.android.package-archive",
        )
    return (
        APK_FIXTURE_PATH.name,
        APK_FIXTURE_PATH.read_bytes(),
        "application/vnd.android.package-archive",
    )


def _network_features():
    features = {
        feature: 0
        for feature in main.network_intrusion_features
    }
    features.update(
        {
            "protocol_type": "tcp",
            "service": "http",
            "flag": "SF",
        }
    )
    return features


ENDPOINTS = (
    {
        "name": "fake_email_prediction",
        "path": "/api/fake-email/cases/{case_id}/predict",
        "json": {
            "email_text": (
                "Synthetic email body for case-linked phishing analysis."
            )
        },
        "sensitive_values": ("Synthetic email body",),
    },
    {
        "name": "fake_email_eml",
        "path": "/api/fake-email/cases/{case_id}/analyze-eml",
        "files": {"file": _eml_upload},
        "sensitive_values": ("Synthetic message body",),
    },
    {
        "name": "phishing_url",
        "path": "/api/phishing-url/cases/{case_id}/predict",
        "json": {"url": "https://example.test/CASE-LINKED-PRIVATE"},
        "sensitive_values": ("CASE-LINKED-PRIVATE",),
    },
    {
        "name": "fake_profile",
        "path": "/api/fake-profile/cases/{case_id}/predict",
        "json": {
            "username": "case-linked-private-profile",
            "fullname": "Synthetic Test User",
            "description": "Generated integration-test profile",
            "external_url": "",
            "has_profile_picture": True,
            "is_private": False,
            "posts": 3,
            "followers": 17,
            "following": 21,
        },
        "sensitive_values": ("case-linked-private-profile",),
    },
    {
        "name": "scam_detection",
        "path": "/api/scam-detection/cases/{case_id}/predict",
        "json": {"text": "Synthetic scam classification test message."},
        "sensitive_values": ("Synthetic scam classification",),
    },
    {
        "name": "apk_analysis",
        "path": "/api/apk-analysis/cases/{case_id}/predict",
        "files": {"file": _apk_upload},
        "requires_apk_fixture": True,
    },
    {
        "name": "image_forgery",
        "path": "/api/image-forgery/cases/{case_id}/predict",
        "files": {"file": _image_upload},
    },
    {
        "name": "chat_email_forensics",
        "path": "/api/chat-email-forensics/cases/{case_id}/predict",
        "json": {
            "text": "Synthetic SMS message for spam classification testing."
        },
        "sensitive_values": ("Synthetic SMS message",),
    },
    {
        "name": "credit_card_fraud",
        "path": "/api/credit-card-fraud/cases/{case_id}/predict",
        "json_factory": lambda: {
            "features": {
                name: 0.0 for name in main.credit_card_fraud_features
            }
        },
    },
    {
        "name": "network_intrusion",
        "path": "/api/network-intrusion/cases/{case_id}/predict",
        "json_factory": lambda: {"features": _network_features()},
    },
    {
        "name": "server_log_analysis",
        "path": "/api/server-log-analysis/cases/{case_id}/predict",
        "json_factory": lambda: {
            "features": {
                name: 0.0 for name in main.server_log_features
            }
        },
    },
)


class CaseLinkedEndpointIntegrationTests(unittest.TestCase):
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
            self.investigator = User(
                username="case_linked_investigator",
                email="case-linked-investigator@example.test",
                password_hash="test-only",
                role="INVESTIGATOR",
                is_active=True,
            )
            other_investigator = User(
                username="case_linked_other",
                email="case-linked-other@example.test",
                password_hash="test-only",
                role="INVESTIGATOR",
                is_active=True,
            )
            session.add_all([self.investigator, other_investigator])
            session.flush()

            self.owned_case = Case(
                case_number="CASE-LINKED-OWNED",
                title="Owned integration test case",
                description="Synthetic test case",
                status="OPEN",
                owner_id=self.investigator.id,
            )
            self.other_case = Case(
                case_number="CASE-LINKED-OTHER",
                title="Other investigator test case",
                description="Synthetic ownership test case",
                status="OPEN",
                owner_id=other_investigator.id,
            )
            session.add_all([self.owned_case, self.other_case])
            session.commit()
            self.user_id = self.investigator.id
            self.owned_case_id = self.owned_case.id
            self.other_case_id = self.other_case.id

        def override_get_db():
            session = self.session_factory()
            try:
                yield session
            finally:
                session.close()

        self._get_db_override = override_get_db
        main.app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(main.app)
        self.client.__enter__()
        self.auth_headers = {
            "Authorization": "Bearer "
            + create_access_token(
                subject=str(self.user_id),
                role="INVESTIGATOR",
            )
        }

    def tearDown(self):
        self.client.__exit__(None, None, None)
        main.app.dependency_overrides.pop(get_db, None)
        self.engine.dispose()

    def _request_kwargs(self, endpoint):
        if "files" in endpoint:
            upload = endpoint["files"]["file"]()
            return {"files": {"file": upload}}
        if "json_factory" in endpoint:
            return {"json": endpoint["json_factory"]()}
        return {"json": endpoint["json"]}

    def _request(self, endpoint, case_id):
        path = endpoint["path"].format(case_id=case_id)
        kwargs = self._request_kwargs(endpoint)
        if (
            endpoint["name"] == "apk_analysis"
            and not APK_FIXTURE_AVAILABLE
        ):
            temporary_paths = []

            def extract_synthetic_apk(path):
                temporary_path = Path(path)
                self.assertTrue(temporary_path.is_file())
                temporary_paths.append(temporary_path)
                return {
                    feature: 0
                    for feature in main.apk_feature_columns
                }

            with patch.object(
                main,
                "extract_apk_features",
                side_effect=extract_synthetic_apk,
            ):
                response = self.client.post(
                    path,
                    headers=self.auth_headers,
                    **kwargs,
                )
            self.assertEqual(len(temporary_paths), 1)
            self.assertFalse(temporary_paths[0].exists())
            return response

        return self.client.post(
            path,
            headers=self.auth_headers,
            **kwargs,
        )

    def assert_endpoint_success(self, endpoint):
        response = self._request(endpoint, self.owned_case_id)
        self.assertEqual(response.status_code, 200, response.text)

        result = response.json()
        self.assertEqual(result["case_id"], self.owned_case_id)
        self.assertIn("finding_id", result)
        self.assertTrue(result["prediction"])
        self.assertGreaterEqual(result["confidence"], 0.0)
        self.assertLessEqual(result["confidence"], 1.0)
        self.assertIn(
            result["severity"],
            {"LOW", "MEDIUM", "HIGH", "CRITICAL"},
        )

        with self.session_factory() as session:
            finding = session.get(DetectionFinding, result["finding_id"])
            self.assertIsNotNone(finding)
            self.assertEqual(finding.case_id, self.owned_case_id)
            self.assertEqual(finding.investigator_id, self.user_id)
            self.assertEqual(finding.prediction, result["prediction"])
            self.assertEqual(
                round(finding.confidence_score, 4),
                result["confidence"],
            )
            self.assertEqual(finding.severity, result["severity"])

            persisted = json.dumps(
                {
                    "input_summary": finding.input_summary,
                    "analysis_details": finding.analysis_details,
                }
            )
            for sensitive_value in endpoint.get("sensitive_values", ()):
                self.assertNotIn(sensitive_value, persisted)

            audit = (
                session.query(AuditLog)
                .filter(
                    AuditLog.action == "AI_DETECTION_FINDING_CREATED",
                    AuditLog.user_id == self.user_id,
                )
                .one()
            )
            audit_details = json.loads(audit.details)
            self.assertEqual(audit_details["finding_id"], finding.id)
            self.assertEqual(audit_details["case_id"], self.owned_case_id)

    def assert_endpoint_ownership(self, endpoint):
        response = self._request(endpoint, self.other_case_id)
        self.assertEqual(response.status_code, 404, response.text)

        with self.session_factory() as session:
            findings = (
                session.query(DetectionFinding)
                .filter(DetectionFinding.case_id == self.other_case_id)
                .count()
            )
            self.assertEqual(findings, 0)
            audit_events = (
                session.query(AuditLog)
                .filter(
                    AuditLog.action == "AI_DETECTION_FINDING_CREATED"
                )
                .count()
            )
            self.assertEqual(audit_events, 0)


for _endpoint in ENDPOINTS:
    _success_name = f"test_success_{_endpoint['name']}"
    _ownership_name = f"test_ownership_{_endpoint['name']}"

    def _success_test(self, endpoint=_endpoint):
        self.assert_endpoint_success(endpoint)

    def _ownership_test(self, endpoint=_endpoint):
        self.assert_endpoint_ownership(endpoint)

    setattr(CaseLinkedEndpointIntegrationTests, _success_name, _success_test)
    setattr(CaseLinkedEndpointIntegrationTests, _ownership_name, _ownership_test)

if __name__ == "__main__":
    unittest.main()
