
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.auth.router import get_current_user
from app.db.audit import log_audit_event
from app.db.database import get_db
from app.db.models import (
    Case,
    Evidence,
    IntegrityChain,
    IntegrityCheckpoint,
    IntegrityRecord,
    User,
)
from app.services.storage_service import EVIDENCE_BUCKET, download_file
from app.integrity.signing import (
    SIGNATURE_INVALID,
    SIGNATURE_UNKNOWN_KEY,
    SIGNATURE_VALID,
    SigningConfigurationError,
    build_checkpoint_payload,
    load_trusted_public_keys,
    sign_checkpoint,
    verify_checkpoint_signature,
)


router = APIRouter(
    prefix="/api/integrity",
    tags=["Evidence Integrity Records"],
)

BASE_DIR = Path(__file__).resolve().parents[2]
EVIDENCE_DIR = (BASE_DIR / "storage" / "evidence").resolve()
CASE_CHAIN_HASH_VERSION = "CASE_CHAIN_V2"
MAX_CHAIN_APPEND_ATTEMPTS = 3


def calculate_record_hash(
    evidence_id: int,
    sha256_hash: str,
    previous_record_hash: str,
    recorded_at: str,
) -> str:
    payload = {
        "evidence_id": evidence_id,
        "sha256_hash": sha256_hash,
        "previous_record_hash": previous_record_hash,
        "recorded_at": recorded_at,
    }

    canonical_payload = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(
        canonical_payload.encode("utf-8")
    ).hexdigest()


def calculate_case_chain_v2_hash(
    *,
    chain_id: int,
    case_id: int,
    sequence_number: int,
    evidence_id: int,
    sha256_hash: str,
    previous_record_hash: str,
    recorded_at: str,
) -> str:
    payload = {
        "chain_id": chain_id,
        "case_id": case_id,
        "sequence_number": sequence_number,
        "evidence_id": evidence_id,
        "sha256_hash": sha256_hash,
        "previous_record_hash": previous_record_hash,
        "recorded_at": recorded_at,
        "hash_version": CASE_CHAIN_HASH_VERSION,
    }

    canonical_payload = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(
        canonical_payload.encode("utf-8")
    ).hexdigest()


def timestamp_string(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc).isoformat()


def calculate_file_sha256(file_path: Path) -> str:
    sha256 = hashlib.sha256()

    with file_path.open("rb") as file:
        for chunk in iter(lambda: file.read(64 * 1024), b""):
            sha256.update(chunk)

    return sha256.hexdigest()


def get_owned_evidence(
    evidence_id: int,
    db: Session,
    user_id: int,
) -> Evidence:
    evidence = (
        db.query(Evidence)
        .join(Case, Evidence.case_id == Case.id)
        .filter(
            Evidence.id == evidence_id,
            Case.owner_id == user_id,
        )
        .first()
    )

    if not evidence:
        raise HTTPException(
            status_code=404,
            detail="Evidence not found.",
        )

    return evidence


def get_safe_evidence_path(storage_path: str) -> Path:
    if not isinstance(storage_path, str) or not storage_path:
        raise HTTPException(
            status_code=400,
            detail="Invalid evidence storage path.",
        )
    if storage_path.startswith("supabase://"):
        raise HTTPException(
            status_code=400,
            detail="Invalid evidence storage path.",
        )

    file_path = (BASE_DIR / storage_path).resolve()

    if not file_path.is_relative_to(EVIDENCE_DIR):
        raise HTTPException(
            status_code=400,
            detail="Invalid evidence storage path.",
        )

    return file_path


def calculate_evidence_sha256(evidence: Evidence) -> str:
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
            raise
        except Exception as error:
            status_code = getattr(
                error,
                "status",
                getattr(error, "status_code", None),
            )
            if str(status_code) == "404":
                raise FileNotFoundError(
                    "Evidence object was not found."
                ) from error
            raise

        return hashlib.sha256(file_bytes).hexdigest()

    evidence_path = get_safe_evidence_path(evidence.storage_path)
    if not evidence_path.is_file():
        raise FileNotFoundError("Evidence file was not found.")

    return calculate_file_sha256(evidence_path)


