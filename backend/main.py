from pathlib import Path
from io import BytesIO
import json
import os
import tempfile
from email import policy
from email.parser import BytesParser
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.auth.router import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.findings.service import save_detection_finding
import joblib
import numpy as np
import pandas as pd
import tensorflow as tf
from PIL import Image, UnidentifiedImageError
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input

from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from phishing_features import extract_url_features
from profile_features import extract_profile_features
from apk_features import extract_apk_features

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.rate_limiter import limiter

# =========================================================
# BACKEND PATHS
# =========================================================

BASE_DIR = Path(__file__).resolve().parent

EMAIL_MODEL_DIR = BASE_DIR / "models" / "fake_email_detection"
EMAIL_MODEL_PATH = EMAIL_MODEL_DIR / "fake_email_detection_model.joblib"
EMAIL_THRESHOLD_PATH = EMAIL_MODEL_DIR / "threshold_config.json"

PHISHING_MODEL_DIR = BASE_DIR / "models" / "phishing_url"
PHISHING_MODEL_PATH = PHISHING_MODEL_DIR / "phishing_model.joblib"
PHISHING_FEATURES_PATH = PHISHING_MODEL_DIR / "feature_columns.json"

PROFILE_MODEL_DIR = BASE_DIR / "models" / "fake_profile"
PROFILE_MODEL_PATH = PROFILE_MODEL_DIR / "fake_profile_model.joblib"
PROFILE_FEATURES_PATH = PROFILE_MODEL_DIR / "fake_profile_feature_columns.json"
PROFILE_LABELS_PATH = PROFILE_MODEL_DIR / "fake_profile_label_mapping.json"

SCAM_MODEL_DIR = BASE_DIR / "models" / "scam_detection"
SCAM_MODEL_PATH = SCAM_MODEL_DIR / "scam_spam_detection_model.joblib"
SCAM_THRESHOLD_PATH = SCAM_MODEL_DIR / "threshold_config.json"

APK_MODEL_DIR = BASE_DIR / "models" / "apk_static_analysis"
APK_MODEL_PATH = APK_MODEL_DIR / "apk_malware_model.joblib"
APK_FEATURES_PATH = APK_MODEL_DIR / "feature_columns.json"
APK_LABELS_PATH = APK_MODEL_DIR / "label_mapping.json"

IMAGE_FORGERY_MODEL_DIR = BASE_DIR / "models" / "image_forgery"
IMAGE_FORGERY_MODEL_PATH = IMAGE_FORGERY_MODEL_DIR / "image_forgery_model.keras"
IMAGE_FORGERY_CONFIG_PATH = IMAGE_FORGERY_MODEL_DIR / "threshold_config.json"

CHAT_EMAIL_MODEL_DIR = BASE_DIR / "models" / "chat_email_forensics"
CHAT_EMAIL_MODEL_PATH = CHAT_EMAIL_MODEL_DIR / "chat_email_spam_model.joblib"
CHAT_EMAIL_LABELS_PATH = CHAT_EMAIL_MODEL_DIR / "label_mapping.json"

CREDIT_CARD_FRAUD_DIR = BASE_DIR / "models" / "credit_card_fraud"
CREDIT_CARD_FRAUD_MODEL_PATH = (
    CREDIT_CARD_FRAUD_DIR / "credit_card_fraud_model.joblib"
)
CREDIT_CARD_FRAUD_FEATURES_PATH = (
    CREDIT_CARD_FRAUD_DIR / "feature_columns.json"
)
CREDIT_CARD_FRAUD_THRESHOLD_PATH = (
    CREDIT_CARD_FRAUD_DIR / "threshold_config.json"
)

# Network Intrusion Detection
NETWORK_INTRUSION_DIR = BASE_DIR / "models" / "network_intrusion"
NETWORK_INTRUSION_MODEL_PATH = (
    NETWORK_INTRUSION_DIR / "network_intrusion_model.joblib"
)
NETWORK_INTRUSION_FEATURES_PATH = (
    NETWORK_INTRUSION_DIR / "feature_info.json"
)
NETWORK_INTRUSION_INFO_PATH = (
    NETWORK_INTRUSION_DIR / "model_info.json"
)

# Server Log Analysis
SERVER_LOG_DIR = BASE_DIR / "models" / "server_log_analysis"

SERVER_LOG_MODEL_PATH = (
    SERVER_LOG_DIR / "server_log_analysis_model.joblib"
)

SERVER_LOG_FEATURES_PATH = (
    SERVER_LOG_DIR / "feature_info.json"
)

SERVER_LOG_INFO_PATH = (
    SERVER_LOG_DIR / "model_info.json"
)

SERVER_LOG_THRESHOLD_PATH = (
    SERVER_LOG_DIR / "threshold_config.json"
)
# =========================================================
# LOAD FAKE EMAIL MODEL
# =========================================================

if not EMAIL_MODEL_PATH.is_file():
    raise FileNotFoundError(f"Email model not found: {EMAIL_MODEL_PATH}")

if not EMAIL_THRESHOLD_PATH.is_file():
    raise FileNotFoundError(
        f"Email threshold configuration not found: {EMAIL_THRESHOLD_PATH}"
    )

email_model = joblib.load(EMAIL_MODEL_PATH)

with EMAIL_THRESHOLD_PATH.open("r", encoding="utf-8") as file:
    threshold_config = json.load(file)

EMAIL_PHISHING_THRESHOLD = float(threshold_config["threshold"])


# =========================================================
# LOAD PHISHING URL MODEL
# =========================================================

if not PHISHING_MODEL_PATH.is_file():
    raise FileNotFoundError(f"Phishing URL model not found: {PHISHING_MODEL_PATH}")

if not PHISHING_FEATURES_PATH.is_file():
    raise FileNotFoundError(
        f"Phishing URL feature configuration not found: {PHISHING_FEATURES_PATH}"
    )

phishing_url_model = joblib.load(PHISHING_MODEL_PATH)

with PHISHING_FEATURES_PATH.open("r", encoding="utf-8") as file:
    phishing_feature_columns = json.load(file)

if list(phishing_url_model.feature_names_in_) != phishing_feature_columns:
    raise RuntimeError(
        "Phishing model feature names do not match feature_columns.json."
    )


# =========================================================
# LOAD FAKE PROFILE MODEL
# =========================================================

if not PROFILE_MODEL_PATH.is_file():
    raise FileNotFoundError(f"Profile model not found: {PROFILE_MODEL_PATH}")

if not PROFILE_FEATURES_PATH.is_file():
    raise FileNotFoundError(
        f"Profile feature configuration not found: {PROFILE_FEATURES_PATH}"
    )

if not PROFILE_LABELS_PATH.is_file():
    raise FileNotFoundError(
        f"Profile label mapping not found: {PROFILE_LABELS_PATH}"
    )

profile_model = joblib.load(PROFILE_MODEL_PATH)

with PROFILE_FEATURES_PATH.open("r", encoding="utf-8") as file:
    profile_feature_columns = json.load(file)

with PROFILE_LABELS_PATH.open("r", encoding="utf-8") as file:
    profile_label_mapping = json.load(file)

if list(profile_model.feature_names_in_) != profile_feature_columns:
    raise RuntimeError(
        "Profile model feature names do not match "
        "fake_profile_feature_columns.json."
    )



# =========================================================
# LOAD SCAM & SPAM MODEL
# =========================================================

if not SCAM_MODEL_PATH.is_file():
    raise FileNotFoundError(f"Scam & Spam model not found: {SCAM_MODEL_PATH}")

if not SCAM_THRESHOLD_PATH.is_file():
    raise FileNotFoundError(
        f"Scam & Spam threshold configuration not found: {SCAM_THRESHOLD_PATH}"
    )

scam_spam_model = joblib.load(SCAM_MODEL_PATH)

with SCAM_THRESHOLD_PATH.open("r", encoding="utf-8") as file:
    scam_threshold_config = json.load(file)

SCAM_SPAM_THRESHOLD = float(scam_threshold_config["threshold"])


# =========================================================
# LOAD APK MALWARE MODEL
# =========================================================

if not APK_MODEL_PATH.is_file():
    raise FileNotFoundError(f"APK model not found: {APK_MODEL_PATH}")

if not APK_FEATURES_PATH.is_file():
    raise FileNotFoundError(
        f"APK feature configuration not found: {APK_FEATURES_PATH}"
    )

if not APK_LABELS_PATH.is_file():
    raise FileNotFoundError(
        f"APK label mapping not found: {APK_LABELS_PATH}"
    )

apk_malware_model = joblib.load(APK_MODEL_PATH)

with APK_FEATURES_PATH.open("r", encoding="utf-8") as file:
    apk_feature_columns = json.load(file)

with APK_LABELS_PATH.open("r", encoding="utf-8") as file:
    apk_label_mapping = json.load(file)

if len(apk_feature_columns) != 68:
    raise RuntimeError("APK feature configuration must contain exactly 68 features.")

if getattr(apk_malware_model, "n_features_in_", None) != len(apk_feature_columns):
    raise RuntimeError(
        "APK model input size does not match feature_columns.json."
    )


# =========================================================
# LOAD IMAGE FORGERY DETECTION MODEL
# =========================================================

if not IMAGE_FORGERY_MODEL_PATH.is_file():
    raise FileNotFoundError(
        f"Image forgery model not found: {IMAGE_FORGERY_MODEL_PATH}"
    )

if not IMAGE_FORGERY_CONFIG_PATH.is_file():
    raise FileNotFoundError(
        f"Image forgery configuration not found: {IMAGE_FORGERY_CONFIG_PATH}"
    )

