"""Ed25519 checkpoint-signing configuration and canonicalization tests."""

import base64
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization


BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.integrity.signing import (
    PRIVATE_KEY_FILE_ENV,
    SIGNATURE_INVALID,
    SIGNATURE_UNKNOWN_KEY,
    SIGNATURE_VALID,
    SigningConfigurationError,
    build_checkpoint_payload,
    canonical_checkpoint_payload,
    sign_checkpoint,
    verify_checkpoint_signature,
)
from integrity_test_helpers import configure_test_signing, restore_test_signing


class IntegrityCheckpointSigningTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory(
            prefix="cyberfusion-ed25519-"
        )
        self.root = Path(self.temp_directory.name).resolve()
        (
            self.previous_signing_environment,
            self.private_key,
            self.private_key_path,
            self.trusted_public_keys_path,
        ) = configure_test_signing(self.root)

    def tearDown(self):
        restore_test_signing(self.previous_signing_environment)
        self.temp_directory.cleanup()

    def _payload(self, *, key_id="integrity-test-key"):
        return build_checkpoint_payload(
            chain_id=8,
            case_id=13,
            sequence_number=2,
            head_record_hash="a" * 64,
            key_id=key_id,
        )

    def test_canonical_json_is_stable_sorted_compact_utf8(self):
        payload = self._payload()
        expected = (
            '{"case_id":13,"chain_id":8,'
            '"checkpoint_version":"ED25519_CASE_CHAIN_CHECKPOINT_V1",'
            '"head_record_hash":"' + "a" * 64 + '","key_id":"integrity-test-key",'
            '"sequence_number":2}'
        ).encode("utf-8")

        self.assertEqual(canonical_checkpoint_payload(payload), expected)

    def test_valid_signature_and_modified_payload(self):
        signed = sign_checkpoint(
            chain_id=8,
            case_id=13,
            sequence_number=2,
            head_record_hash="a" * 64,
        )
        payload = self._payload()
        self.assertEqual(
            verify_checkpoint_signature(payload, signed.signature),
            SIGNATURE_VALID,
        )

        payload["head_record_hash"] = "b" * 64
        self.assertEqual(
            verify_checkpoint_signature(payload, signed.signature),
            SIGNATURE_INVALID,
        )

    def test_invalid_signature_is_rejected(self):
        self.assertEqual(
            verify_checkpoint_signature(
                self._payload(),
                base64.b64encode(b"invalid" * 8).decode("ascii"),
            ),
            SIGNATURE_INVALID,
        )

    def test_unknown_key_id_is_rejected(self):
        payload = self._payload(key_id="unknown-key")
        self.assertEqual(
            verify_checkpoint_signature(payload, "AA=="),
            SIGNATURE_UNKNOWN_KEY,
        )

    def test_missing_private_key_configuration_is_rejected(self):
        os.environ.pop(PRIVATE_KEY_FILE_ENV, None)

        with self.assertRaises(SigningConfigurationError):
            sign_checkpoint(
                chain_id=8,
                case_id=13,
                sequence_number=2,
                head_record_hash="a" * 64,
            )

    def test_mismatched_private_key_and_trusted_public_key_are_rejected(self):
        another_key = Ed25519PrivateKey.generate()
        wrong_public_key = another_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        self.trusted_public_keys_path.write_text(
            json.dumps(
                {
                    "integrity-test-key": base64.b64encode(
                        wrong_public_key
                    ).decode("ascii")
                }
            ),
            encoding="utf-8",
        )

        with self.assertRaises(SigningConfigurationError):
            sign_checkpoint(
                chain_id=8,
                case_id=13,
                sequence_number=2,
                head_record_hash="a" * 64,
            )

    def test_key_rotation_keeps_old_public_key_available(self):
        old_signature = sign_checkpoint(
            chain_id=8,
            case_id=13,
            sequence_number=2,
            head_record_hash="a" * 64,
        )
        old_payload = self._payload()
        rotated_key = Ed25519PrivateKey.generate()
        (
            _,
            _,
            rotated_private_path,
            rotated_trust_path,
        ) = configure_test_signing(
            self.root,
            key_id="integrity-test-key-rotated",
            private_key=rotated_key,
            trusted_keys={
                "integrity-test-key": self.private_key,
                "integrity-test-key-rotated": rotated_key,
            },
        )
        new_signature = sign_checkpoint(
            chain_id=8,
            case_id=13,
            sequence_number=3,
            head_record_hash="c" * 64,
        )
        new_payload = build_checkpoint_payload(
            chain_id=8,
            case_id=13,
            sequence_number=3,
            head_record_hash="c" * 64,
            key_id="integrity-test-key-rotated",
        )

        self.assertEqual(
            verify_checkpoint_signature(old_payload, old_signature.signature),
            SIGNATURE_VALID,
        )
        self.assertEqual(
            verify_checkpoint_signature(new_payload, new_signature.signature),
            SIGNATURE_VALID,
        )
        self.assertTrue(rotated_private_path.is_file())
        self.assertTrue(rotated_trust_path.is_file())

    def test_invalid_trusted_public_key_configuration_is_rejected(self):
        self.trusted_public_keys_path.write_text(
            '{"integrity-test-key":"not-base64!"}',
            encoding="utf-8",
        )

        with self.assertRaises(SigningConfigurationError):
            sign_checkpoint(
                chain_id=8,
                case_id=13,
                sequence_number=2,
                head_record_hash="a" * 64,
            )

    def test_private_key_file_with_broad_posix_permissions_is_rejected(self):
        if os.name == "nt":
            self.skipTest("Windows file access is controlled with ACLs.")
        self.private_key_path.chmod(0o644)

        with self.assertRaises(SigningConfigurationError):
            sign_checkpoint(
                chain_id=8,
                case_id=13,
                sequence_number=2,
                head_record_hash="a" * 64,
            )


if __name__ == "__main__":
    unittest.main()
