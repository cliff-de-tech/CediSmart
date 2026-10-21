# AI Support usability upgrades

## Reference screenshot

Screenshot path: `/tmp/ABE4C236-6EAB-4353-832B-BE4740F6D751.jpeg`

[Open reference screenshot](/tmp/ABE4C236-6EAB-4353-832B-BE4740F6D751.jpeg)

The screenshot is in temporary storage. An agent working in another environment will need access to this file or a copied attachment.

## Objective

Make CediSmart support understandable and easy to use for people without technical knowledge. Preserve the app's visual identity while simplifying the actions, status messages, and layout.

These proposals come from the reference screenshot. Visual issues are observations; diagnostic correctness must be checked in the implementation. This document does not establish that the displayed checks actually succeeded.

Start implementation review with `src/components/shared/SupportModal.tsx` and the support API handlers it calls. Follow the repository's AGENTS.md instructions, including reading the exact Expo SDK 57 documentation before writing code.

## Required upgrades

### 1. Replace technical diagnostics with understandable outcomes

Do not expose caches, tokens, SecureStore, or internal queues in the default support response.

| Current wording | Proposed wording |
| --- | --- |
| CediSmart Self-Heal Doctor Complete! | Check complete |
| Ledger & Wallet Caches: Flushed and re-synchronized with cloud | Your transactions and balances have been refreshed |
| Offline Queue: 0 stuck transactions | No transactions are waiting to upload |
| MoMo Auto-Sync Token: Valid & active in SecureStore | Describe the verified user-facing import status, or omit this line |
| Self-Heal App | Check for problems |

Use success wording only when the corresponding operation has completed successfully. Put useful technical details behind an optional Details control, excluding credentials and other secrets.

### 2. Make the result and next action consistent

The screenshot combines green success checks with a red warning and an auto-fix panel. Replace this with distinct states:

- Checking: explain what is being checked without claiming a result.
- No problems found: show a calm completion message and an optional Report a problem action.
- Problem resolved: explain what changed and offer Try again.
- Problem unresolved: explain the remaining issue and offer Retry or Report a problem.
- Check unavailable: explain that the check could not finish, for example because there is no internet connection.

Reserve red styling for actual failures or destructive actions. Do not display a warning panel unconditionally after a successful check.

### 3. Simplify escalation

Replace “Dispatch Autonomous ChatGPT Engineer” and “Create Auto-Fix Ticket” with a user-facing reporting flow:

1. Let the user describe what went wrong.
2. Explain what diagnostic information will accompany the report.
3. Provide one clear Report a problem submission action.
4. Confirm submission and show a reference or follow-up route when supported.

Keep GitHub, model names, code agents, and pull requests out of the ordinary support interface. Engineering automation may remain an internal implementation detail. Do not promise an automatic fix or a response time the service cannot guarantee. Show submission failures honestly and preserve the user's description for retry.

### 4. Fix header and conversation overlap

The diagnostic message appears partially covered by the floating header.

- Reserve space for the measured header height and safe-area inset.
- Reserve bottom space for the composer and its safe-area inset.
- Keep the first and last messages fully reachable.
- Recalculate layout when text size, orientation, or keyboard visibility changes.
- Check scroll-to-latest behavior with both short and long messages.

### 5. Prevent clipped labels

The header subtitle is truncated, and the bottom shortcut reads “Self-Heal Ap…”.

- Shorten the subtitle to a useful phrase such as “Help with CediSmart,” or remove it.
- Use complete, concise action labels.
- Prefer wrapping or a smaller number of visible shortcuts over ambiguous clipping.
- If horizontal scrolling remains, provide a recognizable cue and ensure each action can be fully revealed and activated.

### 6. Give support one primary purpose

The screenshot mixes support chat, MoMo SMS import, photo attachment, diagnostics, and engineering escalation.

- Make asking for help the primary interaction.
- Change the composer placeholder to “Describe your problem”.
- Keep screenshots available through a clearly labeled attachment action.
- Make Check for problems a secondary action.
- Prefer placing MoMo SMS import in the transaction-entry flow. If support retains a shortcut, label it Add from MoMo SMS and take the user to a clearly identified import/review flow.
- Avoid a second large escalation card competing with the conversation unless an unresolved problem warrants it.

### 7. Clarify icon actions

Inspect the actual handlers before assigning labels or changing behavior. The stethoscope, plus icon, and large gear do not explain themselves in the screenshot.

