"""Smile ID (Smile Identity) Core Integrations.

Enables generation of HMAC-SHA256 signatures required by Smile ID's REST APIs.
"""

import hmac
import hashlib
import base64

def generate_smile_id_signature(api_key: str, partner_id: str, timestamp: str) -> str:
    """Generate SHA256 HMAC signature required by Smile ID for authentication.
    
    Formula: Base64(HMAC-SHA256(timestamp + partner_id + "sid_request", api_key))
    """
    message = f"{timestamp}{partner_id}sid_request"
    
    signature = hmac.new(
        api_key.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256
    ).digest()
    
    return base64.b64encode(signature).decode("utf-8")
