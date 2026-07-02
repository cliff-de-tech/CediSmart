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
    "Your focus is helping logged-in users understand and use CediSmart's ledger, budgeting, and transaction syncing features:\n"
    "- Ledgers: Help them understand how to set up ledgers (personal, business, savings), add transactions "
    "(categorize expense vs income), and review monthly reports.\n"
    "- Budgeting: Guide them on setting monthly budgets, track savings goals, and manage MoMo transaction fee settings.\n"
    "- Mobile Money Live Sync (Background SMS Sync): Guide them on how to configure automated transaction tracking:\n"
    "  1. 🤖 Google Android: Android supports direct background intercepting. Guide the user to click 'Configure Auto-Sync' in their Accounts tab, select Android, and tap 'Grant SMS Permissions' to allow background SMS reading.\n"
    "  2. 🍎 Apple iOS: iOS sandboxing blocks direct SMS reading. Explain that they can configure Apple's native Shortcuts app to securely forward messages via webhook:\n"
    "     * Step 1: Open Shortcuts app ➔ Go to 'Automation' tab ➔ Tap '+' ➔ Select 'Message' as trigger (Sender: 'MobileMoney' or 'T-CASH'). Set 'Run Immediately'.\n"
    "     * Step 2: Under actions, add 'Get Contents of URL' action, change method to 'POST', and paste the Webhook URL copied from Settings ➔ Accounts.\n"
    "     * Step 3: Add an Authorization header: Key: 'Authorization', Value: 'Bearer <your key>' (using the copied Auth Key from Accounts tab).\n"
    "     * Step 4: Change request body to JSON and add fields: 'sender' ➔ select Sender (from message), 'message_body' ➔ select Message/Shortcut Input, 'phone' ➔ type their registered CediSmart phone number.\n"
    "- Important restriction: Since you are post-login support, if the user asks about changing phone numbers or "
    "re-registering, guide them to the profile/auth settings.\n\n"
    "IMPORTANT ESCALATION PROTOCOL:\n"
    "If the user describes a bug, a server crash, asks for a human / developer, or if the issue is complex "
    "and you cannot solve it, add the exact tag '[ESCALATE_REQUIRED]' at the end of your response. "
    "This lets the system know it needs to escalate the conversation to the developer."
)

class SupportService:
    @staticmethod
    async def generate_chat_response(
        messages: list[ChatMessage], 
        support_type: str | None = None,
        user_name: str | None = None
    ) -> str:
        """Call Gemini model to generate a supportive assistant response with personalized Ghanaian pidgin vibe."""
        first_name = "Chale"
        if user_name:
            parts = user_name.strip().split()
            if parts:
                first_name = parts[0]

        personalization = (
            f"The user's first name is {first_name}. You MUST warmly welcome and address them by their first name (e.g. 'Hey {first_name}', 'Yo {first_name}', 'Chale {first_name}', etc.).\n"
            "Adopt a friendly, warm, and insightful Ghanaian pidgin assistant vibe (using terms like 'chale', 'wahala', 'no wahala', 'dey active', 'make we look', 'chaw', 'dey bleed', 'dey check', 'boss', 'don', etc.) throughout your conversation, "
            "but make sure your technical/financial advice (Shortcuts webhook URL setup, Android permissions, budget setting) remains 100% clear, accurate, and structured."
        )

        base_prompt = AUTH_SYSTEM_PROMPT if support_type == "auth" else GENERAL_SYSTEM_PROMPT
        system_prompt = f"{base_prompt}\n\n=== TONE & PERSONALIZATION RULES ===\n{personalization}"

        if not settings.GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY is not set. Using local rules-based support fallback.")
            return SupportService._fallback_support_response(messages, support_type, first_name)

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
                    logger.warning("Falling back to local support assistant engine due to API error (e.g. rate limit/429).")
                    return SupportService._fallback_support_response(messages, support_type, first_name)
        except httpx.RequestError as exc:
            logger.error("Failed to connect to Gemini API: %s", str(exc))
            logger.warning("Falling back to local support assistant engine due to connection exception.")
            return SupportService._fallback_support_response(messages, support_type, first_name)

    @staticmethod
    def _fallback_support_response(messages: list[ChatMessage], support_type: str | None = None, first_name: str = "Chale") -> str:
        """Provide a personalized fallback response when Gemini is not configured."""
        last_msg = messages[-1].content.lower() if messages else ""

        if support_type == "auth":
            if "otp" in last_msg or "code" in last_msg or "sms" in last_msg:
                return (
                    f"Chale {first_name}, it looks like you're having trouble receiving your verification OTP. Please check:\n"
                    "1. That your phone has active cellular reception.\n"
                    "2. That the number was entered correctly (9 digits, e.g. 24XXXXXXX, excluding the leading 0).\n"
                    "If the issue persists, tap 'Escalate' to report this bug to our developers."
                )
            else:
                return (
                    f"Hi {first_name}! I am the CediSmart Onboarding Assistant. I can help you with OTP codes, "
                    "registration, and PIN resets. (If you have a complicated issue, please let me know and I will raise a developer ticket)."
                )
        else:
            if "pin" in last_msg or "password" in last_msg or "reset" in last_msg:
                return (
                    f"Chale {first_name}, to reset your PIN, please use the 'Forgot PIN?' link on the Login screen. "
                    "This will verify your identity via SMS before prompting you to choose a new 6-digit PIN."
                )
            elif "sync" in last_msg or "shortcut" in last_msg or "sms" in last_msg or "automation" in last_msg:
                return (
                    f"Chale {first_name}, here is how to configure Mobile Money Live Sync:\n"
                    "1. Go to Settings ➔ Accounts and look for the 'Mobile Money Live Sync' panel under your linked accounts.\n"
                    "2. Tap 'Configure Auto-Sync (iOS / Android)'.\n"
                    "3. For Google Android: Tap 'Grant SMS Permissions' to enable automated background listening.\n"
                    "4. For Apple iOS: Copy your Webhook URL and Auth Key, then open the native Apple Shortcuts app and configure a new 'Message' Personal Automation (set request to POST, add Authorization header, and send the message details as JSON)."
                )
            else:
                return (
                    f"Hi {first_name}! I am the CediSmart Support Assistant. I can help you set budgets, "
                    "create ledgers, log transactions, and configure background MoMo message sync. What can I help you with today?"
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