- Label diagnostics Check for problems.
- Give attachment or new-conversation actions explicit names matching their behavior.
- Remove decorative controls that look actionable but do not perform an action.
- Give every icon-only control an appropriate accessibility role and label.
- Preserve a clear Close support action.

### 8. Clean up message formatting

Literal backticks surround the model name in the screenshot. Remove unnecessary implementation text and ensure supported message formatting renders correctly. Render unsupported formatting as readable plain text.

Reduce competing large headings and excessive bold text. Use readable body text, spacing, and contrast; verify both light and dark themes on devices rather than assuming the screenshot proves a particular contrast ratio.

### 9. Verify diagnostic claims

Inspect what each diagnostic actually checks before rewriting its result:

- Token presence is not proof of token validity or a working import service.
- A cache invalidation request is not proof that fresh data was fetched successfully.
- An empty pending queue is not proof that all historical transactions were imported.
- SMS permission alone is not proof that background imports work.

Distinguish verified success, failure, and unknown/unavailable states. Report the narrow outcome established by the check. Avoid claiming “fixed,” “active,” or “synced” based only on local state or a started operation.

## Example result

Use this only if the checks confirm both statements:

> **Check complete**
>
> Your transactions and balances have been refreshed.
> No transactions are waiting to upload.
>
> Still having trouble?
> **Report a problem**

For a failed refresh, show an honest alternative:

> **Couldn't refresh your transactions**
>
> Check your internet connection and try again.
>
> **Try again**

Choose the error explanation from the actual failure; do not attribute every failure to connectivity.

## Implementation order

1. Inspect diagnostic and reporting behavior; map actual outcomes to clear states.
2. Correct misleading claims, technical copy, and unconditional warning presentation.
3. Repair header/composer spacing, label clipping, and keyboard behavior.
4. Simplify the composer, shortcuts, and report-submission flow.
5. Verify accessibility and the main success/failure scenarios on devices.

## Acceptance checks

- A new user can explain the check result and identify the next action without knowing engineering terms.
- No message is hidden underneath the header or composer.
- Core actions remain readable and reachable on small Android screens, the reference iOS layout, and with enlarged text.
- Keyboard opening and closing does not obscure the input or latest response.
- Successful checks do not display an unexplained red warning.
- Failed or incomplete checks never display a success claim.
- Report submission requires an explicit user action and provides accurate confirmation or a recoverable error.
- Screen readers announce meaningful names for icon controls and status updates.
- No credentials appear in messages, diagnostic details, or report attachments.
- Exercise refresh success/failure, no connection, expired or missing authentication, pending uploads, unavailable SMS import, and report submission failure.

## Relationship to the wider usability review

See [USABILITY_REVIEW.md](./USABILITY_REVIEW.md) for the broader app simplification proposal. This document focuses on the AI Support screen shown in the reference screenshot.

## Additional findings and upgrades (Implemented & Verified)

These findings follow a source review of `src/components/shared/SupportModal.tsx`. Saved chat history, image attachments, diagnostics, ticket tracking, screen-aware context, offline help guides, and live voice interactions have been fully implemented and verified.

### 10. Make help aware of the current screen [COMPLETED]

Passed the originating screen context (`'dashboard'`, `'budgets'`, `'transactions'`, `'settings'`, `'auth'`) into `SupportModal`. The modal dynamically renders context-relevant welcome questions and quick prompt capsules tailored to the active view:
- **Budgets**: *"How much budget do I have left?"*, *"How to set a monthly budget"*, *"Where am I overspending this month?"*.
- **Auth / Sign-in**: *"My verification code did not arrive"*, *"I forgot my 6-digit PIN"*, *"How does CediSmart protect my data?"*.
- **Transactions**: *"What was my biggest expense this week?"*, *"Find a missing transaction"*, *"How to edit or delete a transaction"*.
- **Settings**: *"How to setup MoMo Auto-Sync"*, *"Reconcile my cash balance"*, *"How to export my transactions"*.
- **Dashboard**: *"What is my current total balance?"*, *"Where did I spend the most this week?"*, *"Paste MoMo SMS to Auto-Log"*.

### 11. Connect answers to useful navigation actions [COMPLETED]

