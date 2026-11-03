
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.auth.router import get_current_user
from app.db.audit import log_audit_event
from app.db.database import get_db
from app.db.models import (
    Case,
    InvestigationReport,
    User,
)
from app.reports.generator import (
    generate_investigation_pdf,
    REPORTS_DIR,
)


router = APIRouter(
    prefix="/api/reports",
    tags=["Investigation Reports"],
)


class ReportResponse(BaseModel):
    id: int
    report_number: str
    case_id: int
    investigator_id: int
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


def get_owned_report(
    db: Session,
    report_id: int,
    user_id: int,
) -> InvestigationReport:
    report = (
        db.query(InvestigationReport)
        .join(Case, InvestigationReport.case_id == Case.id)
        .filter(
            InvestigationReport.id == report_id,
            Case.owner_id == user_id,
            InvestigationReport.investigator_id == user_id,
        )
        .first()
    )

    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found.",
        )

    return report


@router.post(
    "/generate/{case_id}",
    response_model=ReportResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_report(
    case_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    case = get_owned_case(db, case_id, current_user.id)

    report_number = f"CF-REPORT-{uuid4().hex[:10].upper()}"
    generated_path = None

    try:
        generated_path = generate_investigation_pdf(
            db=db,
            case=case,
            investigator=current_user,
            report_number=report_number,
        )

        report = InvestigationReport(
            report_number=report_number,
            case_id=case.id,
            investigator_id=current_user.id,
            report_path=generated_path,
        )

        db.add(report)
        db.flush()

        log_audit_event(
            db=db,
            user_id=current_user.id,
            action="REPORT_GENERATED",
            details={
                "report_id": report.id,
                "report_number": report_number,
                "case_id": case.id,
                "case_number": case.case_number,
            },
        )

        db.commit()
        db.refresh(report)

        return report

    except Exception:
        db.rollback()

        if generated_path:
            try:
                Path(generated_path).unlink(missing_ok=True)
            except OSError:
                pass

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate investigation report.",
        )


@router.get(
    "",
    response_model=list[ReportResponse],
)
def list_reports(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return (
        db.query(InvestigationReport)
        .join(Case, InvestigationReport.case_id == Case.id)
        .filter(
            Case.owner_id == current_user.id,
            InvestigationReport.investigator_id == current_user.id,
        )
        .order_by(InvestigationReport.created_at.desc())
        .all()
    )


@router.get(
    "/{report_id}",
    response_model=ReportResponse,
)
def get_report(
    report_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    return get_owned_report(db, report_id, current_user.id)


@router.get("/{report_id}/download")
def download_report(
    report_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    report = get_owned_report(db, report_id, current_user.id)

    report_path = Path(report.report_path).resolve()
    reports_root = REPORTS_DIR.resolve()

    if not report_path.is_relative_to(reports_root):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report file not found.",
        )

    if not report_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report file not found.",
        )

    try:
        log_audit_event(
            db=db,
            user_id=current_user.id,
            action="REPORT_DOWNLOADED",
            details={
                "report_id": report.id,
                "report_number": report.report_number,
            },
        )
        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to record report download.",
        )

    return FileResponse(
        path=report_path,
        media_type="application/pdf",
        filename=f"{report.report_number}.pdf",
    )
