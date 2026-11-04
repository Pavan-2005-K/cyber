import logging
import os
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from google import genai
from google.genai import types
from google.genai.errors import APIError
from pydantic import BaseModel, Field

from app.auth.router import get_current_user
from app.db.models import User

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/chat",
    tags=["CyberFusion Chatbot"],
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(
        default_factory=list,
        max_length=10,
    )


class ChatResponse(BaseModel):
    reply: str


SYSTEM_INSTRUCTION = """
You are CyberFusion AI Assistant, the cybersecurity assistant
inside the CyberFusion AI Cybersecurity and Digital Forensics Platform.

Your responsibilities:
- Explain cybersecurity concepts in beginner-friendly language.
- Help users understand phishing, fake emails, fake profiles,
  scams, spam, APK malware, image forgery, network intrusion,
  server logs, and chat/email forensics.
- Explain machine learning predictions and their limitations.
- Explain SHA-256, cryptographic hash chains, and Ed25519 signatures.
- Help users understand how to use CyberFusion features.
- Provide practical cybersecurity recommendations.

Important rules:
- Be accurate, clear, and concise.
- Never claim that a model prediction proves malicious activity.
- Do not invent investigation results or access private case records.
- You cannot access uploaded evidence or private investigation files.
- Do not request, reveal, infer, or claim access to private cases,
  uploaded evidence, credentials, or confidential user records.
- Do not claim that CyberFusion uses blockchain.
- If a question is unrelated to cybersecurity or CyberFusion,
  politely guide the user back to those topics.
"""


@router.post("", response_model=ChatResponse)
def chat_with_cyberfusion(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()

    if not api_key:
        logger.error("Gemini API key is missing or empty.")
        raise HTTPException(
            status_code=503,
            detail="Chatbot is not configured: the backend GEMINI_API_KEY is missing.",
        )

    contents = []

    for item in request.history:
        contents.append(
            types.Content(
                role="user" if item.role == "user" else "model",
                parts=[types.Part.from_text(text=item.content)],
            )
        )

    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=request.message.strip())],
        )
    )

    model_name = (
        os.getenv("GEMINI_MODEL", "gemini-3.6-flash").strip()
        or "gemini-3.6-flash"
    )

    try:
        http_options = types.HttpOptions(
            timeout=20_000,
            retry_options=types.HttpRetryOptions(
                attempts=3,
                initial_delay=0.5,
                max_delay=2,
                exp_base=2,
                jitter=0.3,
                http_status_codes=[408, 429, 500, 502, 503, 504],
            ),
        )
        with genai.Client(api_key=api_key, http_options=http_options) as client:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    max_output_tokens=800,
                ),
            )

        reply = response.text

        if not reply:
            logger.error("Gemini returned an empty response (model=%s).", model_name)
            raise HTTPException(
                status_code=502,
                detail="The AI assistant returned an empty response.",
            )

        return ChatResponse(reply=reply.strip())

    except HTTPException:
        raise
    except APIError as exc:
        provider_status = (exc.status or "").upper()
        provider_message = (exc.message or "").casefold()
        logger.warning(
            "Gemini API request failed (model=%s, http_status=%s, provider_status=%s).",
            model_name,
            exc.code,
            provider_status or "unknown",
        )

        invalid_api_key = (
            "api key" in provider_message
            and any(
                term in provider_message
                for term in ("invalid", "not valid", "expired")
            )
        )
        if (
            exc.code in (401, 403)
            or provider_status in (
                "UNAUTHENTICATED",
                "PERMISSION_DENIED",
                "API_KEY_INVALID",
            )
            or invalid_api_key
        ):
            raise HTTPException(
                status_code=503,
                detail=(
                    "Chatbot credentials are invalid or lack permission. "
                    "Verify GEMINI_API_KEY and Gemini API access."
                ),
            ) from exc

        if exc.code == 429 or provider_status in (
            "RESOURCE_EXHAUSTED",
            "RATE_LIMIT_EXCEEDED",
        ):
            error_info = f"{provider_status} {provider_message}".casefold()
            if "quota" in error_info or "daily limit" in error_info:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        "Gemini quota is exhausted. Check the Google AI project "
                        "quota or billing before retrying."
                    ),
                ) from exc
            raise HTTPException(
                status_code=429,
                detail=(
                    "The AI assistant is rate-limited. Please wait a moment "
                    "and retry."
                ),
            ) from exc

        model_error = (
            exc.code == 404
            or provider_status in ("NOT_FOUND", "MODEL_NOT_FOUND")
            or (
                "model" in provider_message
                and any(
                    term in provider_message
                    for term in ("not found", "unsupported", "not supported")
                )
            )
        )
        if model_error:
            raise HTTPException(
                status_code=502,
                detail=(
                    "The configured Gemini model is unavailable. "
                    "Check the backend GEMINI_MODEL setting."
                ),
            ) from exc

        if exc.code in (408, 500, 502, 503, 504) or provider_status in (
            "UNAVAILABLE",
            "DEADLINE_EXCEEDED",
            "INTERNAL",
        ):
            raise HTTPException(
                status_code=503,
                detail=(
                    "Gemini is temporarily unavailable. Please wait a moment "
                    "and retry."
                ),
            ) from exc

        if exc.code == 400 and "api key" in provider_message:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Chatbot credentials are invalid. Verify GEMINI_API_KEY "
                    "in the backend environment."
                ),
            ) from exc

        raise HTTPException(
            status_code=502,
            detail=(
                "Gemini rejected the request. Check the backend model and "
                "chat request configuration."
            ),
        ) from exc
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        logger.warning(
            "Gemini transport failure (model=%s, error_type=%s).",
            model_name,
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail=(
                "Gemini could not be reached temporarily. Please wait a moment "
                "and retry."
            ),
        ) from exc
    except Exception as exc:
        logger.error(
            "Gemini request failed (model=%s, error_type=%s).",
            model_name,
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=502,
            detail="Unable to get a response from the AI assistant.",
        ) from exc