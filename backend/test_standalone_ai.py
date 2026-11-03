"""Tests for the standalone AI prediction API operations."""

import io
import math
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parent
MODEL_ARTIFACTS = (
    "fake_email_detection/fake_email_detection_model.joblib",
    "fake_email_detection/threshold_config.json",
    "phishing_url/phishing_model.joblib",
    "phishing_url/feature_columns.json",
    "fake_profile/fake_profile_model.joblib",
    "fake_profile/fake_profile_feature_columns.json",
    "fake_profile/fake_profile_label_mapping.json",
    "scam_detection/scam_spam_detection_model.joblib",
    "scam_detection/threshold_config.json",
    "apk_static_analysis/apk_malware_model.joblib",
    "apk_static_analysis/feature_columns.json",
    "apk_static_analysis/label_mapping.json",
    "image_forgery/image_forgery_model.keras",
    "image_forgery/threshold_config.json",
    "chat_email_forensics/chat_email_spam_model.joblib",
    "chat_email_forensics/label_mapping.json",
    "credit_card_fraud/credit_card_fraud_model.joblib",
    "credit_card_fraud/feature_columns.json",
    "credit_card_fraud/threshold_config.json",
    "network_intrusion/network_intrusion_model.joblib",
    "network_intrusion/feature_info.json",
    "network_intrusion/model_info.json",
    "server_log_analysis/server_log_analysis_model.joblib",
    "server_log_analysis/feature_info.json",
    "server_log_analysis/model_info.json",
    "server_log_analysis/threshold_config.json",
)
MISSING_MODEL_ARTIFACTS = [
    str(BACKEND_DIR / "models" / artifact)
    for artifact in MODEL_ARTIFACTS
    if not (BACKEND_DIR / "models" / artifact).is_file()
]
if MISSING_MODEL_ARTIFACTS:
    raise unittest.SkipTest(
        "Real model artifacts required for standalone AI tests are missing: "
        + ", ".join(MISSING_MODEL_ARTIFACTS)
    )

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import main
from app.db.database import get_db


EMAIL_TEXT = (
    "From: sender@example.test\n"
    "Subject: Synthetic standalone analysis\n\n"
    "A synthetic message body for local model testing."
)
EML_CONTENT = (
    b"From: sender@example.test\r\n"
    b"To: recipient@example.test\r\n"
    b"Subject: Synthetic standalone EML test\r\n"
    b"MIME-Version: 1.0\r\n"
    b"Content-Type: text/plain; charset=utf-8\r\n"
    b"\r\n"
    b"Synthetic message body for local model testing.\r\n"
)
PROFILE_REQUEST = {
    "username": "synthetic_test_profile",
    "fullname": "Synthetic Test User",
    "description": "Generated standalone prediction test profile",
    "external_url": "",
    "has_profile_picture": True,
    "is_private": False,
    "posts": 3,
    "followers": 17,
    "following": 21,
}


def _image_upload():
    from PIL import Image

    image_buffer = io.BytesIO()
    Image.new("RGB", (160, 160), color=(125, 80, 175)).save(
        image_buffer,
        format="PNG",
    )
    return ("synthetic-test.png", image_buffer.getvalue(), "image/png")


def _network_features():
    features = {feature: 0 for feature in main.network_intrusion_features}
    features.update(
        {
            "protocol_type": "tcp",
            "service": "http",
            "flag": "SF",
        }
    )
    return features


def _valid_payloads():
    return {
        "fake_email": {
            "json": {"email_text": EMAIL_TEXT},
        },
        "phishing_url": {
            "json": {"url": "https://example.test/synthetic"},
        },
        "fake_profile": {
            "json": PROFILE_REQUEST,
        },
        "scam_detection": {
            "json": {"text": "Synthetic message for spam analysis."},
        },
        "chat_email_forensics": {
            "json": {"text": "Synthetic SMS message for classification."},
        },
        "credit_card_fraud": {
            "json": {
                "features": {
                    name: 0.0 for name in main.credit_card_fraud_features
                }
            },
        },
        "network_intrusion": {
            "json": {"features": _network_features()},
        },
        "server_log_analysis": {
            "json": {
                "features": {
                    name: 0.0 for name in main.server_log_features
                }
            },
        },
    }


class StandaloneAIPredictionTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.previous_get_db_override = main.app.dependency_overrides.get(
            get_db
        )

        def unexpected_database_access():
            raise AssertionError(
                "Standalone AI endpoints must not access the database."
            )

        main.app.dependency_overrides[get_db] = unexpected_database_access

    def tearDown(self):
        if self.previous_get_db_override is None:
            main.app.dependency_overrides.pop(get_db, None)
        else:
            main.app.dependency_overrides[get_db] = (
                self.previous_get_db_override
            )
        self.client.close()

    def assert_prediction_response(
        self,
        response,
        *,
        module,
        probability_fields,
        expected_fields=(),
    ):
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["module"], module)
        self.assertIsInstance(body["prediction"], str)
        self.assertTrue(body["prediction"])
        if "class" in body:
            self.assertIs(type(body["class"]), int)
        for field in probability_fields:
            value = body[field]
            self.assertIs(type(value), float, field)
            self.assertTrue(math.isfinite(value), field)
            self.assertGreaterEqual(value, 0.0, field)
            self.assertLessEqual(value, 1.0, field)
        for field in expected_fields:
            self.assertIn(field, body)
        return body

    def test_fake_email_prediction_response(self):
        response = self.client.post(
            "/api/fake-email/predict",
            json={"email_text": EMAIL_TEXT},
        )

        self.assert_prediction_response(
            response,
            module="Fake Email Detection",
            probability_fields=("phishing_probability", "threshold"),
            expected_fields=("warning",),
        )

    def test_fake_email_missing_and_malformed_input(self):
        missing = self.client.post("/api/fake-email/predict", json={})
        wrong_type = self.client.post(
            "/api/fake-email/predict",
            json={"email_text": 123},
        )
        whitespace = self.client.post(
            "/api/fake-email/predict",
            json={"email_text": "   "},
        )

        self.assertEqual(missing.status_code, 422, missing.text)
        self.assertEqual(wrong_type.status_code, 422, wrong_type.text)
        self.assertEqual(whitespace.status_code, 422, whitespace.text)

    def test_fake_email_inference_error_response(self):
        with patch.object(
            main.email_model,
            "predict_proba",
            side_effect=RuntimeError("controlled model failure"),
        ):
            response = self.client.post(
                "/api/fake-email/predict",
                json={"email_text": EMAIL_TEXT},
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(response.json()["detail"], "Email analysis failed.")

    def test_fake_email_eml_response(self):
        response = self.client.post(
            "/api/fake-email/analyze-eml",
            files={"file": ("synthetic.eml", EML_CONTENT, "message/rfc822")},
        )

        body = self.assert_prediction_response(
            response,
            module="Fake Email Detection",
            probability_fields=("phishing_probability", "threshold"),
            expected_fields=("filename", "email_headers", "analysis_scope"),
        )
        self.assertEqual(body["email_headers"]["subject"], "Synthetic standalone EML test")
        self.assertEqual(body["email_headers"]["from"], "sender@example.test")
        self.assertEqual(body["filename"], "synthetic.eml")

    def test_fake_email_eml_missing_and_invalid_uploads(self):
        missing = self.client.post("/api/fake-email/analyze-eml")
        wrong_extension = self.client.post(
            "/api/fake-email/analyze-eml",
            files={"file": ("synthetic.txt", EML_CONTENT, "text/plain")},
        )
        empty = self.client.post(
            "/api/fake-email/analyze-eml",
            files={"file": ("empty.eml", b"", "message/rfc822")},
        )
        no_plain_text = self.client.post(
            "/api/fake-email/analyze-eml",
            files={
                "file": (
                    "html-only.eml",
                    b"Subject: HTML only\r\nContent-Type: text/html\r\n\r\n<b>body</b>",
                    "message/rfc822",
                )
            },
        )

        self.assertEqual(missing.status_code, 422, missing.text)
        self.assertEqual(wrong_extension.status_code, 400, wrong_extension.text)
        self.assertEqual(empty.status_code, 400, empty.text)
        self.assertEqual(no_plain_text.status_code, 400, no_plain_text.text)

    def test_fake_email_eml_inference_error_response(self):
        with patch.object(
            main.email_model,
            "predict_proba",
            side_effect=RuntimeError("controlled model failure"),
        ):
            response = self.client.post(
                "/api/fake-email/analyze-eml",
                files={
                    "file": (
                        "synthetic.eml",
                        EML_CONTENT,
                        "message/rfc822",
                    )
                },
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(response.json()["detail"], "Email analysis failed.")

    def test_phishing_url_prediction_response(self):
        response = self.client.post(
            "/api/phishing-url/predict",
            json={"url": "https://example.test/synthetic"},
        )

        body = self.assert_prediction_response(
            response,
            module="Phishing URL Detection",
            probability_fields=("confidence",),
            expected_fields=("url", "features", "warning"),
        )
        self.assertIsInstance(body["features"], dict)
        self.assertEqual(body["url"], "https://example.test/synthetic")

    def test_phishing_url_missing_and_malformed_input(self):
        missing = self.client.post("/api/phishing-url/predict", json={})
        wrong_type = self.client.post(
            "/api/phishing-url/predict",
            json={"url": []},
        )
        whitespace = self.client.post(
            "/api/phishing-url/predict",
            json={"url": "   "},
        )

        self.assertEqual(missing.status_code, 422, missing.text)
        self.assertEqual(wrong_type.status_code, 422, wrong_type.text)
        self.assertEqual(whitespace.status_code, 422, whitespace.text)

    def test_phishing_url_inference_error_response(self):
        with patch.object(
            main.phishing_url_model,
            "predict",
            side_effect=RuntimeError("controlled model failure"),
        ):
            response = self.client.post(
                "/api/phishing-url/predict",
                json={"url": "https://example.test/synthetic"},
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(
            response.json()["detail"],
            "Phishing URL analysis failed.",
        )

    def test_fake_profile_prediction_response(self):
        response = self.client.post(
            "/api/fake-profile/predict",
            json=PROFILE_REQUEST,
        )

        body = self.assert_prediction_response(
            response,
            module="Fake Social Media Profile Detection",
            probability_fields=("confidence",),
            expected_fields=("username", "features", "warning"),
        )
        self.assertEqual(body["username"], PROFILE_REQUEST["username"])
        self.assertIsInstance(body["features"], dict)

    def test_fake_profile_missing_and_malformed_input(self):
        missing = self.client.post(
            "/api/fake-profile/predict",
            json={"fullname": "Synthetic user"},
        )
        wrong_type = self.client.post(
            "/api/fake-profile/predict",
            json={"username": ["not", "a", "string"]},
        )
        negative_count = self.client.post(
            "/api/fake-profile/predict",
            json={**PROFILE_REQUEST, "followers": -1},
        )

        self.assertEqual(missing.status_code, 422, missing.text)
        self.assertEqual(wrong_type.status_code, 422, wrong_type.text)
        self.assertEqual(negative_count.status_code, 422, negative_count.text)

    def test_fake_profile_inference_error_response(self):
        with patch.object(
            main.profile_model,
            "predict",
            side_effect=RuntimeError("controlled model failure"),
        ):
            response = self.client.post(
                "/api/fake-profile/predict",
                json=PROFILE_REQUEST,
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(response.json()["detail"], "Profile analysis failed.")

    def test_scam_detection_prediction_response(self):
        response = self.client.post(
            "/api/scam-detection/predict",
            json={"text": "Synthetic message for spam analysis."},
        )

        self.assert_prediction_response(
            response,
            module="Scam & Spam Message Detection",
            probability_fields=("spam_probability", "threshold"),
            expected_fields=("warning",),
        )

    def test_scam_detection_missing_and_malformed_input(self):
        missing = self.client.post("/api/scam-detection/predict", json={})
        wrong_type = self.client.post(
            "/api/scam-detection/predict",
            json={"text": {"not": "text"}},
        )
        whitespace = self.client.post(
            "/api/scam-detection/predict",
            json={"text": "  \t "},
        )

        self.assertEqual(missing.status_code, 422, missing.text)
        self.assertEqual(wrong_type.status_code, 422, wrong_type.text)
        self.assertEqual(whitespace.status_code, 422, whitespace.text)

    def test_scam_detection_inference_error_response(self):
        with patch.object(
            main.scam_spam_model,
            "predict_proba",
            side_effect=RuntimeError("controlled model failure"),
        ):
            response = self.client.post(
                "/api/scam-detection/predict",
                json={"text": "Synthetic message for spam analysis."},
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(
            response.json()["detail"],
            "Scam and spam analysis failed.",
        )

    def test_apk_analysis_prediction_response(self):
        extracted_features = {
            feature: 0 for feature in main.apk_feature_columns
        }
        with patch.object(
            main,
            "extract_apk_features",
            return_value=extracted_features,
        ) as extractor:
            response = self.client.post(
                "/api/apk-analysis/predict",
                files={
                    "file": (
                        "synthetic.apk",
                        b"Synthetic APK bytes for a mocked extractor.",
                        "application/vnd.android.package-archive",
                    )
                },
            )

        body = self.assert_prediction_response(
            response,
            module="Android Malware Static Analysis",
            probability_fields=(),
            expected_fields=(
                "filename",
                "class_probabilities",
                "features_extracted",
                "analysis_type",
                "warning",
            ),
        )
        self.assertIsInstance(body["class_probabilities"], dict)
        self.assertEqual(
            set(body["class_probabilities"]),
            {"benign", "malware"},
        )
        for probability in body["class_probabilities"].values():
            self.assertIs(type(probability), float)
            self.assertGreaterEqual(probability, 0.0)
            self.assertLessEqual(probability, 1.0)
        self.assertIs(type(body["features_extracted"]), int)
        self.assertGreater(body["features_extracted"], 0)
        self.assertEqual(body["filename"], "synthetic.apk")
        self.assertEqual(extractor.call_count, 1)
        self.assertFalse(Path(extractor.call_args.args[0]).exists())

    def test_apk_analysis_missing_and_invalid_uploads(self):
        missing = self.client.post("/api/apk-analysis/predict")
        wrong_extension = self.client.post(
            "/api/apk-analysis/predict",
            files={"file": ("synthetic.zip", b"not an APK", "application/zip")},
        )
        empty = self.client.post(
            "/api/apk-analysis/predict",
            files={"file": ("empty.apk", b"", "application/octet-stream")},
        )

        self.assertEqual(missing.status_code, 422, missing.text)
        self.assertEqual(wrong_extension.status_code, 400, wrong_extension.text)
        self.assertEqual(empty.status_code, 400, empty.text)

    def test_apk_analysis_rejects_missing_extracted_features(self):
        with patch.object(main, "extract_apk_features", return_value={}):
            response = self.client.post(
                "/api/apk-analysis/predict",
                files={
                    "file": (
                        "synthetic.apk",
                        b"Synthetic APK bytes.",
                        "application/vnd.android.package-archive",
                    )
                },
            )

        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(
            response.json()["detail"],
            "APK extractor did not return all required model features.",
        )

    def test_apk_analysis_inference_error_response(self):
        with (
            patch.object(
                main,
                "extract_apk_features",
                return_value={
                    feature: 0 for feature in main.apk_feature_columns
                },
            ),
            patch.object(
                main.apk_malware_model,
                "predict",
                side_effect=RuntimeError("controlled model failure"),
            ),
        ):
            response = self.client.post(
                "/api/apk-analysis/predict",
                files={
                    "file": (
                        "synthetic.apk",
                        b"Synthetic APK bytes.",
                        "application/vnd.android.package-archive",
                    )
                },
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(
            response.json()["detail"],
            "APK analysis failed. Check the backend logs.",
        )

    def test_image_forgery_prediction_response(self):
        response = self.client.post(
            "/api/image-forgery/predict",
            files={"file": _image_upload()},
        )

        body = self.assert_prediction_response(
            response,
            module="Image Forgery Detection",
            probability_fields=(
                "tampered_probability",
                "authentic_probability",
                "threshold",
            ),
            expected_fields=(
                "filename",
                "input_size",
                "model",
                "warning",
            ),
        )
        self.assertAlmostEqual(
            body["tampered_probability"] + body["authentic_probability"],
            1.0,
            places=3,
        )
        self.assertIsInstance(body["input_size"], list)

    def test_image_forgery_missing_and_invalid_uploads(self):
        missing = self.client.post("/api/image-forgery/predict")
        wrong_extension = self.client.post(
            "/api/image-forgery/predict",
            files={"file": ("synthetic.gif", b"GIF bytes", "image/gif")},
        )
        invalid_image = self.client.post(
            "/api/image-forgery/predict",
            files={"file": ("not-image.png", b"not a real image", "image/png")},
        )
        empty = self.client.post(
            "/api/image-forgery/predict",
            files={"file": ("empty.png", b"", "image/png")},
        )

        self.assertEqual(missing.status_code, 422, missing.text)
        self.assertEqual(wrong_extension.status_code, 400, wrong_extension.text)
        self.assertEqual(invalid_image.status_code, 400, invalid_image.text)
        self.assertEqual(empty.status_code, 400, empty.text)

    def test_image_forgery_inference_error_response(self):
        with patch.object(
            main.image_forgery_model,
            "predict",
            side_effect=RuntimeError("controlled model failure"),
        ):
            response = self.client.post(
                "/api/image-forgery/predict",
                files={"file": _image_upload()},
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(
            response.json()["detail"],
            "Image forgery analysis failed.",
        )

    def test_chat_email_forensics_prediction_response(self):
        response = self.client.post(
            "/api/chat-email-forensics/predict",
            json={"text": "Synthetic SMS message for classification."},
        )

        body = self.assert_prediction_response(
            response,
            module="Chat & Email Forensics",
            probability_fields=("spam_probability", "ham_probability"),
            expected_fields=("model", "analysis_scope", "warning"),
        )
        self.assertAlmostEqual(
            body["spam_probability"] + body["ham_probability"],
            1.0,
            places=3,
        )

    def test_chat_email_forensics_missing_and_malformed_input(self):
        missing = self.client.post(
            "/api/chat-email-forensics/predict",
            json={},
        )
        wrong_type = self.client.post(
            "/api/chat-email-forensics/predict",
            json={"text": 123},
        )
        whitespace = self.client.post(
            "/api/chat-email-forensics/predict",
            json={"text": " \n "},
        )

        self.assertEqual(missing.status_code, 422, missing.text)
        self.assertEqual(wrong_type.status_code, 422, wrong_type.text)
        self.assertEqual(whitespace.status_code, 422, whitespace.text)

    def test_chat_email_forensics_inference_error_response(self):
        with patch.object(
            main.chat_email_model,
            "predict_proba",
            side_effect=RuntimeError("controlled model failure"),
        ):
            response = self.client.post(
                "/api/chat-email-forensics/predict",
                json={"text": "Synthetic SMS message for classification."},
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(
            response.json()["detail"],
            "Chat and Email analysis failed.",
        )

    def test_credit_card_fraud_prediction_response(self):
        response = self.client.post(
            "/api/credit-card-fraud/predict",
            json=_valid_payloads()["credit_card_fraud"]["json"],
        )

        body = self.assert_prediction_response(
            response,
            module="Credit Card Fraud Detection",
            probability_fields=(
                "fraud_probability",
                "legitimate_probability",
                "threshold",
            ),
            expected_fields=("model", "input_features", "warning"),
        )
        self.assertEqual(body["input_features"], len(main.credit_card_fraud_features))
        self.assertAlmostEqual(
            body["fraud_probability"] + body["legitimate_probability"],
            1.0,
            places=3,
        )

    def test_credit_card_fraud_missing_and_malformed_input(self):
        missing_features = self.client.post(
            "/api/credit-card-fraud/predict",
            json={},
        )
        missing_keys = self.client.post(
            "/api/credit-card-fraud/predict",
            json={"features": {}},
        )
        malformed_value = self.client.post(
            "/api/credit-card-fraud/predict",
            json={
                "features": {
                    **{
                        name: 0.0
                        for name in main.credit_card_fraud_features
                    },
                    main.credit_card_fraud_features[0]: "not numeric",
                }
            },
        )

        self.assertEqual(missing_features.status_code, 422, missing_features.text)
        self.assertEqual(missing_keys.status_code, 422, missing_keys.text)
        self.assertEqual(malformed_value.status_code, 422, malformed_value.text)

    def test_credit_card_fraud_inference_error_response(self):
        with patch.object(
            main.credit_card_fraud_model,
            "predict_proba",
            side_effect=RuntimeError("controlled model failure"),
        ):
            response = self.client.post(
                "/api/credit-card-fraud/predict",
                json=_valid_payloads()["credit_card_fraud"]["json"],
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(
            response.json()["detail"],
            "Credit card fraud analysis failed.",
        )

    def test_network_intrusion_prediction_response(self):
        response = self.client.post(
            "/api/network-intrusion/predict",
            json=_valid_payloads()["network_intrusion"]["json"],
        )

        body = self.assert_prediction_response(
            response,
            module="Network Intrusion Detection",
            probability_fields=(
                "attack_probability",
                "normal_probability",
                "threshold",
            ),
            expected_fields=("model", "input_features", "dataset", "warning"),
        )
        self.assertEqual(body["input_features"], len(main.network_intrusion_features))
        self.assertAlmostEqual(
            body["attack_probability"] + body["normal_probability"],
            1.0,
            places=3,
        )

    def test_network_intrusion_missing_and_malformed_input(self):
        missing_features = self.client.post(
            "/api/network-intrusion/predict",
            json={},
        )
        missing_keys = self.client.post(
            "/api/network-intrusion/predict",
            json={"features": {}},
        )
        malformed_numeric = _network_features()
        malformed_numeric["duration"] = "not numeric"
        invalid_category = _network_features()
        invalid_category["protocol_type"] = ""

        malformed = self.client.post(
            "/api/network-intrusion/predict",
            json={"features": malformed_numeric},
        )
        category = self.client.post(
            "/api/network-intrusion/predict",
            json={"features": invalid_category},
        )

        self.assertEqual(missing_features.status_code, 422, missing_features.text)
        self.assertEqual(missing_keys.status_code, 422, missing_keys.text)
        self.assertEqual(malformed.status_code, 422, malformed.text)
        self.assertEqual(category.status_code, 422, category.text)

    def test_network_intrusion_inference_error_response(self):
        with patch.object(
            main.network_intrusion_model,
            "predict_proba",
            side_effect=RuntimeError("controlled model failure"),
        ):
            response = self.client.post(
                "/api/network-intrusion/predict",
                json=_valid_payloads()["network_intrusion"]["json"],
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(
            response.json()["detail"],
            "Network intrusion prediction failed.",
        )

    def test_server_log_analysis_prediction_response(self):
        response = self.client.post(
            "/api/server-log-analysis/predict",
            json=_valid_payloads()["server_log_analysis"]["json"],
        )

        body = self.assert_prediction_response(
            response,
            module="Server Log Analysis",
            probability_fields=(
                "anomaly_probability",
                "normal_probability",
                "threshold",
            ),
            expected_fields=("model", "input_features", "dataset", "warning"),
        )
        self.assertEqual(body["input_features"], len(main.server_log_features))
        self.assertAlmostEqual(
            body["anomaly_probability"] + body["normal_probability"],
            1.0,
            places=3,
        )

    def test_server_log_analysis_missing_and_malformed_input(self):
        missing_features = self.client.post(
            "/api/server-log-analysis/predict",
            json={},
        )
        missing_keys = self.client.post(
            "/api/server-log-analysis/predict",
            json={"features": {}},
        )
        malformed_value = {
            name: 0.0 for name in main.server_log_features
        }
        malformed_value[main.server_log_features[0]] = "not numeric"
        negative_value = {
            name: 0.0 for name in main.server_log_features
        }
        negative_value[main.server_log_features[0]] = -1

        malformed = self.client.post(
            "/api/server-log-analysis/predict",
            json={"features": malformed_value},
        )
        negative = self.client.post(
            "/api/server-log-analysis/predict",
            json={"features": negative_value},
        )

        self.assertEqual(missing_features.status_code, 422, missing_features.text)
        self.assertEqual(missing_keys.status_code, 422, missing_keys.text)
        self.assertEqual(malformed.status_code, 422, malformed.text)
        self.assertEqual(negative.status_code, 422, negative.text)

    def test_server_log_analysis_inference_error_response(self):
        with patch.object(
            main.server_log_model,
            "predict_proba",
            side_effect=RuntimeError("controlled model failure"),
        ):
            response = self.client.post(
                "/api/server-log-analysis/predict",
                json=_valid_payloads()["server_log_analysis"]["json"],
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertEqual(
            response.json()["detail"],
            "Server log analysis prediction failed.",
        )


if __name__ == "__main__":
    unittest.main()