def _integrity_error(record_id: int, problem: str) -> dict:
    return {"record_id": record_id, "problem": problem}


def _verify_legacy_records(
    db: Session,
    *,
    owner_id: int,
    case_id: int | None = None,
) -> tuple[int, list[dict]]:
    legacy_rows = (
        db.query(IntegrityRecord, Case.owner_id, Evidence.case_id)
        .outerjoin(Evidence, IntegrityRecord.evidence_id == Evidence.id)
        .outerjoin(Case, Evidence.case_id == Case.id)
        .filter(
            IntegrityRecord.chain_id.is_(None),
            IntegrityRecord.sequence_number.is_(None),
        )
        .order_by(IntegrityRecord.id.asc())
        .all()
    )

    errors = []
    records_checked = 0
    expected_previous = "GENESIS"
    prior_global_error = False

    for record, record_owner_id, record_case_id in legacy_rows:
        record_errors = []
        if record.previous_record_hash != expected_previous:
            record_errors.append(
                "Previous record hash does not match the chain."
            )

        if record.recorded_at is None:
            record_errors.append("Record timestamp is missing.")
        else:
            try:
                expected_hash = calculate_record_hash(
                    evidence_id=record.evidence_id,
                    sha256_hash=record.sha256_hash,
                    previous_record_hash=record.previous_record_hash,
                    recorded_at=timestamp_string(record.recorded_at),
                )
                if expected_hash != record.record_hash:
                    record_errors.append(
                        "Record hash does not match its contents."
                    )
            except (TypeError, ValueError, OverflowError):
                record_errors.append("Record timestamp is invalid.")

        is_visible_record = (
            record_owner_id == owner_id
            and (case_id is None or record_case_id == case_id)
        )
        if is_visible_record:
            records_checked += 1
            if prior_global_error:
                record_errors.append(
                    "A preceding legacy record cannot be verified."
                )
            errors.extend(
                _integrity_error(record.id, problem)
                for problem in record_errors
            )

        prior_global_error = prior_global_error or bool(record_errors)
        expected_previous = record.record_hash

    return records_checked, errors


