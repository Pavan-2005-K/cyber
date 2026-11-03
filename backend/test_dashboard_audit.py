"""Dashboard analytics and audit-log API tests using in-memory SQLite."""

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_DIR = Path(__file__).resolve().parent
os.environ.setdefault(
    "CYBERFUSION_JWT_SECRET",
    "dashboard-audit-tests-only-secret",
)
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main
from app.auth.security import create_access_token
from app.db.database import Base, get_db
from app.db.models import (
    AuditLog,
    Case,
    DetectionFinding,
    Evidence,
    IntegrityRecord,
    InvestigationReport,
    User,
)


class DashboardAuditEndpointTests(unittest.TestCase):
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
                username="dashboard_test_owner",
                email="dashboard-owner@example.test",
                password_hash="test-only",
                role="INVESTIGATOR",
                is_active=True,
            )
            self.other_owner = User(
                username="dashboard_test_other",
                email="dashboard-other@example.test",
                password_hash="test-only",
                role="INVESTIGATOR",
                is_active=True,
            )
            session.add_all([self.owner, self.other_owner])
            session.flush()

            self.owner_open_case_1 = Case(
                case_number="CF-DASH-OPEN-1",
                title="Owner open case one",
                description="Synthetic analytics case",
                status="OPEN",
                owner_id=self.owner.id,
            )
            self.owner_open_case_2 = Case(
                case_number="CF-DASH-OPEN-2",
                title="Owner open case two",
                description="Synthetic analytics case",
                status="OPEN",
                owner_id=self.owner.id,
            )
            self.owner_closed_case = Case(
                case_number="CF-DASH-CLOSED",
                title="Owner closed case",
                description="Synthetic analytics case",
                status="CLOSED",
                owner_id=self.owner.id,
            )
            self.other_case = Case(
                case_number="CF-DASH-OTHER",
                title="Other investigator case",
                description="Synthetic isolation case",
                status="OPEN",
                owner_id=self.other_owner.id,
            )
            session.add_all(
                [
                    self.owner_open_case_1,
                    self.owner_open_case_2,
                    self.owner_closed_case,
                    self.other_case,
                ]
            )
            session.flush()

            session.add_all(
                [
                    Evidence(
                        case_id=self.owner_open_case_1.id,
                        uploaded_by=self.owner.id,
                        original_filename="owner-one.txt",
                        storage_path="storage/evidence/owner-one.txt",
                        media_type="text/plain",
                        file_size=10,
                        sha256_hash="1" * 64,
                    ),
                    Evidence(
                        case_id=self.owner_closed_case.id,
                        uploaded_by=self.owner.id,
                        original_filename="owner-two.txt",
                        storage_path="storage/evidence/owner-two.txt",
                        media_type="text/plain",
                        file_size=20,
                        sha256_hash="2" * 64,
                    ),
                    Evidence(
                        case_id=self.other_case.id,
                        uploaded_by=self.other_owner.id,
                        original_filename="other.txt",
                        storage_path="storage/evidence/other.txt",
                        media_type="text/plain",
                        file_size=30,
                        sha256_hash="3" * 64,
                    ),
                ]
            )

            self.owner_id = self.owner.id
            self.other_owner_id = self.other_owner.id
            self.owner_case_ids = (
                self.owner_open_case_1.id,
                self.owner_open_case_2.id,
                self.owner_closed_case.id,
            )
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
        self.engine.dispose()

    @staticmethod
    def _headers(user_id):
        token = create_access_token(
            subject=str(user_id),
            role="INVESTIGATOR",
        )
        return {"Authorization": f"Bearer {token}"}

    def _add_finding(
        self,
        session,
        *,
        case_id,
        investigator_id,
        module_name,
        severity,
        created_at,
        index,
    ):
        finding = DetectionFinding(
            case_id=case_id,
            investigator_id=investigator_id,
            module_name=module_name,
            input_summary=f"Synthetic finding {index}",
            prediction=f"Prediction {index}",
            confidence_score=0.5 + (index % 5) / 10,
            severity=severity,
            analysis_details={"sequence": index},
            created_at=created_at,
        )
        session.add(finding)
        return finding

    def _add_report(
        self,
        session,
        *,
        report_number,
        case_id,
        investigator_id,
        created_at,
    ):
        report = InvestigationReport(
            report_number=report_number,
            case_id=case_id,
            investigator_id=investigator_id,
            report_path=f"reports/{report_number}.pdf",
            created_at=created_at,
        )
        session.add(report)
        return report

    def _add_integrity_record(
        self,
        session,
        *,
        evidence_id,
        record_number,
        recorded_at,
    ):
        record = IntegrityRecord(
            evidence_id=evidence_id,
            sha256_hash=f"{record_number:064x}",
            previous_record_hash="GENESIS",
            record_hash=f"{record_number + 100:064x}",
            recorded_at=recorded_at,
        )
        session.add(record)
        return record

    def _add_audit_log(
        self,
        session,
        *,
        user_id,
        action,
        details,
        created_at,
    ):
        log = AuditLog(
            user_id=user_id,
            action=action,
            details=details,
            created_at=created_at,
        )
        session.add(log)
        return log

    def test_dashboard_requires_authentication(self):
        response = self.client.get("/api/dashboard/analytics")

        self.assertEqual(response.status_code, 401, response.text)

    def test_dashboard_analytics_counts_and_isolates_investigator_data(self):
        base_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
        own_findings = []
        with self.session_factory() as session:
            for index in range(12):
                severity = ("CRITICAL", "HIGH", "MEDIUM", "LOW")[index % 4]
                module_name = (
                    "Fake Email Detection"
                    if index % 2 == 0
                    else "Phishing URL Detection"
                )
                own_findings.append(
                    self._add_finding(
                        session,
                        case_id=self.owner_case_ids[index % 3],
                        investigator_id=self.owner_id,
                        module_name=module_name,
                        severity=severity,
                        created_at=base_time + timedelta(minutes=index),
                        index=index,
                    )
                )

            self._add_finding(
                session,
                case_id=self.other_case_id,
                investigator_id=self.other_owner_id,
                module_name="Other Investigator Module",
                severity="HIGH",
                created_at=base_time + timedelta(days=1),
                index=100,
            )
            session.commit()
            expected_recent_ids = [
                finding.id
                for finding in reversed(own_findings[-10:])
            ]

        response = self.client.get(
            "/api/dashboard/analytics",
            headers=self.owner_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["total_cases"], 3)
        self.assertEqual(body["open_cases"], 2)
        self.assertEqual(body["closed_cases"], 1)
        self.assertEqual(body["total_evidence"], 2)
        self.assertEqual(body["total_findings"], 12)
        self.assertEqual(
            body["severity_distribution"],
            {"CRITICAL": 3, "HIGH": 3, "MEDIUM": 3, "LOW": 3},
        )
        self.assertEqual(
            body["module_findings"],
            {
                "Fake Email Detection": 6,
                "Phishing URL Detection": 6,
            },
        )
        self.assertEqual(
            [finding["finding_id"] for finding in body["recent_findings"]],
            expected_recent_ids,
        )
        self.assertEqual(len(body["recent_findings"]), 10)
        self.assertEqual(
            body["recent_findings"][0]["prediction"],
            "Prediction 11",
        )
        self.assertEqual(
            body["recent_findings"][0]["module"],
            "Phishing URL Detection",
        )
        self.assertEqual(body["recent_findings"][0]["severity"], "LOW")
        self.assertIsInstance(body["recent_findings"][0]["confidence"], float)
        self.assertEqual(
            set(body),
            {
                "total_cases",
                "open_cases",
                "closed_cases",
                "total_evidence",
                "total_findings",
                "severity_distribution",
                "module_findings",
                "recent_findings",
                "analytics_period",
                "finding_trends",
                "reports",
                "total_integrity_records",
                "evidence_verification_outcomes",
            },
        )
        self.assertNotIn(
            "Other Investigator Module",
            body["module_findings"],
        )

    def test_dashboard_daily_finding_trends_use_full_date_range(self):
        start = datetime(2026, 6, 1, tzinfo=timezone.utc)
        end = datetime(2026, 6, 3, 23, 59, 59, tzinfo=timezone.utc)
        exclusive_end = datetime(2026, 6, 4, tzinfo=timezone.utc)
        with self.session_factory() as session:
            self._add_finding(
                session,
                case_id=self.owner_case_ids[0],
                investigator_id=self.owner_id,
                module_name="Trend Module",
                severity="CRITICAL",
                created_at=start,
                index=1,
            )
            self._add_finding(
                session,
                case_id=self.owner_case_ids[0],
                investigator_id=self.owner_id,
                module_name="Trend Module",
                severity="HIGH",
                created_at=datetime(2026, 6, 3, 12, tzinfo=timezone.utc),
                index=2,
            )
            self._add_finding(
                session,
                case_id=self.owner_case_ids[0],
                investigator_id=self.owner_id,
                module_name="Trend Module",
                severity="LOW",
                created_at=end,
                index=3,
            )
            self._add_finding(
                session,
                case_id=self.owner_case_ids[0],
                investigator_id=self.owner_id,
                module_name="Trend Module",
                severity="LOW",
                created_at=exclusive_end,
                index=4,
            )
            self._add_finding(
                session,
                case_id=self.owner_case_ids[0],
                investigator_id=self.other_owner_id,
                module_name="Wrong Investigator",
                severity="LOW",
                created_at=datetime(2026, 6, 2, 8, tzinfo=timezone.utc),
                index=5,
            )
            self._add_finding(
                session,
                case_id=self.other_case_id,
                investigator_id=self.other_owner_id,
                module_name="Other Owner",
                severity="LOW",
                created_at=datetime(2026, 6, 2, 9, tzinfo=timezone.utc),
                index=6,
            )
            session.commit()

        response = self.client.get(
            "/api/dashboard/analytics?start_date=2026-06-01&end_date=2026-06-03",
            headers=self.owner_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(
            body["analytics_period"],
            {
                "start_date": "2026-06-01",
                "end_date": "2026-06-03",
                "timezone": "UTC",
            },
        )
        self.assertEqual(
            body["finding_trends"],
            [
                {"date": "2026-06-01", "count": 1},
                {"date": "2026-06-02", "count": 0},
                {"date": "2026-06-03", "count": 2},
            ],
        )

    def test_dashboard_rejects_invalid_and_oversized_date_ranges(self):
        invalid_date = self.client.get(
            "/api/dashboard/analytics?start_date=2026-02-30",
            headers=self.owner_headers,
        )
        reversed_range = self.client.get(
            "/api/dashboard/analytics?start_date=2026-06-03&end_date=2026-06-01",
            headers=self.owner_headers,
        )
        oversized_range = self.client.get(
            "/api/dashboard/analytics?start_date=2024-01-01&end_date=2024-12-31",
            headers=self.owner_headers,
        )
        maximum_range = self.client.get(
            "/api/dashboard/analytics?start_date=2025-01-01&end_date=2025-12-31",
            headers=self.owner_headers,
        )

        self.assertEqual(invalid_date.status_code, 422, invalid_date.text)
        self.assertEqual(reversed_range.status_code, 422, reversed_range.text)
        self.assertEqual(oversized_range.status_code, 422, oversized_range.text)
        self.assertEqual(maximum_range.status_code, 200, maximum_range.text)
        self.assertEqual(len(maximum_range.json()["finding_trends"]), 365)

        exactly_365_days = self.client.get(
            "/api/dashboard/analytics?start_date=2024-01-01&end_date=2024-12-30",
            headers=self.owner_headers,
        )
        self.assertEqual(exactly_365_days.status_code, 200, exactly_365_days.text)
        self.assertEqual(len(exactly_365_days.json()["finding_trends"]), 365)

    def test_dashboard_report_integrity_and_verification_statistics_are_scoped(self):
        period_start = datetime(2026, 7, 1, tzinfo=timezone.utc)
        period_end = datetime(2026, 7, 3, 23, 59, 59, tzinfo=timezone.utc)
        owner_evidence_id = None
        other_evidence_id = None
        with self.session_factory() as session:
            owner_evidence_id = (
                session.query(Evidence.id)
                .filter(Evidence.case_id == self.owner_case_ids[0])
                .scalar()
            )
            other_evidence_id = (
                session.query(Evidence.id)
                .filter(Evidence.case_id == self.other_case_id)
                .scalar()
            )

            self._add_report(
                session,
                report_number="OWNER-IN-RANGE",
                case_id=self.owner_case_ids[0],
                investigator_id=self.owner_id,
                created_at=period_start,
            )
            self._add_report(
                session,
                report_number="OWNER-END-BOUNDARY",
                case_id=self.owner_case_ids[0],
                investigator_id=self.owner_id,
                created_at=period_end,
            )
            self._add_report(
                session,
                report_number="OWNER-OUT-OF-RANGE",
                case_id=self.owner_case_ids[1],
                investigator_id=self.owner_id,
                created_at=datetime(2026, 6, 30, 23, 59, 59, tzinfo=timezone.utc),
            )
            self._add_report(
                session,
                report_number="OTHER-CASE",
                case_id=self.other_case_id,
                investigator_id=self.other_owner_id,
                created_at=period_start,
            )
            self._add_report(
                session,
                report_number="WRONG-INVESTIGATOR",
                case_id=self.owner_case_ids[0],
                investigator_id=self.other_owner_id,
                created_at=period_start,
            )

            self._add_integrity_record(
                session,
                evidence_id=owner_evidence_id,
                record_number=1,
                recorded_at=period_start,
            )
            self._add_integrity_record(
                session,
                evidence_id=owner_evidence_id,
                record_number=2,
                recorded_at=period_end,
            )
            self._add_integrity_record(
                session,
                evidence_id=other_evidence_id,
                record_number=3,
                recorded_at=period_start,
            )

            for index, status in enumerate(
                ("INTEGRITY_VERIFIED", "HASH_MISMATCH", "FILE_MISSING"),
                start=1,
            ):
                self._add_audit_log(
                    session,
                    user_id=self.owner_id,
                    action="EVIDENCE_VERIFICATION_COMPLETED",
                    details=json.dumps(
                        {"evidence_id": owner_evidence_id, "status": status}
                    ),
                    created_at=period_start + timedelta(hours=index),
                )

            self._add_audit_log(
                session,
                user_id=self.owner_id,
                action="EVIDENCE_VERIFICATION_COMPLETED",
                details=json.dumps(
                    {
                        "evidence_id": owner_evidence_id,
                        "status": "INTEGRITY_VERIFIED",
                    }
                ),
                created_at=period_end,
            )
            self._add_audit_log(
                session,
                user_id=self.owner_id,
                action="EVIDENCE_VERIFICATION_COMPLETED",
                details=json.dumps(
                    {
                        "evidence_id": owner_evidence_id,
                        "status": "INTEGRITY_VERIFIED",
                    }
                ),
                created_at=datetime(2026, 7, 4, tzinfo=timezone.utc),
            )

            self._add_audit_log(
                session,
                user_id=self.owner_id,
                action="EVIDENCE_VERIFICATION_COMPLETED",
                details=json.dumps(
                    {
                        "evidence_id": other_evidence_id,
                        "status": "INTEGRITY_VERIFIED",
                    }
                ),
                created_at=period_start,
            )
            self._add_audit_log(
                session,
                user_id=self.other_owner_id,
                action="EVIDENCE_VERIFICATION_COMPLETED",
                details=json.dumps(
                    {
                        "evidence_id": owner_evidence_id,
                        "status": "INTEGRITY_VERIFIED",
                    }
                ),
                created_at=period_start,
            )
            self._add_audit_log(
                session,
                user_id=self.owner_id,
                action="LOGIN_FAILED",
                details=json.dumps(
                    {
                        "evidence_id": owner_evidence_id,
                        "status": "INTEGRITY_VERIFIED",
                    }
                ),
                created_at=period_start,
            )
            self._add_audit_log(
                session,
                user_id=self.owner_id,
                action="EVIDENCE_VERIFICATION_COMPLETED",
                details="{malformed",
                created_at=period_start,
            )
            self._add_audit_log(
                session,
                user_id=self.owner_id,
                action="EVIDENCE_VERIFICATION_COMPLETED",
                details=json.dumps(
                    {"evidence_id": owner_evidence_id, "status": "UNKNOWN"}
                ),
                created_at=period_start,
            )
            session.commit()

        response = self.client.get(
            "/api/dashboard/analytics?start_date=2026-07-01&end_date=2026-07-03",
            headers=self.owner_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(
            body["reports"],
            {"total_generated": 3, "generated_in_period": 2},
        )
        self.assertEqual(body["total_integrity_records"], 2)
        self.assertEqual(
            body["evidence_verification_outcomes"],
            {
                "INTEGRITY_VERIFIED": 2,
                "HASH_MISMATCH": 1,
                "FILE_MISSING": 1,
            },
        )

    def test_dashboard_empty_state(self):
        with self.session_factory() as session:
            session.query(Evidence).delete()
            session.query(Case).delete()
            session.commit()

        response = self.client.get(
            "/api/dashboard/analytics",
            headers=self.owner_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["total_cases"], 0)
        self.assertEqual(body["open_cases"], 0)
        self.assertEqual(body["closed_cases"], 0)
        self.assertEqual(body["total_evidence"], 0)
        self.assertEqual(body["total_findings"], 0)
        self.assertEqual(
            body["severity_distribution"],
            {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0},
        )
        self.assertEqual(body["module_findings"], {})
        self.assertEqual(body["recent_findings"], [])
        self.assertEqual(
            body["reports"],
            {"total_generated": 0, "generated_in_period": 0},
        )
        self.assertEqual(body["total_integrity_records"], 0)
        self.assertEqual(
            body["evidence_verification_outcomes"],
            {
                "INTEGRITY_VERIFIED": 0,
                "HASH_MISMATCH": 0,
                "FILE_MISSING": 0,
            },
        )
        self.assertEqual(len(body["finding_trends"]), 30)
        today_utc = datetime.now(timezone.utc).date()
        self.assertEqual(
            body["analytics_period"],
            {
                "start_date": (today_utc - timedelta(days=29)).isoformat(),
                "end_date": today_utc.isoformat(),
                "timezone": "UTC",
            },
        )

    def test_audit_logs_require_authentication(self):
        response = self.client.get("/api/audit/logs")

        self.assertEqual(response.status_code, 401, response.text)

    def test_audit_log_retrieval_is_scoped_and_ordered(self):
        with self.session_factory() as session:
            session.add_all(
                [
                    AuditLog(
                        user_id=self.owner_id,
                        action="OWNER_OLDER",
                        details=json.dumps({"event": "older"}),
                    ),
                    AuditLog(
                        user_id=self.other_owner_id,
                        action="OTHER_PRIVATE",
                        details=json.dumps({"event": "private"}),
                    ),
                    AuditLog(
                        user_id=self.owner_id,
                        action="OWNER_NEWER",
                        details=json.dumps({"event": "newer"}),
                    ),
                ]
            )
            session.commit()

        response = self.client.get(
            "/api/audit/logs",
            headers=self.owner_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["total"], 2)
        self.assertEqual(body["limit"], 50)
        self.assertEqual(body["offset"], 0)
        self.assertEqual(
            [log["action"] for log in body["logs"]],
            ["OWNER_NEWER", "OWNER_OLDER"],
        )
        self.assertTrue(
            all(log["user_id"] == self.owner_id for log in body["logs"])
        )
        self.assertEqual(body["logs"][0]["details"], {"event": "newer"})
        self.assertNotIn("OTHER_PRIVATE", str(body))

    def test_audit_log_empty_state(self):
        response = self.client.get(
            "/api/audit/logs",
            headers=self.owner_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json(),
            {"total": 0, "limit": 50, "offset": 0, "logs": []},
        )

    def test_case_creation_emits_retrievable_audit_log(self):
        case_response = self.client.post(
            "/api/cases",
            headers=self.owner_headers,
            json={
                "title": "Audit event workflow",
                "description": "Ensure case creation is audited.",
            },
        )

        self.assertEqual(case_response.status_code, 201, case_response.text)
        case_body = case_response.json()

        response = self.client.get(
            "/api/audit/logs",
            headers=self.owner_headers,
        )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(len(body["logs"]), 1)
        event = body["logs"][0]
        self.assertEqual(event["user_id"], self.owner_id)
        self.assertEqual(event["action"], "CASE_CREATED")
        self.assertEqual(event["details"]["case_id"], case_body["id"])
        self.assertEqual(event["details"]["case_number"], case_body["case_number"])

    def test_audit_log_pagination_and_parameter_validation(self):
        with self.session_factory() as session:
            session.add_all(
                [
                    AuditLog(
                        user_id=self.owner_id,
                        action=f"PAGE_{index}",
                        details="{}",
                    )
                    for index in range(4)
                ]
            )
            session.commit()

        page = self.client.get(
            "/api/audit/logs?limit=2&offset=1",
            headers=self.owner_headers,
        )
        invalid_limit = self.client.get(
            "/api/audit/logs?limit=0",
            headers=self.owner_headers,
        )
        invalid_offset = self.client.get(
            "/api/audit/logs?offset=-1",
            headers=self.owner_headers,
        )

        self.assertEqual(page.status_code, 200, page.text)
        self.assertEqual(page.json()["total"], 4)
        self.assertEqual(page.json()["limit"], 2)
        self.assertEqual(page.json()["offset"], 1)
        self.assertEqual(len(page.json()["logs"]), 2)
        self.assertEqual(invalid_limit.status_code, 422, invalid_limit.text)
        self.assertEqual(invalid_offset.status_code, 422, invalid_offset.text)


if __name__ == "__main__":
    unittest.main()
