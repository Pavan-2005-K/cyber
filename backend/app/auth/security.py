import os
import secrets
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
import jwt
from pwdlib import PasswordHash

# Load environment variables before reading the JWT secret.
load_dotenv()

password_hash = PasswordHash.recommended()

JWT_SECRET_KEY = os.getenv("CYBERFUSION_JWT_SECRET")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_access_token(subject: str, role: str) -> str:
    if not JWT_SECRET_KEY:
        raise RuntimeError(
            "CYBERFUSION_JWT_SECRET environment variable is not configured."
        )

    now = datetime.now(timezone.utc)

    payload = {
        "sub": subject,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": secrets.token_urlsafe(16),
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict:
    if not JWT_SECRET_KEY:
        raise RuntimeError(
            "CYBERFUSION_JWT_SECRET environment variable is not configured."
        )

    return jwt.decode(
        token,
        JWT_SECRET_KEY,
        algorithms=[JWT_ALGORITHM],
        options={"require": ["sub", "iat", "exp", "jti"]},
    )