def _verify_case_chain(
    db: Session,
    *,
    case_id: int,
    chain: IntegrityChain | None,
) -> tuple[int, list[dict]]:
    if chain is None:
        unattached_records = (
            db.query(IntegrityRecord)
            .join(Evidence, IntegrityRecord.evidence_id == Evidence.id)
            .filter(
                Evidence.case_id == case_id,
                IntegrityRecord.hash_version == CASE_CHAIN_HASH_VERSION,
            )
            .order_by(IntegrityRecord.id.asc())
            .all()
        )
        return len(unattached_records), [
            _integrity_error(
                record.id,
                "No case integrity chain exists for this record.",
            )
            for record in unattached_records
        ]

    errors = []
    records = (
        db.query(IntegrityRecord)
        .filter(IntegrityRecord.chain_id == chain.id)
        .order_by(
            IntegrityRecord.sequence_number.asc(),
            IntegrityRecord.id.asc(),
        )
        .all()
    )
    misplaced_records = (
        db.query(IntegrityRecord)
        .join(Evidence, IntegrityRecord.evidence_id == Evidence.id)
        .filter(
            Evidence.case_id == case_id,
            IntegrityRecord.hash_version == CASE_CHAIN_HASH_VERSION,
            or_(
                IntegrityRecord.chain_id.is_(None),
                IntegrityRecord.chain_id != chain.id,
            ),
        )
        .order_by(IntegrityRecord.id.asc())
        .all()
    )
    errors.extend(
        _integrity_error(
            record.id,
            "Record references an incorrect case integrity chain.",
        )
        for record in misplaced_records
    )
    expected_previous = "GENESIS"
    seen_sequences = set()

    if chain.case_id != case_id:
        errors.append(
            {
                "chain_id": chain.id,
                "problem": "Integrity chain is not associated with this case.",
            }
        )

    for expected_sequence, record in enumerate(records, start=1):
        record_errors = []
        sequence = record.sequence_number
        if sequence is None or sequence < 1:
            record_errors.append("Sequence number is missing or invalid.")
        else:
            if sequence in seen_sequences:
                record_errors.append("Duplicate sequence number.")
            if sequence != expected_sequence:
                record_errors.append(
                    "Sequence number gap or out-of-order record detected."
                )
            seen_sequences.add(sequence)

        if record.chain_id != chain.id:
            record_errors.append("Record references an incorrect chain.")
        if record.hash_version != CASE_CHAIN_HASH_VERSION:
            record_errors.append("Unsupported or incorrect hash version.")
        if record.previous_record_hash != expected_previous:
            record_errors.append(
                "Previous record hash does not match the case chain."
            )

        evidence = db.get(Evidence, record.evidence_id)
        if evidence is None:
            record_errors.append("Evidence record is missing.")
        else:
            if evidence.case_id != case_id:
                record_errors.append(
                    "Evidence does not belong to this case."
                )
            if evidence.sha256_hash != record.sha256_hash:
                record_errors.append(
                    "Evidence hash does not match the integrity record."
                )

            try:
                actual_evidence_hash = calculate_evidence_sha256(evidence)
            except HTTPException as error:
                if error.status_code == 400:
                    record_errors.append(
                        "Evidence storage metadata is invalid."
                    )
                else:
                    record_errors.append(
                        "Evidence storage information is invalid."
                    )
            except FileNotFoundError:
                record_errors.append("Evidence file is missing.")
            except OSError:
                record_errors.append("Evidence file cannot be read.")
            except Exception:
                record_errors.append("Evidence file cannot be accessed.")
            else:
                if actual_evidence_hash != record.sha256_hash:
                    record_errors.append(
                        "Evidence file hash does not match the record."
                    )

        if record.recorded_at is None:
            record_errors.append("Record timestamp is missing.")
        else:
            try:
                expected_record_hash = calculate_case_chain_v2_hash(
                    chain_id=chain.id,
                    case_id=case_id,
                    sequence_number=sequence,
                    evidence_id=record.evidence_id,
                    sha256_hash=record.sha256_hash,
                    previous_record_hash=record.previous_record_hash,
                    recorded_at=timestamp_string(record.recorded_at),
                )
            except (TypeError, ValueError, OverflowError):
                record_errors.append("Record timestamp is invalid.")
            else:
                if expected_record_hash != record.record_hash:
                    record_errors.append(
                        "Record hash does not match its contents."
                    )

        errors.extend(
            _integrity_error(record.id, problem)
            for problem in record_errors
        )
        expected_previous = record.record_hash

    latest_sequence = records[-1].sequence_number if records else 0
    latest_hash = records[-1].record_hash if records else "GENESIS"
    if chain.head_sequence != latest_sequence:
        errors.append(
            {
                "chain_id": chain.id,
                "problem": "Chain head sequence does not match its records.",
            }
        )
    if chain.head_record_hash != latest_hash:
        errors.append(
            {
                "chain_id": chain.id,
                "problem": "Chain head hash does not match its latest record.",
            }
        )

    return len(records) + len(misplaced_records), errors


