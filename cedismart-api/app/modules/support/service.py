import asyncio
import json
import logging
import re
from datetime import date
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.support.models import SupportTicket
from app.modules.support.schemas import ChatMessage

logger = logging.getLogger(__name__)

ACTION_TAGS_GUIDE = (
    "\n\n=== INTERACTIVE 1-TAP ACTION TAGS ('DO IT FOR ME' CARDS) ===\n"
    "You can embed interactive Liquid Glass action buttons inside your reply by appending one or more of these exact tags at the end of your message when relevant:\n"
    "- `[ACTION:NAV_ADD_EXPENSE]` — Include this whenever the user asks to log, add, or record an expense or income. It lets them open the Add Transaction screen in 1 tap.\n"
    "- `[ACTION:NAV_BUDGETS]` — Include this whenever advising the user to check, create, or adjust their monthly category budgets.\n"
    "- `[ACTION:NAV_TRANSACTIONS]` — Include this whenever the user wants to inspect their full transaction history or search for an entry.\n"
    "- `[ACTION:GENERATE_MOMO_KEY]` — Include this whenever the user asks about Mobile Money Auto-Sync, SMS sync, iOS Shortcuts setup, or Android background SMS permissions.\n"
    "- `[ACTION:OPEN_SHORTCUTS]` — Include this when guiding an iOS user through Apple Shortcuts automation so they can jump straight into the Shortcuts app in 1 tap.\n"
    "- `[ACTION:SYNC_OFFLINE_QUEUE]` — Include this if the user's telemetry shows pending offline transactions waiting to upload.\n"
    "- `[ACTION:HEAL_APP]` — Include this if the user reports stale balances or needs to check for app problems in 1 tap.\n"
    "- `[ACTION:REPORT_PROBLEM]` — Include this if an issue cannot be resolved through automated troubleshooting and should be sent to customer support.\n"
)

CRITICAL_TRUTH_AND_INTEGRITY_RULES = (
    "\n\n=== CRITICAL TRUTH & TRANSACTION INTEGRITY RULES (ZERO HALLUCINATIONS) ===\n"
    "1. You CANNOT directly create, edit, delete, or categorize transactions in the database from chat messages unless "
    "the system explicitly attached a verified '=== INSTANT SMS RESCUE EXECUTED ===' or '=== AUTONOMOUS ACTION EXECUTED ===' block in your context.\n"
    "2. NEVER claim, pretend, or tell the user that you 'logged', 'saved', 'recorded', or 'categorized' a transaction unless you see "
    "an explicit '=== INSTANT SMS RESCUE EXECUTED ===' or '=== AUTONOMOUS ACTION EXECUTED ===' banner in this prompt!\n"
    "3. In Advisor Mode (Auto-Pilot OFF), when the user asks to record an expense, log income, or scan a receipt, "
    "output the structured `[PROPOSED_TRANSACTION: {...}]` or `[PROPOSED_BUDGET: {...}]` tag at the end of your message so the user can review and tap 'Confirm & Save' with 1 touch.\n"
    "4. Always verify facts against the 'LIVE X-RAY ACCOUNT & DEVICE TELEMETRY' provided below. "
    "If the telemetry lists their recent transactions, budgets, or reports, cite the actual numbers accurately rather than inventing amounts.\n"
)

VOICE_MODE_INSTRUCTIONS = (
    "\n\n=== CHATGPT LIVE VOICE MODE INSTRUCTIONS ===\n"
    "When a user message begins with `[VOICE_MODE]` or is spoken via hands-free Voice Call Mode:\n"
    "1. Speak naturally as a friendly, reassuring Ghanaian financial companion (mimicking ChatGPT Voice).\n"
    "2. Keep your spoken response brief, conversational, and direct (1 to 2 short sentences max).\n"
    "3. Never include markdown bullet points, asterisks, or raw symbols that sound awkward when read out loud by text-to-speech.\n"
    "4. Pronounce all currency strictly in Cedis or Ghana Cedis (e.g. '50 Cedis' or '50 Ghana Cedis'). NEVER say 'Dollars', and NEVER use dollar signs ($).\n"
    "5. When reporting pesewas, say e.g. '12 Cedis and 50 Pesewas'.\n"
)

AUTH_SYSTEM_PROMPT = "".join(
    [
        "You are the CediSmart Onboarding & Authentication Troubleshooter. CediSmart is a digital ledger "
        "and budgeting mobile application built for the Ghanaian market.\n\n",
        "Your tone should be professional, polite, helpful, and direct.\n\n",
        "Your sole focus is helping users resolve registration, SMS verification OTP, sign-in, and 6-digit Secure PIN reset issues.\n",
        "- SMS Verification OTP: SMS verification is handled via Clerk. If they aren't receiving OTPs, "
        "suggest they check cellular signal, ensure they didn't prefix the number with another 0 "
        "(Ghana numbers are 9 digits, e.g., 24XXXXXXX, excluding the leading 0), or check if they have "
        "MTN Do Not Disturb (DND) active which blocks transaction SMS. "
        "Also note that reviewers can use pre-configured Test Phone Numbers.\n",
        "- PIN & Login: Security PINs are 6 digits and stored securely. PIN resets require a Clerk "
        "phone re-verification step.\n",
        "- Screenshot Vision: If the user attaches a screenshot of an error screen or OTP issue, inspect the visual details carefully and give exact step-by-step guidance.\n",
        "- Important restriction: Since you are the Onboarding Troubleshooter, if users ask about general ledger usage, "
        "adding transactions, or setting budgets, politely advise them that you are specialized in login/registration issues, "
        "but once they are logged in, the General Support assistant in Settings will happily help them with budgeting.\n\n",
        "IMPORTANT ESCALATION PROTOCOL:\n",
        "If the user describes a bug, a server crash, asks for human support, or if the issue is complex "
        "and you cannot solve it, add the exact tag '[ESCALATE_REQUIRED]' at the end of your response. "
        "This lets the system know it needs to offer the user a direct problem report.",
        ACTION_TAGS_GUIDE,
        CRITICAL_TRUTH_AND_INTEGRITY_RULES,
        VOICE_MODE_INSTRUCTIONS,
    ]
)

GENERAL_SYSTEM_PROMPT = "".join(
    [
        "You are the CediSmart Ledger & Budgeting Co-Pilot. CediSmart is a digital ledger and budgeting "
        "mobile application built for the Ghanaian market, supporting Cash, Mobile Money (MTN, Telecel, AT), "
        "and Bank accounts.\n\n",
        "Your tone should be professional, polite, reassuring, and direct. You must provide clear, trustworthy financial advice.\n\n",
        "Your focus is helping logged-in users understand and use CediSmart's ledger, budgeting, and transaction syncing features:\n",
        "- Ledgers: Help them understand how to set up accounts, record transactions (categorize expense vs income), and review monthly reports.\n",
        "- Budgeting: Guide them on setting monthly category budgets and tracking spending limits.\n",
        "- Live Budget & Report Intelligence: You have direct, real-time access to the user's active monthly budgets and financial reports in the 'LIVE X-RAY ACCOUNT & DEVICE TELEMETRY'. When the user asks about their spending, budgets, savings rate, or financial health:\n",
        "  * Answer immediately and accurately with their actual numbers (e.g. 'You have spent GH₵ 150.00 out of your GH₵ 500.00 Food budget (30%), leaving GH₵ 350.00 remaining.').\n",
        "  * Proactively warn them if any budget shows '[OVER BUDGET!]' or has exceeded 80% of its limit.\n",
        "  * If they have no budgets set, encourage them to create one and provide `[ACTION:NAV_BUDGETS]`.\n",
        "- Mobile Money Live Sync (Background SMS Sync): Guide them on how to configure automated transaction tracking:\n",
        "  1. 🤖 Google Android: Android supports direct background intercepting. Guide the user to click 'Configure Auto-Sync' in their Accounts tab, select Android, and tap 'Grant SMS Permissions' to allow background SMS reading.\n",
        "  2. 🍎 Apple iOS: iOS sandboxing blocks direct SMS reading. Explain that they can configure Apple's native Shortcuts app to securely forward messages via webhook:\n",
        "     * Step 1: Open Shortcuts app ➔ Go to 'Automation' tab ➔ Tap '+' ➔ Select 'Message' as trigger (Sender: 'MobileMoney' or 'T-CASH'). Set 'Run Immediately'.\n",
        "     * Step 2: Under actions, add 'Get Contents of URL' action, change method to 'POST', and paste the Webhook URL copied from Settings ➔ Accounts.\n",
        "     * Step 3: Add an Authorization header: Key: 'Authorization', Value: 'Bearer <your key>' (using the copied Auth Key from Accounts tab).\n",
        "     * Step 4: Change request body to JSON and add fields: 'sender' ➔ select Sender (from message), 'message_body' ➔ select Message/Shortcut Input, 'phone' ➔ type their registered CediSmart phone number.\n",
        "- Paste-Any-SMS Rescue: Users can also paste any missed MTN MoMo, Telecel Cash, or AT Money SMS directly into this support chat and our system will automatically parse and log it into their wallet!\n",
        "- Screenshot & Receipt Vision (Multi-Item Scanner & Splitter): Users can attach screenshots or photos of paper store receipts, market invoices, and checkout slips:\n",
        "  1. Read the image carefully: Transcribe the merchant/store name, transaction date, and line items with individual prices.\n",
        "  2. Present a clean itemized breakdown list of all items and total amount.\n",
        "  3. In Advisor Mode (Auto-Pilot OFF): Append one `[PROPOSED_TRANSACTION: {...}]` tag on its own line for EACH distinct receipt line item (or for the total if preferred) so the user can review and log items with 1 tap.\n",
        "  4. In Auto-Pilot Mode (Auto-Pilot ON): If the user asked you to log/scan the receipt, the items will be recorded automatically.\n",
        "- Important restriction: Since you are post-login support, if the user asks about changing phone numbers or ",
        "re-registering, guide them to the profile/auth settings.\n\n",
        "IMPORTANT ESCALATION PROTOCOL:\n",
        "If the user describes a bug, a server crash, asks for human support, or if the issue is complex ",
        "and you cannot solve it, add the exact tag '[ESCALATE_REQUIRED]' at the end of your response. ",
        "This lets the system know it needs to offer the user a direct problem report.",
        ACTION_TAGS_GUIDE,
        CRITICAL_TRUTH_AND_INTEGRITY_RULES,
        VOICE_MODE_INSTRUCTIONS,
    ]
)


