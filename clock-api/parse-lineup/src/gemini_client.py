import base64
import json
import os

import boto3
from google import genai
from google.genai import types

from .models import ParsedLineup

PROMPT = """Analyze this match report/lineup image from an Icelandic football (soccer) match.

Extract ALL player names and their jersey numbers from the lineup.

Rules:
- Extract both teams if visible, but focus on the players listed
- Jersey numbers are typically 1-99
- Names are in Icelandic format (e.g., "Jón Jónsson", "Guðrún Sigurðardóttir")
- Include substitutes if they appear in the lineup
- If a number is not visible or unclear, set it to null

Return ONLY the JSON, no other text."""

# Cache the API key to avoid repeated Secrets Manager calls
_cached_api_key: str | None = None


def _get_gemini_api_key() -> str:
    global _cached_api_key
    if _cached_api_key is not None:
        return _cached_api_key

    secret_arn = os.environ.get("GEMINI_API_KEY_SECRET_ARN")
    if not secret_arn:
        raise ValueError("GEMINI_API_KEY_SECRET_ARN environment variable not set")

    client = boto3.client("secretsmanager")
    response = client.get_secret_value(SecretId=secret_arn)
    _cached_api_key = response["SecretString"]
    return _cached_api_key


def parse_lineup_image(
    image_base64: str, mime_type: str = "image/jpeg"
) -> ParsedLineup:
    api_key = _get_gemini_api_key()

    client = genai.Client(api_key=api_key)

    image_bytes = base64.b64decode(image_base64)

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[
            PROMPT,
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ParsedLineup,
        ),
    )

    return response.parsed
