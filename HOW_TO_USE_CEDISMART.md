# How to Use CediSmart: The Complete End-to-End Guide 🇬🇭📱

Welcome to **CediSmart**, Ghana’s premier offline-first personal financial tracker, digital ledger, and autonomous AI CFO. CediSmart is engineered from first principles for the Ghanaian financial landscape—seamlessly connecting **Mobile Money (MTN MoMo, Telecel Cash, AT Money)**, **traditional bank accounts**, and **physical cash on hand** with zero manual friction.

This guide provides a comprehensive, end-to-end walkthrough of every capability, screen, setting, and automated feature available in CediSmart.

---

## Table of Contents

1. [Quick Overview & Core Architecture](#1-quick-overview--core-architecture)
2. [Onboarding, Authentication & Security](#2-onboarding-authentication--security)
   - [Ghanaian Phone Number Verification](#ghanaian-phone-number-verification)
   - [6-Digit Secure PIN & Biometrics](#6-digit-secure-pin--biometrics)
   - [App Lock & Privacy Guard](#app-lock--privacy-guard)
3. [The Financial Dashboard & Navigation](#3-the-financial-dashboard--navigation)
   - [Tracked Net Worth Card](#tracked-net-worth-card)
   - [Liquid Glass Quick Action Hub](#liquid-glass-quick-action-hub)
   - [Interactive Transaction Ledger](#interactive-transaction-ledger)
   - [Quick USSD Shortcuts (*170#, *110#, *711#)](#quick-ussd-shortcuts)
4. [Managing Accounts & Wallets](#4-managing-accounts--wallets)
   - [Mobile Money Wallets](#mobile-money-wallets)
   - [Bank Accounts](#bank-accounts)
   - [Physical Cash & Reconciliations](#physical-cash--reconciliations)
5. [Recording Transactions](#5-recording-transactions)
   - [Manual Entry (+ Add Expense / Income)](#manual-entry--add-expense--income)
   - [Paste-to-Log MoMo SMS Rescue](#paste-to-log-momo-sms-rescue)
   - [Receipt & Invoice Vision Scanning](#receipt--invoice-vision-scanning)
6. [Mobile Money Live Auto-Sync](#6-mobile-money-live-auto-sync)
   - [Google Android: Direct Background SMS Interception](#google-android-direct-background-sms-interception)
   - [Apple iOS: Apple Shortcuts Webhook Automation](#apple-ios-apple-shortcuts-webhook-automation)
7. [Monthly Budgets & Spending Control](#7-monthly-budgets--spending-control)
   - [Setting Category Limits](#setting-category-limits)
   - [Live Progress & 80% Threshold Warnings](#live-progress--80-threshold-warnings)
   - [Adjusting Budgets Mid-Month](#adjusting-budgets-mid-month)
8. [Reports, Analytics & Cash Flow Intelligence](#8-reports-analytics--cash-flow-intelligence)
   - [Monthly Summary KPIs](#monthly-summary-kpis)
   - [Plain-Language Financial Takeaways](#plain-language-financial-takeaways)
   - [Category Breakdowns & 6-Month Trends](#category-breakdowns--6-month-trends)
9. [CediSmart AI Support & Voice CFO](#9-cedismart-ai-support--voice-cfo)
   - [ChatGPT Live Voice Mode](#chatgpt-live-voice-mode)
   - [Voice Action Execution (Verbal Logging & Balance Inquiries)](#voice-action-execution)
   - [Tri-Lingual Engine (English, Ghanaian Pidgin, Twi / Akan)](#tri-lingual-engine)
   - [AI Tools & Controls Sheet (+)](#ai-tools--controls-sheet-)
   - [Advisor Mode vs. Auto-Pilot Mode](#advisor-mode-vs-auto-pilot-mode)
   - [Deep Financial Audit Mode](#deep-financial-audit-mode)
10. [Offline Resilience & Auto-Syncing](#10-offline-resilience--auto-syncing)
11. [Troubleshooting, Diagnostics & Support](#11-troubleshooting-diagnostics--support)
    - [Self-Heal Diagnostic Doctor](#self-heal-diagnostic-doctor)
    - [Submitting a Problem Report](#submitting-a-problem-report)
12. [Appearance & Preferences](#12-appearance--preferences)

---

## 1. Quick Overview & Core Architecture

CediSmart is designed to eliminate the common pain points of Ghanaian personal finance:
- **No Manual Fatigue**: Automatic parsing of Mobile Money and bank SMS alerts converts raw messages into ledger records instantly.
- **Offline-First Resilience**: Full local database caching via SQLite/AsyncStorage and an offline queue. Transactions logged without network upload automatically as soon as internet returns.
- **Banking-Grade Truthfulness**: AI assistants cite exact real-time Postgres balances, budgets, and reports with zero hallucinations.

---

## 2. Onboarding, Authentication & Security

### Ghanaian Phone Number Verification
1. Launch CediSmart on your iOS or Android device.
2. Enter your 9-digit or 10-digit Ghanaian mobile number (e.g., `024 123 4567` or `241234567`). The country code `+233` is automatically prefixed.
3. Tap **Continue**. You will receive an official 6-digit SMS verification code powered by Clerk.
4. Enter the 6-digit OTP code to verify your phone ownership.

> [!TIP]
> **Test / Reviewer Credentials**: For App Store reviewers or offline demonstrations, pre-authorized test phone numbers and verification codes bypass cellular SMS constraints.

### 6-Digit Secure PIN & Biometrics
1. Upon first sign-up, create a personal **6-digit Security PIN**.
2. Confirm the PIN. It is securely hashed and stored in your device's hardware SecureStore / Keychain.
3. If your device supports **Face ID**, **Touch ID**, or **Android Biometric Prompt**, you will be prompted to enable biometric unlocking.
4. If you ever forget your PIN, tap **Forgot PIN?** on the lock screen. You will complete an SMS re-verification to reset your PIN safely.

### App Lock & Privacy Guard
- **Automatic Lock**: When you minimize CediSmart or switch apps for more than 60 seconds, CediSmart automatically shields your screen and requests your PIN or Biometrics upon resume.
- **Privacy Obscure**: In your device's multitasking app switcher, your balance figures and ledger records are automatically blurred.

---

## 3. The Financial Dashboard & Navigation

The Dashboard is your primary command center:

```
┌────────────────────────────────────────────────────────┐
│  ☀️ Good Morning, Kwame!           [🔔] [⚙️ Settings] │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 💳 TOTAL TRACKED BALANCE                         │  │
│  │ GH₵ 4,850.50                                     │  │
│  │ 📱 MoMo: GH₵ 2,150.00  •  🏦 Bank: GH₵ 2,400.00  │  │
│  │ 💵 Cash: GH₵ 300.50                              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  [ + Add Expense ]  [ 📊 Budgets ]  [ 📈 Reports ]     │
│                                                        │
│  RECENT TRANSACTIONS                       [View All]  │
│  • Shell Airport (Fuel)              - GH₵ 250.00      │
│  • Salary Deposit (GCB)             + GH₵ 4,200.00     │
│  • Papa's Pizza (Dining)              - GH₵ 120.00     │
└────────────────────────────────────────────────────────┘
```

### Tracked Net Worth Card
- Displays your combined real-time liquid balance across all connected sources.
- Tap the balance card or swipe to inspect breakdowns per wallet type: **Mobile Money**, **Bank Accounts**, and **Physical Cash**.

### Liquid Glass Quick Action Hub
- **+ Add Expense**: Opens the tactile transaction entry sheet.
- **Budgets**: View category limits and progress bars.
- **Reports**: Inspect cash flow trends and top expense categories.
- **AI Support / Voice**: Tap the floating waveform icon or voice button to engage your autonomous financial co-pilot.

### Interactive Transaction Ledger
- Displays your latest recorded transactions with color-coded badges: **Income** (Emerald Green) and **Expense** (Coral Red).
- Tap any transaction to open its detail sheet, edit categories, add notes, or adjust dates.
- Swipe left on any transaction to delete or edit.

### Quick USSD Shortcuts
Tap the dialer icon in the header to trigger one-touch USSD codes for Ghanaian telecom rails:
- **MTN Mobile Money**: `*170#`
- **Telecel Cash**: `*110#`
- **AT Money**: `*110#`
- **E-Levy Info / USSD Services**: Quick telecom assistance without leaving your app.

---

## 4. Managing Accounts & Wallets

CediSmart organizes your money into 3 native account categories:

### Mobile Money Wallets
- **MTN MoMo**: Track main wallet balance, fee charges, and cash-in/cash-out records.
- **Telecel Cash (formerly Vodafone Cash)**: Dedicated tracking for Telecel users.
- **AT Money**: Dedicated tracking for AirtelTigo users.

### Bank Accounts
- Add accounts from major Ghanaian banks: GCB Bank, Ecobank Ghana, Stanbic Bank, CalBank, Absa, Fidelity Bank, and Zenith Bank.
- Track account numbers (last 4 digits), branch labels, and current ledger balances.

### Physical Cash & Reconciliations
- Physical cash spent on street groceries, trotro fares, or roadside vendors can be recorded under your **Cash Wallet**.
- **Cash Reconciliation Tool**:
  1. Open **Settings ➔ Accounts ➔ Cash on Hand**.
  2. Count your physical cedi notes and coins.
  3. Enter the exact figure. CediSmart will reconcile the difference automatically with a balancing adjustment entry.

---

## 5. Recording Transactions

CediSmart offers 3 intuitive methods to record your finances:

### Manual Entry (+ Add Expense / Income)
1. Tap the **+ Add Expense** button from the Dashboard or bottom tab bar.
2. Select transaction type: **Expense** or **Income**.
3. Type the amount in Ghana Cedis (`GH₵`).
4. Select the **Account** (e.g., MTN MoMo, Cash, Ecobank).
5. Choose a **Category** (e.g., Food & Dining, Transportation, Utilities, Groceries, Shopping, Health, Entertainment, Education, Business, Transfer).
6. Optionally add a note (e.g., *"Lunch with team at Buka"*), attach a tag, or customize the date.
7. Tap **Save Transaction**.

### Paste-to-Log MoMo SMS Rescue
If you missed an automatic sync or received an SMS on another device:
1. Copy the SMS text from your phone messages (e.g., `Payment received for GHS 150.00 from Kweku Mensah...`).
2. Open **AI Support** from the dashboard.
3. Paste the raw SMS directly into the chat and hit **Send**.
4. CediSmart’s dual-brain parser instantly extracts the amount, counterparty, wallet, and transaction date, records it into your ledger, and responds: *"Instant MoMo SMS Rescue: Successfully logged GH₵ 150.00 income to your MTN MoMo wallet."*

### Receipt & Invoice Vision Scanning
1. Open **AI Support** and tap the **+** attachment button on the bottom left.
2. Select **Camera** to snap a photo of a store receipt or **Photos** to pick an existing image.
3. You can attach paper receipts from Shoprite, Melcom, shell stations, or neighborhood pharmacy invoices.
4. CediSmart’s multimodal vision reads the merchant, itemized lines, and grand total.
5. In **Advisor Mode**, an interactive confirmation card appears:
   - **Merchant**: Shell Airport
   - **Amount**: `GH₵ 350.00`
   - **Category**: Transportation / Fuel
   - **Wallet**: Mobile Money
   - Buttons: `[ Confirm & Save to Ledger ]` or `[ Edit in Form ]`.
6. Tap **Confirm & Save to Ledger** to record the receipt instantly with 1 touch!

---

## 6. Mobile Money Live Auto-Sync

Automated transaction logging allows CediSmart to maintain an accurate ledger without requiring you to manually type in every trotro fare or momo transfer.

```
┌────────────────────────────────────────────────────────┐
│           HOW MOBILE MONEY AUTO-SYNC WORKS             │
├──────────────────────────┬─────────────────────────────┤
│   🤖 GOOGLE ANDROID      │      🍎 APPLE iOS           │
├──────────────────────────┼─────────────────────────────┤
│ Direct Background SMS    │ Apple Shortcuts Webhook     │
│ Read permission granted  │ Native iOS automation runs  │
│ in app. Intercepts incoming │ on message arrival and   │
│ SMS from MTN/Telecel/AT  │ securely forwards JSON to   │
│ in real time.            │ CediSmart cloud endpoint.   │
└──────────────────────────┴─────────────────────────────┘
```

### Google Android: Direct Background SMS Interception
1. Navigate to **Settings ➔ Accounts & Sync**.
2. Tap **Configure MoMo Auto-Sync**.
3. Select **Google Android**.
4. Tap **Grant SMS Permissions**. Android will prompt you to allow CediSmart to read incoming SMS messages.
5. Once granted, whenever your network operator sends an SMS from `MobileMoney`, `TelecelCash`, or `ATMoney`, CediSmart runs its local regex/AI parser in the background and logs the transaction immediately.

### Apple iOS: Apple Shortcuts Webhook Automation
Because Apple iOS security sandboxing prevents third-party apps from reading SMS directly, CediSmart uses Apple's native **Shortcuts Automation**:

#### Step 1: Copy Your Webhook Credentials
1. In CediSmart, go to **Settings ➔ Accounts & Sync ➔ Configure MoMo Auto-Sync**.
2. Select **Apple iOS**.
3. Tap **Copy Webhook URL** (e.g., `https://cedismart-api.onrender.com/api/v1/transactions/sms-webhook`).
4. Tap **Copy Bearer Auth Key** (your private authenticated security token).

#### Step 2: Create the iOS Shortcut Automation
1. Open the built-in **Shortcuts** app on your iPhone.
2. Tap the **Automation** tab at the bottom, then tap **+** (New Automation).
3. Scroll down and choose **Message**.
4. Set the trigger:
   - **Sender**: Type `MobileMoney` (or add `TelecelCash`, `T-CASH`).
   - **Message Contains**: Leave blank (to match all messages) or type `Payment`.
   - Select **Run Immediately** and make sure **Notify When Run** is toggled off.
   - Tap **Next**.

#### Step 3: Configure the Webhook Post Action
1. Tap **New Blank Automation** ➔ **Add Action**.
2. Search for **Get Contents of URL** and select it.
3. Tap the URL field and paste the **Webhook URL** you copied from CediSmart.
4. Tap **Show More**:
   - Change **Method** to `POST`.
   - Tap **Headers** ➔ **Add new header**:
     - Key: `Authorization`
     - Value: `Bearer <paste your Bearer Auth Key here>`
   - Change **Request Body** to `JSON`.
   - Tap **Add new field** ➔ Choose `Text`:
     - Key: `sender` | Value: Select `Sender` variable from the message.
   - Tap **Add new field** ➔ Choose `Text`:
     - Key: `message_body` | Value: Select `Shortcut Input` (Message Body).
   - Tap **Add new field** ➔ Choose `Text`:
     - Key: `phone` | Value: Enter your registered CediSmart phone number.
5. Tap **Done** in the top right corner.

> [!NOTE]
> Every time MTN MoMo or Telecel sends a transaction SMS alert, your iPhone will securely send the encrypted text to CediSmart’s server, which logs the transaction and updates your balance within 2 seconds!

---

## 7. Monthly Budgets & Spending Control

CediSmart helps you proactively guard your money before it slips away.

```
┌────────────────────────────────────────────────────────┐
│  MONTHLY BUDGETS (OCTOBER)                [+ Add Limit]│
│                                                        │
│  🍔 Food & Dining               GH₵ 650.00 / GH₵ 800.00│
│  [████████████████████░░░░░] 81%  ⚠️ Near Limit!       │
│                                                        │
│  🚗 Transportation (Trotro/Fuel) GH₵ 220.00 / GH₵ 400.00│
│  [██████████░░░░░░░░░░░░░░░] 55%  • GH₵ 180.00 left    │
│                                                        │
│  💡 Utilities & Internet        GH₵ 300.00 / GH₵ 300.00│
│  [█████████████████████████] 100% 🚨 Limit Reached     │
└────────────────────────────────────────────────────────┘
```

### Setting Category Limits
1. Navigate to the **Budgets** tab.
2. Tap **+ Add Budget**.
3. Select a category (e.g., Food & Dining, Transportation, Entertainment).
4. Enter your monthly spending target in Cedis (e.g., `800.00`).
5. Set an alert threshold (default is `80%`).
6. Tap **Save Budget**.

### Live Progress & 80% Threshold Warnings
- **Green Progress Bar (<70%)**: Spending is on track.
- **Amber Warning Bar (70% - 99%)**: Approaching monthly limit. A warning badge alerts you to slow down.
- **Red Over-Budget Alert (100%+)**: Target exceeded. Your AI CFO will flag this category in your weekly summaries and deep audits.

### Adjusting Budgets Mid-Month
- Tap any budget card to edit the spending ceiling or delete the budget limit.
- You can also ask your AI Voice assistant verbally: *"Increase my food budget to 1,000 cedis"* and tap **Set Budget Limit** on the assistant card.

---

## 8. Reports, Analytics & Cash Flow Intelligence

The **Reports** tab provides CFO-grade financial clarity:

### Monthly Summary KPIs
- **Total Income**: Combined earnings across salary, gifts, business deposits, and transfers.
- **Total Expenses**: Grand total spent across all categories.
- **Net Savings**: Income minus expenses.
- **Savings Rate**: Percentage of income retained (e.g., `+34%`).

### Plain-Language Financial Takeaways
Instead of raw tables, CediSmart translates your financial data into plain-language actionable takeaways:
> *"You’ve spent GH₵ 1,450.00 this month, which is 12% lower than this time last month. Your highest spending category is Food & Dining (42% of expenses). If you maintain this velocity, you are projected to save GH₵ 680.00 by month-end."*

### Category Breakdowns & 6-Month Trends
- **Interactive Donut Chart**: Visualizes spending distribution with color-coded slices.
- **6-Month Cash Flow Trend**: Compares monthly income versus expenses to track long-term net worth expansion.

---

## 9. CediSmart AI Support & Voice CFO

CediSmart includes an intelligent, autonomous financial companion powered by Gemini Flash-Lite and Neural TTS.

```
┌────────────────────────────────────────────────────────┐
│                CEDISMART AI SUPPORT                    │
├────────────────────────────────────────────────────────┤
│ [ 🇬🇭 English | 💬 Pidgin | 🇬🇭 Twi ]   [⚡ Auto-Pilot: OFF]│
├────────────────────────────────────────────────────────┤
│ User: How is my food budget doing this month?          │
│                                                        │
│ AI: You have spent GH₵ 650.00 out of your GH₵ 800.00   │
│ Food & Dining budget (81%). You have GH₵ 150.00 left   │
│ for the next 5 days! ⚠️                                │
│                                                        │
│ User: Log 35 cedis for Waakye from cash                │
│                                                        │
│ ┌────────────────────────────────────────────────────┐ │
│ │ 📋 PROPOSED EXPENSE (ADVISOR MODE)                 │ │
│ │ Amount:      GH₵ 35.00                             │ │
│ │ Category:    Food & Dining                         │ │
│ │ Wallet:      Cash                                  │ │
│ │ Note:        Waakye                                │ │
│ │                                                    │ │
│ │ [ Confirm & Save to Ledger ]     [ Edit in Form ]  │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### ChatGPT Live Voice Mode
- Tap the **AudioLines Waveform** button in the chat composer to open ChatGPT Live Voice Mode.
- Features a **Liquid Glass Voice Orb** with animated physics and glowing ripple waves:
  - **Large Orb**: Ambient full-screen voice conversation.
  - **Mini Orb**: Tap the orb to shrink it into a compact badge above the controls, revealing the live speech-synced conversation transcript.
- **Hands-Free Conversational Turnaround**: When the AI stops speaking, the microphone listens automatically. Natural silence detection (~500ms) submits your speech seamlessly.
- **Voice Interruption (Barge-In)**: Tap the orb while the AI is speaking to interrupt and ask a follow-up question immediately.

### Voice Action Execution
You can manage your finances entirely by voice:
- *"Log 50 cedis for fuel on MTN MoMo"*
- *"Spent 25 cedis on lunch from cash"*
- *"What is my balance right now?"*
- *"How much did I spend this week?"*

While executing, CediSmart plays an instant reassuring verbal bridge (*"Checking your balance real quick…"*, *"Logging that for you right away…"*) and speaks the verified outcome aloud in natural Ghanaian English.

### Tri-Lingual Engine
Select your preferred language in the **+** menu:
1. **Standard Ghanaian English**: Clear, professional financial advice with polite cultural warmth.
2. **Ghanaian Pidgin Mode**: Warm, authentic Pidgin (*"Charley, you don spend 200 cedis on food. You dey balance well, no wahala!"*).
3. **Twi / Akan Mode**: Authentic Akan phrasing (*"Medaase! Wo sika a aka wɔ MoMo mu yɛ GH₵ 1,200.00. Sika nhyehyɛe no kɔ so yie."*).

### AI Tools & Controls Sheet (+)
Tap the **+** button on the bottom left of the chat composer to open the AI Command Center:
- **Media Cards**: One-tap access to **Camera**, **Photos**, and **Files** for receipt scanning and screenshot inspection.
- **Language Selector**: Segmented pill to toggle between `[ 🇬🇭 English | 💬 Pidgin | 🇬🇭 Twi ]`.
- **⚡ Auto-Pilot Execution Toggle** (`OFF` by default):
  - When **OFF (Advisor Mode)**: The AI presents structured confirmation cards (`[ Confirm & Save ]` and `[ Edit ]`). No database changes occur without your tap.
  - When **ON (Auto-Pilot Mode)**: Spoken and typed expense instructions are directly written to Postgres, accompanied by a verified banner and an instant 10-second **[ Undo ]** button.
- **🧠 Deep Financial Audit Toggle** (`OFF` by default): Activates a comprehensive, CFO-level diagnosis examining burn rates, velocity, and cost-cutting opportunities.
- **🔊 Auto-Speak Responses Toggle** (`OFF` by default): Synthesizes natural spoken replies for all typed messages.
- **Quick Action Rows**: Paste MoMo SMS, Check for problems, or open Offline Help Guides.

---

## 10. Offline Resilience & Auto-Syncing

CediSmart is built to survive unreliable network connections:
- **Zero Network Entry**: You can record transactions, check recent ledger history, and inspect your budgets while in Airplane Mode or in areas with zero cell reception.
- **Offline Queue**: Transactions created offline are securely queued in local encrypted storage.
- **Automatic Upload**: As soon as your device reconnects to Wi-Fi or cellular data, CediSmart uploads the pending transactions in the background and refreshes your balances.
- **Offline Knowledge Base**: Tap **Offline Help Guides** in the AI Support menu to read step-by-step guides on budgeting, MoMo sync, and cash reconciliation without an internet connection.

---

## 11. Troubleshooting, Diagnostics & Support

### Self-Heal Diagnostic Doctor
If your balance seems delayed or transactions are pending upload:
1. Open **AI Support**.
2. Tap the **Check for problems** pill (or open the `+` menu and tap *Check for problems*).
3. The Self-Heal Doctor performs 3 automated tasks:
   - Synchronizes and flushes local wallet and ledger caches.
   - Flushes and retries any stuck transactions in your offline queue.
   - Refetches live Postgres balances and budget limits.
4. Returns a plain-language summary:
   - `• Your transactions and balances have been refreshed.`
   - `• No transactions are waiting to upload.`

### Submitting a Problem Report
If you experience a bug or server error:
1. Tap **Report a problem** in the AI Support menu.
2. Type a brief description of what happened.
3. Your device environment (OS version, app build, offline queue state) is automatically attached.
4. Tap **Submit Report**. A private ticket reference number is generated for our engineering team.

---

## 12. Appearance & Preferences

Customize CediSmart in **Settings**:
- **Theme Selection**:
  - **Dark Theme**: Pure black liquid glass styling optimized for OLED displays and battery savings.
  - **Light Theme**: Clean, crisp daytime palette with high sunlight contrast.
  - **System Theme**: Automatically matches your iOS or Android system appearance.
- **Currency & Formatting**: Standard Ghanaian Cedi (`GH₵`) notation with comma groupings.
- **Data Export**: Export your complete transaction history to CSV / Excel for personal accounting or tax records.
- **Security PIN Change**: Update your 6-digit PIN anytime under **Settings ➔ Security & PIN**.

---

## Frequently Asked Questions (FAQ)

**Q: Is CediSmart connected directly to my bank or MoMo PIN?**  
**A:** Never. CediSmart does **not** ask for or store your mobile money PIN, bank password, or ATM credentials. Transaction tracking works via SMS receipt parsing or manual entry. Your funds can never be withdrawn or transferred through CediSmart.

**Q: Can I use CediSmart without Mobile Money?**  
**A:** Absolutely. You can track physical cash and bank accounts entirely manually or via receipt photos.

**Q: What happens if I switch to a new phone?**  
**A:** Simply install CediSmart, verify your phone number via Clerk OTP, and enter your 6-digit PIN. All your cloud-synced accounts, transactions, and budgets will restore immediately.

---

*CediSmart — Financial Clarity for the Modern Ghanaian. 🇬🇭*