LANGUAGE_PROMPTS = {
    "en": (
        "\n\n=== LANGUAGE: STANDARD GHANAIAN ENGLISH ===\n"
        "- Respond in clear, professional English with light Ghanaian cultural warmth.\n"
        "- State all currency amounts clearly (e.g. 'GH₵ 50.00').\n"
    ),
    "pidgin": (
        "\n\n=== LANGUAGE: GHANAIAN PIDGIN MODE ===\n"
        "- Respond in warm, authentic Ghanaian Pidgin!\n"
        "- Use natural phrases such as: 'Charley', 'Chop money', 'No wahala', 'You dey balance well', 'I don check am', 'Ledger clean', 'Sika no dey move'.\n"
        "- Keep all numbers, currency figures, and dates crystal clear (e.g. 'GH₵ 50.00', 'MTN MoMo').\n"
        "- Keep financial advice supportive and realistic.\n"
    ),
    "twi": (
        "\n\n=== LANGUAGE: AUTHENTIC TWI / AKAN FINANCIAL MODE ===\n"
        "- Respond in respectful, natural Asante Twi (Akan) with clear financial vocabulary!\n"
        "- Use authentic Akan financial concepts:\n"
        "  * Balance / Funds: 'Wo sika a ɛwɔ wo akontabuo mu' or 'Wo kotokuo mu sika'\n"
        "  * Total Balance: 'Wo sika nyinaa bom yɛ...'\n"
        "  * Expenses / Money spent: 'Sika a woasɛe no' or 'Sika a ɛkɔeɛ'\n"
        "  * Income / Received funds: 'Sika a ɛbaaeɛ' or 'Sika foforɔ a wunyaeɛ'\n"
        "  * Remaining limit: 'Sika a aka a wobɛtumi asɛe'\n"
        "  * Budget / Plan: 'Sika nhyehyɛeɛ'\n"
        "  * Record in ledger: 'Mede ahyɛ wo ledger no mu' or 'Yɛatwerɛ no wɔ wo akontabuo mu'\n"
        "  * Food / Dining: 'Aduane sika' (e.g., waakye, fufu, jollof)\n"
        "  * Transportation: 'Akwantuo / lɔre sika / trotro / petrol'\n"
        "  * Utilities: 'Anyinam ahoɔden (light bill) ne nsuo gye sika'\n"
        "  * Airtime & Data: 'Kasa mfidie sika (airtime) ne intanɛt data'\n"
        "  * Savings: 'Sika a woakora'\n"
        "- Natural Conversational Akan Expressions:\n"
        "  * Greetings & Politeness: 'Akwaaba', 'Medaase pa ara', 'Yɛsrɛ wo', 'Ɛnyɛ hwee koraa' (No problem at all).\n"
        "  * Encouragement: 'Wo sika nhyehyɛeɛ rekɔ yie pa ara' (Your budget is doing very well), 'Wo reyɛ adwuma pa!'\n"
        "- Always state numbers and currency figures crystal clear in Cedis (e.g. '50 Cedis' or 'GH₵ 50.00').\n"
        "- Tone: Warm, respectful, supportive, and knowledgeable.\n"
        "- Few-Shot Spoken Dialogue Examples in Twi:\n"
        "  * Example 1 (Logging an expense):\n"
        "    User: 'Mede 50 cedis atɔ petrol' or 'Log 50 cedis for fuel'\n"
        "    Assistant: 'Medaase, mate aseɛ. Me de GH₵ 50.00 a wode tɔɔ petrol no ahyɛ wo akontabuo mu. Wo sika nhyehyɛeɛ no kɔ so yie.'\n"
        "  * Example 2 (Balance query):\n"
        "    User: 'Me sika a ɛwɔ me MoMo mu yɛ ahe?'\n"
        "    Assistant: 'Wo MTN MoMo akontabuo mu sika nyinaa yɛ GH₵ 450.00. Sika nyinaa a ɛwɔ wo nsa ne wo bank mu nso yɛ GH₵ 1,200.00.'\n"
        "  * Example 3 (Budget status):\n"
        "    User: 'Me aduane sika nhyehyɛeɛ no te sɛn?'\n"
        "    Assistant: 'Wode GH₵ 240.00 atɔ aduane afiri GH₵ 500.00 a wode sii hɔ bosome yi mu. Sika a aka a wobɛtumi asɛe yɛ GH₵ 260.00.'\n"
    ),
}

DEEP_AUDIT_PROMPT = (
    "\n\n=== DEEP FINANCIAL AUDIT MODE ACTIVE ===\n"
    "The user has toggled ON Deep Financial Audit. Provide an in-depth CFO-level analysis:\n"
    "1. Comprehensive Diagnosis: Analyze the user's spending against their monthly income and active budgets from the telemetry.\n"
    "2. Burn-Rate & Velocity: Assess if their daily spending velocity is sustainable for the rest of the month.\n"
    "3. Outlier Categories: Highlight the biggest money drain (top expense category) and calculate what % of total expenses it represents.\n"
    "4. Strategic Savings Advice: Provide 2 specific, realistic cost-cutting moves relevant in Ghana (e.g., preparing meals, grouping errands to save fuel/trotro, managing peak MoMo E-Levy charges).\n"
)


def get_execution_mode_prompt(auto_pilot: bool) -> str:
    if auto_pilot:
        return (
            "\n\n=== AUTO-PILOT EXECUTION MODE ACTIVE ===\n"
            "Autonomous execution is enabled by the user. If the user explicitly asks to record an expense, log income, or set a budget:\n"
            "- If the system executed the database mutation, you will see '=== AUTONOMOUS ACTION EXECUTED ===' below. Confirm the action with concise celebration.\n"
            "- Emphasize that the ledger was updated automatically and an instant undo is available in the chat.\n"
        )
    else:
        return (
            "\n\n=== ADVISOR MODE ACTIVE (CONFIRMATION FIRST) ===\n"
            "Auto-Pilot is OFF (Advisor Mode). You CANNOT write directly to the database without user confirmation.\n"
            "When the user asks you to log an expense, record income, or adjust a budget:\n"
            "1. Politely explain what you prepared.\n"
            "2. At the very end of your response, output structured proposal tags on their own lines so the app can render interactive confirmation cards:\n"
            "   For single expense/income:\n"
            '   `[PROPOSED_TRANSACTION: {"amount": 50.0, "transaction_type": "expense", "category_name": "Food & Dining", "wallet_name": "Mobile Money", "description": "Lunch", "transaction_date": "YYYY-MM-DD"}]`\n'
            "   For multiple expenses or receipt line items, output ONE tag per line for EACH distinct item:\n"
            '   `[PROPOSED_TRANSACTION: {"amount": 50.0, "transaction_type": "expense", "category_name": "Transportation", "wallet_name": "Mobile Money", "description": "Fuel", "transaction_date": "YYYY-MM-DD"}]`\n'
            '   `[PROPOSED_TRANSACTION: {"amount": 30.0, "transaction_type": "expense", "category_name": "Food & Dining", "wallet_name": "Cash", "description": "Lunch", "transaction_date": "YYYY-MM-DD"}]`\n'
            "   For budgets:\n"
            '   `[PROPOSED_BUDGET: {"category_name": "Food & Dining", "monthly_limit": 500.0}]`\n'
            "3. Ask the user to tap 'Confirm & Save' (or 'Confirm All') on the cards to record them.\n"
        )


PERSONA_PROFILES: dict[str, dict[str, str]] = {
    "akosua": {
        "name": "Akosua",
        "gender": "female",
        "role": "CediSmart Financial Companion",
        "style": "Warm, respectful, welcoming, encouraging, and financially knowledgeable Ghanaian sister/companion.",
        "intro_en": "I am Akosua, your personal CediSmart financial companion.",
        "intro_twi": "Me din de Akosua, wo CediSmart sika afotufoɔ ne wo yɔnkoɔ pa.",
        "intro_pidgin": "My name na Akosua, your personal CediSmart financial paddy.",
    },
    "kwame": {
        "name": "Kwame",
        "gender": "male",
        "role": "CediSmart Personal CFO",
        "style": "Confident, grounded, sharp, analytical, reassuring, and wealth-building Ghanaian personal CFO.",
        "intro_en": "I am Kwame, your CediSmart personal CFO and wealth strategist.",
        "intro_twi": "Me din de Kwame, wo CediSmart sika hwɛfoɔ ne wo sika akwankyerɛfoɔ.",
        "intro_pidgin": "My name na Kwame, your CediSmart personal CFO wey dey watch your money.",
    },
    "esi": {
        "name": "Esi",
        "gender": "female",
        "role": "CediSmart Money Navigator",
        "style": "Vibrant, modern, upbeat, quick-witted, and proactive Ghanaian financial companion.",
        "intro_en": "I am Esi, your vibrant CediSmart money companion!",
        "intro_twi": "Me din de Esi, wo CediSmart sika yɔnkoɔ a me ho yɛ hare!",
        "intro_pidgin": "I be Esi, your sharp and energetic CediSmart money navigator!",
    },
}


def get_persona_identity_prompt(persona_key: str = "akosua", language: str = "en") -> str:
    key = (persona_key or "akosua").lower()
    profile = PERSONA_PROFILES.get(key, PERSONA_PROFILES["akosua"])
    p_name = profile["name"]
    p_role = profile["role"]
    p_style = profile["style"]
    p_intro = profile["intro_en"]
    if language == "twi":
        p_intro = profile["intro_twi"]
    elif language == "pidgin":
        p_intro = profile["intro_pidgin"]

    return (
        f"\n\n=== YOUR IDENTITY & NAME (MANDATORY) ===\n"
        f"Your name is {p_name}. You are the {p_role} for CediSmart in Ghana.\n"
        f"Gender: {profile['gender']}. Personality & Tone: {p_style}\n"
        f"- When the user asks what your name is ('What is your name?', 'Who are you?', 'Who am I speaking with?'), "
        f"or in Twi ('Wo din de sɛn?'), or in Pidgin ('Wetin be your name?'), ALWAYS state your name '{p_name}' clearly and proudly: e.g. \"{p_intro}\".\n"
        f"- When the user greets you by your name '{p_name}' (e.g. 'Hello {p_name}', '{p_name}, check my balance', 'Kwame, how much did I spend?'), "
        f"acknowledge your name warmly and naturally.\n"
        f"- Under NO circumstances claim you are a generic faceless bot or anonymous machine. You are {p_name} of CediSmart.\n"
    )