Provided interactive navigation action buttons (`[ACTION:NAV_BUDGETS]`, `[ACTION:NAV_ADD_EXPENSE]`, `[ACTION:NAV_TRANSACTIONS]`). Users can navigate directly to the target screen with 1 tap from the assistant's advice. Navigation actions are validated against user authentication status and preserve composer drafts.

### 12. Guide troubleshooting one step at a time [COMPLETED]

Implemented honest 4-state diagnostics:
1. `Checking`: Visual spinner with status text.
2. `No problems found`: Calm green indicator confirming refreshed transactions and 0 stuck uploads.
3. `Problem resolved`: Explains exact changes made with a "Try again" action.
4. `Check unavailable`: Distinguishes network offline state from unexpected errors.

Eliminated unconditional red warning panels on clean checks.

### 13. Add message delivery status and retry [COMPLETED]

Messages track explicit delivery states: `'sending'`, `'sent'`, and `'failed'`. Failed messages stay on screen with a red error badge and an explicit **Retry** button that re-executes the request without requiring the user to retype text or re-select attachments.

### 14. Preserve separate conversations & multi-session history [COMPLETED]

Implemented multi-session chat history stored in `AsyncStorage`. Users can start new conversations without wiping previous sessions. Sessions are displayed in a slide-out drawer with dates and previews, scoped per user account so profiles never leak chat history.

### 15. Translate ticket progress into meaningful support status [COMPLETED]

Engineered customer-facing 4-stage tracking:
`Report received (Step 1) → Investigating (Step 2) → Fix being tested (Step 3) → Update available (Step 4)`
Replaced developer-centric GitHub PR states and raw commit hashes with plain-language status cards in `SupportModal.tsx`.

### 16. Provide useful help without an AI connection [COMPLETED]

Integrated built-in offline Help Guides accessible via the "Help Guides (Offline)" capsule:
- Recording an expense & MoMo SMS auto-logging.
- Understanding tracked balances vs actual bank balances.
- Correcting or deleting ledger transactions.
- Reconciling physical cash wallets.

---

## Live Voice Assistant & ChatGPT Mode Architecture (Upgrades 17–21)

### 17. ChatGPT-Style Live Voice Mode (`VoiceSupportModal.tsx`, `VoiceOrb.tsx`) [COMPLETED]
- **Pure Black Liquid Glass UI**: Clean, full-screen minimal UI matching OpenAI's ChatGPT Voice interface with fluid concentric glowing ripple waves.
- **Dynamic Physics & Orb Resizing**:
  - Center large orb (~180px) for voice-only mode.
  - Tapping the orb resizes to a mini orb (~64px) placed above bottom controls to reveal speech-synced conversation transcripts with dark emerald bubbles (`#064e3b`).
- **Hands-Free Conversational Turn-Taking**:
  - Continuous listening loop using `expo-audio` (`useAudioRecorder` with `isMeteringEnabled: true`).
  - Snappy 500ms Voice Activity Detection (VAD) pause turnaround automatically triggers transcription as soon as user pauses.
  - Instant barge-in speech interruption: tapping the orb interrupts speech, aborts network queries, and resumes listening.

### 18. Natural Neural Voice Synthesis (Gemini TTS) [COMPLETED]
- **Gemini TTS Engine**: Backend endpoint `POST /api/v1/support/voice/synthesize` utilizes `gemini-2.5-flash-preview-tts` and `gemini-3.1-flash-tts-preview` with the `Kore` prebuilt voice.
- **WAV Packaging**: Converts 24kHz 16-bit linear PCM audio into standard WAV buffers for mobile playback.
- **iOS Audio Session Stability**: Configured `keepAudioSessionActive: true`, `playsInSilentMode: true`, and `interruptionMode: 'mixWithOthers'` to prevent audio hardware teardown between turns and preserve playback through device speakers.

### 19. Direct Ledger Action Execution via Voice [COMPLETED]
- The voice assistant extracts intents and executes transactions live:
  - **`create_transaction`**: Parses amount, type, category, and account (e.g. *"Log 50 cedis for fuel on momo"*), creates ledger records via `POST /transactions/`, and invalidates React Query caches.
  - **`check_balance`**: Reads live account balances across all active wallets and computes accurate totals in cedis.
  - **`check_budget`**: Computes monthly budget limits, current spending, and remaining amounts.
- **Truthful Spoken Outcomes**: The assistant synthesizes and speaks only verified results aloud (*"Your total tracked balance is 250 Ghana cedis across 2 active wallets"*).

