"""Authentication API tests using an isolated in-memory database."""

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile
import unittest

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_DIR = Path(__file__).resolve().parent
os.environ.setdefault(
    "CYBERFUSION_JWT_SECRET",
    "authentication-tests-only-secret",
)
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main
from app.auth.security import (
    JWT_ALGORITHM,
    JWT_SECRET_KEY,
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.database import Base, get_db
from app.db.models import AuditLog, RevokedAccessToken, User
from app.db.migrations.v002_revoked_access_tokens import upgrade


class AuthenticationEndpointTests(unittest.TestCase):
    password = "test-password-long-enough"

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
        )

        with self.session_factory() as session:
            password_hash = hash_password(self.password)
            self.active_user = User(
                username="auth_test_user",
                email="auth-test@example.test",
                password_hash=password_hash,
                role="INVESTIGATOR",
                is_active=True,
            )
            self.inactive_user = User(
                username="auth_test_inactive",
                email="inactive-auth-test@example.test",
                password_hash=password_hash,
                role="INVESTIGATOR",
                is_active=False,
            )
            self.other_user = User(
                username="auth_test_other_user",
                email="other-auth-test@example.test",
                password_hash=password_hash,
                role="INVESTIGATOR",
                is_active=True,
            )
            session.add_all(
                [self.active_user, self.inactive_user, self.other_user]
            )
            session.commit()
            self.active_user_id = self.active_user.id
            self.other_user_id = self.other_user.id

        def override_get_db():
            session = self.session_factory()
            try:
                yield session
            finally:
                session.close()

        self.get_db_override = override_get_db
        main.app.dependency_overrides[get_db] = self.get_db_override
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.pop(get_db, None)
        self.engine.dispose()

    def test_successful_registration(self):
        response = self.client.post(
            "/api/auth/register",
            json={
                "username": "new_auth_user",
                "email": "new-auth-user@example.test",
                "password": self.password,
            },
        )

        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual(body["user"]["username"], "new_auth_user")
        self.assertEqual(body["user"]["email"], "new-auth-user@example.test")
        self.assertEqual(body["user"]["role"], "INVESTIGATOR")

        with self.session_factory() as session:
            user = (
                session.query(User)
                .filter(User.email == "new-auth-user@example.test")
                .one()
            )
            self.assertNotEqual(user.password_hash, self.password)
            self.assertTrue(verify_password(self.password, user.password_hash))
            audit = (
                session.query(AuditLog)
                .filter(
                    AuditLog.user_id == user.id,
                    AuditLog.action == "USER_REGISTERED",
                )
                .one()
            )
            self.assertIsNotNone(audit)

    def test_duplicate_email_registration(self):
        response = self.client.post(
            "/api/auth/register",
            json={
                "username": "another_auth_user",
                "email": "auth-test@example.test",
                "password": self.password,
            },
        )

        self.assertEqual(response.status_code, 409, response.text)

    def test_successful_login(self):
        response = self.client.post(
            "/api/auth/login",
            json={
                "username_or_email": "auth-test@example.test",
                "password": self.password,
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["token_type"], "bearer")
        self.assertEqual(body["expires_in"], 1800)
        self.assertTrue(body["access_token"])
        payload = jwt.decode(
            body["access_token"],
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
        self.assertTrue(payload["jti"])

    def test_login_with_incorrect_password(self):
        response = self.client.post(
            "/api/auth/login",
            json={
                "username_or_email": "auth-test@example.test",
                "password": "incorrect-password",
            },
        )

        self.assertEqual(response.status_code, 401, response.text)

    def test_login_with_nonexistent_email(self):
        response = self.client.post(
            "/api/auth/login",
            json={
                "username_or_email": "missing-auth-user@example.test",
                "password": self.password,
            },
        )

        self.assertEqual(response.status_code, 401, response.text)

    def test_inactive_user_login(self):
        response = self.client.post(
            "/api/auth/login",
            json={
                "username_or_email": "inactive-auth-test@example.test",
                "password": self.password,
            },
        )

        self.assertEqual(response.status_code, 401, response.text)

    def test_get_me_with_valid_token(self):
        response = self.client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {self._token()}"},
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["id"], self.active_user_id)
        self.assertEqual(response.json()["email"], "auth-test@example.test")

    def test_get_me_without_token(self):
        response = self.client.get("/api/auth/me")

        self.assertEqual(response.status_code, 401, response.text)

    def test_get_me_with_invalid_token(self):
        response = self.client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer not-a-valid-token"},
        )

        self.assertEqual(response.status_code, 401, response.text)

    def test_protected_endpoint_rejects_expired_token(self):
        now = datetime.now(timezone.utc)
        expired_token = jwt.encode(
            {
                "sub": str(self.active_user_id),
                "role": "INVESTIGATOR",
                "iat": now - timedelta(minutes=2),
                "exp": now - timedelta(minutes=1),
                "jti": secrets.token_urlsafe(16),
            },
            JWT_SECRET_KEY,
            algorithm=JWT_ALGORITHM,
        )

        response = self.client.get(
            "/api/cases",
            headers={"Authorization": f"Bearer {expired_token}"},
        )

        self.assertEqual(response.status_code, 401, response.text)

    def test_successful_logout_revokes_token(self):
        token = self._token()
        response = self.client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json()["message"],
            "Logged out successfully",
        )
        protected_response = self.client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(protected_response.status_code, 401)

        with self.session_factory() as session:
            self.assertEqual(session.query(RevokedAccessToken).count(), 1)

    def test_revoking_one_users_token_does_not_affect_another_user(self):
        active_token = self._token()
        other_token = self._token(self.other_user_id)

        logout_response = self.client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {active_token}"},
        )
        other_response = self.client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {other_token}"},
        )

        self.assertEqual(logout_response.status_code, 200, logout_response.text)
        self.assertEqual(other_response.status_code, 200, other_response.text)
        self.assertEqual(other_response.json()["id"], self.other_user_id)

    def test_duplicate_logout_is_rejected_without_duplicate_records(self):
        token = self._token()
        headers = {"Authorization": f"Bearer {token}"}

        first_response = self.client.post("/api/auth/logout", headers=headers)
        duplicate_response = self.client.post("/api/auth/logout", headers=headers)

        self.assertEqual(first_response.status_code, 200, first_response.text)
        self.assertEqual(duplicate_response.status_code, 401)
        with self.session_factory() as session:
            self.assertEqual(session.query(RevokedAccessToken).count(), 1)

    def test_revocation_migration_preserves_existing_data_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "existing.db"
            connection = sqlite3.connect(database_path)
            try:
                connection.execute(
                    """
                    CREATE TABLE users (
                        id INTEGER PRIMARY KEY,
                        username TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    "INSERT INTO users (id, username) VALUES (1, 'existing')"
                )
                connection.commit()
            finally:
                connection.close()

            self.assertTrue(upgrade(database_path))
            self.assertFalse(upgrade(database_path))

            connection = sqlite3.connect(database_path)
            try:
                existing_user = connection.execute(
                    "SELECT username FROM users WHERE id = 1"
                ).fetchone()
                revocation_table = connection.execute(
                    """
                    SELECT name FROM sqlite_master
                    WHERE type = 'table' AND name = 'revoked_access_tokens'
                    """
                ).fetchone()
            finally:
                connection.close()

            self.assertEqual(existing_user, ("existing",))
            self.assertIsNotNone(revocation_table)

    def _token(self, user_id=None):
        return create_access_token(
            subject=str(user_id or self.active_user_id),
            role="INVESTIGATOR",
        )


if __name__ == "__main__":
    unittest.main()