with IMAGE_FORGERY_CONFIG_PATH.open("r", encoding="utf-8") as file:
    image_forgery_config = json.load(file)

IMAGE_FORGERY_THRESHOLD = float(image_forgery_config["threshold"])
IMAGE_FORGERY_INPUT_SIZE = tuple(image_forgery_config["input_size"])

if IMAGE_FORGERY_INPUT_SIZE != (160, 160):
    raise RuntimeError(
        "The image forgery model is configured for an unexpected input size."
    )

if image_forgery_config.get("preprocessing") != "MobileNetV2 preprocess_input":
    raise RuntimeError(
        "Unexpected image forgery preprocessing configuration."
    )

if not 0.0 <= IMAGE_FORGERY_THRESHOLD <= 1.0:
    raise RuntimeError("Image forgery threshold must be between 0 and 1.")

image_forgery_model = tf.keras.models.load_model(
    IMAGE_FORGERY_MODEL_PATH,
    compile=False,
)

if tuple(image_forgery_model.input_shape[1:]) != (160, 160, 3):
    raise RuntimeError(
        "Image forgery model input shape must be (None, 160, 160, 3)."
    )

if image_forgery_model.output_shape[-1] != 1:
    raise RuntimeError(
        "Image forgery model must return one probability per image."
    )


# =========================================================
# LOAD CHAT & EMAIL FORENSICS MODEL
# =========================================================

if not CHAT_EMAIL_MODEL_PATH.is_file():
    raise FileNotFoundError(
        f"Chat & Email model not found: {CHAT_EMAIL_MODEL_PATH}"
    )

if not CHAT_EMAIL_LABELS_PATH.is_file():
    raise FileNotFoundError(
        f"Chat & Email label mapping not found: {CHAT_EMAIL_LABELS_PATH}"
    )

chat_email_model = joblib.load(CHAT_EMAIL_MODEL_PATH)

with CHAT_EMAIL_LABELS_PATH.open("r", encoding="utf-8") as file:
    chat_email_label_mapping = json.load(file)

if not hasattr(chat_email_model, "predict_proba"):
    raise RuntimeError("Chat & Email model must support predict_proba.")

if not hasattr(chat_email_model, "named_steps"):
    raise RuntimeError("Chat & Email model must be a scikit-learn Pipeline.")

if "tfidf" not in chat_email_model.named_steps:
    raise RuntimeError("Chat & Email pipeline must contain a TF-IDF step.")

if "classifier" not in chat_email_model.named_steps:
    raise RuntimeError("Chat & Email pipeline must contain a classifier step.")

if set(chat_email_model.classes_) != {0, 1}:
    raise RuntimeError("Chat & Email model must contain classes 0 and 1.")


# =========================================================
# LOAD CREDIT CARD FRAUD DETECTION MODEL
# =========================================================

if not CREDIT_CARD_FRAUD_MODEL_PATH.is_file():
    raise FileNotFoundError(
        f"Credit card fraud model not found: {CREDIT_CARD_FRAUD_MODEL_PATH}"
    )

if not CREDIT_CARD_FRAUD_FEATURES_PATH.is_file():
    raise FileNotFoundError(
        "Credit card fraud feature configuration not found: "
        f"{CREDIT_CARD_FRAUD_FEATURES_PATH}"
    )

if not CREDIT_CARD_FRAUD_THRESHOLD_PATH.is_file():
    raise FileNotFoundError(
        "Credit card fraud threshold configuration not found: "
        f"{CREDIT_CARD_FRAUD_THRESHOLD_PATH}"
    )

credit_card_fraud_model = joblib.load(CREDIT_CARD_FRAUD_MODEL_PATH)

with CREDIT_CARD_FRAUD_FEATURES_PATH.open("r", encoding="utf-8") as file:
    credit_card_fraud_features = json.load(file)

with CREDIT_CARD_FRAUD_THRESHOLD_PATH.open("r", encoding="utf-8") as file:
    credit_card_fraud_threshold_config = json.load(file)

CREDIT_CARD_FRAUD_THRESHOLD = float(
    credit_card_fraud_threshold_config["threshold"]
)

if len(credit_card_fraud_features) != 30:
    raise RuntimeError(
        "Credit card fraud feature configuration must contain 30 features."
    )

if len(set(credit_card_fraud_features)) != 30:
    raise RuntimeError(
        "Credit card fraud feature configuration contains duplicate names."
    )

if getattr(credit_card_fraud_model, "n_features_in_", None) != 30:
    raise RuntimeError(
        "Credit card fraud model must expect exactly 30 features."
    )

if not hasattr(credit_card_fraud_model, "predict_proba"):
    raise RuntimeError(
        "Credit card fraud model must support predict_proba."
    )

if set(credit_card_fraud_model.classes_) != {0, 1}:
    raise RuntimeError(
        "Credit card fraud model must contain classes 0 and 1."
    )

if not 0.0 <= CREDIT_CARD_FRAUD_THRESHOLD <= 1.0:
    raise RuntimeError(
        "Credit card fraud threshold must be between 0 and 1."
    )

# =========================================================
# LOAD NETWORK INTRUSION DETECTION MODEL
# =========================================================

if not NETWORK_INTRUSION_MODEL_PATH.is_file():
    raise FileNotFoundError(
        f"Network intrusion model not found: "
        f"{NETWORK_INTRUSION_MODEL_PATH}"
    )

if not NETWORK_INTRUSION_FEATURES_PATH.is_file():
    raise FileNotFoundError(
        f"Network intrusion feature information not found: "
        f"{NETWORK_INTRUSION_FEATURES_PATH}"
    )

if not NETWORK_INTRUSION_INFO_PATH.is_file():
    raise FileNotFoundError(
        f"Network intrusion model information not found: "
        f"{NETWORK_INTRUSION_INFO_PATH}"
    )

network_intrusion_model = joblib.load(
    NETWORK_INTRUSION_MODEL_PATH
)

with NETWORK_INTRUSION_FEATURES_PATH.open(
    "r", encoding="utf-8"
) as file:
    network_intrusion_feature_info = json.load(file)

with NETWORK_INTRUSION_INFO_PATH.open(
    "r", encoding="utf-8"
) as file:
    network_intrusion_model_info = json.load(file)

network_intrusion_features = network_intrusion_feature_info[
    "input_features"
]

NETWORK_INTRUSION_THRESHOLD = float(
    network_intrusion_model_info["threshold"]
)

if len(network_intrusion_features) != 41:
    raise RuntimeError(
        "Network intrusion model must use exactly 41 input features."
    )

if len(set(network_intrusion_features)) != 41:
    raise RuntimeError(
        "Network intrusion feature configuration has duplicate names."
    )

if getattr(network_intrusion_model, "n_features_in_", None) != 41:
    raise RuntimeError(
        "Network intrusion model must expect exactly 41 features."
    )

if not hasattr(network_intrusion_model, "predict_proba"):
    raise RuntimeError(
        "Network intrusion model must support predict_proba."
    )

if set(network_intrusion_model.classes_) != {0, 1}:
    raise RuntimeError(
        "Network intrusion model must contain classes 0 and 1."
    )

if not 0.0 <= NETWORK_INTRUSION_THRESHOLD <= 1.0:
    raise RuntimeError(
        "Network intrusion threshold must be between 0 and 1."
    )



# =========================================================
# LOAD SERVER LOG ANALYSIS MODEL
# =========================================================

for path in [
    SERVER_LOG_MODEL_PATH,
    SERVER_LOG_FEATURES_PATH,
    SERVER_LOG_INFO_PATH,
    SERVER_LOG_THRESHOLD_PATH,
]:
    if not path.is_file():
        raise FileNotFoundError(
            f"Server log analysis file not found: {path}"
        )

server_log_model = joblib.load(SERVER_LOG_MODEL_PATH)

with SERVER_LOG_FEATURES_PATH.open(
    "r", encoding="utf-8"
) as file:
    server_log_feature_info = json.load(file)

with SERVER_LOG_INFO_PATH.open(
    "r", encoding="utf-8"
) as file:
    server_log_model_info = json.load(file)

with SERVER_LOG_THRESHOLD_PATH.open(
    "r", encoding="utf-8"
) as file:
    server_log_threshold_info = json.load(file)

server_log_features = server_log_feature_info["feature_columns"]

SERVER_LOG_THRESHOLD = float(
    server_log_threshold_info["threshold"]
)

if len(server_log_features) != 29:
    raise RuntimeError(
        "Server log model must use exactly 29 features."
    )

if len(set(server_log_features)) != 29:
    raise RuntimeError(
        "Duplicate server log feature names detected."
    )

if getattr(server_log_model, "n_features_in_", None) != 29:
    raise RuntimeError(
        "Server log model must expect exactly 29 features."
    )

if not hasattr(server_log_model, "predict_proba"):
    raise RuntimeError(
        "Server log model must support predict_proba."
    )

if set(server_log_model.classes_) != {0, 1}:
    raise RuntimeError(
        "Server log model must contain classes 0 and 1."
    )

if not 0.0 <= SERVER_LOG_THRESHOLD <= 1.0:
    raise RuntimeError(
        "Server log threshold must be between 0 and 1."
    )



# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="CyberFusion API",
    description="AI-assisted cybersecurity analysis services",
    version="1.0.0",
)
cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    _rate_limit_exceeded_handler
)
from app.auth.router import router as auth_router

app.include_router(auth_router)

from app.cases.router import router as cases_router
app.include_router(cases_router)

from app.evidence.router import router as evidence_router
app.include_router(evidence_router)

from app.integrity.router import router as integrity_router
app.include_router(integrity_router)

from app.audit.router import router as audit_router
app.include_router(audit_router)