def _verify_case_checkpoints(
    db: Session,
    *,
    case_id: int,
    chain: IntegrityChain | None,
) -> dict:
    if chain is None:
        return {
            "status": "NOT_APPLICABLE",
            "checkpoints_checked": 0,
            "historical_unsigned_records": 0,
            "checkpoints": [],
            "errors": [],
            "independently_anchored": False,
        }

    records = (
        db.query(IntegrityRecord)
        .filter(IntegrityRecord.chain_id == chain.id)
        .order_by(IntegrityRecord.sequence_number.asc())
        .all()
    )
    checkpoints = (
        db.query(IntegrityCheckpoint)
        .filter(IntegrityCheckpoint.chain_id == chain.id)
        .order_by(IntegrityCheckpoint.sequence_number.asc())
        .all()
    )

    if not checkpoints and chain.checkpoint_start_sequence is None:
        status = "HISTORICAL_UNSIGNED" if records else "NOT_APPLICABLE"
        return {
            "status": status,
            "checkpoints_checked": 0,
            "historical_unsigned_records": len(records),
            "checkpoints": [],
            "errors": [],
            "independently_anchored": False,
        }

    errors = []
    start_sequence = chain.checkpoint_start_sequence
    if start_sequence is None:
        start_sequence = checkpoints[0].sequence_number
        errors.append(
            {
                "sequence_number": start_sequence,
                "problem": "Checkpoint signing boundary is missing.",
            }
        )

    if start_sequence < 1 or start_sequence > chain.head_sequence:
        errors.append(
            {
                "sequence_number": start_sequence,
                "problem": "Checkpoint signing boundary is invalid.",
            }
        )
        expected_sequences = []
    else:
        expected_sequences = list(
            range(start_sequence, chain.head_sequence + 1)
        )

    checkpoints_by_sequence = {
        checkpoint.sequence_number: checkpoint
        for checkpoint in checkpoints
    }
    records_by_sequence = {
        record.sequence_number: record for record in records
    }

    for sequence_number in expected_sequences:
        if sequence_number not in checkpoints_by_sequence:
            errors.append(
                {
                    "sequence_number": sequence_number,
                    "problem": "Signed checkpoint is missing.",
                }
            )

    trusted_keys = None
    configuration_error = False
    if checkpoints:
        try:
            trusted_keys = load_trusted_public_keys()
        except SigningConfigurationError:
            configuration_error = True

    checkpoint_results = []
    for checkpoint in checkpoints:
        sequence_number = checkpoint.sequence_number
        record = records_by_sequence.get(sequence_number)
        checkpoint_problems = []
        if sequence_number < start_sequence or sequence_number > chain.head_sequence:
            checkpoint_problems.append(
                "Checkpoint sequence is outside the signed chain range."
            )
        if checkpoint.chain_id != chain.id or checkpoint.case_id != case_id:
            checkpoint_problems.append(
                "Checkpoint context does not match its case integrity chain."
            )
        if record is None:
            checkpoint_problems.append(
                "Checkpoint has no matching integrity record."
            )
        elif record.record_hash != checkpoint.head_record_hash:
            checkpoint_problems.append(
                "Checkpoint head hash does not match its integrity record."
            )
        if (
            sequence_number == chain.head_sequence
            and checkpoint.head_record_hash != chain.head_record_hash
        ):
            checkpoint_problems.append(
                "Latest checkpoint does not match the stored chain head."
            )
        if (
            sequence_number == chain.head_sequence
            and checkpoint.head_record_hash != chain.head_record_hash
        ):
            checkpoint_problems.append(
                "Latest checkpoint does not match the stored chain head."
            )

        payload = build_checkpoint_payload(
            chain_id=checkpoint.chain_id,
            case_id=checkpoint.case_id,
            sequence_number=sequence_number,
            head_record_hash=checkpoint.head_record_hash,
            key_id=checkpoint.key_id,
        )
        payload["checkpoint_version"] = checkpoint.checkpoint_version
        if configuration_error:
            signature_status = "CONFIGURATION_ERROR"
        else:
            try:
                signature_status = verify_checkpoint_signature(
                    payload,
                    checkpoint.signature,
                    trusted_public_keys=trusted_keys,
                )
            except SigningConfigurationError:
                signature_status = "CONFIGURATION_ERROR"

        result_status = (
            "INVALID_CHECKPOINT"
            if checkpoint_problems
            else signature_status
        )
        checkpoint_results.append(
            {
                "checkpoint_id": checkpoint.id,
                "sequence_number": sequence_number,
                "key_id": checkpoint.key_id,
                "checkpoint_version": checkpoint.checkpoint_version,
                "signature_status": signature_status,
                "status": result_status,
            }
        )
        errors.extend(
            {
                "checkpoint_id": checkpoint.id,
                "sequence_number": sequence_number,
                "problem": problem,
            }
            for problem in checkpoint_problems
        )

    signature_statuses = {
        result["signature_status"] for result in checkpoint_results
    }
    has_missing = any(
        error["problem"] == "Signed checkpoint is missing."
        for error in errors
    )
    has_structural_error = any(
        result["status"] == "INVALID_CHECKPOINT"
        for result in checkpoint_results
    ) or any(
        error["problem"] in {
            "Checkpoint signing boundary is missing.",
            "Checkpoint signing boundary is invalid.",
        }
        for error in errors
    )
    if configuration_error or "CONFIGURATION_ERROR" in signature_statuses:
        status = "CONFIGURATION_ERROR"
    elif SIGNATURE_UNKNOWN_KEY in signature_statuses:
        status = SIGNATURE_UNKNOWN_KEY
    elif has_missing:
        status = "MISSING_CHECKPOINT"
    elif SIGNATURE_INVALID in signature_statuses:
        status = SIGNATURE_INVALID
    elif has_structural_error:
        status = "INVALID_CHECKPOINT"
    elif records and start_sequence > 1:
        status = "VALID_WITH_HISTORICAL_UNSIGNED"
    else:
        status = SIGNATURE_VALID

    return {
        "status": status,
        "checkpoints_checked": len(checkpoint_results),
        "historical_unsigned_records": max(start_sequence - 1, 0),
        "checkpoints": checkpoint_results,
        "errors": errors,
        "independently_anchored": False,
    }


