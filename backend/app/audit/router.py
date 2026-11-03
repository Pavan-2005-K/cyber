
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.router import get_current_user
from app.db.database import get_db
from app.db.models import AuditLog, User


router = APIRouter(
    prefix="/api/audit",
    tags=["Audit Logs"],
)


@router.get("/logs")
def list_audit_logs(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        query = db.query(AuditLog)

        # Investigators can view only their own audit events.
        query = query.filter(AuditLog.user_id == current_user.id)

        total = query.count()

        logs = (
            query
            .order_by(AuditLog.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        results = []

        for log in logs:
            try:
                details = json.loads(log.details) if log.details else {}
            except (json.JSONDecodeError, TypeError):
                details = {"message": "Audit details could not be parsed."}

            results.append({
                "id": log.id,
                "user_id": log.user_id,
                "action": log.action,
                "details": details,
                "created_at": (
                    log.created_at.isoformat()
                    if log.created_at
                    else None
                ),
            })

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "logs": results,
        }

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve audit logs.",
        )
