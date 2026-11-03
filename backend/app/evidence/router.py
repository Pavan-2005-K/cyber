import hashlib
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.router import get_current_user
from app.db.audit import log_audit_event
from app.db.database import get_db
from app.db.models import Case, Evidence, User


router = APIRouter(prefix="/api/evidence", tags=["Digital Evidence"])

BASE_DIR = Path(__file__).resolve().parents[2]
EVIDENCE_DIR = (BASE_DIR / "storage" / "evidence").resolve()
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_EXTENSIONS = {
    ".eml",
    ".txt",
    ".csv",
    ".json",
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
}


@router.post("/upload", status_code=status.HTTP_201_CREATED)
def upload_evidence(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = (
        db.query(Case)
        .filter(
            Case.id == case_id,
            Case.owner_id == current_user.id,
        )
        .first()
    )

    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    original_name = Path(file.filename or "").name
    extension = Path(original_name).suffix.lower()

    if not original_name or extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type.",
        )

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

    stored_name = f"{uuid4().hex}{extension}"
    destination = EVIDENCE_DIR / stored_name
    sha256 = hashlib.sha256()
    total_size = 0

    try:
        with destination.open("wb") as output:
            while True:
                chunk = file.file.read(64 * 1024)

                if not chunk:
                    break

                total_size += len(chunk)

                if total_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="File exceeds the 10 MB limit.",
                    )

                sha256.update(chunk)
                output.write(chunk)

        if total_size == 0:
            raise HTTPException(
                status_code=400,
                detail="Empty files are not allowed.",
            )

        evidence = Evidence(
            case_id=case.id,
            uploaded_by=current_user.id,
            original_filename=original_name,
            storage_path=str(destination.relative_to(BASE_DIR)),
            media_type=file.content_type or "application/octet-stream",
            file_size=total_size,
            sha256_hash=sha256.hexdigest(),
        )

        db.add(evidence)
        db.flush()

        log_audit_event(
            db=db,
            user_id=current_user.id,
            action="EVIDENCE_UPLOADED",
            details={
                "evidence_id": evidence.id,
                "case_id": case.id,
                "filename": evidence.original_filename,
                "sha256_hash": evidence.sha256_hash,
                "file_size": evidence.file_size,
            },
        )

        db.commit()
        db.refresh(evidence)

        return {
            "message": "Evidence uploaded successfully.",
            "evidence_id": evidence.id,
            "case_id": evidence.case_id,
            "original_filename": evidence.original_filename,
            "file_size": evidence.file_size,
            "sha256_hash": evidence.sha256_hash,
            "uploaded_at": evidence.uploaded_at,
        }

    except HTTPException:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail="Unable to save evidence.",
        )
    finally:
        file.file.close()


@router.get("/case/{case_id}")
def list_case_evidence(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = (
        db.query(Case)
        .filter(
            Case.id == case_id,
            Case.owner_id == current_user.id,
        )
        .first()
    )

    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    evidence_items = (
        db.query(Evidence)
        .filter(Evidence.case_id == case_id)
        .order_by(Evidence.uploaded_at.desc())
        .all()
    )

    return [
        {
            "id": item.id,
            "case_id": item.case_id,
            "original_filename": item.original_filename,
            "file_size": item.file_size,
            "sha256_hash": item.sha256_hash,
            "media_type": item.media_type,
            "uploaded_at": item.uploaded_at,
        }
        for item in evidence_items
    ]


@router.post("/{evidence_id}/verify")
def verify_evidence_integrity(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    evidence = (
        db.query(Evidence)
        .join(Case, Evidence.case_id == Case.id)
        .filter(
            Evidence.id == evidence_id,
            Case.owner_id == current_user.id,
        )
        .first()
    )

    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found.")

    file_path = (BASE_DIR / evidence.storage_path).resolve()

    # Prevent paths outside the evidence storage directory.
    if not file_path.is_relative_to(EVIDENCE_DIR):
        raise HTTPException(
            status_code=400,
            detail="Invalid evidence storage path.",
        )

    if not file_path.is_file():
        log_audit_event(
            db=db,
            user_id=current_user.id,
            action="EVIDENCE_VERIFICATION_COMPLETED",
            details={
                "evidence_id": evidence.id,
                "status": "FILE_MISSING",
                "integrity_verified": False,
            },
        )
        db.commit()

        return {
            "evidence_id": evidence.id,
            "status": "FILE_MISSING",
            "message": "The stored evidence file could not be found.",
        }

    sha256 = hashlib.sha256()

    try:
        with file_path.open("rb") as stored_file:
            for chunk in iter(lambda: stored_file.read(64 * 1024), b""):
                sha256.update(chunk)
    except OSError:
        raise HTTPException(
            status_code=500,
            detail="Unable to read the stored evidence file.",
        )

    current_hash = sha256.hexdigest()
    is_match = current_hash == evidence.sha256_hash
    verification_status = (
        "INTEGRITY_VERIFIED" if is_match else "HASH_MISMATCH"
    )

    log_audit_event(
        db=db,
        user_id=current_user.id,
        action="EVIDENCE_VERIFICATION_COMPLETED",
        details={
            "evidence_id": evidence.id,
            "status": verification_status,
            "integrity_verified": is_match,
            "stored_sha256_hash": evidence.sha256_hash,
            "current_sha256_hash": current_hash,
        },
    )
    db.commit()

    return {
        "evidence_id": evidence.id,
        "original_filename": evidence.original_filename,
        "stored_sha256_hash": evidence.sha256_hash,
        "current_sha256_hash": current_hash,
        "integrity_verified": is_match,
        "status": verification_status,
        "message": (
            "The stored file matches its recorded SHA-256 hash."
            if is_match
            else "The stored file does not match its recorded SHA-256 hash."
        ),
    }