def _aggregate_checkpoint_status(results: list[dict]) -> dict:
    statuses = {result["status"] for result in results}
    if "CONFIGURATION_ERROR" in statuses:
        status = "CONFIGURATION_ERROR"
    elif SIGNATURE_UNKNOWN_KEY in statuses:
        status = SIGNATURE_UNKNOWN_KEY
    elif SIGNATURE_INVALID in statuses:
        status = SIGNATURE_INVALID
    elif "MISSING_CHECKPOINT" in statuses:
        status = "MISSING_CHECKPOINT"
    elif "INVALID_CHECKPOINT" in statuses:
        status = "INVALID_CHECKPOINT"
    elif "VALID_WITH_HISTORICAL_UNSIGNED" in statuses:
        status = "VALID_WITH_HISTORICAL_UNSIGNED"
    elif "VALID" in statuses:
        status = "VALID"
    elif "HISTORICAL_UNSIGNED" in statuses:
        status = "HISTORICAL_UNSIGNED"
    else:
        status = "NOT_APPLICABLE"

    return {
        "status": status,
        "checkpoints_checked": sum(
            result["checkpoints_checked"] for result in results
        ),
        "historical_unsigned_records": sum(
            result["historical_unsigned_records"] for result in results
        ),
        "cases": results,
        "independently_anchored": False,
    }


def _is_retryable_database_conflict(error: Exception) -> bool:
    if isinstance(error, IntegrityError):
        message = str(error.orig).lower()
        return (
            "unique constraint" in message
            or "duplicate key" in message
            or "unique violation" in message
        )

    if not isinstance(error, OperationalError):
        return False

    original = error.orig
    sqlite_error_code = getattr(original, "sqlite_errorcode", None)
    if sqlite_error_code is not None:
        primary_code = sqlite_error_code & 0xFF
        if primary_code in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED):
            return True

    message = str(original).lower()
    return "database is locked" in message or "database is busy" in message


