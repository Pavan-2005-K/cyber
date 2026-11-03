from sqlalchemy.orm import Session

from app.db.audit import log_audit_event
from app.db.models import Case, DetectionFinding, User


def save_detection_finding(
    db: Session,
    case_id: int,
    investigator: User,
    module_name: str,
    input_summary: str | None,
    prediction: str,
    confidence_score: float | None,
    severity: str,
    analysis_details: dict | list | None = None,
) -> DetectionFinding:
    """
    Save an AI detection result under an investigator-owned case.

    The finding and audit event are committed in one transaction.
    """

    case = (
        db.query(Case)
        .filter(
            Case.id == case_id,
            Case.owner_id == investigator.id,
        )
        .first()
    )

    if case is None:
        raise ValueError("Case not found or access denied.")

    finding = DetectionFinding(
        case_id=case.id,
        investigator_id=investigator.id,
        module_name=module_name,
        input_summary=input_summary,
        prediction=prediction,
        confidence_score=confidence_score,
        severity=severity,
        analysis_details=analysis_details,
    )

    try:
        db.add(finding)
        db.flush()

        log_audit_event(
            db=db,
            user_id=investigator.id,
            action="AI_DETECTION_FINDING_CREATED",
            details={
                "finding_id": finding.id,
                "case_id": case.id,
                "module_name": module_name,
                "prediction": prediction,
                "severity": severity,
            },
        )

        db.commit()
        db.refresh(finding)

        return finding

    except Exception:
        db.rollback()
        raise