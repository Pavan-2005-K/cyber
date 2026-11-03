
from datetime import datetime
from typing import Annotated, Literal

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth.router import get_current_user
from app.db.audit import log_audit_event
from app.db.database import get_db
from app.db.models import Case, DetectionFinding, User


router = APIRouter(
    prefix="/api/findings",
    tags=["Detection Findings"],
)


class FindingCreate(BaseModel):
    module_name: str = Field(min_length=2, max_length=100)
    input_summary: str | None = Field(default=None, max_length=5000)
    prediction: str = Field(min_length=1, max_length=100)
    confidence_score: float | None = Field(
        default=None, ge=0.0, le=1.0
    )
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    analysis_details: dict | list | None = None


class FindingResponse(BaseModel):
    id: int
    case_id: int
    investigator_id: int
    module_name: str
    input_summary: str | None
    prediction: str
    confidence_score: float | None
    severity: str
    analysis_details: dict | list | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


def get_owned_case(
    db: Session,
    case_id: int,
    user_id: int,
) -> Case:
    case = (
        db.query(Case)
        .filter(
            Case.id == case_id,
            Case.owner_id == user_id,
        )
        .first()
    )

    if case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found.",
        )

    return case


def get_owned_finding(
    db: Session,
    finding_id: int,
    user_id: int,
) -> DetectionFinding:
    finding = (
        db.query(DetectionFinding)
        .join(Case, DetectionFinding.case_id == Case.id)
        .filter(
            DetectionFinding.id == finding_id,
            Case.owner_id == user_id,
            DetectionFinding.investigator_id == user_id,
        )
        .first()
    )

    if finding is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Detection finding not found.",
        )

    return finding


@router.post(
    "/cases/{case_id}",
    response_model=FindingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_finding(
    case_id: int,
    finding_data: FindingCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    case = get_owned_case(db, case_id, current_user.id)

    try:
        finding = DetectionFinding(
            case_id=case.id,
            investigator_id=current_user.id,
            module_name=finding_data.module_name,
            input_summary=finding_data.input_summary,
            prediction=finding_data.prediction,
            confidence_score=finding_data.confidence_score,
            severity=finding_data.severity,
            analysis_details=finding_data.analysis_details,
        )

        db.add(finding)
        db.flush()

        log_audit_event(
            db=db,
            user_id=current_user.id,
            action="DETECTION_FINDING_CREATED",
            details={
                "finding_id": finding.id,
                "case_id": case.id,
                "module_name": finding.module_name,
                "severity": finding.severity,
            },
        )

        db.commit()
        db.refresh(finding)

        return finding

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save detection finding.",
        )


@router.get(
    "/cases/{case_id}",
    response_model=list[FindingResponse],
)
def list_case_findings(
    case_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    get_owned_case(db, case_id, current_user.id)

    return (
        db.query(DetectionFinding)
        .filter(
            DetectionFinding.case_id == case_id,
            DetectionFinding.investigator_id == current_user.id,
        )
        .order_by(DetectionFinding.created_at.desc())
        .all()
    )


@router.get(
    "/{finding_id}",
    response_model=FindingResponse,
)
def get_finding(
    finding_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return get_owned_finding(
        db,
        finding_id,
        current_user.id,
    )