from app.reports.router import router as reports_router
app.include_router(reports_router)

from app.findings.router import router as findings_router
app.include_router(findings_router)

from app.dashboard.router import router as dashboard_router
app.include_router(dashboard_router)



# =========================================================
# REQUEST MODELS
# =========================================================

class EmailRequest(BaseModel):
    email_text: str = Field(
        ...,
        min_length=1,
        max_length=100000,
        description="Email text to analyze",
    )


class PhishingURLRequest(BaseModel):
    url: str = Field(
        ...,
        min_length=1,
        max_length=2048,
        description="URL to analyze",
    )


class ProfileRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    fullname: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=5000)
    external_url: str = Field(default="", max_length=2048)
    has_profile_picture: bool = False
    is_private: bool = False
    posts: int = Field(default=0, ge=0)
    followers: int = Field(default=0, ge=0)
    following: int = Field(default=0, ge=0)





class ScamSpamRequest(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Message text to analyze for spam or scam patterns",
    )


class ChatEmailForensicsRequest(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="SMS or message text to analyze for spam",
    )


class CreditCardFraudRequest(BaseModel):
    features: dict[str, float] = Field(
        ...,
        description=(
            "Exactly 30 numeric features from the original credit card "
            "fraud dataset: Time, V1-V28, and Amount."
        ),
    )


class NetworkIntrusionRequest(BaseModel):
    features: dict[str, str | float | int] = Field(
        ...,
        description=(
            "Exactly 41 KDD Cup 99 network-traffic features, "
            "including protocol_type, service, and flag."
        ),
    )

class ServerLogAnalysisRequest(BaseModel):
    features: dict[str, float | int] = Field(
        ...,
        description=(
            "Exactly 29 numerical HDFS event-count features: "
            "E1 through E29."
        ),
    )   

# =========================================================
# HOME AND HEALTH
# =========================================================

@app.get("/")
def home():
    return {
        "message": "CyberFusion API is running",
        "modules": [
            "Fake Email Detection",
            "Phishing URL Detection",
            "Fake Social Media Profile Detection",
            "Scam & Spam Message Detection",
            "Android Malware Static Analysis",
            "Image Forgery Detection",
            "Chat & Email Forensics",
            "Credit Card Fraud Detection",
            "Network Intrusion Detection",
            "Server Log Analysis",
        ],
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "fake_email_detection": "loaded",
        "phishing_url_detection": "loaded",
        "fake_profile_detection": "loaded",
        "scam_spam_detection": "loaded",
        "apk_malware_analysis": "loaded",
        "image_forgery_detection": "loaded",
        "chat_email_forensics": "loaded",
        "credit_card_fraud_detection": "loaded",
        "network_intrusion_detection": "loaded",
        "server_log_analysis": "loaded",
    }


# =========================================================
# FAKE EMAIL DETECTION
# =========================================================

@app.post("/api/fake-email/predict")
def predict_fake_email(request: EmailRequest):
    email_text = request.email_text.strip()

    if not email_text:
        raise HTTPException(
            status_code=422,
            detail="Email text cannot be empty or whitespace only.",
        )

    try:
        phishing_probability = float(
            email_model.predict_proba([email_text])[0][1]
        )
    except Exception as exc:
        print(f"Email analysis failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Email analysis failed.",
        ) from exc

    is_phishing = phishing_probability >= EMAIL_PHISHING_THRESHOLD

    return {
        "module": "Fake Email Detection",
        "prediction": "Phishing" if is_phishing else "Safe",
        "phishing_probability": round(phishing_probability, 4),
        "threshold": round(EMAIL_PHISHING_THRESHOLD, 6),
        "warning": (
            "This is a model-based risk estimate, not definitive proof "
            "that an email is malicious."
        ),
    }


