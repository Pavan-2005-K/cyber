from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.router import get_current_user
from app.db.audit import log_audit_event
from app.db.database import get_db
from app.db.models import Case, User


router = APIRouter(prefix="/api/cases", tags=["Case Management"])


class CaseCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=2000)


class CaseResponse(BaseModel):
    id: int
    case_number: str
    title: str
    description: str
    status: str
    owner_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post(
    "",
    response_model=CaseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_case(
    data: CaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = Case(
        case_number=f"CF-{uuid4().hex[:10].upper()}",
        title=data.title.strip(),
        description=data.description.strip(),
        status="OPEN",
        owner_id=current_user.id,
    )

    try:
        db.add(case)
        db.flush()

        log_audit_event(
            db=db,
            user_id=current_user.id,
            action="CASE_CREATED",
            details={
                "case_id": case.id,
                "case_number": case.case_number,
                "title": case.title,
                "status": case.status,
            },
        )

        db.commit()
        db.refresh(case)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create the case.",
        )

    return case


@router.get("", response_model=list[CaseResponse])
def list_cases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Case)
        .filter(Case.owner_id == current_user.id)
        .order_by(Case.created_at.desc())
        .all()
    )
