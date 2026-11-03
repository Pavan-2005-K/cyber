
from datetime import datetime, timezone
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)
from app.db.audit import log_audit_event
from app.db.database import get_db
from app.db.models import RevokedAccessToken, User
from app.rate_limiter import limiter

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
bearer_scheme = HTTPBearer(auto_error=False)


class RegisterRequest(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=50,
        pattern=r"^[a-zA-Z0-9_.-]+$",
    )
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    username_or_email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


def get_current_token_payload(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
        int(payload["sub"])
        token_id = payload["jti"]
        if not isinstance(token_id, str) or not token_id:
            raise ValueError("Invalid token identifier")
    except (jwt.InvalidTokenError, ValueError, KeyError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    revoked_token = (
        db.query(RevokedAccessToken.id)
        .filter(RevokedAccessToken.jti == token_id)
        .first()
    )
    if revoked_token is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Revoked access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


def get_current_user(
    payload: Annotated[dict, Depends(get_current_token_payload)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    user_id = int(payload["sub"])
    user = db.get(User, user_id)

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive account",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


@router.post("/logout")
def logout(
    payload: Annotated[dict, Depends(get_current_token_payload)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    revoked_token = RevokedAccessToken(
        jti=payload["jti"],
        user_id=current_user.id,
        expires_at=datetime.fromtimestamp(payload["exp"], timezone.utc),
    )
    db.add(revoked_token)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing_revocation = (
            db.query(RevokedAccessToken.id)
            .filter(
                RevokedAccessToken.jti == payload["jti"],
                RevokedAccessToken.user_id == current_user.id,
            )
            .first()
        )
        if existing_revocation is None:
            raise

    return {"message": "Logged out successfully"}


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(
    data: RegisterRequest,
    db: Annotated[Session, Depends(get_db)],
):
    username = data.username.strip()
    email = data.email.strip().lower()

    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a valid email address",
        )

    existing_user = db.query(User).filter(
        or_(
            User.username == username,
            User.email == email,
        )
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email is already registered",
        )

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(data.password),
        role="INVESTIGATOR",
        is_active=True,
    )

    try:
        db.add(user)
        db.flush()

        log_audit_event(
            db=db,
            user_id=user.id,
            action="USER_REGISTERED",
            details={
                "user_id": user.id,
                "role": user.role,
            },
        )

        db.commit()
        db.refresh(user)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create account",
        )

    return {
        "message": "Account created successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
        },
    }


@router.post("/login")
@limiter.limit("5/minute")
def login(
    request: Request,
    data: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
):
    identifier = data.username_or_email.strip()

    user = db.query(User).filter(
        or_(
            User.username == identifier,
            User.email == identifier.lower(),
        )
    ).first()

    if (
        user is None
        or not verify_password(data.password, user.password_hash)
        or not user.is_active
    ):
        log_audit_event(
            db=db,
            action="LOGIN_FAILED",
            details={
                "reason": "Invalid credentials or inactive account",
            },
        )

        try:
            db.commit()
        except Exception:
            db.rollback()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        log_audit_event(
            db=db,
            user_id=user.id,
            action="LOGIN_SUCCESS",
            details={
                "user_id": user.id,
                "role": user.role,
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to record login event",
        )

    token = create_access_token(
        subject=str(user.id),
        role=user.role,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 1800,
    }


@router.get("/me")
def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "is_active": current_user.is_active,
    }