@app.post("/api/fake-email/cases/{case_id}/predict")
def predict_fake_email_for_case(
    case_id: int,
    request: EmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    email_text = request.email_text.strip()

    if not email_text:
        raise HTTPException(
            status_code=422,
            detail="Email text cannot be empty or whitespace only.",
        )

    try:
        phishing_probability = float(
            email_model.predict_proba([email_text])[0][1]
        )
    except Exception as exc:
        print(f"Case-linked email analysis failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Email analysis failed.",
        ) from exc

    is_phishing = phishing_probability >= EMAIL_PHISHING_THRESHOLD
    prediction = "Phishing" if is_phishing else "Safe"
    confidence = (
        phishing_probability if is_phishing else 1.0 - phishing_probability
    )

    if is_phishing:
        if confidence >= 0.9:
            severity = "CRITICAL"
        elif confidence >= 0.75:
            severity = "HIGH"
        elif confidence >= 0.5:
            severity = "MEDIUM"
        else:
            severity = "LOW"
    else:
        severity = "LOW" if confidence >= 0.75 else "MEDIUM"

    try:
        finding = save_detection_finding(
            db=db,
            case_id=case_id,
            investigator=current_user,
            module_name="Fake Email Detection",
            input_summary="Email text submitted for phishing analysis",
            prediction=prediction,
            confidence_score=confidence,
            severity=severity,
            analysis_details={
                "phishing_probability": phishing_probability,
                "threshold": EMAIL_PHISHING_THRESHOLD,
                "warning": (
                    "This is a model-based risk estimate, not definitive proof "
                    "that an email is malicious."
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail="Case not found or access denied.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Unable to save case-linked email finding: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Unable to save email analysis finding.",
        ) from exc

    return {
        "module": "Fake Email Detection",
        "case_id": case_id,
        "finding_id": finding.id,
        "prediction": prediction,
        "class": 1 if is_phishing else 0,
        "confidence": round(confidence, 4),
        "severity": severity,
        "phishing_probability": round(phishing_probability, 4),
        "threshold": round(EMAIL_PHISHING_THRESHOLD, 6),
        "message": "Analysis completed and finding saved to the case.",
    }


# =========================================================
# FAKE EMAIL DETECTION FROM .EML FILE
# =========================================================

@app.post("/api/fake-email/analyze-eml")
async def analyze_eml(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".eml"):
        raise HTTPException(
            status_code=400,
            detail="Please upload an .eml email file.",
        )

    max_size = 5 * 1024 * 1024
    raw_data = await file.read(max_size + 1)

    if not raw_data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if len(raw_data) > max_size:
        raise HTTPException(
            status_code=413,
            detail="Email file must be 5 MB or smaller.",
        )

    try:
        message = BytesParser(policy=policy.default).parsebytes(raw_data)
    except Exception as exc:
        print(f"Email parsing failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=400,
            detail="The email file could not be parsed.",
        ) from exc

    subject = str(message.get("subject", ""))
    sender = str(message.get("from", ""))
    recipient = str(message.get("to", ""))
    reply_to = str(message.get("reply-to", ""))
    return_path = str(message.get("return-path", ""))

    body_parts = []

    if message.is_multipart():
        for part in message.walk():
            if part.get_content_disposition() == "attachment":
                continue

            if part.get_content_type() == "text/plain":
                try:
                    content = part.get_content()
                    if isinstance(content, str):
                        body_parts.append(content)
                except (LookupError, UnicodeDecodeError):
                    continue

    elif message.get_content_type() == "text/plain":
        try:
            content = message.get_content()
            if isinstance(content, str):
                body_parts.append(content)
        except (LookupError, UnicodeDecodeError):
            pass

    body_text = "\n".join(body_parts).strip()

    if not body_text:
        raise HTTPException(
            status_code=400,
            detail=(
                "No readable plain-text body was found. "
                "HTML-only emails are not supported by this endpoint yet."
            ),
        )

    try:
        phishing_probability = float(
            email_model.predict_proba([body_text])[0][1]
        )
    except Exception as exc:
        print(f"Email analysis failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Email analysis failed.",
        ) from exc

    is_phishing = phishing_probability >= EMAIL_PHISHING_THRESHOLD

    return {
        "module": "Fake Email Detection",
        "filename": Path(file.filename).name,
        "email_headers": {
            "subject": subject,
            "from": sender,
            "to": recipient,
            "reply_to": reply_to,
            "return_path": return_path,
        },
        "prediction": "Phishing" if is_phishing else "Safe",
        "phishing_probability": round(phishing_probability, 4),
        "threshold": round(EMAIL_PHISHING_THRESHOLD, 6),
        "analysis_scope": (
            "Classification of extracted plain-text body only. "
            "Headers are extracted but not authenticated."
        ),
        "warning": (
            "This model-based estimate is not definitive proof of phishing. "
            "Extracted sender and routing headers are not verified."
        ),
    }


@app.post("/api/fake-email/cases/{case_id}/analyze-eml")
async def analyze_eml_for_case(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        if not file.filename or not file.filename.lower().endswith(".eml"):
            raise HTTPException(
                status_code=400,
                detail="Please upload an .eml email file.",
            )

        max_size = 5 * 1024 * 1024
        raw_data = await file.read(max_size + 1)

        if not raw_data:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty.",
            )

        if len(raw_data) > max_size:
            raise HTTPException(
                status_code=413,
                detail="Email file must be 5 MB or smaller.",
            )

        try:
            message = BytesParser(policy=policy.default).parsebytes(raw_data)
        except Exception as exc:
            print(f"Case-linked email parsing failed: {type(exc).__name__}")
            raise HTTPException(
                status_code=400,
                detail="The email file could not be parsed.",
            ) from exc

        subject = str(message.get("subject", ""))
        sender = str(message.get("from", ""))
        recipient = str(message.get("to", ""))
        reply_to = str(message.get("reply-to", ""))
        return_path = str(message.get("return-path", ""))
        body_parts = []

        if message.is_multipart():
            for part in message.walk():
                if part.get_content_disposition() == "attachment":
                    continue

                if part.get_content_type() == "text/plain":
                    try:
                        content = part.get_content()
                        if isinstance(content, str):
                            body_parts.append(content)
                    except (LookupError, UnicodeDecodeError):
                        continue
        elif message.get_content_type() == "text/plain":
            try:
                content = message.get_content()
                if isinstance(content, str):
                    body_parts.append(content)
            except (LookupError, UnicodeDecodeError):
                pass

        body_text = "\n".join(body_parts).strip()

        if not body_text:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No readable plain-text body was found. "
                    "HTML-only emails are not supported by this endpoint yet."
                ),
            )

        try:
            phishing_probability = float(
                email_model.predict_proba([body_text])[0][1]
            )
        except Exception as exc:
            print(f"Case-linked email analysis failed: {type(exc).__name__}")
            raise HTTPException(
                status_code=500,
                detail="Email analysis failed.",
            ) from exc

        is_phishing = phishing_probability >= EMAIL_PHISHING_THRESHOLD
        prediction = "Phishing" if is_phishing else "Safe"
        confidence = (
            phishing_probability if is_phishing else 1.0 - phishing_probability
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Case-linked email processing failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Email analysis failed.",
        ) from exc
    finally:
        await file.close()

    if is_phishing:
        if confidence >= 0.9:
            severity = "CRITICAL"
        elif confidence >= 0.75:
            severity = "HIGH"
        elif confidence >= 0.5:
            severity = "MEDIUM"
        else:
            severity = "LOW"
    else:
        severity = "LOW" if confidence >= 0.75 else "MEDIUM"

    try:
        finding = save_detection_finding(
            db=db,
            case_id=case_id,
            investigator=current_user,
            module_name="Fake Email Detection",
            input_summary="Email file submitted for phishing analysis",
            prediction=prediction,
            confidence_score=confidence,
            severity=severity,
            analysis_details={
                "phishing_probability": phishing_probability,
                "threshold": EMAIL_PHISHING_THRESHOLD,
                "analysis_scope": (
                    "Classification of extracted plain-text body only. "
                    "Headers are extracted but not authenticated."
                ),
                "warning": (
                    "This model-based estimate is not definitive proof of phishing. "
                    "Extracted sender and routing headers are not verified."
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail="Case not found or access denied.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Unable to save case-linked email finding: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Unable to save email analysis finding.",
        ) from exc

    return {
        "module": "Fake Email Detection",
        "case_id": case_id,
        "finding_id": finding.id,
        "filename": Path(file.filename).name,
        "email_headers": {
            "subject": subject,
            "from": sender,
            "to": recipient,
            "reply_to": reply_to,
            "return_path": return_path,
        },
        "prediction": prediction,
        "class": 1 if is_phishing else 0,
        "confidence": round(confidence, 4),
        "severity": severity,
        "phishing_probability": round(phishing_probability, 4),
        "threshold": round(EMAIL_PHISHING_THRESHOLD, 6),
        "analysis_scope": (
            "Classification of extracted plain-text body only. "
            "Headers are extracted but not authenticated."
        ),
        "message": "Analysis completed and finding saved to the case.",
    }


# =========================================================
# PHISHING URL DETECTION
# =========================================================

@app.post("/api/phishing-url/predict")
def predict_phishing_url(request: PhishingURLRequest):
    url = request.url.strip()

    if not url:
        raise HTTPException(
            status_code=422,
            detail="URL cannot be empty or whitespace only.",
        )

    try:
        features = extract_url_features(url)

        feature_values = pd.DataFrame(
            [[features[column] for column in phishing_feature_columns]],
            columns=phishing_feature_columns,
        )

        prediction = int(phishing_url_model.predict(feature_values)[0])
        probabilities = phishing_url_model.predict_proba(feature_values)[0]
        class_index = list(phishing_url_model.classes_).index(prediction)
        confidence = float(probabilities[class_index])

    except Exception as exc:
        print(f"Phishing URL analysis failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Phishing URL analysis failed.",
        ) from exc

    return {
        "module": "Phishing URL Detection",
        "url": url,
        "prediction": "Phishing URL" if prediction == 1 else "Legitimate URL",
        "class": prediction,
        "confidence": round(confidence, 4),
        "features": features,
        "warning": (
            "This is a model prediction, not a guarantee of safety or "
            "maliciousness. The URL was not opened or independently verified."
        ),
    }


@app.post("/api/phishing-url/cases/{case_id}/predict")
def predict_phishing_url_for_case(
    case_id: int,
    request: PhishingURLRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    url = request.url.strip()

    if not url:
        raise HTTPException(
            status_code=422,
            detail="URL cannot be empty or whitespace only.",
        )

    try:
        features = extract_url_features(url)

        feature_values = pd.DataFrame(
            [[features[column] for column in phishing_feature_columns]],
            columns=phishing_feature_columns,
        )

        prediction = int(phishing_url_model.predict(feature_values)[0])
        probabilities = phishing_url_model.predict_proba(feature_values)[0]
        class_index = list(phishing_url_model.classes_).index(prediction)
        confidence = float(probabilities[class_index])
        prediction_class = (
            "Phishing URL" if prediction == 1 else "Legitimate URL"
        )

        if prediction == 1:
            if confidence >= 0.85:
                severity = "HIGH"
            elif confidence >= 0.65:
                severity = "MEDIUM"
            else:
                severity = "LOW"
        else:
            severity = "LOW"

    except HTTPException:
        raise
    except Exception as exc:
        print(
            f"Case-linked phishing analysis failed: {type(exc).__name__}"
        )
        raise HTTPException(
            status_code=500,
            detail="Phishing URL analysis failed.",
        ) from exc

    try:
        finding = save_detection_finding(
            db=db,
            case_id=case_id,
            investigator=current_user,
            module_name="Phishing URL Detection",
            input_summary="URL submitted for phishing analysis",
            prediction=prediction_class,
            confidence_score=confidence,
            severity=severity,
            analysis_details={
                "class": prediction,
                "warning": (
                    "This is a model prediction, not a guarantee of safety "
                    "or maliciousness. The URL was not opened or independently verified."
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail="Case not found or access denied.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        print(
            f"Case-linked phishing analysis failed: {type(exc).__name__}"
        )
        raise HTTPException(
            status_code=500,
            detail="Phishing URL analysis failed.",
        ) from exc

    return {
        "module": "Phishing URL Detection",
        "case_id": case_id,
        "finding_id": finding.id,
        "prediction": prediction_class,
        "class": prediction,
        "confidence": confidence,
        "severity": severity,
        "message": "Analysis completed and finding saved to the case.",
    }


# =========================================================
# FAKE SOCIAL MEDIA PROFILE DETECTION
# =========================================================

@app.post("/api/fake-profile/predict")
def predict_fake_profile(request: ProfileRequest):
    profile = request.model_dump()

    try:
        features = extract_profile_features(profile)

        feature_values = pd.DataFrame(
            [[features[column] for column in profile_feature_columns]],
            columns=profile_feature_columns,
        )

        prediction = int(profile_model.predict(feature_values)[0])
        probabilities = profile_model.predict_proba(feature_values)[0]
        class_index = list(profile_model.classes_).index(prediction)
        confidence = float(probabilities[class_index])

    except Exception as exc:
        print(f"Profile analysis failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Profile analysis failed.",
        ) from exc

    return {
        "module": "Fake Social Media Profile Detection",
        "username": request.username,
        "prediction": profile_label_mapping.get(str(prediction), "Unknown"),
        "class": prediction,
        "confidence": round(confidence, 4),
        "features": features,
        "warning": (
            "This is an experimental model-based estimate. "
            "It does not verify account ownership or prove that a profile is fake."
        ),
    }


@app.post("/api/fake-profile/cases/{case_id}/predict")
def predict_fake_profile_for_case(
    case_id: int,
    request: ProfileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = request.model_dump()

    try:
        features = extract_profile_features(profile)
        feature_values = pd.DataFrame(
            [[features[column] for column in profile_feature_columns]],
            columns=profile_feature_columns,
        )
        prediction = int(profile_model.predict(feature_values)[0])
        probabilities = profile_model.predict_proba(feature_values)[0]
        class_index = list(profile_model.classes_).index(prediction)
        confidence = float(probabilities[class_index])
        prediction_label = profile_label_mapping.get(str(prediction), "Unknown")
    except Exception as exc:
        print(f"Case-linked profile analysis failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Profile analysis failed.",
        ) from exc

    if prediction == 1:
        if confidence >= 0.9:
            severity = "CRITICAL"
        elif confidence >= 0.75:
            severity = "HIGH"
        elif confidence >= 0.5:
            severity = "MEDIUM"
        else:
            severity = "LOW"
    else:
        severity = "LOW" if confidence >= 0.75 else "MEDIUM"

    try:
        finding = save_detection_finding(
            db=db,
            case_id=case_id,
            investigator=current_user,
            module_name="Fake Social Media Profile Detection",
            input_summary="Profile submitted for fake-profile analysis",
            prediction=prediction_label,
            confidence_score=confidence,
            severity=severity,
            analysis_details={
                "class": prediction,
                "warning": (
                    "This is an experimental model-based estimate. "
                    "It does not verify account ownership or prove that a profile is fake."
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail="Case not found or access denied.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Case-linked profile analysis failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Profile analysis failed.",
        ) from exc

    return {
        "module": "Fake Social Media Profile Detection",
        "case_id": case_id,
        "finding_id": finding.id,
        "prediction": prediction_label,
        "class": prediction,
        "confidence": round(confidence, 4),
        "severity": severity,
        "message": "Analysis completed and finding saved to the case.",
    }


# =========================================================
# SCAM & SPAM MESSAGE DETECTION
# =========================================================

@app.post("/api/scam-detection/predict")
def predict_scam_spam(request: ScamSpamRequest):
    text = request.text.strip()

    if not text:
        raise HTTPException(
            status_code=422,
            detail="Message cannot be empty or whitespace only.",
        )

    try:
        probabilities = scam_spam_model.predict_proba([text])[0]
        classes = list(scam_spam_model.classes_)

        if 1 not in classes or 0 not in classes:
            raise ValueError("Expected model classes 0 and 1.")

        spam_class_index = classes.index(1)
        spam_probability = float(probabilities[spam_class_index])
        is_spam = spam_probability >= SCAM_SPAM_THRESHOLD

    except Exception as exc:
        print(f"Scam/spam analysis failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Scam and spam analysis failed.",
        ) from exc

    return {
        "module": "Scam & Spam Message Detection",
        "prediction": "Spam" if is_spam else "Ham",
        "class": 1 if is_spam else 0,
        "spam_probability": round(spam_probability, 4),
        "threshold": round(SCAM_SPAM_THRESHOLD, 6),
        "warning": (
            "This is a model-based classification. A spam prediction "
            "does not independently prove fraud or malicious intent."
        ),
    }


@app.post("/api/scam-detection/cases/{case_id}/predict")
def predict_scam_spam_for_case(
    case_id: int,
    request: ScamSpamRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    text = request.text.strip()

    if not text:
        raise HTTPException(
            status_code=422,
            detail="Message cannot be empty or whitespace only.",
        )

    try:
        probabilities = scam_spam_model.predict_proba([text])[0]
        classes = list(scam_spam_model.classes_)

        if 1 not in classes or 0 not in classes:
            raise ValueError("Expected model classes 0 and 1.")

        spam_class_index = classes.index(1)
        spam_probability = float(probabilities[spam_class_index])
        is_spam = spam_probability >= SCAM_SPAM_THRESHOLD
        prediction = "Spam" if is_spam else "Ham"
        confidence = spam_probability if is_spam else 1 - spam_probability
    except Exception as exc:
        print(f"Case-linked scam/spam analysis failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Scam and spam analysis failed.",
        ) from exc

    if is_spam:
        if confidence >= 0.9:
            severity = "CRITICAL"
        elif confidence >= 0.75:
            severity = "HIGH"
        elif confidence >= 0.5:
            severity = "MEDIUM"
        else:
            severity = "LOW"
    else:
        severity = "LOW" if confidence >= 0.75 else "MEDIUM"

    try:
        finding = save_detection_finding(
            db=db,
            case_id=case_id,
            investigator=current_user,
            module_name="Scam & Spam Message Detection",
            input_summary="Message submitted for scam and spam analysis",
            prediction=prediction,
            confidence_score=confidence,
            severity=severity,
            analysis_details={
                "class": 1 if is_spam else 0,
                "spam_probability": spam_probability,
                "threshold": SCAM_SPAM_THRESHOLD,
                "warning": (
                    "This is a model-based classification. A spam prediction "
                    "does not independently prove fraud or malicious intent."
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail="Case not found or access denied.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Case-linked scam/spam analysis failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Scam and spam analysis failed.",
        ) from exc

    return {
        "module": "Scam & Spam Message Detection",
        "case_id": case_id,
        "finding_id": finding.id,
        "prediction": prediction,
        "class": 1 if is_spam else 0,
        "confidence": round(confidence, 4),
        "severity": severity,
        "message": "Analysis completed and finding saved to the case.",
    }


# =========================================================
# ANDROID APK MALWARE STATIC ANALYSIS
# =========================================================

@app.post("/api/apk-analysis/predict")
async def analyze_apk(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".apk"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a file with the .apk extension.",
        )

    max_size = 100 * 1024 * 1024
    temp_path = None

    try:
        content = await file.read(max_size + 1)

        if not content:
            raise HTTPException(
                status_code=400,
                detail="The uploaded APK is empty.",
            )

        if len(content) > max_size:
            raise HTTPException(
                status_code=413,
                detail="APK file exceeds the 100 MB limit.",
            )

        with tempfile.NamedTemporaryFile(suffix=".apk", delete=False) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        features = extract_apk_features(temp_path)

        missing_features = [
            column for column in apk_feature_columns if column not in features
        ]

        if missing_features:
            raise ValueError(
                "APK extractor did not return all required model features."
            )

        feature_values = pd.DataFrame(
            [[features[column] for column in apk_feature_columns]],
            columns=apk_feature_columns,
        )

        prediction = int(apk_malware_model.predict(feature_values)[0])
        probabilities = apk_malware_model.predict_proba(feature_values)[0]
        classes = list(apk_malware_model.classes_)

        class_probabilities = {
            int(label): float(probability)
            for label, probability in zip(classes, probabilities)
        }

        label = apk_label_mapping.get(str(prediction), "Unknown")

        return {
            "module": "Android Malware Static Analysis",
            "filename": Path(file.filename).name,
            "prediction": label,
            "class": prediction,
            "class_probabilities": {
                "benign": round(class_probabilities.get(0, 0.0), 4),
                "malware": round(class_probabilities.get(1, 0.0), 4),
            },
            "features_extracted": len(features),
            "analysis_type": "Static analysis",
            "warning": (
                "Experimental result. The current feature extractor has "
                "not been validated against the original training pipeline. "
                "Do not treat this result as a definitive malware verdict."
            ),
        }

    except HTTPException:
        raise
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        print(f"APK analysis failed: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=500,
            detail="APK analysis failed. Check the backend logs.",
        ) from exc
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError as exc:
                print(f"Temporary APK cleanup failed: {type(exc).__name__}")
        await file.close()


@app.post("/api/apk-analysis/cases/{case_id}/predict")
async def analyze_apk_for_case(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    max_size = 100 * 1024 * 1024
    temp_path = None

    try:
        if not file.filename or not file.filename.lower().endswith(".apk"):
            raise HTTPException(
                status_code=400,
                detail="Please upload a file with the .apk extension.",
            )

        content = await file.read(max_size + 1)

        if not content:
            raise HTTPException(
                status_code=400,
                detail="The uploaded APK is empty.",
            )

        if len(content) > max_size:
            raise HTTPException(
                status_code=413,
                detail="APK file exceeds the 100 MB limit.",
            )

        with tempfile.NamedTemporaryFile(suffix=".apk", delete=False) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        features = extract_apk_features(temp_path)
        missing_features = [
            column for column in apk_feature_columns if column not in features
        ]

        if missing_features:
            raise ValueError(
                "APK extractor did not return all required model features."
            )

        feature_values = pd.DataFrame(
            [[features[column] for column in apk_feature_columns]],
            columns=apk_feature_columns,
        )
        prediction = int(apk_malware_model.predict(feature_values)[0])
        probabilities = apk_malware_model.predict_proba(feature_values)[0]
        classes = list(apk_malware_model.classes_)
        class_probabilities = {
            int(label): float(probability)
            for label, probability in zip(classes, probabilities)
        }
        confidence = class_probabilities[prediction]
        label = apk_label_mapping.get(str(prediction), "Unknown")
    except HTTPException:
        raise
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        print(f"Case-linked APK analysis failed: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=500,
            detail="APK analysis failed. Check the backend logs.",
        ) from exc
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError as exc:
                print(f"Temporary APK cleanup failed: {type(exc).__name__}")
        await file.close()

    if prediction == 1:
        if confidence >= 0.9:
            severity = "CRITICAL"
        elif confidence >= 0.75:
            severity = "HIGH"
        elif confidence >= 0.5:
            severity = "MEDIUM"
        else:
            severity = "LOW"
    else:
        severity = "LOW" if confidence >= 0.75 else "MEDIUM"

    try:
        finding = save_detection_finding(
            db=db,
            case_id=case_id,
            investigator=current_user,
            module_name="Android Malware Static Analysis",
            input_summary="APK submitted for malware static analysis",
            prediction=label,
            confidence_score=confidence,
            severity=severity,
            analysis_details={
                "class": prediction,
                "class_probabilities": {
                    "benign": class_probabilities.get(0, 0.0),
                    "malware": class_probabilities.get(1, 0.0),
                },
                "features_extracted": len(features),
                "analysis_type": "Static analysis",
                "warning": (
                    "Experimental result. The current feature extractor has "
                    "not been validated against the original training pipeline. "
                    "Do not treat this result as a definitive malware verdict."
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail="Case not found or access denied.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Case-linked APK analysis failed: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Unable to save APK analysis finding.",
        ) from exc

    return {
        "module": "Android Malware Static Analysis",
        "case_id": case_id,
        "finding_id": finding.id,
        "filename": Path(file.filename).name,
        "prediction": label,
        "class": prediction,
        "confidence": round(confidence, 4),
        "severity": severity,
        "class_probabilities": {
            "benign": round(class_probabilities.get(0, 0.0), 4),
            "malware": round(class_probabilities.get(1, 0.0), 4),
        },
        "features_extracted": len(features),
        "analysis_type": "Static analysis",
        "message": "Analysis completed and finding saved to the case.",
    }


# =========================================================
# IMAGE FORGERY DETECTION
# =========================================================

@app.post("/api/image-forgery/predict")
async def predict_image_forgery(file: UploadFile = File(...)):
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    max_size = 10 * 1024 * 1024

    if not file.filename:
        raise HTTPException(status_code=400, detail="A filename is required.")

    extension = Path(file.filename).suffix.lower()

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Upload a JPG, JPEG, PNG, or WEBP image.",
        )

    try:
        raw_data = await file.read(max_size + 1)

        if not raw_data:
            raise HTTPException(
                status_code=400,
                detail="The uploaded image is empty.",
            )

        if len(raw_data) > max_size:
            raise HTTPException(
                status_code=413,
                detail="Image file must be 10 MB or smaller.",
            )

        try:
            with Image.open(BytesIO(raw_data)) as image:
                image.verify()

            with Image.open(BytesIO(raw_data)) as image:
                image = image.convert("RGB")
                image = image.resize(
                    IMAGE_FORGERY_INPUT_SIZE,
                    Image.Resampling.BILINEAR,
                )
                image_array = np.asarray(image, dtype=np.float32)

        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is not a valid supported image.",
            ) from exc

        image_batch = np.expand_dims(image_array, axis=0)
        image_batch = preprocess_input(image_batch)

        raw_prediction = image_forgery_model.predict(image_batch, verbose=0)
        tampered_probability = float(np.asarray(raw_prediction).reshape(-1)[0])

        if not np.isfinite(tampered_probability):
            raise ValueError("Model returned a non-finite prediction.")

        if not 0.0 <= tampered_probability <= 1.0:
            raise ValueError("Model output is outside the expected probability range.")

        is_tampered = tampered_probability >= IMAGE_FORGERY_THRESHOLD
        authentic_probability = 1.0 - tampered_probability

        return {
            "module": "Image Forgery Detection",
            "filename": Path(file.filename).name,
            "prediction": "Tampered" if is_tampered else "Authentic",
            "class": 1 if is_tampered else 0,
            "tampered_probability": round(tampered_probability, 4),
            "authentic_probability": round(authentic_probability, 4),
            "threshold": IMAGE_FORGERY_THRESHOLD,
            "input_size": list(IMAGE_FORGERY_INPUT_SIZE),
            "model": "Fine-tuned MobileNetV2",
            "warning": (
                "This is an experimental model-based estimate, not proof "
                "of image manipulation. False positives and false negatives "
                "are possible. Use independent forensic examination for "
                "important decisions."
            ),
        }

    except HTTPException:
        raise
    except Exception as exc:
        print(f"Image forgery analysis failed: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Image forgery analysis failed.",
        ) from exc
    finally:
        await file.close()


@app.post("/api/image-forgery/cases/{case_id}/predict")
async def predict_image_forgery_for_case(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    max_size = 10 * 1024 * 1024

    if not file.filename:
        raise HTTPException(status_code=400, detail="A filename is required.")

    extension = Path(file.filename).suffix.lower()
    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Upload a JPG, JPEG, PNG, or WEBP image.",
        )

    try:
        raw_data = await file.read(max_size + 1)

        if not raw_data:
            raise HTTPException(
                status_code=400,
                detail="The uploaded image is empty.",
            )

        if len(raw_data) > max_size:
            raise HTTPException(
                status_code=413,
                detail="Image file must be 10 MB or smaller.",
            )

        try:
            with Image.open(BytesIO(raw_data)) as image:
                image.verify()

            with Image.open(BytesIO(raw_data)) as image:
                image = image.convert("RGB")
                image = image.resize(
                    IMAGE_FORGERY_INPUT_SIZE,
                    Image.Resampling.BILINEAR,
                )
                image_array = np.asarray(image, dtype=np.float32)
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is not a valid supported image.",
            ) from exc

        image_batch = np.expand_dims(image_array, axis=0)
        image_batch = preprocess_input(image_batch)
        raw_prediction = image_forgery_model.predict(image_batch, verbose=0)
        tampered_probability = float(np.asarray(raw_prediction).reshape(-1)[0])

        if not np.isfinite(tampered_probability):
            raise ValueError("Model returned a non-finite prediction.")

        if not 0.0 <= tampered_probability <= 1.0:
            raise ValueError("Model output is outside the expected probability range.")

        is_tampered = tampered_probability >= IMAGE_FORGERY_THRESHOLD
        authentic_probability = 1.0 - tampered_probability
        prediction = "Tampered" if is_tampered else "Authentic"
        confidence = (
            tampered_probability if is_tampered else authentic_probability
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Case-linked image forgery analysis failed: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=500,
            detail="Image forgery analysis failed.",
        ) from exc
    finally:
        await file.close()

    if is_tampered:
        if confidence >= 0.9:
            severity = "CRITICAL"
        elif confidence >= 0.75:
            severity = "HIGH"
        elif confidence >= 0.5:
            severity = "MEDIUM"
        else:
            severity = "LOW"
    else:
        severity = "LOW" if confidence >= 0.75 else "MEDIUM"

    try:
        finding = save_detection_finding(
            db=db,
            case_id=case_id,
            investigator=current_user,
            module_name="Image Forgery Detection",
            input_summary="Image submitted for forgery analysis",
            prediction=prediction,
            confidence_score=confidence,
            severity=severity,
            analysis_details={
                "class": 1 if is_tampered else 0,
                "tampered_probability": tampered_probability,
                "authentic_probability": authentic_probability,
                "threshold": IMAGE_FORGERY_THRESHOLD,
                "input_size": list(IMAGE_FORGERY_INPUT_SIZE),
                "model": "Fine-tuned MobileNetV2",
                "warning": (
                    "This is an experimental model-based estimate, not proof "
                    "of image manipulation. False positives and false negatives "
                    "are possible. Use independent forensic examination for "
                    "important decisions."
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail="Case not found or access denied.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Unable to save case-linked image forgery finding: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Unable to save image forgery finding.",
        ) from exc

    return {
        "module": "Image Forgery Detection",
        "case_id": case_id,
        "finding_id": finding.id,
        "filename": Path(file.filename).name,
        "prediction": prediction,
        "class": 1 if is_tampered else 0,
        "confidence": round(confidence, 4),
        "severity": severity,
        "tampered_probability": round(tampered_probability, 4),
        "authentic_probability": round(authentic_probability, 4),
        "threshold": IMAGE_FORGERY_THRESHOLD,
        "input_size": list(IMAGE_FORGERY_INPUT_SIZE),
        "model": "Fine-tuned MobileNetV2",
        "message": "Analysis completed and finding saved to the case.",
    }


# =========================================================
# CHAT & EMAIL FORENSICS — SMS SPAM CLASSIFICATION
# =========================================================

@app.post("/api/chat-email-forensics/predict")
def predict_chat_email_forensics(request: ChatEmailForensicsRequest):
    message_text = request.text.strip()

    if not message_text:
        raise HTTPException(
            status_code=422,
            detail="Message text cannot be empty or whitespace only.",
        )

    try:
        probabilities = chat_email_model.predict_proba([message_text])[0]
        classes = list(chat_email_model.classes_)

        spam_probability = float(probabilities[classes.index(1)])
        ham_probability = float(probabilities[classes.index(0)])
        prediction = int(chat_email_model.predict([message_text])[0])

        label = chat_email_label_mapping.get(str(prediction), "Unknown")

    except Exception as exc:
        print(f"Chat & Email analysis failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Chat and Email analysis failed.",
        ) from exc

    return {
        "module": "Chat & Email Forensics",
        "prediction": label,
        "class": prediction,
        "spam_probability": round(spam_probability, 4),
        "ham_probability": round(ham_probability, 4),
        "model": "TF-IDF + Logistic Regression",
        "analysis_scope": (
            "SMS spam classification using the UCI SMS Spam Collection "
            "dataset. Email-specific performance has not been evaluated."
        ),
        "warning": (
            "This is a model-based spam classification, not proof of fraud "
            "or malicious intent. Performance on emails and other message "
            "types has not been established."
        ),
    }


@app.post("/api/chat-email-forensics/cases/{case_id}/predict")
def predict_chat_email_forensics_for_case(
    case_id: int,
    request: ChatEmailForensicsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message_text = request.text.strip()

    if not message_text:
        raise HTTPException(
            status_code=422,
            detail="Message text cannot be empty or whitespace only.",
        )

    try:
        probabilities = chat_email_model.predict_proba([message_text])[0]
        classes = list(chat_email_model.classes_)
        prediction = int(chat_email_model.predict([message_text])[0])
        confidence = float(probabilities[classes.index(prediction)])
        spam_probability = float(probabilities[classes.index(1)])
        ham_probability = float(probabilities[classes.index(0)])
        label = chat_email_label_mapping.get(str(prediction), "Unknown")
    except Exception as exc:
        print(f"Case-linked Chat & Email analysis failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Chat and Email analysis failed.",
        ) from exc

    if prediction == 1:
        if confidence >= 0.9:
            severity = "CRITICAL"
        elif confidence >= 0.75:
            severity = "HIGH"
        elif confidence >= 0.5:
            severity = "MEDIUM"
        else:
            severity = "LOW"
    else:
        severity = "LOW" if confidence >= 0.75 else "MEDIUM"

    try:
        finding = save_detection_finding(
            db=db,
            case_id=case_id,
            investigator=current_user,
            module_name="Chat & Email Forensics",
            input_summary="Message submitted for chat and email spam classification",
            prediction=label,
            confidence_score=confidence,
            severity=severity,
            analysis_details={
                "class": prediction,
                "spam_probability": spam_probability,
                "ham_probability": ham_probability,
                "model": "TF-IDF + Logistic Regression",
                "analysis_scope": (
                    "SMS spam classification using the UCI SMS Spam Collection "
                    "dataset. Email-specific performance has not been evaluated."
                ),
                "warning": (
                    "This is a model-based spam classification, not proof of fraud "
                    "or malicious intent. Performance on emails and other message "
                    "types has not been established."
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail="Case not found or access denied.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Unable to save case-linked Chat & Email finding: {type(exc).__name__}")
        raise HTTPException(
            status_code=500,
            detail="Unable to save Chat and Email finding.",
        ) from exc

    return {
        "module": "Chat & Email Forensics",
        "case_id": case_id,
        "finding_id": finding.id,
        "prediction": label,
        "class": prediction,
        "confidence": round(confidence, 4),
        "severity": severity,
        "spam_probability": round(spam_probability, 4),
        "ham_probability": round(ham_probability, 4),
        "model": "TF-IDF + Logistic Regression",
        "message": "Analysis completed and finding saved to the case.",
    }


# =========================================================
# CREDIT CARD FRAUD DETECTION
# =========================================================

@app.post("/api/credit-card-fraud/predict")
def predict_credit_card_fraud(request: CreditCardFraudRequest):
    supplied_features = request.features
    expected_features = credit_card_fraud_features

    expected_set = set(expected_features)
    supplied_set = set(supplied_features)

    missing_features = sorted(expected_set - supplied_set)
    unexpected_features = sorted(supplied_set - expected_set)

    if missing_features or unexpected_features:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    "Input must contain exactly the 30 expected "
                    "credit card fraud features."
                ),
                "missing_features": missing_features,
                "unexpected_features": unexpected_features,
            },
        )

    try:
        values = [
            float(supplied_features[name])
            for name in expected_features
        ]

        if not np.all(np.isfinite(values)):
            raise HTTPException(
                status_code=422,
                detail="All feature values must be finite numbers.",
            )

        # Preserve the exact feature order used by the trained model.
        input_df = pd.DataFrame(
            [values],
            columns=expected_features,
        )

        probabilities = credit_card_fraud_model.predict_proba(input_df)[0]
        classes = list(credit_card_fraud_model.classes_)

        fraud_probability = float(probabilities[classes.index(1)])
        legitimate_probability = float(probabilities[classes.index(0)])

        # Apply the configured threshold of 0.15.
        is_fraudulent = fraud_probability >= CREDIT_CARD_FRAUD_THRESHOLD

        prediction = 1 if is_fraudulent else 0

    except HTTPException:
        raise
    except Exception as exc:
        print(
            f"Credit card fraud prediction failed: {type(exc).__name__}"
        )
        raise HTTPException(
            status_code=500,
            detail="Credit card fraud analysis failed.",
        ) from exc

    return {
        "module": "Credit Card Fraud Detection",
        "prediction": (
            "Fraudulent transaction"
            if prediction == 1
            else "Legitimate transaction"
        ),
        "class": prediction,
        "fraud_probability": round(fraud_probability, 4),
        "legitimate_probability": round(legitimate_probability, 4),
        "threshold": CREDIT_CARD_FRAUD_THRESHOLD,
        "model": "Random Forest",
        "input_features": len(expected_features),
        "warning": (
            "This is an experimental decision-support estimate, not a "
            "guarantee of fraud detection. The model was trained on a "
            "historical dataset and requires the original dataset's "
            "feature definitions and preprocessing. Synthetic or "
            "incompatible feature values may produce misleading results."
        ),
    }


@app.post("/api/credit-card-fraud/cases/{case_id}/predict")
def predict_credit_card_fraud_for_case(
    case_id: int,
    request: CreditCardFraudRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplied_features = request.features
    expected_features = credit_card_fraud_features

    expected_set = set(expected_features)
    supplied_set = set(supplied_features)
    missing_features = sorted(expected_set - supplied_set)
    unexpected_features = sorted(supplied_set - expected_set)

    if missing_features or unexpected_features:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    "Input must contain exactly the 30 expected "
                    "credit card fraud features."
                ),
                "missing_features": missing_features,
                "unexpected_features": unexpected_features,
            },
        )

    try:
        values = [
            float(supplied_features[name])
            for name in expected_features
        ]

        if not np.all(np.isfinite(values)):
            raise HTTPException(
                status_code=422,
                detail="All feature values must be finite numbers.",
            )

        input_df = pd.DataFrame([values], columns=expected_features)
        probabilities = credit_card_fraud_model.predict_proba(input_df)[0]
        classes = list(credit_card_fraud_model.classes_)
        fraud_probability = float(probabilities[classes.index(1)])
        legitimate_probability = float(probabilities[classes.index(0)])
        prediction = (
            1
            if fraud_probability >= CREDIT_CARD_FRAUD_THRESHOLD
            else 0
        )
        confidence = (
            fraud_probability if prediction == 1 else legitimate_probability
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(
            f"Case-linked credit card fraud prediction failed: {type(exc).__name__}"
        )
        raise HTTPException(
            status_code=500,
            detail="Credit card fraud analysis failed.",
        ) from exc

    if prediction == 1:
        if confidence >= 0.9:
            severity = "CRITICAL"
        elif confidence >= 0.75:
            severity = "HIGH"
        elif confidence >= 0.5:
            severity = "MEDIUM"
        else:
            severity = "LOW"
    else:
        severity = "LOW" if confidence >= 0.75 else "MEDIUM"

    prediction_label = (
        "Fraudulent transaction"
        if prediction == 1
        else "Legitimate transaction"
    )
    try:
        finding = save_detection_finding(
            db=db,
            case_id=case_id,
            investigator=current_user,
            module_name="Credit Card Fraud Detection",
            input_summary="Transaction features submitted for fraud analysis",
            prediction=prediction_label,
            confidence_score=confidence,
            severity=severity,
            analysis_details={
                "class": prediction,
                "fraud_probability": fraud_probability,
                "legitimate_probability": legitimate_probability,
                "threshold": CREDIT_CARD_FRAUD_THRESHOLD,
                "model": "Random Forest",
                "input_features": len(expected_features),
                "warning": (
                    "This is an experimental decision-support estimate, not a "
                    "guarantee of fraud detection. The model was trained on a "
                    "historical dataset and requires the original dataset's "
                    "feature definitions and preprocessing. Synthetic or "
                    "incompatible feature values may produce misleading results."
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail="Case not found or access denied.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        print(
            f"Unable to save case-linked credit card fraud finding: {type(exc).__name__}"
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to save credit card fraud finding.",
        ) from exc

    return {
        "module": "Credit Card Fraud Detection",
        "case_id": case_id,
        "finding_id": finding.id,
        "prediction": prediction_label,
        "class": prediction,
        "confidence": round(confidence, 4),
        "severity": severity,
        "fraud_probability": round(fraud_probability, 4),
        "legitimate_probability": round(legitimate_probability, 4),
        "threshold": CREDIT_CARD_FRAUD_THRESHOLD,
        "model": "Random Forest",
        "input_features": len(expected_features),
        "message": "Analysis completed and finding saved to the case.",
    }


# =========================================================
# NETWORK INTRUSION DETECTION
# =========================================================

@app.post("/api/network-intrusion/predict")
def predict_network_intrusion(request: NetworkIntrusionRequest):
    supplied_features = request.features
    expected_features = network_intrusion_features

    expected_set = set(expected_features)
    supplied_set = set(supplied_features)

    missing_features = sorted(expected_set - supplied_set)
    unexpected_features = sorted(supplied_set - expected_set)

    if missing_features or unexpected_features:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Exactly 41 expected features must be supplied.",
                "missing_features": missing_features,
                "unexpected_features": unexpected_features,
            },
        )

    categorical_features = {"protocol_type", "service", "flag"}

    cleaned_features = {}

    for name in expected_features:
        value = supplied_features[name]

        if name in categorical_features:
            if not isinstance(value, str) or not value.strip():
                raise HTTPException(
                    status_code=422,
                    detail=f"{name} must be a non-empty string.",
                )
            cleaned_features[name] = value.strip()
        else:
            if isinstance(value, bool):
                raise HTTPException(
                    status_code=422,
                    detail=f"{name} must be numeric, not boolean.",
                )

            try:
                numeric_value = float(value)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=422,
                    detail=f"{name} must be numeric.",
                )

            if not np.isfinite(numeric_value):
                raise HTTPException(
                    status_code=422,
                    detail=f"{name} must be a finite number.",
                )

            cleaned_features[name] = numeric_value

    input_df = pd.DataFrame(
        [cleaned_features],
        columns=expected_features,
    )

    try:
        probabilities = network_intrusion_model.predict_proba(
            input_df
        )[0]

        classes = list(network_intrusion_model.classes_)
        attack_probability = float(probabilities[classes.index(1)])
        normal_probability = float(probabilities[classes.index(0)])

        is_attack = (
            attack_probability >= NETWORK_INTRUSION_THRESHOLD
        )

        prediction = 1 if is_attack else 0

    except Exception as exc:
        print(
            "Network intrusion prediction failed:",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail="Network intrusion prediction failed.",
        ) from exc

    return {
        "module": "Network Intrusion Detection",
        "prediction": (
            "Potential Attack" if prediction == 1 else "Normal"
        ),
        "class": prediction,
        "attack_probability": round(attack_probability, 4),
        "normal_probability": round(normal_probability, 4),
        "threshold": NETWORK_INTRUSION_THRESHOLD,
        "model": "Random Forest Classifier",
        "input_features": len(expected_features),
        "dataset": "KDD Cup 99, 10% subset",
        "warning": (
            "Experimental decision-support output trained on KDD Cup 99. "
            "Performance on real-world network traffic may differ."
        ),
    }


@app.post("/api/network-intrusion/cases/{case_id}/predict")
def predict_network_intrusion_for_case(
    case_id: int,
    request: NetworkIntrusionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplied_features = request.features
    expected_features = network_intrusion_features
    expected_set = set(expected_features)
    supplied_set = set(supplied_features)
    missing_features = sorted(expected_set - supplied_set)
    unexpected_features = sorted(supplied_set - expected_set)

    if missing_features or unexpected_features:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Exactly 41 expected features must be supplied.",
                "missing_features": missing_features,
                "unexpected_features": unexpected_features,
            },
        )

    categorical_features = {"protocol_type", "service", "flag"}
    cleaned_features = {}

    for name in expected_features:
        value = supplied_features[name]

        if name in categorical_features:
            if not isinstance(value, str) or not value.strip():
                raise HTTPException(
                    status_code=422,
                    detail=f"{name} must be a non-empty string.",
                )
            cleaned_features[name] = value.strip()
        else:
            if isinstance(value, bool):
                raise HTTPException(
                    status_code=422,
                    detail=f"{name} must be numeric, not boolean.",
                )

            try:
                numeric_value = float(value)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=422,
                    detail=f"{name} must be numeric.",
                )

            if not np.isfinite(numeric_value):
                raise HTTPException(
                    status_code=422,
                    detail=f"{name} must be a finite number.",
                )

            cleaned_features[name] = numeric_value

    input_df = pd.DataFrame(
        [cleaned_features],
        columns=expected_features,
    )

    try:
        probabilities = network_intrusion_model.predict_proba(input_df)[0]
        classes = list(network_intrusion_model.classes_)
        attack_probability = float(probabilities[classes.index(1)])
        normal_probability = float(probabilities[classes.index(0)])
        prediction = (
            1
            if attack_probability >= NETWORK_INTRUSION_THRESHOLD
            else 0
        )
        confidence = (
            attack_probability if prediction == 1 else normal_probability
        )
    except Exception as exc:
        print(
            "Case-linked network intrusion prediction failed:",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail="Network intrusion prediction failed.",
        ) from exc

    if prediction == 1:
        if confidence >= 0.9:
            severity = "CRITICAL"
        elif confidence >= 0.75:
            severity = "HIGH"
        elif confidence >= 0.5:
            severity = "MEDIUM"
        else:
            severity = "LOW"
    else:
        severity = "LOW" if confidence >= 0.75 else "MEDIUM"

    prediction_label = "Potential Attack" if prediction == 1 else "Normal"
    try:
        finding = save_detection_finding(
            db=db,
            case_id=case_id,
            investigator=current_user,
            module_name="Network Intrusion Detection",
            input_summary="Network traffic features submitted for intrusion analysis",
            prediction=prediction_label,
            confidence_score=confidence,
            severity=severity,
            analysis_details={
                "class": prediction,
                "attack_probability": attack_probability,
                "normal_probability": normal_probability,
                "threshold": NETWORK_INTRUSION_THRESHOLD,
                "model": "Random Forest Classifier",
                "input_features": len(expected_features),
                "dataset": "KDD Cup 99, 10% subset",
                "warning": (
                    "Experimental decision-support output trained on KDD Cup 99. "
                    "Performance on real-world network traffic may differ."
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail="Case not found or access denied.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        print(
            "Unable to save case-linked network intrusion finding:",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to save network intrusion finding.",
        ) from exc

    return {
        "module": "Network Intrusion Detection",
        "case_id": case_id,
        "finding_id": finding.id,
        "prediction": prediction_label,
        "class": prediction,
        "confidence": round(confidence, 4),
        "severity": severity,
        "attack_probability": round(attack_probability, 4),
        "normal_probability": round(normal_probability, 4),
        "threshold": NETWORK_INTRUSION_THRESHOLD,
        "model": "Random Forest Classifier",
        "input_features": len(expected_features),
        "dataset": "KDD Cup 99, 10% subset",
        "message": "Analysis completed and finding saved to the case.",
    }


# =========================================================
# SERVER LOG ANALYSIS
# =========================================================

@app.post("/api/server-log-analysis/predict")
def predict_server_log_analysis(
    request: ServerLogAnalysisRequest,
):
    supplied_features = request.features
    expected_features = server_log_features

    expected_set = set(expected_features)
    supplied_set = set(supplied_features)

    missing_features = sorted(expected_set - supplied_set)
    unexpected_features = sorted(supplied_set - expected_set)

    if missing_features or unexpected_features:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Exactly 29 expected features are required.",
                "missing_features": missing_features,
                "unexpected_features": unexpected_features,
            },
        )

    cleaned_features = {}

    for name in expected_features:
        value = supplied_features[name]

        if isinstance(value, bool):
            raise HTTPException(
                status_code=422,
                detail=f"{name} must be numeric, not boolean.",
            )

        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=422,
                detail=f"{name} must be numeric.",
            )

        if not np.isfinite(numeric_value):
            raise HTTPException(
                status_code=422,
                detail=f"{name} must be a finite number.",
            )

        if numeric_value < 0:
            raise HTTPException(
                status_code=422,
                detail=f"{name} cannot be negative.",
            )

        cleaned_features[name] = numeric_value

    input_df = pd.DataFrame(
        [cleaned_features],
        columns=expected_features,
    )

    try:
        probabilities = server_log_model.predict_proba(input_df)[0]

        classes = list(server_log_model.classes_)

        anomaly_probability = float(
            probabilities[classes.index(1)]
        )
        normal_probability = float(
            probabilities[classes.index(0)]
        )

        is_anomaly = (
            anomaly_probability >= SERVER_LOG_THRESHOLD
        )

        prediction = 1 if is_anomaly else 0

    except Exception as exc:
        print(
            "Server log prediction failed:",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail="Server log analysis prediction failed.",
        ) from exc

    return {
        "module": "Server Log Analysis",
        "prediction": (
            "Anomaly" if prediction == 1 else "Normal"
        ),
        "class": prediction,
        "anomaly_probability": round(anomaly_probability, 4),
        "normal_probability": round(normal_probability, 4),
        "threshold": SERVER_LOG_THRESHOLD,
        "model": "Random Forest Classifier",
        "input_features": len(expected_features),
        "dataset": "LogHub HDFS",
        "warning": (
            "Experimental decision-support output trained on LogHub HDFS. "
            "Real-world performance requires independent evaluation."
        ),
    }


@app.post("/api/server-log-analysis/cases/{case_id}/predict")
def predict_server_log_analysis_for_case(
    case_id: int,
    request: ServerLogAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    supplied_features = request.features
    expected_features = server_log_features
    expected_set = set(expected_features)
    supplied_set = set(supplied_features)
    missing_features = sorted(expected_set - supplied_set)
    unexpected_features = sorted(supplied_set - expected_set)

    if missing_features or unexpected_features:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Exactly 29 expected features are required.",
                "missing_features": missing_features,
                "unexpected_features": unexpected_features,
            },
        )

    cleaned_features = {}

    for name in expected_features:
        value = supplied_features[name]

        if isinstance(value, bool):
            raise HTTPException(
                status_code=422,
                detail=f"{name} must be numeric, not boolean.",
            )

        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=422,
                detail=f"{name} must be numeric.",
            )

        if not np.isfinite(numeric_value):
            raise HTTPException(
                status_code=422,
                detail=f"{name} must be a finite number.",
            )

        if numeric_value < 0:
            raise HTTPException(
                status_code=422,
                detail=f"{name} cannot be negative.",
            )

        cleaned_features[name] = numeric_value

    input_df = pd.DataFrame(
        [cleaned_features],
        columns=expected_features,
    )

    try:
        probabilities = server_log_model.predict_proba(input_df)[0]
        classes = list(server_log_model.classes_)
        anomaly_probability = float(probabilities[classes.index(1)])
        normal_probability = float(probabilities[classes.index(0)])
        prediction = (
            1
            if anomaly_probability >= SERVER_LOG_THRESHOLD
            else 0
        )
        confidence = (
            anomaly_probability if prediction == 1 else normal_probability
        )
    except Exception as exc:
        print(
            "Case-linked server log prediction failed:",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail="Server log analysis prediction failed.",
        ) from exc

    if prediction == 1:
        if confidence >= 0.9:
            severity = "CRITICAL"
        elif confidence >= 0.75:
            severity = "HIGH"
        elif confidence >= 0.5:
            severity = "MEDIUM"
        else:
            severity = "LOW"
    else:
        severity = "LOW" if confidence >= 0.75 else "MEDIUM"

    prediction_label = "Anomaly" if prediction == 1 else "Normal"
    try:
        finding = save_detection_finding(
            db=db,
            case_id=case_id,
            investigator=current_user,
            module_name="Server Log Analysis",
            input_summary="Aggregated server log features submitted for analysis",
            prediction=prediction_label,
            confidence_score=confidence,
            severity=severity,
            analysis_details={
                "class": prediction,
                "anomaly_probability": anomaly_probability,
                "normal_probability": normal_probability,
                "threshold": SERVER_LOG_THRESHOLD,
                "model": "Random Forest Classifier",
                "input_features": len(expected_features),
                "dataset": "LogHub HDFS",
                "warning": (
                    "Experimental decision-support output trained on LogHub HDFS. "
                    "Real-world performance requires independent evaluation."
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail="Case not found or access denied.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        print(
            "Unable to save case-linked server log finding:",
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to save server log analysis finding.",
        ) from exc

    return {
        "module": "Server Log Analysis",
        "case_id": case_id,
        "finding_id": finding.id,
        "prediction": prediction_label,
        "class": prediction,
        "confidence": round(confidence, 4),
        "severity": severity,
        "anomaly_probability": round(anomaly_probability, 4),
        "normal_probability": round(normal_probability, 4),
        "threshold": SERVER_LOG_THRESHOLD,
        "model": "Random Forest Classifier",
        "input_features": len(expected_features),
        "dataset": "LogHub HDFS",
        "message": "Analysis completed and finding saved to the case.",
    }