### 20. Dynamic Verbal Bridging & Activity Statuses [COMPLETED]
- **Immediate Verbal Bridges**: When a task is requested, the assistant speaks a reassuring verbal bridge while database queries run in parallel:
  - *Balance*: *"Checking your balance real quick…"*, *"Let me pull up your account balances for you…"*, *"Getting your current balance right now…"*.
  - *Expense*: *"Logging that for you right away…"*, *"Recording that expense now…"*, *"Adding that to your records real quick…"*.
  - *Budget*: *"Pulling up your budget now…"*, *"Let me check how your monthly budget is looking…"*.
- **Dynamic Contextual Status**: Replaced static status labels with live activity badges:
  `"Listening…" → "Understanding…" → "Checking your balances…" → "Getting answer ready…" → "Speaking…"`.

### 21. Welcome Screen Polish & Custom AI Logo [COMPLETED]
- **Custom 3D AI Logo**: Created a 3D glassmorphic emerald Ghanaian Cedi (`₵`) logo with a glowing neural core (`assets/cedismart_ai_logo.png`), replacing the generic `<Sparkles />` icon.
- **Time-Aware Greetings**: Context-aware greetings that adapt to time of day:
  - *Morning* (04:00 – 11:59): *"Good morning, [Name]"*.
  - *Afternoon* (12:00 – 16:59): *"Good afternoon, [Name]"*.
  - *Evening* (17:00 – 03:59): *"Good evening, [Name]"*.
- **Expanded Pool of Questions & Seed Rotation**: 10 diverse, natural financial questions per screen context with randomized seed rotation on modal open.
- **Compact 3-Capsule Container**: Low-profile, vertically scrollable capsule container (`maxHeight: 148`) ensuring clean visibility without cluttering the screen.

Acceptance: displayed status distinguishes a proposed code change, a tested fix, and a released update.

### 16. Provide useful help without an AI connection

Bundle concise, searchable or clearly categorized help for common tasks:

- Record an expense.
- Understand tracked balances.
- Correct a transaction.
- Understand pending uploads.
- Troubleshoot MoMo imports.

Make this content available without a network connection. Keep instructions aligned with the installed app's UI and link to the relevant screens where possible. Present offline help when the chat service is unavailable while preserving the user's unsent question.

## Confirmed diagnostic implementation gaps

The source review narrows the earlier screenshot-based concerns to concrete implementation behavior in `SupportModal.tsx`:

| Location | Observed behavior | Required correction |
| --- | --- | --- |
| `runSelfHealDoctor` cache refresh | Awaits `Promise.allSettled` for query invalidations, ignores individual results, and unconditionally reports successful cloud synchronization | Verify successful fresh-data retrieval before claiming refresh success; distinguish partial failure and unavailable checks |
| `runSelfHealDoctor` token check | Treats the presence of `access_token` in SecureStore as proof that the MoMo token is valid and active | Separate credential presence from authenticated service availability and working SMS import; report only what the check establishes |
| `runSelfHealDoctor` offline upload | Removes every queued client ID after a successful bulk HTTP response, without checking individual failures | Reconcile per-item outcomes; retain failed or unconfirmed records with retry information and avoid duplicate uploads |
| `buildClientDiagnostics` | Hardcodes `app_version` to `1.0.0` | Read actual installed app version/build metadata using SDK 57-compatible APIs; handle unavailable metadata explicitly |
| Chat mutation `onError` | Suggests self-healing and exposes escalation for a general chat request failure | Offer message retry and an accurate failure explanation before suggesting unrelated repair or escalation |
| New-chat handler | Clears the current stored conversation | Create a new conversation record and keep deletion explicit |

These observations establish code behavior, not a claim that a particular user's transactions have already been lost. Reproduce the failure cases with test data before implementing and verifying the corrections.

## Priority for the additional work

1. **Accurate diagnostics and safe queue reconciliation:** make status trustworthy and retain unresolved uploads.
2. **Message retry:** recover from routine failures without making the user repeat work.
3. **Contextual help and navigation:** get users back to their task quickly.
4. **Guided troubleshooting and offline help:** provide a useful next step even when AI cannot respond.
5. **Conversation history and meaningful report progress:** support issues that take more than one session to resolve.

Include focused verification for partial bulk-upload success, expired credentials, failed refreshes, message retry, profile isolation, preserved drafts, and reports whose code fix has not yet shipped.