class _ConcurrentChainHead(Exception):
    pass


@router.post("/evidence/{evidence_id}/record")
def create_integrity_record(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for attempt in range(MAX_CHAIN_APPEND_ATTEMPTS):
        try:
            if db.get_bind().dialect.name == "sqlite":
                db.connection().exec_driver_sql("BEGIN IMMEDIATE")

            evidence = get_owned_evidence(
                evidence_id=evidence_id,
                db=db,
                user_id=current_user.id,
            )
            case = db.get(Case, evidence.case_id)
            if case is None or case.owner_id != current_user.id:
                raise HTTPException(
                    status_code=404,
                    detail="Evidence not found.",
                )

            try:
                current_hash = calculate_evidence_sha256(evidence)
            except HTTPException:
                raise
            except FileNotFoundError as error:
                raise HTTPException(
                    status_code=404,
                    detail="Evidence file is missing.",
                ) from error
            except OSError as error:
                raise HTTPException(
                    status_code=500,
                    detail="Unable to read the evidence file.",
                ) from error
            except Exception as error:
                raise HTTPException(
                    status_code=503,
                    detail="Unable to access the stored evidence file.",
                ) from error

            if current_hash != evidence.sha256_hash:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Evidence hash mismatch. "
                        "No integrity record was created."
                    ),
                )

            chain = (
                db.query(IntegrityChain)
                .filter(IntegrityChain.case_id == case.id)
                .first()
            )
            if chain is None:
                chain = IntegrityChain(
                    case_id=case.id,
                    head_sequence=0,
                    head_record_hash="GENESIS",
                )
                db.add(chain)
                db.flush()

            prior_sequence = chain.head_sequence
            previous_hash = chain.head_record_hash
            sequence_number = prior_sequence + 1
            recorded_at = datetime.now(timezone.utc)
            recorded_at_text = timestamp_string(recorded_at)

            record_hash = calculate_case_chain_v2_hash(
                chain_id=chain.id,
                case_id=case.id,
                sequence_number=sequence_number,
                evidence_id=evidence.id,
                sha256_hash=current_hash,
                previous_record_hash=previous_hash,
                recorded_at=recorded_at_text,
            )

            signed_checkpoint = sign_checkpoint(
                chain_id=chain.id,
                case_id=case.id,
                sequence_number=sequence_number,
                head_record_hash=record_hash,
            )
            record = IntegrityRecord(
                evidence_id=evidence.id,
                sha256_hash=current_hash,
                previous_record_hash=previous_hash,
                record_hash=record_hash,
                recorded_at=recorded_at,
                chain_id=chain.id,
                sequence_number=sequence_number,
                hash_version=CASE_CHAIN_HASH_VERSION,
            )
            db.add(record)
            db.flush()

            checkpoint = IntegrityCheckpoint(
                chain_id=chain.id,
                case_id=case.id,
                sequence_number=sequence_number,
                head_record_hash=record_hash,
                checkpoint_version=signed_checkpoint.checkpoint_version,
                key_id=signed_checkpoint.key_id,
                signature=signed_checkpoint.signature,
                created_at=recorded_at,
            )
            db.add(checkpoint)
            db.flush()

            head_update = db.execute(
                update(IntegrityChain)
                .where(
                    IntegrityChain.id == chain.id,
                    IntegrityChain.head_sequence == prior_sequence,
                    IntegrityChain.head_record_hash == previous_hash,
                )
                .values(
                    head_sequence=sequence_number,
                    head_record_hash=record_hash,
                    checkpoint_start_sequence=(
                        chain.checkpoint_start_sequence or sequence_number
                    ),
                    updated_at=recorded_at,
                )
                .execution_options(synchronize_session=False)
            )
            if head_update.rowcount != 1:
                raise _ConcurrentChainHead()

            log_audit_event(
                db=db,
                user_id=current_user.id,
                action="INTEGRITY_RECORD_CREATED",
                details={
                    "record_id": record.id,
                    "evidence_id": evidence.id,
                    "chain_id": chain.id,
                    "case_id": case.id,
                    "sequence_number": sequence_number,
                    "hash_version": CASE_CHAIN_HASH_VERSION,
                    "record_hash": record.record_hash,
                    "previous_record_hash": record.previous_record_hash,
                },
            )

            db.commit()
            db.refresh(record)
            db.refresh(checkpoint)

            return {
                "message": "Integrity record created successfully.",
                "record_id": record.id,
                "evidence_id": record.evidence_id,
                "sha256_hash": record.sha256_hash,
                "previous_record_hash": record.previous_record_hash,
                "record_hash": record.record_hash,
                "recorded_at": timestamp_string(record.recorded_at),
                "chain_id": record.chain_id,
                "sequence_number": record.sequence_number,
                "hash_version": record.hash_version,
                "checkpoint_id": checkpoint.id,
                "checkpoint_version": checkpoint.checkpoint_version,
                "key_id": checkpoint.key_id,
                "signature": checkpoint.signature,
            }

        except HTTPException:
            db.rollback()
            raise
        except SigningConfigurationError as error:
            db.rollback()
            raise HTTPException(
                status_code=503,
                detail="Integrity checkpoint signing is not configured.",
            ) from error
        except _ConcurrentChainHead as error:
            db.rollback()
            if attempt + 1 >= MAX_CHAIN_APPEND_ATTEMPTS:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Integrity chain changed concurrently. "
                        "Retry the request."
                    ),
                ) from error
            time.sleep(0.01 * (attempt + 1))
        except (IntegrityError, OperationalError) as error:
            db.rollback()
            if (
                not _is_retryable_database_conflict(error)
                or attempt + 1 >= MAX_CHAIN_APPEND_ATTEMPTS
            ):
                if _is_retryable_database_conflict(error):
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Integrity chain changed concurrently. "
                            "Retry the request."
                        ),
                    ) from error
                raise HTTPException(
                    status_code=500,
                    detail="Unable to create integrity record.",
                ) from error
            time.sleep(0.01 * (attempt + 1))
        except Exception as error:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail="Unable to create integrity record.",
            ) from error

    raise HTTPException(
        status_code=409,
        detail="Integrity chain changed concurrently. Retry the request.",
    )


