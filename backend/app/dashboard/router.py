import json
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.auth.router import get_current_user
from app.db.database import get_db
from app.db.models import (
    AuditLog,
    Case,
    DetectionFinding,
    Evidence,
    IntegrityRecord,
    InvestigationReport,
    User,
)


router = APIRouter(
    prefix="/api/dashboard",
    tags=["Dashboard"],
)


@router.get("/analytics")
def get_dashboard_analytics(
    start_date: str | None = Query(default=None),
    end_date: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    def parse_date(value: str | None, parameter_name: str) -> date | None:
        if value is None:
            return None

        try:
            parsed = datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=f"{parameter_name} must use YYYY-MM-DD format.",
            ) from None

        if parsed.isoformat() != value:
            raise HTTPException(
                status_code=422,
                detail=f"{parameter_name} must use YYYY-MM-DD format.",
            )

        return parsed

    parsed_start_date = parse_date(start_date, "start_date")
    parsed_end_date = parse_date(end_date, "end_date")
    today_utc = datetime.now(timezone.utc).date()
    period_start = parsed_start_date or today_utc - timedelta(days=29)
    period_end = parsed_end_date or today_utc

    if period_start > period_end:
        raise HTTPException(
            status_code=422,
            detail="start_date must be on or before end_date.",
        )

    if (period_end - period_start).days + 1 > 365:
        raise HTTPException(
            status_code=422,
            detail="The requested date range cannot exceed 365 days.",
        )

    period_start_utc = datetime.combine(
        period_start,
        time.min,
        tzinfo=timezone.utc,
    )
    period_end_utc = datetime.combine(
        period_end + timedelta(days=1),
        time.min,
        tzinfo=timezone.utc,
    )

    case_status_counts = (
        db.query(Case.status, func.count(Case.id))
        .filter(Case.owner_id == current_user.id)
        .group_by(Case.status)
        .all()
    )
    case_counts = {
        status: count
        for status, count in case_status_counts
    }

    total_evidence = (
        db.query(func.count(Evidence.id))
        .join(Case, Evidence.case_id == Case.id)
        .filter(Case.owner_id == current_user.id)
        .scalar()
        or 0
    )

    finding_scope = (
        db.query(DetectionFinding)
        .join(Case, DetectionFinding.case_id == Case.id)
        .filter(
            Case.owner_id == current_user.id,
            DetectionFinding.investigator_id == current_user.id,
        )
    )
    total_findings = finding_scope.with_entities(
        func.count(DetectionFinding.id)
    ).scalar() or 0

    severity_counts = (
        finding_scope.with_entities(
            DetectionFinding.severity,
            func.count(DetectionFinding.id),
        )
        .group_by(DetectionFinding.severity)
        .all()
    )
    severity_distribution = {
        "CRITICAL": 0,
        "HIGH": 0,
        "MEDIUM": 0,
        "LOW": 0,
    }
    severity_distribution.update(
        {
            severity: count
            for severity, count in severity_counts
            if severity in severity_distribution
        }
    )

    finding_date_counts = (
        finding_scope.with_entities(
            func.date(DetectionFinding.created_at),
            func.count(DetectionFinding.id),
        )
        .filter(
            DetectionFinding.created_at >= period_start_utc,
            DetectionFinding.created_at < period_end_utc,
        )
        .group_by(func.date(DetectionFinding.created_at))
        .all()
    )
    finding_counts_by_date = {
        str(finding_date): count
        for finding_date, count in finding_date_counts
    }
    finding_trends = []
    current_date = period_start
    while current_date <= period_end:
        date_string = current_date.isoformat()
        finding_trends.append(
            {
                "date": date_string,
                "count": finding_counts_by_date.get(date_string, 0),
            }
        )
        current_date += timedelta(days=1)

    module_counts = (
        finding_scope.with_entities(
            DetectionFinding.module_name,
            func.count(DetectionFinding.id),
        )
        .group_by(DetectionFinding.module_name)
        .order_by(DetectionFinding.module_name)
        .all()
    )

    recent_findings = (
        finding_scope.order_by(
            DetectionFinding.created_at.desc(),
            DetectionFinding.id.desc(),
        )
        .limit(10)
        .all()
    )

    report_counts = (
        db.query(
            func.count(InvestigationReport.id),
            func.count(
                case(
                    (
                        (InvestigationReport.created_at >= period_start_utc)
                        & (InvestigationReport.created_at < period_end_utc),
                        InvestigationReport.id,
                    )
                )
            ),
        )
        .join(Case, InvestigationReport.case_id == Case.id)
        .filter(
            Case.owner_id == current_user.id,
            InvestigationReport.investigator_id == current_user.id,
        )
        .one()
    )

    total_integrity_records = (
        db.query(func.count(IntegrityRecord.id))
        .join(Evidence, IntegrityRecord.evidence_id == Evidence.id)
        .join(Case, Evidence.case_id == Case.id)
        .filter(Case.owner_id == current_user.id)
        .scalar()
        or 0
    )

    verification_logs = (
        db.query(AuditLog.details)
        .filter(
            AuditLog.user_id == current_user.id,
            AuditLog.action == "EVIDENCE_VERIFICATION_COMPLETED",
            AuditLog.created_at >= period_start_utc,
            AuditLog.created_at < period_end_utc,
        )
        .all()
    )
    verification_events = []
    evidence_ids = set()
    verification_statuses = {
        "INTEGRITY_VERIFIED",
        "HASH_MISMATCH",
        "FILE_MISSING",
    }
    for (audit_details,) in verification_logs:
        try:
            details = json.loads(audit_details) if audit_details else None
        except (json.JSONDecodeError, TypeError):
            continue

        if not isinstance(details, dict):
            continue

        evidence_id = details.get("evidence_id")
        verification_status = details.get("status")
        if (
            isinstance(evidence_id, int)
            and not isinstance(evidence_id, bool)
            and isinstance(verification_status, str)
            and verification_status in verification_statuses
        ):
            verification_events.append((evidence_id, verification_status))
            evidence_ids.add(evidence_id)

    owned_evidence_ids = set()
    if evidence_ids:
        owned_evidence_ids = {
            evidence_id
            for (evidence_id,) in (
                db.query(Evidence.id)
                .join(Case, Evidence.case_id == Case.id)
                .filter(
                    Case.owner_id == current_user.id,
                    Evidence.id.in_(evidence_ids),
                )
                .all()
            )
        }

    evidence_verification_outcomes = {
        "INTEGRITY_VERIFIED": 0,
        "HASH_MISMATCH": 0,
        "FILE_MISSING": 0,
    }
    for evidence_id, verification_status in verification_events:
        if evidence_id in owned_evidence_ids:
            evidence_verification_outcomes[verification_status] += 1

    return {
        "total_cases": sum(case_counts.values()),
        "open_cases": case_counts.get("OPEN", 0),
        "closed_cases": case_counts.get("CLOSED", 0),
        "total_evidence": total_evidence,
        "total_findings": total_findings,
        "severity_distribution": severity_distribution,
        "module_findings": {
            module_name: count
            for module_name, count in module_counts
        },
        "recent_findings": [
            {
                "finding_id": finding.id,
                "case_id": finding.case_id,
                "module": finding.module_name,
                "prediction": finding.prediction,
                "confidence": finding.confidence_score,
                "severity": finding.severity,
                "timestamp": finding.created_at,
            }
            for finding in recent_findings
        ],
        "analytics_period": {
            "start_date": period_start.isoformat(),
            "end_date": period_end.isoformat(),
            "timezone": "UTC",
        },
        "finding_trends": finding_trends,
        "reports": {
            "total_generated": report_counts[0] or 0,
            "generated_in_period": report_counts[1] or 0,
        },
        "total_integrity_records": total_integrity_records,
        "evidence_verification_outcomes": evidence_verification_outcomes,
    }
