import logging
from typing import Any
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.exceptions import AppException
from app.modules.support.schemas import ChatMessage
from app.modules.support.models import SupportTicket

logger = logging.getLogger(__name__)

AUTH_SYSTEM_PROMPT = (
    "You are the CediSmart Onboarding & Authentication Troubleshooter. CediSmart is a digital ledger "
    "and budgeting mobile application built for the Ghanaian market.\n\n"
    "Your tone should be polite, helpful, and direct. You can use Ghanaian context/slang appropriately "
    "to make the user feel at home.\n\n"
    "Your sole focus is helping users resolve registration, SMS verification OTP, sign-in, and 6-digit Secure PIN reset issues.\n"
    "- SMS Verification OTP: SMS verification is offloaded to Clerk. If they aren't receiving OTPs, "
    "suggest they check cellular signal, ensure they didn't prefix the number with another 0 "
    "(Ghana numbers are 9 digits, e.g., 24XXXXXXX, excluding the leading 0), or check if they have "
    "MTN Do Not Disturb (DND) active which blocks transaction SMS. "
    "Also note that reviewers can use pre-configured Test Phone Numbers.\n"
    "- PIN & Login: Security PINs are 6 digits and stored securely. PIN resets require a Clerk "
    "phone re-verification step.\n"
    "- Important restriction: Since you are the Onboarding Troubleshooter, if users ask about general ledger usage, "
    "adding transactions, or setting budgets, politely advise them that you are specialized in login/registration issues, "
    "but once they are logged in, the General Support assistant in Settings will happily help them with budgeting.\n\n"
    "IMPORTANT ESCALATION PROTOCOL:\n"
    "If the user describes a bug, a server crash, asks for a human / developer, or if the issue is complex "
    "and you cannot solve it, add the exact tag '[ESCALATE_REQUIRED]' at the end of your response. "
    "This lets the system know it needs to escalate the conversation to the developer."
)

GENERAL_SYSTEM_PROMPT = (
    "You are the CediSmart Ledger & Budgeting Co-Pilot. CediSmart is a digital ledger and budgeting "
    "mobile application built for the Ghanaian market, supporting Cash, Mobile Money (MTN, Telecel, AT), "
    "and Bank accounts.\n\n"
    "Your tone should be polite, helpful, and direct. You can use Ghanaian context/slang (e.g., chop money, "
    "trotro, airtime, MoMo fees) appropriately to make the user feel at home.\n\n"
    "Your focus is helping logged-in users understand and use CediSmart's ledger and budgeting features:\n"
    "- Ledgers: Help them understand how to set up ledgers (personal, business, savings), add transactions "
    "(categorize expense vs income), and review monthly reports.\n"
    "- Budgeting: Guide them on setting monthly budgets, track savings goals, and manage MoMo transaction fee settings.\n"
    "- Important restriction: Since you are post-login support, if the user asks about changing phone numbers or "
    "re-registering, guide them to the profile/auth settings.\n\n"
    "IMPORTANT ESCALATION PROTOCOL:\n"
    "If the user describes a bug, a server crash, asks for a human / developer, or if the issue is complex "
    "and you cannot solve it, add the exact tag '[ESCALATE_REQUIRED]' at the end of your response. "
    "This lets the system know it needs to escalate the conversation to the developer."
)