@router.get("/evidence/{evidence_id}/records")
def list_integrity_records(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_evidence(
        evidence_id=evidence_id,
        db=db,
        user_id=current_user.id,
    )

    records = (
        db.query(IntegrityRecord)
        .filter(IntegrityRecord.evidence_id == evidence_id)
        .order_by(IntegrityRecord.id.asc())
        .all()
    )

    response_records = []
    for record in records:
        checkpoint = None
        if record.chain_id is not None and record.sequence_number is not None:
            checkpoint = (
                db.query(IntegrityCheckpoint)
                .filter(
                    IntegrityCheckpoint.chain_id == record.chain_id,
                    IntegrityCheckpoint.sequence_number
                    == record.sequence_number,
                )
                .first()
            )

        response_records.append({
            "record_id": record.id,
            "evidence_id": record.evidence_id,
            "sha256_hash": record.sha256_hash,
            "previous_record_hash": record.previous_record_hash,
            "record_hash": record.record_hash,
            "recorded_at": timestamp_string(record.recorded_at),
            "chain_id": record.chain_id,
            "sequence_number": record.sequence_number,
            "hash_version": record.hash_version,
            "checkpoint": (
                {
                    "checkpoint_id": checkpoint.id,
                    "checkpoint_version": checkpoint.checkpoint_version,
                    "key_id": checkpoint.key_id,
                    "signature": checkpoint.signature,
                }
                if checkpoint is not None
                else None
            ),
        })

    return response_records


@router.get("/verify-chain")
def verify_integrity_chain(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    legacy_records_checked, legacy_errors = _verify_legacy_records(
        db,
        owner_id=current_user.id,
    )
    owned_cases = (
        db.query(Case)
        .filter(Case.owner_id == current_user.id)
        .order_by(Case.id.asc())
        .all()
    )

    case_chain_results = []
    checkpoint_results = []
    v2_errors = []
    v2_records_checked = 0
    for case in owned_cases:
        chain = (
            db.query(IntegrityChain)
            .filter(IntegrityChain.case_id == case.id)
            .first()
        )
        checked, errors = _verify_case_chain(
            db,
            case_id=case.id,
            chain=chain,
        )
        checkpoint_verification = _verify_case_checkpoints(
            db,
            case_id=case.id,
            chain=chain,
        )
        if chain is None and checked == 0 and not errors:
            continue

        v2_records_checked += checked
        v2_errors.extend(errors)
        checkpoint_results.append(
            {
                "case_id": case.id,
                "chain_id": chain.id if chain else None,
                **checkpoint_verification,
            }
        )
        case_chain_results.append(
            {
                "chain_id": chain.id if chain else None,
                "case_id": case.id,
                "chain_valid": not errors,
                "records_checked": checked,
                "errors": errors,
                "checkpoint_verification": checkpoint_verification,
            }
        )

    errors = legacy_errors + v2_errors
    legacy_valid = not legacy_errors
    v2_valid = not v2_errors

    return {
        "chain_valid": len(errors) == 0,
        "records_checked": legacy_records_checked + v2_records_checked,
        "errors": errors,
        "message": (
            "Integrity records passed verification."
            if not errors
            else "Integrity-chain inconsistencies were detected."
        ),
        "legacy_chain_valid": legacy_valid,
        "legacy_records_checked": legacy_records_checked,
        "legacy_errors": legacy_errors,
        "v2_chain_valid": v2_valid,
        "v2_records_checked": v2_records_checked,
        "case_chains": case_chain_results,
        "checkpoint_verification": _aggregate_checkpoint_status(
            checkpoint_results
        ),
    }


@router.get("/cases/{case_id}/verify-chain")
def verify_case_integrity_chain(
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
    if case is None:
        raise HTTPException(
            status_code=404,
            detail="Case not found.",
        )

    legacy_records_checked, legacy_errors = _verify_legacy_records(
        db,
        owner_id=current_user.id,
        case_id=case.id,
    )
    chain = (
        db.query(IntegrityChain)
        .filter(IntegrityChain.case_id == case.id)
        .first()
    )
    v2_records_checked, v2_errors = _verify_case_chain(
        db,
        case_id=case.id,
        chain=chain,
    )
    checkpoint_verification = _verify_case_checkpoints(
        db,
        case_id=case.id,
        chain=chain,
    )
    errors = legacy_errors + v2_errors
    legacy_valid = not legacy_errors
    v2_valid = not v2_errors

    return {
        "chain_valid": not errors,
        "records_checked": legacy_records_checked + v2_records_checked,
        "errors": errors,
        "chain_id": chain.id if chain else None,
        "message": (
            "Integrity records passed verification."
            if not errors
            else "Integrity-chain inconsistencies were detected."
        ),
        "legacy_chain_valid": legacy_valid,
        "legacy_records_checked": legacy_records_checked,
        "legacy_errors": legacy_errors,
        "v2_chain_valid": v2_valid,
        "v2_records_checked": v2_records_checked,
        "checkpoint_verification": checkpoint_verification,
        "verification": {
            "legacy": "VALID" if legacy_valid else "INVALID",
            "case_chain_v2": "VALID" if v2_valid else "INVALID",
            "ed25519_checkpoints": checkpoint_verification["status"],
        },
    }