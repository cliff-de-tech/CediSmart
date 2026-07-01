import logging
from typing import Any
import httpx
from app.core.config import settings
from app.core.exceptions import AppException
from app.modules.support.schemas import ChatMessage

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are the CediSmart AI Support Assistant. CediSmart is a digital ledger and budgeting "
    "mobile application built for the Ghanaian market, supporting Cash, Mobile Money (MTN, Telecel, AT), "
    "and Bank accounts.\n\n"
    "Your tone should be polite, helpful, and direct. You can use Ghanaian context/slang (e.g. chop money, "
    "trotro, airtime, MoMo fees) appropriately to make the user feel at home.\n\n"
    "Help users troubleshoot issues including:\n"
    "- Registration & OTP: SMS verification is offloaded to Clerk. If they aren't receiving OTPs, "
    "suggest they check cellular signal, ensure they didn't prefix the number with another 0 "
    "(Ghana numbers are 9 digits, e.g. 20xxxxxxx), or try again in a few minutes. "
    "Also note that reviewers can use pre-configured Test Phone Numbers.\n"
    "- PIN & Login: Security PINs are 6 digits and stored securely. PIN resets require a Clerk "
    "phone re-verification step.\n"
    "- Budgeting & Ledgers: Help them understand how to set budgets, add transactions (expense vs income), "
    "and review monthly reports.\n\n"
    "IMPORTANT ESCALATION PROTOCOL:\n"
    "If the user describes a bug, a server crash, asks for a human / developer, or if the issue is complex "
    "and you cannot solve it, add the exact tag '[ESCALATE_REQUIRED]' at the end of your response. "
    "This lets the system know it needs to escalate the conversation to the developer."
)

class SupportService:
    @staticmethod
    async def generate_chat_response(messages: list[ChatMessage]) -> str:
        """Call Gemini model to generate a supportive assistant response."""
        if not settings.GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY is not set. Using local rules-based support fallback.")
            return SupportService._fallback_support_response(messages)

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={settings.GEMINI_API_KEY}"

        contents = []
        for msg in messages:
            contents.append({
                "role": msg.role,
                "parts": [{"text": msg.content}]
            })

        payload = {
            "contents": contents,
            "systemInstruction": {
                "parts": [{"text": SYSTEM_PROMPT}]
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload)
                if response.status_code == 200:
                    resp_json = response.json()
                    return resp_json["candidates"][0]["content"]["parts"][0]["text"]
                else:
                    logger.error("Gemini Support API error (status %d): %s", response.status_code, response.text)
                    raise AppException(
                        status_code=502,
                        error_code="AI_PROVIDER_ERROR",
                        message="Failed to get response from AI assistant. Please try again."
                    )
        except httpx.RequestError as exc:
            logger.error("Failed to connect to Gemini API: %s", str(exc))
            raise AppException(
                status_code=503,
                error_code="AI_PROVIDER_UNREACHABLE",
                message="Support assistant is currently offline. Please try again."
            )

    @staticmethod
    def _fallback_support_response(messages: list[ChatMessage]) -> str:
        """Provide a fallback response when Gemini is not configured."""
        last_msg = messages[-1].content.lower() if messages else ""

        if "otp" in last_msg or "code" in last_msg or "sms" in last_msg:
            return (
                "It looks like you're having trouble receiving your verification OTP. Please check:\n"
                "1. That your phone has active cellular reception.\n"
                "2. That the number was entered correctly (9 digits, e.g. 24XXXXXXX, excluding the leading 0).\n"
                "If the issue persists, tap 'Escalate' to report this bug to our developers."
            )
        elif "pin" in last_msg or "password" in last_msg or "reset" in last_msg:
            return (
                "To reset your PIN, please use the 'Forgot PIN?' link on the Login screen. "
                "This will verify your identity via SMS before prompting you to choose a new 6-digit PIN."
            )
        else:
            return (
                "Hi there! I am the CediSmart Support Assistant. I can help you with OTP codes, "
                "PIN resets, budgets, and transactions. What's on your mind? "
                "(If you have a complicated issue, please let me know and I will raise a developer ticket)."
            )

    @staticmethod
    async def escalate_to_github(phone: str, user_query: str, chat_history: list[ChatMessage]) -> dict[str, Any]:
        """Create a GitHub issue containing the support details and chat transcript."""
        if not settings.GITHUB_ACCESS_TOKEN:
            logger.warning("GITHUB_ACCESS_TOKEN is empty. Simulating successful GitHub escalation.")
            return {
                "number": 404,
                "html_url": "https://github.com/cliff-de-tech/CediSmart/issues/mock"
            }

        url = f"https://api.github.com/repos/{settings.GITHUB_REPO}/issues"
        headers = {
            "Authorization": f"token {settings.GITHUB_ACCESS_TOKEN}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        }

        # Format transcript
        transcript_lines = []
        for msg in chat_history:
            role_label = "User" if msg.role == "user" else "AI Assistant"
            transcript_lines.append(f"**{role_label}**: {msg.content}")
        transcript_str = "\n\n".join(transcript_lines)

        body_content = (
            f"## 📱 CediSmart Support Escalation\n\n"
            f"**Phone Number:** `{phone}`\n"
            f"**Primary Query:** {user_query}\n\n"
            f"### 💬 Chat History\n"
            f"{transcript_str}\n\n"
            f"---  \n"
            f"*Issue generated automatically by CediSmart AI Support Service.*"
        )

        payload = {
            "title": f"Support Ticket: Phone {phone} ({user_query[:30]}...)",
            "body": body_content,
            "labels": ["support", "escalated"]
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code == 201:
                    resp_json = response.json()
                    return {
                        "number": resp_json["number"],
                        "html_url": resp_json["html_url"]
                    }
                else:
                    logger.error("GitHub API issue creation failed (status %d): %s", response.status_code, response.text)
                    raise AppException(
                        status_code=502,
                        error_code="GITHUB_API_ERROR",
                        message="Failed to submit support ticket to GitHub. Please try again."
                    )
        except httpx.RequestError as exc:
            logger.error("Failed to connect to GitHub API: %s", str(exc))
            raise AppException(
                status_code=503,
                error_code="GITHUB_UNREACHABLE",
                message="Bug tracker service is currently unreachable. Please try again."
            )