class SupportService:
    @staticmethod
    async def build_xray_telemetry(
        db: AsyncSession | None,
        phone: str | None,
        device_diagnostics: dict[str, Any] | None,
        user_id: UUID | None = None,
    ) -> tuple[str, Any]:
        """Build a live X-Ray diagnostic snapshot from Postgres + client telemetry."""
        lines: list[str] = []
        user_obj = None

        if device_diagnostics:
            os_name = device_diagnostics.get("os", "unknown")
            os_ver = device_diagnostics.get("os_version", "unknown")
            app_ver = device_diagnostics.get("app_version", "1.0.0")
            offline_q = device_diagnostics.get("offline_queue_count", 0)
            net_state = device_diagnostics.get("network_state", "online")
            has_token = device_diagnostics.get("has_momo_sync_token", None)
            lines.append(
                f"- Client Device: OS={os_name} ({os_ver}), App v{app_ver}, Network={net_state}, "
                f"Pending Offline Queue={offline_q} tx(s), Local Auth Token Present={has_token}"
            )

        if db is not None:
            try:
                from app.modules.accounts.models import FinancialAccount
                from app.modules.accounts.service import _compute_balances
                from app.modules.auth.models import User
                from app.modules.transactions.models import Transaction

                if user_id:
                    stmt = select(User).where(User.id == user_id)
                    res = await db.execute(stmt)
                    user_obj = res.scalar_one_or_none()

                if not user_obj and phone and phone.lower() != "anonymous":
                    clean = phone.strip().replace(" ", "").replace("-", "")
                    candidates = {clean}
                    if clean.startswith("+233"):
                        candidates.add("0" + clean[4:])
                    elif clean.startswith("0") and len(clean) == 10:
                        candidates.add("+233" + clean[1:])

                    stmt = select(User).where(User.phone.in_(list(candidates)))
                    res = await db.execute(stmt)
                    user_obj = res.scalar_one_or_none()

                if user_obj:
                    tier = (
                        "Pro Premium"
                        if user_obj.is_premium
                        else (
                            f"7-Day Free Trial ({user_obj.trial_days_remaining}d left)"
                            if user_obj.is_trial_active
                            else "Free Tier"
                        )
                    )
                    lines.append(
                        f"- Account Profile: Phone={user_obj.phone}, Name={user_obj.full_name or 'N/A'}, "
                        f"Tier={tier}, KYC Verified={user_obj.kyc_verified}"
                    )

                    acc_stmt = select(FinancialAccount).where(
                        FinancialAccount.user_id == user_obj.id,
                        FinancialAccount.is_active.is_(True),
                    )
                    acc_res = await db.execute(acc_stmt)
                    accounts = list(acc_res.scalars().all())
                    if accounts:
                        balances = await _compute_balances(
                            user_obj.id, db, [a.id for a in accounts]
                        )
                        acc_summaries = []
                        has_momo = False
                        for a in accounts:
                            if a.account_type == "mobile_money":
                                has_momo = True
                            bal = balances.get(a.id, a.opening_balance)
                            acc_summaries.append(
                                f"{a.name} ({a.account_type}/{a.provider or 'N/A'} #{a.account_number or 'N/A'}: GH₵ {bal})"
                            )
                        lines.append(
                            f"- Active Wallets ({len(accounts)}): " + "; ".join(acc_summaries)
                        )
                        lines.append(
                            f"- Mobile Money Wallet Linked: {'YES' if has_momo else 'NO (User must link a MoMo wallet in Accounts tab before SMS Auto-Sync can log transactions)'}"
                        )
                    else:
                        lines.append("- Active Wallets: 0 linked accounts.")

                    tx_stmt = (
                        select(Transaction)
                        .where(
                            Transaction.user_id == user_obj.id,
                            Transaction.is_deleted.is_(False),
                        )
                        .order_by(
                            Transaction.transaction_date.desc(), Transaction.created_at.desc()
                        )
                        .limit(3)
                    )
                    tx_res = await db.execute(tx_stmt)
                    recent_txs = list(tx_res.scalars().all())
                    if recent_txs:
                        tx_strs = [
                            f"{t.transaction_type.upper()} GH₵ {t.amount} ({t.description or 'No desc'} on {t.transaction_date})"
                            for t in recent_txs
                        ]
                        lines.append("- Latest 3 Ledger Transactions: " + " | ".join(tx_strs))
                    else:
                        lines.append("- Latest Ledger Transactions: None recorded yet.")

                    # 4. Active Monthly Budgets Telemetry
                    try:
                        from app.modules.budgets.service import list_budgets

                        today_now = date.today()
                        budgets_list = await list_budgets(
                            user_obj.id, db, today_now.year, today_now.month
                        )
                        if budgets_list:
                            b_summaries = []
                            for b in budgets_list:
                                cat_name = b.get("category", {}).get("name", "Unknown")
                                budgeted = b.get("budgeted_amount", "0.00")
                                spent = b.get("spent_amount", "0.00")
                                rem = b.get("remaining_amount", "0.00")
                                pct = b.get("percentage_used", "0.00")
                                over_tag = " [OVER BUDGET!]" if b.get("is_over_budget") else ""
                                b_summaries.append(
                                    f"{cat_name}: Limit GH₵ {budgeted}, Spent GH₵ {spent} ({pct}%){over_tag}, Remaining GH₵ {rem}"
                                )
                            lines.append(
                                f"- Active Budgets ({today_now.strftime('%B %Y')}): "
                                + " | ".join(b_summaries)
                            )
                        else:
                            lines.append(
                                f"- Active Budgets ({today_now.strftime('%B %Y')}): None set yet for this month."
                            )
                    except Exception as b_err:
                        logger.warning("Failed to load budgets for X-Ray: %s", str(b_err))

                    # 5. Monthly Financial Report & Spending Breakdown Telemetry
                    try:
                        from app.modules.reports.service import (
                            get_category_report,
                            get_monthly_report,
                        )

                        today_now = date.today()
                        m_report = await get_monthly_report(
                            user_obj.id, today_now.year, today_now.month, db
                        )
                        if m_report:
                            inc = m_report.get("total_income", "0.00")
                            exp = m_report.get("total_expense", "0.00")
                            net = m_report.get("net", "0.00")
                            tx_cnt = m_report.get("transaction_count", 0)
                            top_cat = m_report.get("top_expense_category")
                            top_cat_str = (
                                f", Top Expense Category: {top_cat['name']} (GH₵ {top_cat['amount']})"
                                if top_cat
                                else ""
                            )
                            lines.append(
                                f"- Financial Report ({today_now.strftime('%B %Y')}): Total Income GH₵ {inc}, Total Expenses GH₵ {exp}, Net Savings GH₵ {net} ({tx_cnt} transactions{top_cat_str})"
                            )

                            # Top spending breakdown
                            start_of_month = date(today_now.year, today_now.month, 1)
                            cat_report = await get_category_report(
                                user_obj.id, start_of_month, today_now, "expense", db
                            )
                            cats = cat_report.get("categories", [])
                            if cats:
                                top_3 = [
                                    f"{c['name']} (GH₵ {c['amount']}, {c['percentage']}%)"
                                    for c in cats[:3]
                                ]
                                lines.append("- Top Spending Categories: " + ", ".join(top_3))
                    except Exception as r_err:
                        logger.warning("Failed to load reports for X-Ray: %s", str(r_err))
                else:
                    lines.append(
                        f"- Database Lookup: No registered user found matching phone '{phone}'."
                    )
            except Exception as exc:
                logger.warning("X-Ray telemetry lookup non-fatal error: %s", str(exc))

        if not lines:
            return "", None

        telemetry_block = (
            "\n\n=== LIVE X-RAY ACCOUNT & DEVICE TELEMETRY (SILENT DIAGNOSTICS) ===\n"
            "Use this real-time telemetry to diagnose the user's issue immediately without asking redundant questions:\n"
            + "\n".join(lines)
        )
        return telemetry_block, user_obj

    @staticmethod
    def _looks_like_momo_sms(text: str) -> bool:
        """Detect if a user message contains a raw Ghanaian Mobile Money / bank SMS."""
        if len(text) < 25:
            return False
        lower = text.lower()
        has_currency = bool(re.search(r"(?:ghs|ghc|₵)\s*\d+", text, re.IGNORECASE))
        sms_markers = [
            "payment received",
            "payment made",
            "you have received",
            "you have sent",
            "you have transferred",
            "transferred ghs",
            "payment of ghs",
            "cash out",
            "cash-out",
            "transaction id",
            "financial transaction id",
            "current balance",
            "available balance",
            "e-levy",
            "mobilemoney",
            "telecel cash",
            "t-cash",
        ]
        marker_hits = sum(1 for m in sms_markers if m in lower)
        return has_currency and marker_hits >= 1

    @staticmethod
    def _split_sms_blocks(text: str) -> list[str]:
        """Split pasted text into individual SMS messages if multiple alerts are pasted together."""
        # Split by separator lines (===, ---, ***, ___) or multiple newlines
        initial_chunks = re.split(r"(?:\r?\n\s*[-=_*~]{3,}\s*\r?\n|\r?\n\s*\r?\n)+", text.strip())
        blocks: list[str] = []
        for chunk in initial_chunks:
            chunk = chunk.strip()
            if not chunk:
                continue
            # Also check if multiple SMS statements are concatenated without delimiter lines
            sub_chunks = re.split(
                r"(?<=[.!?\w])\s+(?=(?:payment\s+made\s+for|payment\s+received\s+for|payment\s+of\s+ghs|you\s+have\s+received|you\s+have\s+transferred|you\s+have\s+sent|cash\s*out\s+made\s+for))",
                chunk,
                flags=re.IGNORECASE,
            )
            for sub in sub_chunks:
                sub = sub.strip()
                if sub and SupportService._looks_like_momo_sms(sub):
                    blocks.append(sub)
        return (
            blocks
            if blocks
            else ([text.strip()] if SupportService._looks_like_momo_sms(text) else [])
        )

    @staticmethod
    async def _try_instant_sms_rescue(
        db: AsyncSession | None,
        user_obj: Any,
        raw_text: str,
    ) -> str | None:
        """If the user pasted raw MoMo SMS message(s) in Support Chat, parse and log them immediately."""
        if not SupportService._looks_like_momo_sms(raw_text):
            return None

        from app.modules.transactions.service import _parse_sms_fallback
        from app.modules.transactions.sms_parser import parse_sms as fast_parse_sms

        sms_blocks = SupportService._split_sms_blocks(raw_text)
        if not sms_blocks:
            sms_blocks = [raw_text.strip()]

        parsed_items: list[Any] = []
        for idx, block in enumerate(sms_blocks):
            parsed = fast_parse_sms("MobileMoney", block)
            if not parsed:
                fb = _parse_sms_fallback(block)
                if fb and fb.get("amount") and float(fb["amount"]) > 0:
                    ref = (
                        fb.get("reference_id")
                        or f"chat_sms_{int(date.today().strftime('%Y%m%d'))}_{abs(hash(block)) % 100000}_{idx}"
                    )
                    parsed = {
                        "amount": float(fb["amount"]),
                        "fee": 0.0,
                        "transaction_type": fb["transaction_type"],
                        "description": fb["description"],
                        "reference_id": ref,
                        "new_balance": 0.0,
                    }
            if parsed and parsed.get("amount") and float(parsed["amount"]) > 0:
                parsed_items.append(parsed)

        if not parsed_items:
            return None

        if db is None or user_obj is None:
            tx_summaries = [
                f"`{p['transaction_type'].upper()}` **GH₵ {p['amount']:.2f}** ({p['description']})"
                for p in parsed_items
            ]
            return (
                f"⚡ **Instant SMS Rescue Parsed ({len(parsed_items)} transaction{'s' if len(parsed_items) > 1 else ''}):**\n"
                + "\n".join(f"- {s}" for s in tx_summaries)
                + "\n\nLog in to an active account with a linked Mobile Money wallet to auto-credit your ledger! [ACTION:GENERATE_MOMO_KEY]"
            )

        try:
            from app.modules.accounts.models import FinancialAccount
            from app.modules.categories.models import Category
            from app.modules.transactions.models import Transaction

            acc_stmt = (
                select(FinancialAccount)
                .where(
                    FinancialAccount.user_id == user_obj.id,
                    FinancialAccount.is_active.is_(True),
                )
                .order_by(
                    (FinancialAccount.account_type == "mobile_money").desc(),
                    FinancialAccount.created_at.asc(),
                )
            )
            acc_res = await db.execute(acc_stmt)
            account = acc_res.scalars().first()
            if not account:
                return (
                    f"⚡ **Instant SMS Rescue Parsed:** I detected {len(parsed_items)} MoMo transaction(s), but you don't have an active wallet linked yet. "
                    f"Create a Mobile Money wallet in the **Accounts** tab first!"
                )

            newly_logged: list[dict[str, Any]] = []
            already_synced: list[dict[str, Any]] = []

            for item in parsed_items:
                ref_id = str(item.get("reference_id") or "")
                if ref_id:
                    dup_stmt = select(Transaction).where(
                        Transaction.user_id == user_obj.id,
                        Transaction.account_id == account.id,
                        Transaction.is_deleted.is_(False),
                        or_(
                            Transaction.notes.like(f"%{ref_id}%"),
                            Transaction.description.like(f"%{ref_id}%"),
                        ),
                    )
                    dup_res = await db.execute(dup_stmt)
                    if dup_res.scalars().first():
                        already_synced.append(item)
                        continue

                cat_stmt = select(Category).where(
                    or_(Category.user_id == user_obj.id, Category.is_system.is_(True)),
                    Category.category_type == item["transaction_type"],
                )
                cat_res = await db.execute(cat_stmt)
                cat_obj = cat_res.scalars().first()
                if not cat_obj:
                    cat_obj = Category(
                        user_id=user_obj.id,
                        name=(
                            "Mobile Money"
                            if item["transaction_type"] == "income"
                            else "MoMo Transfer"
                        ),
                        icon="wallet-outline",
                        color="#10B981",
                        category_type=item["transaction_type"],
                        is_system=False,
                    )
                    db.add(cat_obj)
                    await db.flush()

                new_tx = Transaction(
                    user_id=user_obj.id,
                    account_id=account.id,
                    category_id=cat_obj.id,
                    amount=item["amount"],
                    transaction_type=item["transaction_type"],
                    description=item["description"][:250],
                    transaction_date=date.today(),
                    notes=f"Rescued via AI Support Chat SMS Paste | Ref: {ref_id}",
                )
                db.add(new_tx)
                newly_logged.append(item)

            if newly_logged:
                await db.commit()
                try:
                    from app.core.redis import init_redis, redis_pool
                    from app.modules.transactions.service import _invalidate_caches

                    r_client = redis_pool
                    if r_client is None:
                        r_client = await init_redis()
                    if r_client is not None:
                        await _invalidate_caches(user_obj.id, date.today(), r_client)
                except Exception as c_err:
                    logger.warning("Failed to invalidate cache after SMS rescue: %s", str(c_err))

            # Format the verified result banner for Gemini and client confirmation
            parts = []
            if newly_logged:
                header = f"⚡ **Instant MoMo SMS Rescue Complete! ({len(newly_logged)} transaction{'s' if len(newly_logged) > 1 else ''} logged)**"
                lines = [header]
                for idx, t in enumerate(newly_logged, start=1):
                    lines.append(
                        f"{idx}. `{t['transaction_type'].upper()}` **GH₵ {t['amount']:.2f}** — {t['description']} (Ref: `{t['reference_id']}`)"
                    )
                lines.append(
                    f"\nWallet: **{account.name}**\nAll transactions have been logged directly into your ledger. Your wallet balance has been updated automatically! [ACTION:NAV_TRANSACTIONS]"
                )
                parts.append("\n".join(lines))

            if already_synced:
                sync_header = f"✅ **Already Recorded in Ledger ({len(already_synced)} item{'s' if len(already_synced) > 1 else ''}):**"
                sync_lines = [sync_header]
                for s in already_synced:
                    sync_lines.append(
                        f"- **GH₵ {s['amount']:.2f}** ({s['description']} — Ref `{s['reference_id']}`)"
                    )
                parts.append("\n".join(sync_lines))

            return "\n\n".join(parts) if parts else None
        except Exception as exc:
            logger.warning("Instant SMS rescue DB log failed: %s", str(exc))
            return None

    @staticmethod
    async def _try_autonomous_chat_execution(
        db: AsyncSession | None,
        user_obj: Any,
        raw_text: str,
    ) -> tuple[str | None, str | None]:
        """In Auto-Pilot mode, parse intent to log expenses/income or update budgets directly into Postgres.

        Supports:
        - Multi-item expenses & income in compound prompts (e.g. '50 for fuel and 30 for lunch')
        - Natural Ghanaian English, Pidgin ('I chop 25 for waakye'), and Twi ('Mede 40 atɔ aduane')
        - Monthly budget adjustments ('set food budget to 500')
        Returns (banner_for_system_prompt, autonomous_tags_for_response).
        """
        if not db or not user_obj:
            return None, None

        text = raw_text.strip()
        today_date = date.today()

        from app.modules.accounts.models import FinancialAccount
        from app.modules.budgets.models import Budget
        from app.modules.categories.models import Category
        from app.modules.transactions.models import Transaction

        # 1. Check for autonomous budget adjustment intent
        b_match = re.search(
            r"(?:set|update|change|create|make)\s+(?:my\s+)?([a-zA-Z\s&]+?)\s+budget\s+(?:to|at)?\s*(?:ghs|ghc|₵|\$)?\s*(\d+(?:\.\d{1,2})?)",
            text,
            re.IGNORECASE,
        )
        if b_match:
            try:
                cat_hint = b_match.group(1).strip()
                limit_val = float(b_match.group(2))
                if limit_val > 0:
                    cat_stmt = select(Category).where(
                        or_(Category.user_id == user_obj.id, Category.is_system.is_(True)),
                        Category.category_type == "expense",
                        Category.name.ilike(f"%{cat_hint.split()[0]}%"),
                    )
                    cat_res = await db.execute(cat_stmt)
                    cat_obj = cat_res.scalars().first()
                    if not cat_obj:
                        cat_obj = Category(
                            user_id=user_obj.id,
                            name=cat_hint.title(),
                            icon="wallet-outline",
                            color="#0d631b",
                            category_type="expense",
                            is_system=False,
                        )
                        db.add(cat_obj)
                        await db.flush()

                    budget_stmt = select(Budget).where(
                        Budget.user_id == user_obj.id,
                        Budget.category_id == cat_obj.id,
                        Budget.budget_year == today_date.year,
                        Budget.budget_month == today_date.month,
                    )
                    b_res = await db.execute(budget_stmt)
                    budget_obj = b_res.scalars().first()
                    if budget_obj:
                        budget_obj.amount = float(limit_val)
                    else:
                        budget_obj = Budget(
                            user_id=user_obj.id,
                            category_id=cat_obj.id,
                            amount=float(limit_val),
                            budget_year=today_date.year,
                            budget_month=today_date.month,
                            alert_at_percent=80,
                        )
                        db.add(budget_obj)

                    await db.commit()
                    await db.refresh(budget_obj)

                    # Invalidate caches
                    try:
                        from app.core.redis import init_redis, redis_pool

                        r_client = redis_pool or await init_redis()
                        if r_client:
                            await r_client.delete(
                                f"budgets:user:{user_obj.id}:{today_date.year}:{today_date.month}"
                            )
                    except Exception:
                        pass

                    banner = (
                        f"=== AUTONOMOUS ACTION EXECUTED ===\n"
                        f"You successfully updated the monthly budget for '{cat_obj.name}' to GH₵ {limit_val:.2f} for this month.\n"
                        f"Confirm this clearly and advise the user that their budget targets have been updated live."
                    )
                    tag = (
                        f'\n\n[PROPOSED_BUDGET: {{"category_name": "{cat_obj.name}", '
                        f'"monthly_limit": {limit_val:.2f}}}]'
                    )
                    return banner, tag
            except Exception as b_err:
                logger.warning("Autonomous budget update failed: %s", str(b_err))

        # 2. Extract multi-item or single-item transactions
        clauses = re.split(r"\b(?:and|&|plus)\b|[\n;]", text, flags=re.IGNORECASE)
        extracted_items: list[dict[str, Any]] = []

        for clause in clauses:
            clause = clause.strip()
            if not clause:
                continue

            # Check income pattern
            inc_match = re.search(
                r"(?:received|got|income|earned|manya)\s+(?:ghs|ghc|₵|\$)?\s*(\d+(?:\.\d{1,2})?)\s*(?:cedis?|ghs|ghc|₵)?\s*(.*)",
                clause,
                re.IGNORECASE,
            )
            if inc_match:
                amt = float(inc_match.group(1))
                rest = inc_match.group(2).strip()
                wallet = ""
                w_match = re.search(
                    r"\b(?:via|into|with|in|from|through)\s+(mtn\s*momo|momo|mobile\s*money|cash|bank|telecel|at)\b",
                    rest,
                    re.IGNORECASE,
                )
                if w_match:
                    wallet = w_match.group(1).lower()
                    rest = rest[: w_match.start()] + rest[w_match.end() :]
                desc = (
                    re.sub(r"^(?:for|as|from)\s+", "", rest.strip(), flags=re.IGNORECASE).strip()
                    or "Income"
                )
                if amt > 0:
                    extracted_items.append(
                        {
                            "action": "income",
                            "amount": amt,
                            "description": desc,
                            "wallet": wallet,
                        }
                    )
                continue

            # Check expense pattern
            exp_match = re.search(
                r"(?:(?:log|record|spent|paid|add|chop|mede)\s+)?(?:ghs|ghc|₵|\$)?\s*(\d+(?:\.\d{1,2})?)\s*(?:cedis?|ghs|ghc|₵)?\s*(.*)",
                clause,
                re.IGNORECASE,
            )
            if exp_match:
                amt = float(exp_match.group(1))
                rest = exp_match.group(2).strip()
                wallet = ""
                w_match = re.search(
                    r"\b(?:from|via|with|on|in|through)\s+(mtn\s*momo|momo|mobile\s*money|cash|bank|telecel|at)\b",
                    rest,
                    re.IGNORECASE,
                )
                if w_match:
                    wallet = w_match.group(1).lower()
                    rest = rest[: w_match.start()] + rest[w_match.end() :]
                desc = re.sub(
                    r"^(?:for|on|atɔ|kɔ|in)\s+", "", rest.strip(), flags=re.IGNORECASE
                ).strip()
                if amt > 0 and desc:
                    extracted_items.append(
                        {
                            "action": "expense",
                            "amount": amt,
                            "description": desc,
                            "wallet": wallet,
                        }
                    )

        if not extracted_items:
            return None, None

        try:
            # Fetch active user accounts
            acc_stmt = select(FinancialAccount).where(
                FinancialAccount.user_id == user_obj.id,
                FinancialAccount.is_active.is_(True),
            )
            acc_res = await db.execute(acc_stmt)
            accounts_list = list(acc_res.scalars().all())
            if not accounts_list:
                return None, None

            recorded_transactions = []
            autonomous_tags = []

            for item in extracted_items:
                amt_val = item["amount"]
                raw_desc = item["description"]
                wallet_hint = item["wallet"]
                tx_type = item["action"]

                acc_type = "mobile_money"
                if "cash" in wallet_hint or "cash" in text.lower():
                    acc_type = "cash"
                elif "bank" in wallet_hint or "bank" in text.lower():
                    acc_type = "bank"

                target_account = next(
                    (a for a in accounts_list if a.account_type == acc_type),
                    accounts_list[0],
                )

                cat_name = "Salary" if tx_type == "income" else "Other Expense"
                lower_desc = raw_desc.lower()

                if tx_type == "expense":
                    if any(
                        w in lower_desc
                        for w in [
                            "food",
                            "lunch",
                            "dinner",
                            "breakfast",
                            "eat",
                            "chop",
                            "groceries",
                            "waakye",
                            "jollof",
                            "kfc",
                            "fufu",
                            "gob3",
                            "gobe",
                            "aduane",
                        ]
                    ):
                        cat_name = "Food & Dining"
                    elif any(
                        w in lower_desc
                        for w in [
                            "fuel",
                            "petrol",
                            "diesel",
                            "transport",
                            "trotro",
                            "uber",
                            "bolt",
                            "car",
                            "taxi",
                            "fare",
                            "lɔre",
                            "lore",
                            "akwantuo",
                        ]
                    ):
                        cat_name = "Transportation"
                    elif any(
                        w in lower_desc
                        for w in [
                            "utility",
                            "ecg",
                            "light",
                            "water",
                            "gwcl",
                            "power",
                            "bill",
                            "anyinam",
                            "nsuo",
                        ]
                    ):
                        cat_name = "Utilities"
                    elif any(
                        w in lower_desc
                        for w in [
                            "airtime",
                            "data",
                            "internet",
                            "mtn bundle",
                            "wifi",
                            "kasa",
                        ]
                    ):
                        cat_name = "Airtime & Data"
                    elif any(
                        w in lower_desc
                        for w in [
                            "health",
                            "med",
                            "drug",
                            "pharmacy",
                            "hospital",
                            "ayaresabea",
                        ]
                    ):
                        cat_name = "Health"
                    elif any(
                        w in lower_desc
                        for w in [
                            "shop",
                            "cloth",
                            "shoe",
                            "market",
                            "item",
                            "ntoma",
                            "mpaboa",
                        ]
                    ):
                        cat_name = "Shopping"

                cat_stmt = select(Category).where(
                    or_(Category.user_id == user_obj.id, Category.is_system.is_(True)),
                    Category.category_type == tx_type,
                    Category.name.ilike(f"%{cat_name.split()[0]}%"),
                )
                cat_res = await db.execute(cat_stmt)
                cat_obj = cat_res.scalars().first()
                if not cat_obj:
                    cat_obj = Category(
                        user_id=user_obj.id,
                        name=cat_name,
                        icon="wallet-outline" if tx_type == "income" else "receipt-outline",
                        color="#10B981" if tx_type == "income" else "#0d631b",
                        category_type=tx_type,
                        is_system=False,
                    )
                    db.add(cat_obj)
                    await db.flush()

                clean_desc = raw_desc.capitalize()
                new_tx = Transaction(
                    user_id=user_obj.id,
                    account_id=target_account.id,
                    category_id=cat_obj.id,
                    amount=Decimal(str(amt_val)),
                    transaction_type=tx_type,
                    description=clean_desc[:250],
                    transaction_date=today_date,
                    notes="Logged autonomously via AI Support Auto-Pilot",
                )
                db.add(new_tx)
                await db.flush()
                await db.refresh(new_tx)

                recorded_transactions.append(
                    {
                        "id": str(new_tx.id),
                        "amount": amt_val,
                        "type": tx_type,
                        "category": cat_obj.name,
                        "wallet": target_account.name,
                        "description": clean_desc,
                    }
                )
                autonomous_tags.append(
                    f'[AUTONOMOUS_TRANSACTION: {{"id": "{new_tx.id}", "amount": {amt_val:.2f}, '
                    f'"transaction_type": "{tx_type}", "category_name": "{cat_obj.name}", '
                    f'"wallet_name": "{target_account.name}", "description": "{clean_desc}", '
                    f'"transaction_date": "{today_date.isoformat()}"}}]'
                )

            await db.commit()

            # Invalidate caches
            try:
                from app.core.redis import init_redis, redis_pool
                from app.modules.transactions.service import _invalidate_caches

                r_client = redis_pool or await init_redis()
                if r_client:
                    await _invalidate_caches(user_obj.id, today_date, r_client)
            except Exception as c_err:
                logger.warning("Cache invalidation failed: %s", str(c_err))

            # Build banner
            banner_lines = [
                "=== AUTONOMOUS ACTION EXECUTED ===",
                (
                    f"You successfully logged {len(recorded_transactions)} transaction(s) directly into "
                    f"the user's ledger on {today_date.isoformat()}:"
                ),
            ]
            for rec in recorded_transactions:
                banner_lines.append(
                    f"- {rec['type'].upper()}: GH₵ {rec['amount']:.2f} for '{rec['description']}' "
                    f"({rec['category']}) from wallet '{rec['wallet']}' (ID: `{rec['id']}`)"
                )
            banner_lines.append(
                "Confirm all recorded items clearly and assure the user that their balances have been updated live with instant undo available."
            )
            banner = "\n".join(banner_lines)
            tag = "\n\n" + "\n".join(autonomous_tags)

            return banner, tag
        except Exception as err:
            logger.warning("Autonomous execution failed: %s", str(err))
            return None, None

    @staticmethod
    def _extract_display_name(raw_name: str | None, db_user: Any = None) -> tuple[str, str]:
        """
        Extract the user's actual first name and full display name, stripping honorific titles
        (e.g., 'Mr. Cliff' -> first_name='Cliff', full_name='Cliff').
        """
        source = (raw_name or "").strip()
        if (
            (
                not source
                or source.lower() in {"mr.", "mr", "mrs.", "mrs", "ms.", "ms", "miss", "anonymous"}
            )
            and db_user
            and getattr(db_user, "full_name", None)
        ):
            source = str(db_user.full_name).strip()

        if not source:
            return "there", "Friend"

        titles = {
            "mr",
            "mr.",
            "mrs",
            "mrs.",
            "ms",
            "ms.",
            "miss",
            "dr",
            "dr.",
            "prof",
            "prof.",
            "pastor",
            "rev",
            "rev.",
        }
        words = source.split()
        filtered = [w for w in words if w.lower() not in titles]

        if filtered:
            first_name = filtered[0].capitalize()
            full_display = " ".join(filtered).title()
        else:
            first_name = words[0].capitalize()
            full_display = source.title()

        return first_name, full_display

    @staticmethod
    async def generate_chat_response(
        messages: list[ChatMessage],
        support_type: str | None = None,
        user_name: str | None = None,
        db: AsyncSession | None = None,
        phone: str | None = None,
        device_diagnostics: dict[str, Any] | None = None,
        image_base64: str | None = None,
        image_mime_type: str | None = "image/jpeg",
        language: str = "en",
        voice_persona: str = "akosua",
        auto_pilot: bool = False,
        deep_audit: bool = False,
    ) -> str:
        """Generate a supportive assistant response using Gemini 2.5 Flash with automatic ChatGPT (gpt-4o-mini) fallback."""
        xray_block, user_obj = await SupportService.build_xray_telemetry(
            db=db,
            phone=phone,
            device_diagnostics=device_diagnostics,
        )

        first_name, full_name = SupportService._extract_display_name(user_name, user_obj)

        personalization = (
            f"=== USER IDENTITY & ADAPTIVE TONE RULES ===\n"
            f"- User's Actual Name: {first_name} (Full Name: {full_name}).\n"
            f"- Addressing the user: Address them respectfully and naturally by their actual name '{first_name}' (e.g. 'Hello {first_name},', 'Hi {first_name},', or 'Certainly, {first_name}!'). "
            f"Always use '{first_name}' to personalize your answer whenever greeting or advising them. NEVER address them as 'Mr.!', 'boss', 'don', 'Friend', or other generic nicknames when their name is known.\n"
            f"- Tone: Professional, reassuring, calm, and trustworthy. CediSmart is a real personal finance and ledger application. "
            f"Keep all financial information, numbers, dates, and instructions clear and articulate.\n"
            f"- Greeting & Confirmation Rule: Do NOT start every response or ongoing reply with 'Akwaaba' (Welcome). Only use 'Akwaaba' if it is the very beginning of a new conversation or user onboarding. For routine confirmations, pasted SMS messages, and follow-ups, start directly and naturally without welcoming them repeatedly (e.g., 'Got it, {first_name}!', 'All set, {first_name}.', or 'Here are the details:')."
        )

        # Check if the user pasted a raw MoMo SMS into chat for instant rescue
        sms_rescue_banner = None
        if messages:
            sms_rescue_banner = await SupportService._try_instant_sms_rescue(
                db=db,
                user_obj=user_obj,
                raw_text=messages[-1].content,
            )

        # Check for autonomous execution if auto_pilot is enabled
        auto_pilot_banner = None
        auto_pilot_tag = None
        if auto_pilot and messages and not sms_rescue_banner:
            auto_pilot_banner, auto_pilot_tag = await SupportService._try_autonomous_chat_execution(
                db=db,
                user_obj=user_obj,
                raw_text=messages[-1].content,
            )

        base_prompt = AUTH_SYSTEM_PROMPT if support_type == "auth" else GENERAL_SYSTEM_PROMPT
        persona_prompt = get_persona_identity_prompt(voice_persona, language)
        lang_prompt = LANGUAGE_PROMPTS.get(language, LANGUAGE_PROMPTS["en"])
        audit_prompt = DEEP_AUDIT_PROMPT if deep_audit else ""
        exec_mode_prompt = get_execution_mode_prompt(auto_pilot)

        system_prompt = f"{base_prompt}\n\n{personalization}{persona_prompt}{lang_prompt}{audit_prompt}{exec_mode_prompt}{xray_block}"
        if sms_rescue_banner:
            system_prompt += (
                f"\n\n=== INSTANT SMS RESCUE EXECUTED ===\n"
                f"The system just parsed and logged the user's pasted MoMo SMS with this verified result:\n{sms_rescue_banner}\n"
                f"Instructions for your response:\n"
                f"1. Warmly and clearly confirm the exact GH₵ amount(s), transaction type (Cash In / Payment / Transfer), and wallet logged based strictly on the verified result above.\n"
                f"2. Explicitly assure {first_name} that CediSmart has already automatically synced their balance and updated their ledger in real-time.\n"
                f"3. Do NOT tell the user to tap any 'refresh button'—the app updates automatically in real-time. If you offer an action button, use `[ACTION:NAV_TRANSACTIONS]` so they can view their transactions.\n"
                f"4. Do NOT start your message with 'Akwaaba'."
            )
        elif auto_pilot_banner:
            system_prompt += (
                f"\n\n{auto_pilot_banner}\n"
                f"Instructions for your response:\n"
                f"1. Clearly confirm that the transaction was logged directly into their ledger.\n"
                f"2. Mention the amount, category, and wallet.\n"
                f"3. Note that an undo option is active in their chat."
            )
        elif not auto_pilot:
            system_prompt += (
                "\n\n=== ADVISOR MODE REMINDER ===\n"
                "No automatic database changes were made. If the user asks to log an expense/income or set a budget, "
                "construct a proposed card using `[PROPOSED_TRANSACTION: {...}]` or `[PROPOSED_BUDGET: {...}]` "
                "and advise them to tap 'Confirm & Save' to record it."
            )
        else:
            system_prompt += (
                "\n\n=== CRITICAL ZERO-HALLUCINATION GUARD (MANDATORY) ===\n"
                "NO TRANSACTIONS WERE AUTOMATICALLY LOGGED INTO THE DATABASE FOR THIS MESSAGE.\n"
                "Under NO circumstances should you claim, imply, or hallucinate that you or CediSmart logged, recorded, saved, or added any transactions to the user's ledger.\n"
                "If the user shared SMS messages or receipts, explain clearly what is required (e.g. linking their Mobile Money wallet in Accounts tab) or invite them to tap [ACTION:NAV_ADD_EXPENSE] to record it manually."
            )

        # Resolve any image attached either on the request or on the last message
        effective_img_b64 = image_base64 or (messages[-1].image_base64 if messages else None)
        effective_img_mime = image_mime_type or (
            messages[-1].image_mime_type
            if messages and messages[-1].image_mime_type
            else "image/jpeg"
        )

        final_reply: str | None = None

        # 1. Primary Engine: High-Speed Gemini Flash-Lite Models
        if settings.GEMINI_API_KEY:
            contents: list[dict[str, Any]] = []
            for idx, msg in enumerate(messages):
                parts_list: list[dict[str, Any]] = [{"text": msg.content}]
                msg_img = msg.image_base64 or (
                    effective_img_b64 if idx == len(messages) - 1 else None
                )
                msg_mime = msg.image_mime_type or effective_img_mime or "image/jpeg"
                if msg_img:
                    clean_b64 = msg_img.split(",")[-1] if "," in msg_img else msg_img
                    parts_list.append(
                        {
                            "inlineData": {
                                "mimeType": msg_mime,
                                "data": clean_b64,
                            }
                        }
                    )
                contents.append(
                    {
                        "role": "model" if msg.role == "model" else "user",
                        "parts": parts_list,
                    }
                )

            payload = {
                "contents": contents,
                "systemInstruction": {"parts": [{"text": system_prompt}]},
            }

            for model_name in [
                "gemini-flash-lite-latest",
                "gemini-3.5-flash-lite",
                "gemini-3.1-flash-lite",
            ]:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={settings.GEMINI_API_KEY}"
                try:
                    async with httpx.AsyncClient(timeout=6.0) as client:
                        response = await client.post(url, json=payload)
                        if response.status_code == 200:
                            resp_json = response.json()
                            final_reply = resp_json["candidates"][0]["content"]["parts"][0]["text"]
                            break
                        logger.warning(
                            "Gemini Chat API error (%s status %d): %s",
                            model_name,
                            response.status_code,
                            response.text[:200],
                        )
                except Exception as exc:
                    logger.warning("Gemini chat connection failed (%s): %s", model_name, str(exc))

        # 2. Secondary Engine: Mistral Pro (`mistral-small-latest`) via MISTRAL_API_KEY
        if not final_reply:
            final_reply = await SupportService._call_mistral_fallback(
                messages=messages,
                system_prompt=system_prompt,
            )

        # 3. Tertiary Engine: ChatGPT (gpt-4o-mini) via OpenAI API or Free GitHub Models
        if not final_reply:
            final_reply = await SupportService._call_chatgpt_fallback(
                messages=messages,
                system_prompt=system_prompt,
                image_base64=effective_img_b64,
                image_mime_type=effective_img_mime,
            )

        # 4. If an SMS was rescued even when offline from LLMs, return the rescue banner directly
        if not final_reply and sms_rescue_banner:
            final_reply = sms_rescue_banner

        # 5. Final Local Rules Engine
        if not final_reply:
            final_reply = SupportService._fallback_support_response(
                messages, support_type, first_name
            )

        if auto_pilot_tag and auto_pilot_tag not in final_reply:
            final_reply += auto_pilot_tag

        return final_reply

    @staticmethod
    async def _call_chatgpt_fallback(
        messages: list[ChatMessage],
        system_prompt: str,
        image_base64: str | None = None,
        image_mime_type: str | None = "image/jpeg",
    ) -> str | None:
        """Fallback to ChatGPT (`gpt-4o-mini`) via OPENAI_API_KEY or free GitHub Models (`GITHUB_ACCESS_TOKEN`)."""
        api_key = settings.OPENAI_API_KEY or settings.GITHUB_ACCESS_TOKEN
        if not api_key:
            return None

        url = (
            "https://api.openai.com/v1/chat/completions"
            if settings.OPENAI_API_KEY
            else "https://models.inference.ai.azure.com/chat/completions"
        )
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        oa_messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
        for idx, msg in enumerate(messages):
            role = "assistant" if msg.role == "model" else "user"
            msg_img = msg.image_base64 or (image_base64 if idx == len(messages) - 1 else None)
            msg_mime = msg.image_mime_type or image_mime_type or "image/jpeg"
            if msg_img and role == "user":
                clean_b64 = msg_img.split(",")[-1] if "," in msg_img else msg_img
                oa_messages.append(
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": msg.content},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:{msg_mime};base64,{clean_b64}"},
                            },
                        ],
                    }
                )
            else:
                oa_messages.append({"role": role, "content": msg.content})

        payload = {
            "model": "gpt-4o-mini",
            "messages": oa_messages,
            "temperature": 0.4,
        }

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    return cast("str | None", data["choices"][0]["message"]["content"])
                logger.warning(
                    "ChatGPT fallback returned status %d: %s",
                    resp.status_code,
                    resp.text[:300],
                )
        except Exception as exc:
            logger.warning("ChatGPT fallback connection error: %s", str(exc))
        return None

    @staticmethod
    async def _call_mistral_fallback(
        messages: list[ChatMessage],
        system_prompt: str,
    ) -> str | None:
        """Fallback to Mistral Pro (`mistral-small-latest`) via MISTRAL_API_KEY."""
        if not settings.MISTRAL_API_KEY:
            return None

        url = "https://api.mistral.ai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.MISTRAL_API_KEY}",
            "Content-Type": "application/json",
        }

        mistral_messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
        for msg in messages:
            mistral_messages.append(
                {
                    "role": "assistant" if msg.role == "model" else "user",
                    "content": msg.content,
                }
            )

        payload = {
            "model": "mistral-small-latest",
            "messages": mistral_messages,
            "temperature": 0.3,
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices") or []
                    if choices and "message" in choices[0]:
                        return cast("str | None", choices[0]["message"].get("content"))
                logger.warning(
                    "Mistral chat fallback returned status %d: %s",
                    resp.status_code,
                    resp.text[:200],
                )
        except Exception as exc:
            logger.warning("Mistral chat fallback connection error: %s", str(exc))
        return None

    @staticmethod
    def _fallback_support_response(
        messages: list[ChatMessage],
        support_type: str | None = None,
        first_name: str = "Chale",
    ) -> str:
        """Provide a personalized fallback response when neither Gemini nor ChatGPT is reachable."""
        last_msg = messages[-1].content.lower() if messages else ""

        if support_type == "auth":
            if "otp" in last_msg or "code" in last_msg or "sms" in last_msg:
                return (
                    f"Chale {first_name}, it looks like you're having trouble receiving your verification OTP. Please check:\n"
                    "1. That your phone has active cellular reception.\n"
                    "2. That the number was entered correctly (9 digits, e.g. 24XXXXXXX, excluding the leading 0).\n"
                    "If the issue persists, tap 'Escalate' to report this bug to our developers."
                )
            return (
                f"Hi {first_name}! I am the CediSmart Onboarding Assistant. I can help you with OTP codes, "
                "registration, and PIN resets. (If you have a complicated issue, please let me know and I will raise a developer ticket)."
            )

        if "pin" in last_msg or "password" in last_msg or "reset" in last_msg:
            return (
                f"Chale {first_name}, to reset your PIN, please use the 'Forgot PIN?' link on the Login screen. "
                "This will verify your identity via SMS before prompting you to choose a new 6-digit PIN."
            )
        if (
            "sync" in last_msg
            or "shortcut" in last_msg
            or "sms" in last_msg
            or "automation" in last_msg
        ):
            return (
                f"Chale {first_name}, here is how to configure Mobile Money Live Sync:\n"
                "1. Go to Settings ➔ Accounts and look for the 'Mobile Money Live Sync' panel under your linked accounts.\n"
                "2. Tap 'Configure Auto-Sync (iOS / Android)'.\n"
                "3. For Google Android: Tap 'Grant SMS Permissions' to enable automated background listening.\n"
                "4. For Apple iOS: Copy your Webhook URL and Auth Key, then open the native Apple Shortcuts app and configure a new 'Message' Personal Automation (set request to POST, add Authorization header, and send the message details as JSON). [ACTION:GENERATE_MOMO_KEY] [ACTION:OPEN_SHORTCUTS]"
            )
        return (
            f"Hi {first_name}! I am the CediSmart Support Assistant. I can help you set budgets, "
            "create ledgers, log transactions, and configure background MoMo message sync. What can I help you with today? [ACTION:HEAL_APP]"
        )

    @staticmethod
    async def escalate_ticket(
        db: AsyncSession,
        phone: str,
        user_query: str,
        chat_history: list[ChatMessage],
        device_diagnostics: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Save ticket to local database, escalate to GitHub (triggering ChatGPT Code Agent), and notify Discord."""
        ticket = SupportTicket(
            phone=phone,
            user_query=user_query,
            chat_history=[msg.model_dump(exclude={"image_base64"}) for msg in chat_history],
            device_diagnostics=device_diagnostics,
            is_resolved=False,
        )
        db.add(ticket)
        await db.commit()
        await db.refresh(ticket)
        ticket_id = str(ticket.id)

        issue_number = 0
        issue_url = "database_only"

        if settings.GITHUB_ACCESS_TOKEN:
            issue_number, issue_url = await SupportService._create_github_issue(
                phone=phone,
                user_query=user_query,
                chat_history=chat_history,
                device_diagnostics=device_diagnostics,
                ticket_id=ticket_id,
            )

        if settings.DISCORD_WEBHOOK_URL:
            await SupportService._send_discord_alert(
                phone=phone,
                user_query=user_query,
                ticket_id=ticket_id,
                issue_url=issue_url,
                device_diagnostics=device_diagnostics,
            )

        return {
            "ticket_id": ticket_id,
            "issue_number": issue_number,
            "issue_url": issue_url,
        }

    @staticmethod
    async def _create_github_issue(
        phone: str,
        user_query: str,
        chat_history: list[ChatMessage],
        device_diagnostics: dict[str, Any] | None,
        ticket_id: str,
    ) -> tuple[int, str]:
        """Call GitHub API to open a developer issue ticket labeled with `ai-autofix` for the ChatGPT Code Agent."""
        url = f"https://api.github.com/repos/{settings.GITHUB_REPO}/issues"
        headers = {
            "Authorization": f"token {settings.GITHUB_ACCESS_TOKEN}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
        }

        transcript_lines = []
        for msg in chat_history:
            role_label = "User" if msg.role == "user" else "AI Assistant"
            transcript_lines.append(f"**{role_label}**: {msg.content}")
        transcript_str = "\n\n".join(transcript_lines)

        diagnostics_str = "None provided"
        if device_diagnostics:
            diagnostics_str = "\n".join(
                [f"- **{k}**: `{v}`" for k, v in device_diagnostics.items()]
            )

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
            f"*Issue generated automatically by CediSmart AI Support Service (`@chatgpt` auto-triage enabled).*"
        )

        payload = {
            "title": f"Support Ticket: Phone {phone} ({user_query[:45]}...)",
            "body": body_content,
            "labels": ["support", "escalated", "ai-autofix"],
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code == 201:
                    resp_json = response.json()
                    return resp_json["number"], resp_json["html_url"]
                logger.error(
                    "GitHub API issue creation failed (status %d): %s",
                    response.status_code,
                    response.text,
                )
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
        device_diagnostics: dict[str, Any] | None,
    ) -> None:
        """Trigger Discord Webhook message to notify the team instantly of a ticket creation."""
        diag_lines = []
        if device_diagnostics:
            for k, v in device_diagnostics.items():
                diag_lines.append(f"{k}: {v}")
        diag_str = "\n".join(diag_lines) if diag_lines else "No diagnostics provided."

        fields: list[dict[str, Any]] = [
            {"name": "📞 User Phone", "value": f"`{phone}`", "inline": True},
            {"name": "🆔 Ticket ID", "value": f"`{ticket_id}`", "inline": True},
            {"name": "💬 User Query", "value": user_query, "inline": False},
            {"name": "⚙️ Diagnostics", "value": f"```\n{diag_str}\n```", "inline": False},
        ]

        if issue_url and issue_url != "database_only" and "mock" not in issue_url:
            fields.append(
                {
                    "name": "🌐 GitHub Issue Link",
                    "value": f"[Open GitHub Issue]({issue_url})",
                    "inline": False,
                }
            )

        embed: dict[str, Any] = {
            "title": "🚨 CediSmart Support Ticket Created",
            "description": "A user has escalated a support issue to the developers (ChatGPT Code Agent dispatched).",
            "color": 14034714,
            "fields": fields,
        }

        payload = {
            "username": "CediSmart Support Bot",
            "embeds": [embed],
        }

        if not settings.DISCORD_WEBHOOK_URL:
            return

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(settings.DISCORD_WEBHOOK_URL, json=payload)
                if res.status_code < 300:
                    logger.info("Discord support webhook successfully notified.")
                else:
                    logger.error(
                        "Discord support webhook failed with status %d: %s",
                        res.status_code,
                        res.text,
                    )
        except Exception as e:
            logger.error("Error invoking Discord webhook: %s", str(e))

    @staticmethod
    async def submit_user_feedback(
        user_phone: str,
        user_name: str,
        feedback_type: str,
        description: str,
        device_info: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """Open a GitHub Issue with `ai-autofix` for the ChatGPT Code Agent and post to Discord."""
        diag_lines = []
        if device_info:
            for k, v in device_info.items():
                diag_lines.append(f"{k}: {v}")
        diag_str = "\n".join(diag_lines) if diag_lines else "None provided."

        issue_number = 0
        issue_url = ""

        # 1. Create GitHub Issue so the Autonomous ChatGPT Code Agent can implement the feature or fix the bug
        if settings.GITHUB_ACCESS_TOKEN:
            gh_url = f"https://api.github.com/repos/{settings.GITHUB_REPO}/issues"
            headers = {
                "Authorization": f"token {settings.GITHUB_ACCESS_TOKEN}",
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
            }
            is_bug = "bug" in feedback_type.lower()
            labels = (
                ["bug", "ai-autofix"]
                if is_bug
                else ["enhancement", "feature-request", "ai-autofix"]
            )
            prefix = "Bug Report" if is_bug else "Feature Request"
            gh_body = (
                f"## 💡 CediSmart User {prefix}\n\n"
                f"**Submitted By:** {user_name} (`{user_phone}`)\n"
                f"**Category:** `{feedback_type}`\n\n"
                f"### 📝 Description\n{description}\n\n"
                f"### ⚙️ Device Info\n```\n{diag_str}\n```\n\n"
                f"---\n*Automatically dispatched to `@chatgpt` Autonomous Code Agent.*"
            )
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    gh_res = await client.post(
                        gh_url,
                        headers=headers,
                        json={
                            "title": f"{prefix}: {description[:60]}",
                            "body": gh_body,
                            "labels": labels,
                        },
                    )
                    if gh_res.status_code == 201:
                        gh_data = gh_res.json()
                        issue_number = gh_data.get("number", 0)
                        issue_url = gh_data.get("html_url", "")
            except Exception as exc:
                logger.warning("Failed to create GitHub issue for feedback: %s", str(exc))

        # 2. Send Discord notification
        webhook_url = settings.DISCORD_FEEDBACK_WEBHOOK_URL or settings.DISCORD_WEBHOOK_URL
        if not webhook_url:
            logger.warning("No Discord Webhook configured for feedback alerts.")
            return {"issue_number": issue_number, "issue_url": issue_url}

        icon = "💡"
        if "feature" in feedback_type.lower():
            icon = "🚀"
        elif "bug" in feedback_type.lower():
            icon = "🐛"

        fields = [
            {"name": "📞 User Phone", "value": f"`{user_phone}`", "inline": True},
            {"name": "👤 User Name", "value": user_name, "inline": True},
            {"name": "🏷️ Feedback Category", "value": feedback_type.upper(), "inline": True},
            {"name": "💬 Description", "value": description, "inline": False},
            {"name": "⚙️ Device Diagnostics", "value": f"```\n{diag_str}\n```", "inline": False},
        ]
        if issue_url:
            fields.append(
                {
                    "name": "🤖 GitHub Auto-PR Issue",
                    "value": f"[Issue #{issue_number}]({issue_url})",
                    "inline": False,
                }
            )

        embed = {
            "title": f"{icon} New CediSmart Feedback & Suggestions",
            "description": "A user has submitted product feedback from Settings.",
            "color": 3066993,
            "fields": fields,
        }

        payload = {
            "username": "CediSmart Feedback Bot",
            "embeds": [embed],
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(webhook_url, json=payload)
                if res.status_code < 300:
                    logger.info("Discord feedback webhook successfully notified.")
                else:
                    logger.error(
                        "Discord feedback webhook failed with status %d: %s",
                        res.status_code,
                        res.text,
                    )
        except Exception as e:
            logger.error("Error invoking Discord feedback webhook: %s", str(e))

        return {"issue_number": issue_number, "issue_url": issue_url}

    @staticmethod
    async def get_ticket_status(issue_number: int) -> dict[str, Any]:
        """Fetch live GitHub Issue and ChatGPT Pull Request status for in-app ticket tracking."""
        if not settings.GITHUB_ACCESS_TOKEN or issue_number <= 0:
            return {
                "issue_number": issue_number,
                "state": "open",
                "title": f"Support Ticket #{issue_number}",
                "issue_url": f"https://github.com/{settings.GITHUB_REPO}/issues/{issue_number}",
                "labels": ["support", "ai-autofix"],
                "pr_url": None,
                "pr_state": None,
                "latest_agent_comment": "Queued for CediSmart developer & QA review.",
                "user_status": "received",
                "status_label": "Report Received",
                "status_description": "Your issue report has been logged with CediSmart Support.",
                "stage_step": 1,
            }

        headers = {
            "Authorization": f"token {settings.GITHUB_ACCESS_TOKEN}",
            "Accept": "application/vnd.github.v3+json",
        }
        issue_api_url = f"https://api.github.com/repos/{settings.GITHUB_REPO}/issues/{issue_number}"
        comments_api_url = (
            f"https://api.github.com/repos/{settings.GITHUB_REPO}/issues/{issue_number}/comments"
        )
        owner = settings.GITHUB_REPO.split("/")[0]
        branch_head = f"{owner}:chatgpt/issue-{issue_number}"
        pulls_api_url = f"https://api.github.com/repos/{settings.GITHUB_REPO}/pulls?head={branch_head}&state=all"

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                issue_resp = await client.get(issue_api_url, headers=headers)
                if issue_resp.status_code != 200:
                    return {
                        "issue_number": issue_number,
                        "state": "unknown",
                        "title": f"Ticket #{issue_number}",
                        "issue_url": f"https://github.com/{settings.GITHUB_REPO}/issues/{issue_number}",
                        "labels": [],
                        "pr_url": None,
                        "pr_state": None,
                        "latest_agent_comment": None,
                        "user_status": "received",
                        "status_label": "Report Received",
                        "status_description": "Your issue report has been logged with CediSmart Support.",
                        "stage_step": 1,
                    }
                issue_data = issue_resp.json()
                labels = [
                    lbl.get("name", "")
                    for lbl in issue_data.get("labels", [])
                    if isinstance(lbl, dict)
                ]

                pr_url = None
                pr_state = None
                pulls_resp = await client.get(pulls_api_url, headers=headers)
                if pulls_resp.status_code == 200 and pulls_resp.json():
                    first_pr = pulls_resp.json()[0]
                    pr_url = first_pr.get("html_url")
                    pr_state = "merged" if first_pr.get("merged_at") else first_pr.get("state")

                latest_comment = None
                comments_resp = await client.get(comments_api_url, headers=headers)
                if comments_resp.status_code == 200 and comments_resp.json():
                    comments = comments_resp.json()
                    for c in reversed(comments):
                        body = c.get("body", "")
                        if "ChatGPT" in body or "Pull Request" in body or body:
                            latest_comment = body[:500]
                            break

                # Translate engineering details to 4 clear user-facing stages:
                # Report received → Investigating → Fix being tested → Update available
                if pr_state == "merged":
                    user_status = "update_available"
                    status_label = "Update Available"
                    status_description = "A verified fix has been merged into CediSmart and will be included in the next app update."
                    stage_step = 4
                elif pr_url or any("pr" in lbl.lower() or "fix" in lbl.lower() for lbl in labels):
                    user_status = "testing"
                    status_label = "Fix Being Tested"
                    status_description = "A proposed solution has been prepared and is currently being tested by our quality assurance pipeline."
                    stage_step = 3
                elif issue_data.get("state") == "open":
                    user_status = "investigating"
                    status_label = "Investigating"
                    status_description = "Our engineering team has received your diagnostic report and is actively investigating the root cause."
                    stage_step = 2
                else:
                    user_status = "received"
                    status_label = "Report Received"
                    status_description = "Your issue report and device diagnostics have been logged with CediSmart Support."
                    stage_step = 1

                return {
                    "issue_number": issue_number,
                    "state": issue_data.get("state", "open"),
                    "title": issue_data.get("title", f"Ticket #{issue_number}"),
                    "issue_url": issue_data.get("html_url", ""),
                    "labels": labels,
                    "pr_url": pr_url,
                    "pr_state": pr_state,
                    "latest_agent_comment": latest_comment,
                    "user_status": user_status,
                    "status_label": status_label,
                    "status_description": status_description,
                    "stage_step": stage_step,
                }
        except Exception as exc:
            logger.warning("Failed to query GitHub ticket status: %s", str(exc))
            return {
                "issue_number": issue_number,
                "state": "open",
                "title": f"Ticket #{issue_number}",
                "issue_url": f"https://github.com/{settings.GITHUB_REPO}/issues/{issue_number}",
                "labels": [],
                "pr_url": None,
                "pr_state": None,
                "latest_agent_comment": None,
                "user_status": "received",
                "status_label": "Report Received",
                "status_description": "Your issue report has been logged with CediSmart Support.",
                "stage_step": 1,
            }

    @staticmethod
    async def process_voice(
        audio_base64: str,
        audio_mime_type: str = "audio/m4a",
        user_name: str | None = None,
        phone: str | None = None,
        initial_context: str | None = "dashboard",
        synthesize_audio: bool = True,
        messages: list[dict[str, str]] | None = None,
        language: str = "en",
        voice_persona: str = "akosua",
        auto_pilot: bool = False,
        deep_audit: bool = False,
        db: AsyncSession | None = None,
        user_id: UUID | None = None,
    ) -> dict[str, Any]:
        """Process spoken user audio with Gemini 2.5 / 1.5 multimodal audio understanding.

        Transcribes speech, extracts financial actions (e.g. logging transactions, checking balances,
        checking budgets, reading reports), and returns a natural spoken response suitable for TTS.
        """
        # Fetch live telemetry (balances, wallets, budgets, and monthly reports)
        xray_block, user_obj = await SupportService.build_xray_telemetry(
            db=db,
            phone=phone,
            device_diagnostics=None,
            user_id=user_id,
        )

        # Resolve clean first name and full display name
        first_name, full_name = SupportService._extract_display_name(user_name, user_obj)

        # Clean audio base64
        clean_b64 = audio_base64
        if "base64," in clean_b64:
            clean_b64 = clean_b64.split("base64,")[1]
        clean_b64 = clean_b64.strip()

        # Normalise mime type for Gemini inlineData
        mime = audio_mime_type.lower()
        if "m4a" in mime or "mp4" in mime:
            effective_mime = "audio/mp4"
        elif "wav" in mime:
            effective_mime = "audio/wav"
        elif "aac" in mime:
            effective_mime = "audio/aac"
        elif "mp3" in mime or "mpeg" in mime:
            effective_mime = "audio/mp3"
        elif "ogg" in mime:
            effective_mime = "audio/ogg"
        else:
            effective_mime = "audio/mp4"

        persona_prompt = get_persona_identity_prompt(voice_persona, language)

        prompt = (
            f"{persona_prompt}\n"
            f"You are talking directly to {first_name} in Ghana.\n"
            "The user spoke an audio message. Your tasks:\n"
            "1. Transcribe the user's speech accurately into English or Ghanaian Pidgin. If there is no speech, background silence, or non-speech noise, set transcript to '' (empty string). NEVER output timestamps such as '00:00' or tags like '<noise>'.\n"
            "2. Detect user intent and use LIVE FINANCIAL DATA below to provide factual, accurate answers:\n"
            "   - 'create_transaction': If user says e.g. 'log 50 cedis for fuel on momo', 'spent 20 cedis on lunch', 'received 500 from kwame on bank'. Extract amount (number), type ('expense' or 'income'), category ('Food', 'Transport', 'Utilities', 'Shopping', 'Entertainment', 'Health', 'Income'), description (e.g. 'Fuel', 'Lunch'), and account_type ('mobile_money', 'cash', or 'bank').\n"
            "   - 'check_balance': If user asks about their balance, wallets, or money. Answer accurately using the live wallet balances in LIVE FINANCIAL DATA.\n"
            "   - 'check_budget': If user asks about their budget, category limits, or remaining amounts. State the exact limit, spent amount, and remaining balance using the live budgets in LIVE FINANCIAL DATA.\n"
            "   - 'check_reports': If user asks about reports, monthly spending, income, or financial breakdown. Summarize their total income, total expense, and net position or top category from LIVE FINANCIAL DATA.\n"
            "   - 'navigate': If user asks to open/go to a screen ('Budgets', 'Transactions', 'Settings', 'Reports').\n"
            "   - 'general_reply': For any questions, support, or financial guidance.\n"
            "3. Spoken Response & Dynamic Verbal Bridges (CRITICAL):\n"
            "   - Generate a warm, active, concise spoken response in 1-2 short sentences (maximum 20 words) that sounds friendly, authentic, and natural when spoken aloud via Text-To-Speech in Ghana.\n"
            "   - When answering questions about balances, budgets, or reports, answer directly with the real figures.\n"
            "   - For actionable intents ('check_balance', 'create_transaction', 'check_budget', 'check_reports'), you MUST provide an immediate reassuring verbal bridge that tells the user what you are doing before fetching or logging data.\n"
            "   - DO NOT repeat the same bridging phrase consecutively. Dynamically rotate across a rich plethora of natural Ghanaian phrasing:\n"
            "     * For 'check_balance': e.g., 'Checking your balance real quick...', 'Let me pull up your account balances for you...', 'Getting your current balance right now...', 'Let me look at your wallets real quick...'\n"
            "     * For 'create_transaction': e.g., 'Logging that for you right away...', 'Recording that expense now...', 'Adding that to your records real quick...', 'Got it, saving that transaction for you...'\n"
            "     * For 'check_budget': e.g., 'Pulling up your budget now...', 'Let me check how your monthly budget is looking...', 'Checking your budget limits real quick...', 'Looking up your budget status for you...'\n"
            "     * For 'check_reports': e.g., 'Pulling up your financial report...', 'Let me check your monthly spending breakdown...', 'Checking your income and expenses for this month...', 'Looking up your spending report real quick...'\n"
            "   - Never use static or robotic wording. Keep it reassuring, varied, and lively.\n"
            + (
                "4. Language / Dialect: Spoken response and transcript MUST be in authentic Ghanaian Pidgin ('Charley', 'No wahala', 'I dey check am').\n\n"
                if language == "pidgin"
                else (
                    "4. Language / Dialect: Spoken response and transcript MUST be in respectful Akan/Twi ('Medaase', 'Mede sika no bɛto ledger mu', 'Ɛbɛyɛ yie').\n\n"
                    if language == "twi"
                    else "4. Language: Standard Ghanaian English with polite cultural warmth.\n\n"
                )
            )
            + "Return valid JSON matching this schema:\n"
            "{\n"
            '  "transcript": "Transcribed user speech here",\n'
            '  "response": "Concise spoken reply here",\n'
            '  "action": {\n'
            '    "type": "create_transaction" | "check_balance" | "check_budget" | "check_reports" | "navigate" | "general_reply",\n'
            '    "payload": {\n'
            '      "amount": null or float,\n'
            '      "type": null or "expense" or "income",\n'
            '      "category": null or string,\n'
            '      "description": null or string,\n'
            '      "account_type": null or "mobile_money" or "cash" or "bank",\n'
            '      "screen": null or string\n'
            "    }\n"
            "  }\n"
            "}\n\n"
            f"=== LIVE USER FINANCIAL DATA (LEDGER, BUDGETS & REPORTS) ===\n{xray_block}\n"
        )

        # 1. Primary: Gemini Multimodal Audio Understanding (Ultra-Fast Flash-Lite Models)
        if settings.GEMINI_API_KEY:
            for model_name in [
                "gemini-flash-lite-latest",
                "gemini-3.5-flash-lite",
                "gemini-3.1-flash-lite",
            ]:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={settings.GEMINI_API_KEY}"
                contents: list[dict[str, Any]] = []
                if messages:
                    for prev_msg in messages[-6:]:
                        p_role = (
                            "model" if prev_msg.get("role") in ("model", "assistant") else "user"
                        )
                        p_text = prev_msg.get("content", "")
                        if p_text:
                            contents.append({"role": p_role, "parts": [{"text": p_text}]})

                contents.append(
                    {
                        "role": "user",
                        "parts": [
                            {
                                "inlineData": {
                                    "mimeType": effective_mime,
                                    "data": clean_b64,
                                }
                            },
                            {
                                "text": prompt,
                            },
                        ],
                    }
                )

                payload = {
                    "contents": contents,
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "temperature": 0.2,
                    },
                }
                try:
                    async with httpx.AsyncClient(timeout=8.0) as client:
                        async with asyncio.timeout(8.0):
                            resp = await client.post(url, json=payload)
                        if resp.status_code == 200:
                            data = resp.json()
                            candidates = data.get("candidates") or []
                            if not candidates:
                                continue
                            parts = (candidates[0].get("content") or {}).get("parts") or []
                            if not parts or "text" not in parts[0]:
                                continue
                            candidate_text = parts[0]["text"].strip()
                            if candidate_text.startswith("```"):
                                candidate_text = re.sub(r"^```(?:json)?\s*", "", candidate_text)
                                candidate_text = re.sub(r"\s*```$", "", candidate_text).strip()
                            try:
                                parsed = json.loads(candidate_text)
                            except Exception:
                                continue
                            raw_transcript = (parsed.get("transcript") or "").strip()
                            # Clean timestamp hallucinations (e.g. 00:00) and audio noise tags
                            if re.match(
                                r"^\[?\(?\d{1,2}:\d{2}(\.\d+)?\)?\]?$", raw_transcript
                            ) or re.match(r"^<[^>]+>$", raw_transcript):
                                raw_transcript = ""
                            transcript = raw_transcript
                            reply_text = parsed.get("response") or f"I heard you, {first_name}."
                            action_payload = parsed.get("action")

                            # Synthesize natural neural voice audio via Gemini TTS if requested
                            audio_b64, audio_mime = (
                                await SupportService.synthesize_neural_voice(
                                    reply_text, voice_persona=voice_persona
                                )
                                if synthesize_audio and transcript
                                else (None, "audio/wav")
                            )

                            return {
                                "transcript": transcript,
                                "response": reply_text,
                                "action": action_payload,
                                "audio_base64": audio_b64,
                                "audio_mime_type": audio_mime or "audio/wav",
                            }
                        logger.warning(
                            "Gemini audio recognition error (%s status %d)",
                            model_name,
                            resp.status_code,
                        )
                except Exception as exc:
                    logger.warning(
                        "Gemini audio request failed (%s): %s", model_name, type(exc).__name__
                    )

        # Provider failures must not masquerade as silence or successful recognition.
        return {
            "transcript": "",
            "response": "Speech recognition is unavailable. Please retry or type your message.",
            "action": None,
            "audio_base64": None,
            "audio_mime_type": "audio/wav",
            "error_code": "recognition_unavailable",
        }

    @staticmethod
    def normalize_currency_for_speech(text: str) -> str:
        """Phonetically normalizes currency symbols and figures for TTS models.

        Converts GH₵/GHS/GH¢/₵/$ amounts to natural Ghanaian speech:
        e.g. 'GH₵ 50.00' -> '50 Ghana Cedis', 'GH₵ 12.50' -> '12 Ghana Cedis and 50 Pesewas'.
        """
        if not text:
            return ""

        def _replace_currency(match: re.Match[str]) -> str:
            amt_str = match.group(1).replace(",", "")
            try:
                if "." in amt_str:
                    parts = amt_str.split(".", 1)
                    cedis = int(parts[0])
                    pesewas = int(parts[1][:2].ljust(2, "0"))
                    if pesewas == 0:
                        return f"{cedis} Ghana Cedis"
                    return f"{cedis} Ghana Cedis and {pesewas} Pesewas"
                else:
                    return f"{amt_str} Ghana Cedis"
            except Exception:
                return f"{amt_str} Ghana Cedis"

        pattern = r"(?:GH[₵¢]|GHS|[₵$])\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)"
        normalized = re.sub(pattern, _replace_currency, text, flags=re.IGNORECASE)
        normalized = re.sub(
            r"\bGH[₵¢]\b|\bGHS\b|[₵]", "Ghana Cedis", normalized, flags=re.IGNORECASE
        )
        normalized = re.sub(r"\bdollars?\b", "Cedis", normalized, flags=re.IGNORECASE)
        normalized = re.sub(r"\bcents?\b", "Pesewas", normalized, flags=re.IGNORECASE)
        normalized = normalized.replace("$", " Cedis ")
        return normalized

    @staticmethod
    async def synthesize_neural_voice(
        text: str, voice_name: str = "Kore", voice_persona: str = "akosua"
    ) -> tuple[str | None, str | None]:
        """Synthesize natural neural speech using Gemini Flash TTS models with consistent persona mapping. Returns (base64_audio, mime_type)."""
        if not settings.GEMINI_API_KEY or not text or not text.strip():
            return None, None

        # Clean tags and markdown from text before audio synthesis
        clean_text = re.sub(r"\[ACTION:[^\]]+\]", "", text)
        clean_text = re.sub(r"\[VOICE_ACTION:[^\]]+\]", "", clean_text)
        clean_text = re.sub(r"\[PROPOSED_[A-Z]+:\s*\{[^}]*\}\]", "", clean_text)
        clean_text = re.sub(r"\[AUTONOMOUS_[A-Z]+:\s*\{[^}]*\}\]", "", clean_text)
        clean_text = re.sub(r"[*#_`]", "", clean_text).strip()
        if not clean_text:
            return None, None

        # Phonetically normalize currency figures to guarantee Cedis pronunciation
        clean_text = SupportService.normalize_currency_for_speech(clean_text)

        voice_personas_map: dict[str, dict[str, str]] = {
            "akosua": {
                "gemini": "Kore",
                "mistral": "en_paul_happy",
                "openai": "nova",
            },
            "kwame": {
                "gemini": "Puck",
                "mistral": "en_paul_neutral",
                "openai": "onyx",
            },
            "esi": {
                "gemini": "Aoede",
                "mistral": "en_paul_confident",
                "openai": "alloy",
            },
        }

        persona_key = (voice_persona or "akosua").lower()
        persona_cfg = voice_personas_map.get(persona_key, voice_personas_map["akosua"])
        effective_gemini_voice = persona_cfg["gemini"] if voice_persona else voice_name
        effective_mistral_voice = persona_cfg["mistral"]
        effective_openai_voice = persona_cfg["openai"]

        tts_models = [
            "gemini-3.1-flash-tts-preview",
            "gemini-3.8-flash-lite-tts",
        ]
        for model in tts_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={settings.GEMINI_API_KEY}"
            payload = {
                "contents": [{"parts": [{"text": clean_text}]}],
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {
                            "prebuiltVoiceConfig": {
                                "voiceName": effective_gemini_voice,
                            }
                        }
                    },
                },
            }
            try:
                async with httpx.AsyncClient(timeout=9.5) as client:
                    async with asyncio.timeout(9.5):
                        resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates") or []
                        if not candidates:
                            continue
                        parts = (candidates[0].get("content") or {}).get("parts") or []
                        inline_data = next(
                            (
                                part["inlineData"]
                                for part in parts
                                if part.get("inlineData", {}).get("data")
                            ),
                            None,
                        )
                        if not inline_data:
                            continue
                        raw_data = inline_data.get("data")
                        raw_mime = inline_data.get("mimeType", "audio/wav")

                        # If raw L16 PCM without WAV header is returned, wrap into standard WAV and normalize volume
                        if "audio/l16" in raw_mime.lower() or "codec=pcm" in raw_mime.lower():
                            try:
                                import array
                                import base64
                                import io
                                import wave

                                pcm_bytes = base64.b64decode(raw_data)
                                arr = array.array("h")
                                arr.frombytes(pcm_bytes)
                                max_amp = max((abs(s) for s in arr), default=0)
                                if 0 < max_amp < 31500:
                                    scale = 31500.0 / max_amp
                                    for i in range(len(arr)):
                                        arr[i] = int(arr[i] * scale)
                                    pcm_bytes = arr.tobytes()

                                wav_io = io.BytesIO()
                                with wave.open(wav_io, "wb") as wf:
                                    wf.setnchannels(1)
                                    wf.setsampwidth(2)  # 16-bit
                                    wf.setframerate(24000)
                                    wf.writeframes(pcm_bytes)
                                raw_data = base64.b64encode(wav_io.getvalue()).decode("utf-8")
                                raw_mime = "audio/wav"
                            except Exception as wav_err:
                                logger.warning(
                                    "PCM to WAV packaging error: %s", type(wav_err).__name__
                                )
                                continue
                        elif "audio/wav" in raw_mime.lower() or "audio/x-wav" in raw_mime.lower():
                            try:
                                import array
                                import base64
                                import io
                                import wave

                                wav_bytes = base64.b64decode(raw_data)
                                in_io = io.BytesIO(wav_bytes)
                                with wave.open(in_io, "rb") as wf_in:
                                    nchannels = wf_in.getnchannels()
                                    sampwidth = wf_in.getsampwidth()
                                    framerate = wf_in.getframerate()
                                    frames = wf_in.readframes(wf_in.getnframes())

                                if sampwidth == 2 and frames:
                                    arr = array.array("h")
                                    arr.frombytes(frames)
                                    max_amp = max((abs(s) for s in arr), default=0)
                                    if 0 < max_amp < 31500:
                                        scale = 31500.0 / max_amp
                                        for i in range(len(arr)):
                                            arr[i] = int(arr[i] * scale)
                                        out_io = io.BytesIO()
                                        with wave.open(out_io, "wb") as wf_out:
                                            wf_out.setnchannels(nchannels)
                                            wf_out.setsampwidth(sampwidth)
                                            wf_out.setframerate(framerate)
                                            wf_out.writeframes(arr.tobytes())
                                        raw_data = base64.b64encode(out_io.getvalue()).decode(
                                            "utf-8"
                                        )
                            except Exception:
                                pass

                        return raw_data, raw_mime
                    logger.warning("Gemini TTS unavailable (%s status %d)", model, resp.status_code)
            except Exception as e:
                logger.warning("Gemini TTS synthesis failed on %s: %s", model, type(e).__name__)

        # 2. Secondary Engine: Mistral Voxtral 3 Realtime TTS Fallback
        if settings.MISTRAL_API_KEY:
            mistral_audio, mistral_mime = await SupportService._synthesize_with_mistral(
                clean_text, voice=effective_mistral_voice
            )
            if mistral_audio:
                return mistral_audio, mistral_mime

        # 3. Tertiary Engine: OpenAI tts-1 Fallback
        if settings.OPENAI_API_KEY:
            oa_audio, oa_mime = await SupportService._synthesize_with_openai(
                clean_text, voice=effective_openai_voice
            )
            if oa_audio:
                return oa_audio, oa_mime

        return None, None

    @staticmethod
    async def _synthesize_with_mistral(
        text: str, voice: str = "en_paul_neutral"
    ) -> tuple[str | None, str | None]:
        """Synthesize natural neural speech using Mistral Voxtral 3 Realtime TTS API."""
        if not settings.MISTRAL_API_KEY or not text or not text.strip():
            return None, None

        clean_text = re.sub(r"\[ACTION:[^\]]+\]", "", text)
        clean_text = re.sub(r"\[VOICE_ACTION:[^\]]+\]", "", clean_text)
        clean_text = re.sub(r"[*#_`]", "", clean_text).strip()
        if not clean_text:
            return None, None

        url = "https://api.mistral.ai/v1/audio/speech"
        payload = {
            "model": "voxtral-mini-tts-latest",
            "input": clean_text,
            "voice": voice,
        }
        headers = {
            "Authorization": f"Bearer {settings.MISTRAL_API_KEY}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    audio_b64 = data.get("audio_data")
                    if audio_b64:
                        return audio_b64, "audio/mp3"
                logger.warning(
                    "Mistral Voxtral TTS error (status %d): %s",
                    resp.status_code,
                    resp.text[:200],
                )
        except Exception as exc:
            logger.warning("Mistral Voxtral TTS connection error: %s", str(exc))
        return None, None

    @staticmethod
    async def _synthesize_with_openai(
        text: str, voice: str = "nova"
    ) -> tuple[str | None, str | None]:
        """Synthesize natural neural speech using OpenAI tts-1 API."""
        if not settings.OPENAI_API_KEY or not text or not text.strip():
            return None, None

        clean_text = re.sub(r"\[ACTION:[^\]]+\]", "", text)
        clean_text = re.sub(r"\[VOICE_ACTION:[^\]]+\]", "", clean_text)
        clean_text = re.sub(r"[*#_`]", "", clean_text).strip()
        if not clean_text:
            return None, None

        url = "https://api.openai.com/v1/audio/speech"
        payload = {
            "model": "tts-1",
            "input": clean_text,
            "voice": voice,
            "response_format": "mp3",
        }
        headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    import base64

                    audio_b64 = base64.b64encode(resp.content).decode("utf-8")
                    return audio_b64, "audio/mp3"
                logger.warning(
                    "OpenAI TTS error (status %d): %s",
                    resp.status_code,
                    resp.text[:200],
                )
        except Exception as exc:
            logger.warning("OpenAI TTS connection error: %s", str(exc))
        return None, None
