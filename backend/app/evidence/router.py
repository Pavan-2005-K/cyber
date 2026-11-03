import hashlib
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.router import get_current_user
from app.db.audit import log_audit_event
from app.db.database import get_db
from app.db.models import Case, Evidence, User
from app.services.storage_service import (
    EVIDENCE_BUCKET,
    upload_file,
    download_file,
    delete_file,
)


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

# Use known MIME types instead of trusting the uploaded content type.
MIME_TYPES = {
    ".eml": "message/rfc822",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def get_owned_case(db: Session, case_id: int, user_id: int):
    return (
        db.query(Case)
        .filter(
            Case.id == case_id,
            Case.owner_id == user_id,
        )
        .first()
    )


def record_verification(
    db: Session,
    user_id: int,
    evidence: Evidence,
    verification_status: str,
    integrity_verified: bool,
    current_hash: str | None = None,
):
    log_audit_event(
        db=db,
        user_id=user_id,
        action="EVIDENCE_VERIFICATION_COMPLETED",
        details={
            "evidence_id": evidence.id,
            "status": verification_status,
            "integrity_verified": integrity_verified,
            "stored_sha256_hash": evidence.sha256_hash,
            "current_sha256_hash": current_hash,
        },
    )

    db.commit()


@router.post("/upload", status_code=status.HTTP_201_CREATED)
def upload_evidence(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_owned_case(db, case_id, current_user.id)

    if not case:
        raise HTTPException(
            status_code=404,
            detail="Case not found.",
        )

    original_name = Path(file.filename or "").name
    extension = Path(original_name).suffix.lower()

    if not original_name or extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type.",
        )

    file_bytes = bytearray()

    try:
        # Read the uploaded file and enforce the 10 MB limit.
        while True:
            chunk = file.file.read(64 * 1024)

            if not chunk:
                break

            file_bytes.extend(chunk)

            if len(file_bytes) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail="File exceeds the 10 MB limit.",
                )

        if not file_bytes:
            raise HTTPException(
                status_code=400,
                detail="Empty files are not allowed.",
            )

        file_bytes = bytes(file_bytes)

        # Calculate SHA-256 before uploading.
        sha256_hash = hashlib.sha256(file_bytes).hexdigest()

        media_type = MIME_TYPES[extension]

        # Create the database record first to obtain its ID.
        evidence = Evidence(
            case_id=case.id,
            uploaded_by=current_user.id,
            original_filename=original_name,
            storage_path="pending",
            media_type=media_type,
            file_size=len(file_bytes),
            sha256_hash=sha256_hash,
        )

        db.add(evidence)
        db.flush()

        # Generate a unique object key inside the evidence bucket.
        object_key = (
            f"evidence/{evidence.id}/{uuid4().hex}{extension}"
        )

        storage_uploaded = False

        try:
            # Upload the actual file to private Supabase Storage.
            upload_file(
                bucket=EVIDENCE_BUCKET,
                object_key=object_key,
                file_bytes=file_bytes,
                content_type=media_type,
            )

            storage_uploaded = True

            # Store cloud-storage metadata in PostgreSQL.
            evidence.storage_bucket = EVIDENCE_BUCKET
            evidence.storage_object_key = object_key

            # Preserve the storage_path field for compatibility
            # with the existing database model.
            evidence.storage_path = (
                f"supabase://{EVIDENCE_BUCKET}/{object_key}"
            )

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
                    "storage_bucket": EVIDENCE_BUCKET,
                    "storage_object_key": object_key,
                },
            )

            db.commit()
            db.refresh(evidence)

        except Exception:
            db.rollback()

            # If the database transaction fails after upload,
            # remove the uploaded object to avoid orphaned files.
            if storage_uploaded:
                try:
                    delete_file(EVIDENCE_BUCKET, object_key)
                except Exception:
                    pass

            raise

        return {
            "message": "Evidence uploaded successfully.",
            "evidence_id": evidence.id,
            "case_id": evidence.case_id,
            "original_filename": evidence.original_filename,
            "file_size": evidence.file_size,
            "sha256_hash": evidence.sha256_hash,
            "storage_bucket": evidence.storage_bucket,
            "uploaded_at": evidence.uploaded_at,
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

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
    case = get_owned_case(db, case_id, current_user.id)

    if not case:
        raise HTTPException(
            status_code=404,
            detail="Case not found.",
        )

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
            "storage_bucket": item.storage_bucket,
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
        raise HTTPException(
            status_code=404,
            detail="Evidence not found.",
        )

    try:
        # New evidence: verify directly from Supabase Storage.
        has_storage_metadata = (
            evidence.storage_bucket is not None
            or evidence.storage_object_key is not None
        )
        if has_storage_metadata:
            if (
                evidence.storage_bucket != EVIDENCE_BUCKET
                or not isinstance(evidence.storage_object_key, str)
                or not evidence.storage_object_key.strip()
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid evidence storage metadata.",
                )

            try:
                file_bytes = download_file(
                    bucket=evidence.storage_bucket,
                    object_key=evidence.storage_object_key,
                )

            except FileNotFoundError:
                record_verification(
                    db=db,
                    user_id=current_user.id,
                    evidence=evidence,
                    verification_status="FILE_MISSING",
                    integrity_verified=False,
                )

                return {
                    "evidence_id": evidence.id,
                    "status": "FILE_MISSING",
                    "integrity_verified": False,
                    "message": "The stored evidence file could not be found.",
                }

            current_hash = hashlib.sha256(file_bytes).hexdigest()

        # Legacy evidence: verify using its original local path.
        elif (
            isinstance(evidence.storage_path, str)
            and evidence.storage_path
            and not evidence.storage_path.startswith("supabase://")
        ):

            file_path = (BASE_DIR / evidence.storage_path).resolve()

            if not file_path.is_relative_to(EVIDENCE_DIR):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid evidence storage path.",
                )

            if not file_path.is_file():
                record_verification(
                    db=db,
                    user_id=current_user.id,
                    evidence=evidence,
                    verification_status="FILE_MISSING",
                    integrity_verified=False,
                )

                return {
                    "evidence_id": evidence.id,
                    "status": "FILE_MISSING",
                    "integrity_verified": False,
                    "message": "The stored evidence file could not be found.",
                }

            sha256 = hashlib.sha256()

            with file_path.open("rb") as stored_file:
                for chunk in iter(
                    lambda: stored_file.read(64 * 1024),
                    b"",
                ):
                    sha256.update(chunk)

            current_hash = sha256.hexdigest()

        else:
            raise HTTPException(
                status_code=400,
                detail="Evidence storage information is incomplete.",
            )

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Unable to access the stored evidence file.",
        )

    is_match = current_hash == evidence.sha256_hash

    verification_status = (
        "INTEGRITY_VERIFIED"
        if is_match
        else "HASH_MISMATCH"
    )

    record_verification(
        db=db,
        user_id=current_user.id,
        evidence=evidence,
        verification_status=verification_status,
        integrity_verified=is_match,
        current_hash=current_hash,
    )

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
