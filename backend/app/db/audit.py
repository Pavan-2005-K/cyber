
import json

from sqlalchemy.orm import Session

from app.db.models import AuditLog


def log_audit_event(
    db: Session,
    action: str,
    user_id: int | None = None,
    details: dict | None = None,
) -> None:
    """Add an audit event to the current database transaction."""
    entry = AuditLog(
        user_id=user_id,
        action=action,
        details=json.dumps(details or {}, sort_keys=True),
    )
    db.add(entry)