class SupportService:
    @staticmethod
    async def generate_chat_response(messages: list[ChatMessage], support_type: str | None = None) -> str:
        """Call Gemini model to generate a supportive assistant response."""
        system_prompt = AUTH_SYSTEM_PROMPT if support_type == "auth" else GENERAL_SYSTEM_PROMPT

        if not settings.GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY is not set. Using local rules-based support fallback.")
            return SupportService._fallback_support_response(messages, support_type)

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
                "parts": [{"text": system_prompt}]
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
    def _fallback_support_response(messages: list[ChatMessage], support_type: str | None = None) -> str:
        """Provide a fallback response when Gemini is not configured."""
        last_msg = messages[-1].content.lower() if messages else ""

        if support_type == "auth":
            if "otp" in last_msg or "code" in last_msg or "sms" in last_msg:
                return (
                    "It looks like you're having trouble receiving your verification OTP. Please check:\n"
                    "1. That your phone has active cellular reception.\n"
                    "2. That the number was entered correctly (9 digits, e.g. 24XXXXXXX, excluding the leading 0).\n"
                    "If the issue persists, tap 'Escalate' to report this bug to our developers."
                )
            else:
                return (
                    "Hi there! I am the CediSmart Onboarding Assistant. I can help you with OTP codes, "
                    "registration, and PIN resets. (If you have a complicated issue, please let me know and I will raise a developer ticket)."
                )
        else:
            if "pin" in last_msg or "password" in last_msg or "reset" in last_msg:
                return (
                    "To reset your PIN, please use the 'Forgot PIN?' link on the Login screen. "
                    "This will verify your identity via SMS before prompting you to choose a new 6-digit PIN."
                )
            else:
                return (
                    "Hi there! I am the CediSmart Support Assistant. I can help you set budgets, "
                    "create ledgers, and log transactions. What can I help you with today?"
                )

    @staticmethod
    async def escalate_ticket(
        db: AsyncSession,
        phone: str,
        user_query: str,
        chat_history: list[ChatMessage],
        device_diagnostics: dict | None = None
    ) -> dict[str, Any]:
        """Save ticket to local database, escalate to GitHub, and notify via Discord if configured."""
        # 1. Create and commit the SupportTicket in the Postgres database
        ticket = SupportTicket(
            phone=phone,
            user_query=user_query,
            chat_history=[msg.model_dump() for msg in chat_history],
            device_diagnostics=device_diagnostics,
            is_resolved=False
        )
        db.add(ticket)
        await db.commit()
        await db.refresh(ticket)
        ticket_id = str(ticket.id)

        # 2. Escalate to GitHub if token exists
        issue_number = 0
        issue_url = "database_only"
        
        if settings.GITHUB_ACCESS_TOKEN:
            issue_number, issue_url = await SupportService._create_github_issue(
                phone=phone,
                user_query=user_query,
                chat_history=chat_history,
                device_diagnostics=device_diagnostics,
                ticket_id=ticket_id
            )

        # 3. Send private alert to Discord webhook if configured
        if settings.DISCORD_WEBHOOK_URL:
            await SupportService._send_discord_alert(
                phone=phone,
                user_query=user_query,
                ticket_id=ticket_id,
                issue_url=issue_url,
                device_diagnostics=device_diagnostics
            )

        return {
            "ticket_id": ticket_id,
            "issue_number": issue_number,
            "issue_url": issue_url
        }

    @staticmethod
    async def _create_github_issue(
        phone: str,
        user_query: str,
        chat_history: list[ChatMessage],
        device_diagnostics: dict | None,
        ticket_id: str
    ) -> tuple[int, str]:
        """Call GitHub API to open a developer issue ticket."""
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

        # Format diagnostics
        diagnostics_str = "None provided"
        if device_diagnostics:
            diagnostics_str = "\n".join([f"- **{k}**: `{v}`" for k, v in device_diagnostics.items()])

        body_content = (
            f"## 📱 CediSmart Support Escalation\n\n"
            f"**Ticket Database ID:** `{ticket_id}`\n"
            f"**Phone Number:** `{phone}`\n"
            f"**Primary Query:** {user_query}\n\n"
            f"### ⚙️ Diagnostics\n"
            f"{diagnostics_str}\n\n"
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
                    return resp_json["number"], resp_json["html_url"]
                else:
                    logger.error("GitHub API issue creation failed (status %d): %s", response.status_code, response.text)
                    return 0, "github_error"
        except httpx.RequestError as exc:
            logger.error("Failed to connect to GitHub API: %s", str(exc))
            return 0, "github_unreachable"

    @staticmethod
    async def _send_discord_alert(
        phone: str,
        user_query: str,
        ticket_id: str,
        issue_url: str,
        device_diagnostics: dict | None
    ) -> None:
        """Trigger Discord Webhook message to notify the team instantly of a ticket creation."""
        # Format diagnostics block
        diag_lines = []
        if device_diagnostics:
            for k, v in device_diagnostics.items():
                diag_lines.append(f"{k}: {v}")
        diag_str = "\n".join(diag_lines) if diag_lines else "No diagnostics provided."

        embed = {
            "title": "🚨 CediSmart Support Ticket Created",
            "description": f"A user has escalated a support issue to the developers.",
            "color": 14034714,  # Red color decimal
            "fields": [
                {"name": "📞 User Phone", "value": f"`{phone}`", "inline": True},
                {"name": "🆔 Ticket ID", "value": f"`{ticket_id}`", "inline": True},
                {"name": "💬 User Query", "value": user_query, "inline": False},
                {"name": "⚙️ Diagnostics", "value": f"```\n{diag_str}\n```", "inline": False}
            ]
        }

        if issue_url and issue_url != "database_only" and "mock" not in issue_url:
            embed["fields"].append({"name": "🌐 GitHub Issue Link", "value": f"[Open GitHub Issue]({issue_url})", "inline": False})

        payload = {
            "username": "CediSmart Support Bot",
            "embeds": [embed]
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(settings.DISCORD_WEBHOOK_URL, json=payload)
                if res.status_code < 300:
                    logger.info("Discord support webhook successfully notified.")
                else:
                    logger.error("Discord support webhook failed with status %d: %s", res.status_code, res.text)
        except Exception as e:
            logger.error("Error invoking Discord webhook: %s", str(e))
