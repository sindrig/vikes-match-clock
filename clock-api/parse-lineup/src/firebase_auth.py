import os

import firebase_admin
from firebase_admin import auth as firebase_auth


_app = None


def get_firebase_app():
    global _app
    if _app is None:
        _app = firebase_admin.initialize_app()
    return _app


def verify_firebase_token(token: str) -> dict | None:
    """Verify Firebase ID token and return decoded claims, or None if invalid."""
    try:
        get_firebase_app()
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except Exception as e:
        print(f"Firebase token verification failed: {e}")
        return None


def get_token_from_header(auth_header: str | None) -> str | None:
    """Extract Bearer token from Authorization header."""
    if not auth_header:
        return None
    if not auth_header.startswith("Bearer "):
        return None
    return auth_header[7:]
