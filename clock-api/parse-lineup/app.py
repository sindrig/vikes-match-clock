import json
import base64

from src.firebase_auth import verify_firebase_token, get_token_from_header
from src.gemini_client import parse_lineup_image
from src.models import ParsedLineup


def respond(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "body": json.dumps(body),
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
            "Content-Type": "application/json",
        },
    }


def lambda_handler(event: dict, context) -> dict:
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")

    if http_method == "OPTIONS":
        return respond(200, {"message": "OK"})

    if http_method != "POST":
        return respond(405, {"error": "Method not allowed"})

    auth_header = event.get("headers", {}).get("authorization")
    token = get_token_from_header(auth_header)

    if not token:
        return respond(401, {"error": "Missing authorization token"})

    claims = verify_firebase_token(token)
    if not claims:
        return respond(401, {"error": "Invalid authorization token"})

    try:
        body = event.get("body", "")
        if event.get("isBase64Encoded", False):
            body = base64.b64decode(body).decode("utf-8")

        request_data = json.loads(body) if body else {}
    except json.JSONDecodeError:
        return respond(400, {"error": "Invalid JSON body"})

    image_base64 = request_data.get("image")
    if not image_base64:
        return respond(400, {"error": "Missing 'image' field (base64 encoded)"})

    mime_type = request_data.get("mimeType", "image/jpeg")

    try:
        result: ParsedLineup = parse_lineup_image(image_base64, mime_type)
        return respond(
            200,
            {
                "players": [p.model_dump() for p in result.players],
            },
        )
    except Exception as e:
        print(f"Error parsing lineup: {e}")
        return respond(500, {"error": f"Failed to parse lineup: {str(e)}"})


if __name__ == "__main__":
    import os

    test_event = {
        "requestContext": {"http": {"method": "POST"}},
        "headers": {"authorization": "Bearer test-token"},
        "body": json.dumps(
            {
                "image": "base64-encoded-image-here",
                "mimeType": "image/jpeg",
            }
        ),
    }
    print(lambda_handler(test_event, {}))
