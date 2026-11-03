"""Ed25519 signing for canonical per-case integrity checkpoints."""

import base64
import json
import os
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)


CHECKPOINT_VERSION = "ED25519_CASE_CHAIN_CHECKPOINT_V1"
PRIVATE_KEY_FILE_ENV = "CYBERFUSION_INTEGRITY_PRIVATE_KEY_FILE"
KEY_ID_ENV = "CYBERFUSION_INTEGRITY_KEY_ID"
TRUSTED_PUBLIC_KEYS_FILE_ENV = "CYBERFUSION_INTEGRITY_TRUSTED_PUBLIC_KEYS_FILE"
SIGNATURE_VALID = "VALID"
SIGNATURE_INVALID = "INVALID_SIGNATURE"
SIGNATURE_UNKNOWN_KEY = "UNKNOWN_KEY_ID"

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class SigningConfigurationError(RuntimeError):
    """Raised when signing or trusted-key configuration is invalid."""


@dataclass(frozen=True)
class SignedCheckpoint:
    checkpoint_version: str
    key_id: str
    signature: str


def build_checkpoint_payload(
    *,
    chain_id: int,
    case_id: int,
    sequence_number: int,
    head_record_hash: str,
    key_id: str,
) -> dict[str, int | str]:
    return {
        "chain_id": chain_id,
        "case_id": case_id,
        "sequence_number": sequence_number,
        "head_record_hash": head_record_hash,
        "checkpoint_version": CHECKPOINT_VERSION,
        "key_id": key_id,
    }


def canonical_checkpoint_payload(payload: Mapping[str, object]) -> bytes:
    required_fields = {
        "chain_id",
        "case_id",
        "sequence_number",
        "head_record_hash",
        "checkpoint_version",
        "key_id",
    }
    if set(payload) != required_fields:
        raise ValueError("Invalid checkpoint payload fields.")
    if payload["checkpoint_version"] != CHECKPOINT_VERSION:
        raise ValueError("Unsupported checkpoint version.")
    if (
        not isinstance(payload["chain_id"], int)
        or not isinstance(payload["case_id"], int)
        or not isinstance(payload["sequence_number"], int)
        or not isinstance(payload["head_record_hash"], str)
        or not isinstance(payload["key_id"], str)
    ):
        raise ValueError("Invalid checkpoint payload values.")

    try:
        return json.dumps(
            dict(payload),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError, UnicodeEncodeError) as error:
        raise ValueError("Checkpoint payload cannot be serialized.") from error


def _configured_external_path(environment_variable: str) -> Path:
    configured_path = os.getenv(environment_variable, "").strip()
    if not configured_path:
        raise SigningConfigurationError(
            f"{environment_variable} is not configured."
        )

    path = Path(configured_path).expanduser()
    if not path.is_absolute():
        raise SigningConfigurationError(
            f"{environment_variable} must be an absolute path."
        )

    try:
        resolved_path = path.resolve(strict=True)
    except OSError:
        raise SigningConfigurationError(
            f"{environment_variable} does not identify a readable file."
        ) from None

    if resolved_path.is_relative_to(PROJECT_ROOT):
        raise SigningConfigurationError(
            f"{environment_variable} must point outside the project repository."
        )
    if not resolved_path.is_file():
        raise SigningConfigurationError(
            f"{environment_variable} must point to a file."
        )

    return resolved_path


def load_trusted_public_keys() -> dict[str, Ed25519PublicKey]:
    path = _configured_external_path(TRUSTED_PUBLIC_KEYS_FILE_ENV)
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        raise SigningConfigurationError(
            "Trusted Ed25519 public-key configuration is invalid."
        ) from None

    if not isinstance(document, dict) or not document:
        raise SigningConfigurationError(
            "Trusted Ed25519 public-key configuration must be a non-empty object."
        )

    public_keys = {}
    for key_id, encoded_key in document.items():
        if (
            not isinstance(key_id, str)
            or not key_id
            or len(key_id) > 128
            or not isinstance(encoded_key, str)
        ):
            raise SigningConfigurationError(
                "Trusted Ed25519 public-key configuration is invalid."
            )
        try:
            raw_key = base64.b64decode(encoded_key, validate=True)
            public_keys[key_id] = Ed25519PublicKey.from_public_bytes(raw_key)
        except (ValueError, TypeError):
            raise SigningConfigurationError(
                f"Trusted Ed25519 public key for key ID '{key_id}' is invalid."
            ) from None

    return public_keys


