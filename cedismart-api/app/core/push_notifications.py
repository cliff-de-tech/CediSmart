"""Push notification sender utility using Expo's Push API."""

import logging
import uuid
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.auth.models import UserDeviceToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push_notification(
    user_id: uuid.UUID,
    title: str,
    body: str,
    data: dict | None = None,
    db: AsyncSession | None = None,
) -> None:
    """Send a push notification to all active devices of a given user.

    Automatically cleans up/deletes tokens that are invalid or unregistered.
    """
    if db is None:
        logger.warning("No database session provided to send_push_notification. Skipping.")
        return

    # Fetch active device tokens for the user
    result = await db.execute(
        select(UserDeviceToken).where(
            UserDeviceToken.user_id == user_id,
            UserDeviceToken.is_active == True
        )
    )
    device_tokens = result.scalars().all()

    if not device_tokens:
        logger.debug("No active push tokens found for user %s. Skipping.", user_id)
        return

    # Build the payload list for Expo
    payloads = []
    token_map = {}
    for dt in device_tokens:
        payloads.append({
            "to": dt.token,
            "title": title,
            "body": body,
            "sound": "default",
            "data": data or {},
        })
        token_map[dt.token] = dt

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=payloads,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                timeout=10.0,
            )
            
            if response.status_code == 200:
                response_data = response.json()
                # Expo sends back a list of ticket statuses matching the order of payloads
                tickets = response_data.get("data", [])
                
                for payload, ticket in zip(payloads, tickets):
                    token = payload["to"]
                    status = ticket.get("status")
                    
                    if status == "error":
                        error_detail = ticket.get("details", {})
                        error_code = error_detail.get("error")
                        
                        logger.warning(
                            "Failed to deliver notification to token %s: %s (code: %s)",
                            token,
                            ticket.get("message"),
                            error_code
                        )
                        
                        # Cleanup dead/invalid tokens
                        if error_code in ("DeviceNotRegistered", "InvalidCredentials"):
                            dt_to_delete = token_map.get(token)
                            if dt_to_delete:
                                logger.info("Removing inactive/unregistered device token: %s", token)
                                await db.delete(dt_to_delete)
                
                await db.commit()
            else:
                logger.error(
                    "Expo Push Service returned HTTP status %d: %s",
                    response.status_code,
                    response.text
                )
    except Exception as e:
        logger.error("Exception occurred while sending push notifications via Expo: %s", str(e))
