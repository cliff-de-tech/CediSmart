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

## Additional findings and upgrades

These findings follow a source review of `src/components/shared/SupportModal.tsx`. Saved chat history, image attachments, diagnostics, and ticket tracking already exist. Improve their behavior rather than rebuilding them as new features. The proposed additions below are not yet implemented.

### 10. Make help aware of the current screen

Pass the originating screen and relevant task context when opening support. Offer a small set of relevant prompts rather than the same broad greeting everywhere.

- Budgets: Create a budget; My spending looks wrong.
- Sign-in: My verification code did not arrive; I forgot my PIN.
- Transactions: Find a missing transaction; Correct a transaction.

Avoid automatically collecting unnecessary financial details. Keep a general question option available.

### 11. Connect answers to useful navigation actions

Provide short explanations with buttons that open the relevant screen, such as Open budgets or View transactions. Preserve the user's current draft when leaving a form.

Use a defined set of supported navigation actions. Opening a screen should not silently change a budget, transaction, or account. Validate that the destination is available for the current user and authentication state.

### 12. Guide troubleshooting one step at a time

Replace long generic diagnostic responses with a focused sequence:

`Identify the problem → Run the relevant check → Explain the result → Offer the next step`

For example, a missing transaction should first lead to checking pending uploads rather than running every diagnostic. Finish with “Did this solve your problem?” and Yes/No actions. A No response should preserve the context and continue troubleshooting or prepare a report without restarting the conversation.

### 13. Add message delivery status and retry

The current chat mutation appends the user's message and clears the composer before sending. On failure, it adds a generic assistant response suggesting self-healing and escalation.

- Give messages stable IDs and explicit Sending, Sent, and Couldn't send states.
- Attach Retry to the failed message and preserve its attachment.
- Explain connectivity, authentication, and service errors accurately when identifiable.
- Avoid suggesting app repair merely because a chat request failed.
- Prevent retries from duplicating messages or any transaction-changing operation supported by the backend.

Acceptance: a failed message can be retried without retyping or reattaching the image, and a transient connection failure does not automatically become an engineering escalation.

### 14. Preserve separate conversations

The existing chat history persists locally, but New chat currently clears the current conversation history.

- Start a separate conversation without deleting the previous one.
- Provide a simple history list with a short title and last-updated time.
- Let users return to unresolved issues.
- Make Delete conversation a separate, explicit action.
- Keep histories isolated between user profiles, including sign-in support sessions.

Acceptance: starting a new chat and reopening support preserves earlier conversations; switching profiles never exposes another user's history.

### 15. Translate ticket progress into meaningful support status

The existing interface exposes GitHub issue state, pull-request state, and agent comments. Replace these with user-facing status backed by actual workflow evidence:

`Report received → Investigating → Fix being tested → Update available`

Do not infer every stage from GitHub state alone. A closed issue may not mean the problem was resolved, and an opened or merged pull request does not establish that the user's installed app contains the fix. Show an accurate explanation for reports closed without a fix. When a fix is released, identify the app version containing it and provide the supported update route.

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