def _load_private_key(path: Path) -> Ed25519PrivateKey:
    if os.name != "nt":
        try:
            permissions = stat.S_IMODE(path.stat().st_mode)
        except OSError:
            raise SigningConfigurationError(
                "The Ed25519 private-key file cannot be accessed."
            ) from None
        if permissions & 0o077:
            raise SigningConfigurationError(
                "The Ed25519 private-key file permissions must be restricted to its owner."
            )

    try:
        loaded_key = serialization.load_pem_private_key(
            path.read_bytes(),
            password=None,
        )
    except (OSError, TypeError, ValueError, UnsupportedAlgorithm):
        raise SigningConfigurationError(
            "The Ed25519 private-key file is invalid or unreadable."
        ) from None

    if not isinstance(loaded_key, Ed25519PrivateKey):
        raise SigningConfigurationError(
            "The configured private key is not an Ed25519 key."
        )
    return loaded_key


def _load_active_signing_key() -> tuple[str, Ed25519PrivateKey]:
    key_id = os.getenv(KEY_ID_ENV, "").strip()
    if not key_id or len(key_id) > 128:
        raise SigningConfigurationError(
            f"{KEY_ID_ENV} is not configured with a valid key ID."
        )

    private_key_path = _configured_external_path(PRIVATE_KEY_FILE_ENV)
    trusted_public_keys = load_trusted_public_keys()
    private_key = _load_private_key(private_key_path)
    trusted_public_key = trusted_public_keys.get(key_id)
    if trusted_public_key is None:
        raise SigningConfigurationError(
            f"The active key ID '{key_id}' is not in the trusted public-key configuration."
        )

    derived_public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    trusted_public_bytes = trusted_public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    if derived_public_key != trusted_public_bytes:
        raise SigningConfigurationError(
            "The configured private key does not match its trusted public key."
        )

    return key_id, private_key


def sign_checkpoint(
    *,
    chain_id: int,
    case_id: int,
    sequence_number: int,
    head_record_hash: str,
) -> SignedCheckpoint:
    key_id, private_key = _load_active_signing_key()
    payload = build_checkpoint_payload(
        chain_id=chain_id,
        case_id=case_id,
        sequence_number=sequence_number,
        head_record_hash=head_record_hash,
        key_id=key_id,
    )
    signature = private_key.sign(canonical_checkpoint_payload(payload))
    return SignedCheckpoint(
        checkpoint_version=CHECKPOINT_VERSION,
        key_id=key_id,
        signature=base64.b64encode(signature).decode("ascii"),
    )


def verify_checkpoint_signature(
    payload: Mapping[str, object],
    signature: str,
    trusted_public_keys: Mapping[str, Ed25519PublicKey] | None = None,
) -> str:
    try:
        canonical_payload = canonical_checkpoint_payload(payload)
        key_id = payload["key_id"]
        if not isinstance(key_id, str):
            return SIGNATURE_INVALID
    except ValueError:
        return SIGNATURE_INVALID

    if trusted_public_keys is None:
        trusted_public_keys = load_trusted_public_keys()
    public_key = trusted_public_keys.get(key_id)
    if public_key is None:
        return SIGNATURE_UNKNOWN_KEY

    try:
        signature_bytes = base64.b64decode(signature, validate=True)
        public_key.verify(signature_bytes, canonical_payload)
    except (InvalidSignature, ValueError, TypeError):
        return SIGNATURE_INVALID

    return SIGNATURE_VALID
