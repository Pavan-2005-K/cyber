"""Helpers for isolated Ed25519 configuration in integrity tests."""

import base64
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.integrity.signing import (
    KEY_ID_ENV,
    PRIVATE_KEY_FILE_ENV,
    TRUSTED_PUBLIC_KEYS_FILE_ENV,
)


def configure_test_signing(
    directory: Path,
    *,
    key_id: str = "integrity-test-key",
    private_key: Ed25519PrivateKey | None = None,
    trusted_keys: dict[str, Ed25519PrivateKey] | None = None,
) -> tuple[dict[str, str | None], Ed25519PrivateKey, Path, Path]:
    environment_names = (
        PRIVATE_KEY_FILE_ENV,
        KEY_ID_ENV,
        TRUSTED_PUBLIC_KEYS_FILE_ENV,
    )
    previous_environment = {
        name: os.environ.get(name) for name in environment_names
    }

    active_key = private_key or Ed25519PrivateKey.generate()
    trusted_private_keys = trusted_keys or {key_id: active_key}
    private_path = directory / "signing" / "active-private.pem"
    trusted_path = directory / "signing" / "trusted-public-keys.json"
    private_path.parent.mkdir(parents=True, exist_ok=True)
    private_path.write_bytes(
        active_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    private_path.chmod(0o600)

    encoded_public_keys = {}
    for trusted_key_id, trusted_private_key in trusted_private_keys.items():
        raw_public_key = trusted_private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        encoded_public_keys[trusted_key_id] = base64.b64encode(
            raw_public_key
        ).decode("ascii")
    trusted_path.write_text(
        json.dumps(encoded_public_keys),
        encoding="utf-8",
    )

    os.environ[PRIVATE_KEY_FILE_ENV] = str(private_path.resolve())
    os.environ[KEY_ID_ENV] = key_id
    os.environ[TRUSTED_PUBLIC_KEYS_FILE_ENV] = str(trusted_path.resolve())
    return previous_environment, active_key, private_path, trusted_path


def restore_test_signing(
    previous_environment: dict[str, str | None],
) -> None:
    for name, value in previous_environment.items():
        if value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = value
