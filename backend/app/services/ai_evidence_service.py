import hashlib
import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.models import Case, Evidence
from app.services.storage_service import EVIDENCE_BUCKET, download_file


# =========================================================
# EXISTING EVIDENCE FOR AI ANALYSIS
# =========================================================

def get_verified_case_evidence(
    db: Session,
    case_id: int,
    evidence_id: int,
    user_id: int,
    max_size: int,
    allowed_extensions: set[str],
) -> tuple[bytes, str]:
    """
    Securely retrieve existing case evidence for AI analysis.

    Validates:
    1. Case belongs to the authenticated user.
    2. Evidence belongs to the specified case.
    3. File extension is supported by the AI module.
    4. Storage bucket is the private evidence bucket.
    5. Object key follows the expected evidence/{id}/ format.
    6. File is non-empty and within the module's size limit.
    7. Downloaded content matches the recorded SHA-256 hash.

    Returns:
        tuple[bytes, str]: Verified file bytes and original filename.
    """

    # -----------------------------------------------------
    # 1. Verify case ownership
    # -----------------------------------------------------

    case = (
        db.query(Case)
        .filter(
            Case.id == case_id,
            Case.owner_id == user_id,
        )
        .first()
    )

    if not case:
        raise HTTPException(
            status_code=404,
            detail="Case not found.",
        )

    # -----------------------------------------------------
    # 2. Verify evidence belongs to this case
    # -----------------------------------------------------

    evidence = (
        db.query(Evidence)
        .filter(
            Evidence.id == evidence_id,
            Evidence.case_id == case_id,
        )
        .first()
    )

    if not evidence:
        raise HTTPException(
            status_code=404,
            detail="Evidence not found in this case.",
        )

    # -----------------------------------------------------
    # 3. Validate original filename and extension
    # -----------------------------------------------------

    filename = evidence.original_filename

    if not filename:
        raise HTTPException(
            status_code=400,
            detail="Evidence filename is invalid.",
        )

    extension = filename.rsplit(".", 1)[-1].lower()

    if "." not in filename or f".{extension}" not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Evidence file type is not supported by this AI module.",
        )

    # -----------------------------------------------------
    # 4. Validate storage metadata
    # -----------------------------------------------------

    if evidence.storage_bucket != EVIDENCE_BUCKET:
        raise HTTPException(
            status_code=400,
            detail="Invalid evidence storage bucket.",
        )

    object_key = evidence.storage_object_key

    if not isinstance(object_key, str) or not object_key:
        raise HTTPException(
            status_code=400,
            detail="Evidence storage information is incomplete.",
        )

    # Only accept objects stored under this evidence ID.
    expected_prefix = f"evidence/{evidence.id}/"

    if not object_key.startswith(expected_prefix):
        raise HTTPException(
            status_code=400,
            detail="Invalid evidence storage path.",
        )

    # Reject unsafe object-key characters and traversal patterns.
    if (
        ".." in object_key
        or "\\" in object_key
        or not re.fullmatch(
            rf"evidence/{evidence.id}/[a-fA-F0-9]+{re.escape(f'.{extension}')}",
            object_key,
        )
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid evidence storage path.",
        )

    # -----------------------------------------------------
    # 5. Validate recorded hash
    # -----------------------------------------------------

    recorded_hash = evidence.sha256_hash

    if (
        not isinstance(recorded_hash, str)
        or not re.fullmatch(r"[a-fA-F0-9]{64}", recorded_hash)
    ):
        raise HTTPException(
            status_code=400,
            detail="Evidence integrity metadata is invalid.",
        )

    # -----------------------------------------------------
    # 6. Download file from private storage
    # -----------------------------------------------------

    try:
        file_bytes = download_file(
            bucket=EVIDENCE_BUCKET,
            object_key=object_key,
        )

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail="Stored evidence file was not found.",
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to retrieve stored evidence.",
        ) from exc

    # -----------------------------------------------------
    # 7. Validate downloaded content
    # -----------------------------------------------------

    if not file_bytes:
        raise HTTPException(
            status_code=400,
            detail="Stored evidence file is empty.",
        )

    if len(file_bytes) > max_size:
        raise HTTPException(
            status_code=413,
            detail="Evidence file exceeds this AI module's size limit.",
        )

    # -----------------------------------------------------
    # 8. Verify SHA-256 integrity BEFORE analysis
    # -----------------------------------------------------

    current_hash = hashlib.sha256(file_bytes).hexdigest()

    if current_hash.lower() != recorded_hash.lower():
        raise HTTPException(
            status_code=409,
            detail="Evidence integrity verification failed. Analysis aborted.",
        )

    # -----------------------------------------------------
    # 9. Return integrity-verified bytes and filename
    # -----------------------------------------------------

    return file_bytes, filename