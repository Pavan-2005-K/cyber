
import hashlib
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
from fastapi.responses import FileResponse, Response
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
from app.services.storage_service import (
    REPORTS_BUCKET,
    upload_file,
    download_file,
    delete_file,
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
    object_key = None
    storage_uploaded = False

    try:
        # 1. Generate the investigation PDF locally.
        generated_path = generate_investigation_pdf(
            db=db,
            case=case,
            investigator=current_user,
            report_number=report_number,
        )

        report_file = Path(generated_path)

        if not report_file.is_file():
            raise RuntimeError("Generated report file was not found.")

        # 2. Read the PDF and calculate its SHA-256 hash.
        pdf_bytes = report_file.read_bytes()

        if not pdf_bytes:
            raise RuntimeError("Generated report PDF is empty.")

        file_sha256 = hashlib.sha256(pdf_bytes).hexdigest()

        # 3. Create the database record.
        report = InvestigationReport(
            report_number=report_number,
            case_id=case.id,
            investigator_id=current_user.id,
            report_path=str(report_file),
            storage_bucket=REPORTS_BUCKET,
            file_sha256=file_sha256,
        )

        db.add(report)
        db.flush()

        # 4. Generate a unique Supabase Storage object key.
        object_key = (
            f"reports/{report.id}/{uuid4().hex}.pdf"
        )

        # 5. Upload the PDF to private Supabase Storage.
        upload_file(
            bucket=REPORTS_BUCKET,
            object_key=object_key,
            file_bytes=pdf_bytes,
            content_type="application/pdf",
        )

        storage_uploaded = True

        # 6. Save cloud storage metadata.
        report.storage_object_key = object_key

        # 7. Record the audit event.
        log_audit_event(
            db=db,
            user_id=current_user.id,
            action="REPORT_GENERATED",
            details={
                "report_id": report.id,
                "report_number": report_number,
                "case_id": case.id,
                "case_number": case.case_number,
                "storage_bucket": REPORTS_BUCKET,
                "storage_object_key": object_key,
                "file_sha256": file_sha256,
            },
        )

        # 8. Commit the database transaction.
        db.commit()
        db.refresh(report)

        # 9. Remove the temporary local PDF.
        try:
            report_file.unlink(missing_ok=True)
        except OSError:
            pass

        return report

    except Exception:
        db.rollback()

        # Remove the cloud object if the database transaction failed.
        if storage_uploaded and object_key:
            try:
                delete_file(
                    REPORTS_BUCKET,
                    object_key,
                )
            except Exception:
                pass

        # Remove any remaining temporary PDF.
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
    return get_owned_report(
        db,
        report_id,
        current_user.id,
    )


@router.get("/{report_id}/download")
def download_report(
    report_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    report = get_owned_report(
        db,
        report_id,
        current_user.id,
    )

    # --------------------------------------------------
    # NEW REPORTS: DOWNLOAD FROM SUPABASE STORAGE
    # --------------------------------------------------

    has_storage_metadata = (
        report.storage_bucket is not None
        or report.storage_object_key is not None
    )
    if has_storage_metadata:
        if (
            report.storage_bucket != REPORTS_BUCKET
            or not isinstance(report.storage_object_key, str)
            or not report.storage_object_key.strip()
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report file not found.",
            )

        try:
            pdf_bytes = download_file(
                bucket=report.storage_bucket,
                object_key=report.storage_object_key,
            )

        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report file not found in storage.",
            )

        except Exception:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to access the stored report.",
            )

        # Cloud reports must have a stored hash before they can be returned.
        current_hash = hashlib.sha256(pdf_bytes).hexdigest()
        if not report.file_sha256 or current_hash != report.file_sha256:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Report integrity verification failed.",
            )

        response_content = pdf_bytes

    # --------------------------------------------------
    # LEGACY REPORTS: DOWNLOAD FROM LOCAL STORAGE
    # --------------------------------------------------

    else:
        if not report.report_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report file not found.",
            )

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
            response_content = report_path.read_bytes()

        except OSError:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to read the report file.",
            )

    # --------------------------------------------------
    # AUDIT LOGGING
    # --------------------------------------------------

    try:
        log_audit_event(
            db=db,
            user_id=current_user.id,
            action="REPORT_DOWNLOADED",
            details={
                "report_id": report.id,
                "report_number": report.report_number,
                "storage_bucket": report.storage_bucket,
            },
        )

        db.commit()

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to record report download.",
        )

    # --------------------------------------------------
    # RETURN PDF
    # --------------------------------------------------

    return Response(
        content=response_content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{report.report_number}.pdf"'
            )
        },
    )
