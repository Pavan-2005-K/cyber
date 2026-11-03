
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client


# Backend root directory
BASE_DIR = Path(__file__).resolve().parents[2]

# Load backend environment variables
load_dotenv(BASE_DIR / ".env")


EVIDENCE_BUCKET = "cyberfusion-evidence"
REPORTS_BUCKET = "cyberfusion-reports"


@lru_cache(maxsize=1)
def get_storage_client() -> Client:
    """
    Create and reuse the Supabase client.

    The service-role key must only be used by the backend.
    """

    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        raise RuntimeError(
            "Supabase Storage credentials are not configured."
        )

    return create_client(supabase_url, service_role_key)


def upload_file(
    bucket: str,
    object_key: str,
    file_bytes: bytes,
    content_type: str,
) -> None:
    """
    Upload original file bytes to a private Supabase bucket.
    Existing objects are not overwritten.
    """

    if not file_bytes:
        raise ValueError("Cannot upload an empty file.")

    client = get_storage_client()

    client.storage.from_(bucket).upload(
        path=object_key,
        file=file_bytes,
        file_options={
            "content-type": content_type,
            "upsert": "false",
        },
    )


def download_file(bucket: str, object_key: str) -> bytes:
    """
    Download an object from a private Supabase bucket.
    """

    client = get_storage_client()

    result = client.storage.from_(bucket).download(object_key)

    if not result:
        raise FileNotFoundError(
            f"Storage object not found: {object_key}"
        )

    return result


def delete_file(bucket: str, object_key: str) -> None:
    """
    Delete an object from a private Supabase bucket.
    """

    client = get_storage_client()

    client.storage.from_(bucket).remove([object_key])
