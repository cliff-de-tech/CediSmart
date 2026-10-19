# CediSmart usability review and proposed plan

Date: 19 October 2026. Status: proposal for discussion, not an approved implementation specification.

## Scope and confidence

This is a source-code walkthrough of the current mobile working tree, with selected API reads to verify account creation, balance calculation, and transaction pagination. The working tree contains existing uncommitted changes. The APK shared with the friend may differ. No APK, emulator, or authenticated runtime was exercised, and no production data was accessed or changed.

The observed code behaviors below are concrete. Their effect on new users is a usability hypothesis until observed in task-based testing. Screen crowding, contrast, keyboard behavior, Android Back handling, and text scaling require device verification. This review changed documentation only.

Working product assumption: the first success is recording an everyday expense and understanding where money went. Confirm that priority with the product owner before committing to the navigation redesign.

## Main diagnosis

CediSmart asks users to understand its terminology, discover setup dependencies, and distinguish tracking from financial connections before completing a routine task. Some apparent complexity is also incomplete behavior: controls suggest actions they do not perform, and history can omit older records.

Keep the recognizable green visual identity and visual polish. Simplify the decisions, labels, and task sequence. Show advanced functions when someone needs them; do not require a separate beginner/expert mode or a long tutorial.

## Findings with source evidence

Paths are relative to the mobile project unless prefixed with `../cedismart-api`. Line numbers describe the reviewed working tree.

### 1. Navigation requires learning a private vocabulary — high priority

- `src/navigation/AppNavigator.tsx:22`: Ledger leads to the dashboard, Insights to Reports, Vault to My Budgets, and Setup to Settings.
- `src/screens/dashboard/DashboardScreen.tsx:659`: “Current Net Position” is the sum of tracked account balances (`:214`). Income and expenses below it use current-month data (`:534`) but their labels say “Total.”
- `src/screens/dashboard/DashboardScreen.tsx:705`: “Add Txn,” “AI Parse,” and “USSD” are primary shortcuts. “Active Vaults” means budgets (`:722`).
- `src/screens/settings/SettingsScreen.tsx:1416`: financial accounts and “Switch Account” for user identities appear together.

Likely user reaction: “Is a vault somewhere I put money? Is this my real balance? Does switching accounts select my bank?”

Proposal: use Home, Budgets, Reports, Settings consistently across tabs and headings as the smallest first change. Use “Add expense,” “Add from MoMo SMS,” “MoMo quick codes,” “Tracked balance,” “Income this month,” and “Spent this month.” Use “Switch profile” for another login. Explain tracked balance as based on starting balances and recorded transactions; do not call it money available to spend or net worth without the required data.

### 2. The first expense has a setup dependency with a dead end — high priority

- `src/screens/transactions/AddTransactionScreen.tsx:47`: account and category start blank. Both are mandatory at save (`:206`).
- `src/components/shared/AccountPicker.tsx:87`: an empty picker only says “No accounts found.” It has no creation action.
- `src/screens/settings/AccountsScreen.tsx:264`: creating Physical Cash happens in the separate Accounts screen.
- `../cedismart-api/app/modules/auth/service.py:79`: the inspected registration path creates a user but no default financial account.

Likely user reaction: “I want to record lunch. What account am I supposed to choose?”

Proposal: put account creation directly inside the expense flow and preserve the draft. Ask “Paid with?” with Cash, MoMo, or Bank choices. Offer a simple Cash starting option. Never invent a balance. If starting balance can be skipped, distinguish “not provided” from a known zero; until supported, explain the zero starting point and avoid portraying the resulting total as the user's actual available money. Show the selected payment source clearly, remembering it after the first explicit selection.

Acceptance: a fresh user with no financial accounts can save an expense without visiting Settings or abandoning the draft.

### 3. First use includes a sales decision before practical value — high priority

- `src/screens/auth/WelcomeScreen.tsx:82`: Get Started opens the trial offer, rather than registration.
- `src/screens/auth/WelcomeScreen.tsx:260`: the offer introduces “Ledgers & Vaults” before those concepts are understood.
- `src/screens/auth/RegisterScreen.tsx:75`: “Join Sovereign Ledger” and “digital ledger system” describe the product abstractly.
- `src/screens/auth/RegisterScreen.tsx:107`: phone input is limited to nine digits after +233; account setup expects ten digits starting with zero (`AccountsScreen.tsx:327`).
- `src/navigation/RootNavigator.tsx:51`: notification registration runs on authentication.

Proposal: explain the core benefit concretely, let Get Started begin sign-up, normalize familiar phone formats, and label OTP as “verification code.” Keep necessary authentication protections. Offer premium after a useful action or when a premium feature is chosen. Request notification permission in the context of enabling budget alerts. After sign-up, show one actionable empty state: “Record your first expense,” followed by an optional budget suggestion after saving.

### 4. The dashboard gives several jobs similar prominence — medium/high priority

- `src/screens/dashboard/DashboardScreen.tsx:596`: a menu icon opens MoMo quick codes, while a separate USSD shortcut does the same (`:714`).
- Accounts appears in the header (`:608`) and shortcut row (`:711`). Add transaction appears in the shortcut row (`:705`) and floating button (`:804`).
- Budgets precede recent transactions (`:719`, `:754`), even for a user with neither.

Hypothesis: the hierarchy makes the next useful action harder to identify. Duplicated shortcuts are not inherently wrong, but should earn their space through observed use.

Proposal: make Home answer “What have I spent this month?” and “What do I do next?” Lead with monthly spending, one labeled Add expense action, and recent transactions. Keep tracked balances reachable through a clearly named Accounts link. Show a compact budget summary once a budget exists. Move MoMo codes and other occasional tools to a secondary location. Validate the layout on a small Android screen before making claims about what fits above the fold.

### 5. Basic transaction controls are incomplete — immediate functional priority

- `src/screens/transactions/AddTransactionScreen.tsx:492`: the Date row has a chevron and touch styling but no `onPress`; it displays Today.
- `src/screens/dashboard/DashboardScreen.tsx:541`: transaction rows have touch styling but no detail action. The navigator has no transaction detail/edit screen.
- `src/screens/transactions/AddTransactionScreen.tsx:123`: Add Tag prompts for a value on iOS, but on Android only tells the user to type a hashtag in the description.
- `src/screens/budgets/BudgetsScreen.tsx:222`: tapping the trash icon immediately deletes a budget; there is no confirmation or undo in this path.

Proposal: implement a real date picker and transaction detail/edit flow. Put receipt, tags, and notes behind “More details,” and give Android a functioning tag editor if tags remain. Use confirmation or reliable undo for deletion. Show validation next to the relevant field and preserve input. Replace routine success dialogs with visible saved feedback and an Edit action.

Acceptance: users can record yesterday's purchase, correct a wrong amount/category, and recover from or prevent accidental deletion.

### 6. History can appear to lose transactions — immediate functional priority

- `src/screens/dashboard/DashboardScreen.tsx:152`: the “all” query calls `/transactions/` without pagination parameters.
- `../cedismart-api/app/modules/transactions/router.py:83`: the API defaults to page 1 with 20 results.
- `src/screens/dashboard/DashboardScreen.tsx:162`: search and filters run only against the returned items.
- Advanced filter reset is inside the expanded panel (`:1327`); reopening history resets search and type but retains other filters (`:759`).

Proposal: create a dedicated Transactions screen with paginated history, server-side filters, and full-history search. The API supports several structured filters already; description/amount text search needs API support or another explicitly complete search strategy. Do not fix this by requesting a larger but still incomplete first page. Show active filters and Clear filters outside the expanded filter panel.

Acceptance: a seeded record older than the first 20 entries is discoverable through browsing and search; errors are distinguishable from zero results.

### 7. “Linking” suggests capabilities this flow does not perform — immediate clarity priority

- `src/screens/settings/AccountsScreen.tsx:380`: consent/name verification is simulated using a timeout and the entered number's suffix, then an ordinary account record is created.
- `src/screens/settings/AccountsScreen.tsx:433`: bank setup is gated by the locally read verification status.
- `src/screens/settings/AccountsScreen.tsx:442`: starting balances default to arbitrary values of 250 or 1,200, and the form calls them “Simulated Current Balance” (`:993`).
- MoMo SMS automation is a separate feature; its existence does not make the simulated linking step a live bank connection.

Likely user reaction: “Did I connect my bank? Why is there already money here? Will transactions now appear automatically?”

Proposal: separate “Track an account manually” from “Import MoMo messages.” Use “Add account” for manual tracking, explain the data source, and request the actual starting balance without a prefilled fictional amount. Remove simulated verification from ordinary user flows. Show “Connected” only after a real integration succeeds. Review verification requirements specifically for the actual integration; this audit does not establish legal requirements or recommend bypassing real verification.

### 8. Offline and failure states obscure what happened — high priority

- `src/screens/transactions/AddTransactionScreen.tsx:282`: offline save queues a transaction.
- `src/screens/dashboard/DashboardScreen.tsx:537`: activity comes from server results; pending records are not merged into that list. The dashboard uses pending count for confetti rather than a persistent status.
- `src/navigation/RootNavigator.tsx:156`: session hydration retries on timeout/network failure, then deletes credentials and logs out after exhaustion.
- Dashboard, Reports, and Budgets commonly fall back to zero/empty data without rendering query errors distinctly.
- `src/hooks/useOfflineSync.ts:34`: the hook removes all queued IDs after a successful bulk HTTP response without checking per-item errors.

Proposal: show locally saved transactions immediately with “Waiting for internet,” and keep failed items with Retry/Edit. Deduplicate local and server records using their client IDs. Separate unavailable data from true zero values. Distinguish temporary network failure from an invalid session; preserve credentials on transient failure and design authenticated cached access deliberately. Review partial-success handling before promising reliable offline saves.

Acceptance: users can tell whether a record is saved locally, synced, or needs attention; offline/reconnect and partial failure tests prove records are neither lost nor duplicated.

### 9. Secondary screens can explain less and help more — medium priority

- `src/screens/reports/ReportsScreen.tsx:203`: three financial metrics precede two charts; “Net” needs interpretation.
- `src/screens/settings/SettingsScreen.tsx:1374`: profile, verification, financial accounts, profile switching, membership, appearance, security, notifications, storage, and support share a long page.
- `src/components/shared/CategoryPicker.tsx:81`: four-column categories all use the same Tag icon, reducing visual recognition.
- Small uppercase labels and 9–12 point text are common. Their practical legibility is a device-test question, not a measured contrast failure in this audit.

Proposal: lead Reports with one plain-language observation derived from real data and a readable category list; keep charts for exploration. Group settings into Profile, Security, Appearance, Notifications, Data, and Help, with secondary screens. Keep profile switching inside Profile. Give categories distinguishable icons and surface recent choices without silently choosing a category for the user. Test larger text, TalkBack, contrast, touch targets, keyboard interaction, and Android Back behavior.

## Proposed product flow

First use:

`Clear welcome → Sign up → Record first expense → See it saved → Optional first budget`

Everyday expense:

`Add expense → Amount + Category + Paid with → Save → Updated activity`

Default date is Today with a working edit control. Display the payment source explicitly. Expense/Income can remain a compact switch. SMS import is a secondary entry method that ends in the same review-and-save form. Notes, receipts, and tags are expandable optional details.

Navigation proposal after the first usability test:

| Destination | Main job |
| --- | --- |
| Home | Monthly spending, recent activity, add expense, tracked accounts |
| Transactions | Find, inspect, correct, and filter records |
| Budgets | Set a monthly category limit and see what remains |
| More | Reports, settings, help, and MoMo tools |

This is a candidate, not a prerequisite for the first fixes. If testing shows Reports is a frequent destination, keep Reports as a tab and put Settings behind a labeled profile/settings entry. Avoid adding tabs for every feature.

## Delivery order and verification

### Stage 1 — Make existing behavior understandable and dependable

Standardize names; correct account-connection language and fictional starting balances; remove dead ends in account selection; fix date selection; make history complete; distinguish empty/loading/error states. Include balance correctness and offline visibility defects in the functional backlog rather than concealing them with new copy.

Additional correctness case to reproduce: Cash Balance editing sends the entered current balance as `opening_balance` (`AccountsScreen.tsx:268`), while the API subsequently adds transaction history (`../cedismart-api/app/modules/accounts/service.py:282`). With opening cash 100 and spending 20, saving the displayed 80 would produce 60 under this calculation. Design an explicit balance adjustment/reconciliation operation and verify it against transaction history.

Gate: a clean account can create an expense, a date can be changed, an older record can be found, and account totals are explainable. Ship no unsupported connection claims.

### Stage 2 — Simplify first use and daily recording

Remove the pre-registration trial interruption, introduce a focused first-expense empty state, simplify Home and the form, preserve drafts through inline account creation, add transaction details/correction, and provide safe budget deletion. Introduce the navigation candidate only after a short task test validates findability.

Gate: fresh users complete the core tasks below without coaching and can explain what the displayed balance represents.

### Stage 3 — Make advanced use discoverable and resilient

Reorganize settings, improve report explanations, make automation setup platform-specific, and complete offline recovery and accessibility verification. On Android, show Android setup by default. For a future iOS release, replace the exposed webhook/authentication/JSON setup instructions with a supported consumer flow before promoting automation.

Gate: slow network, reconnect, large text, keyboard, and TalkBack scenarios preserve task completion. Confirm existing user data and routes survive navigation changes.

## Small usability study

First reproduce the friend's build/version if available, then compare with the revised build. Start with five fresh participants across different levels of budgeting experience, including at least one cash-first and one MoMo-first user. This is an initial diagnostic round, not a statistically representative result. Use test accounts and invented transactions.

Give tasks, not instructions about which controls to tap:

1. “You spent ₵25 on lunch today. Record it.” Start without a financial account.
2. “You just noticed it was ₵20, not ₵25. Correct it.”
3. “Record ₵15 for transport yesterday.”
4. “Find a payment from last month.” Seed more than 20 records.
5. “Keep food spending below ₵600 this month. How much remains?”
6. “What does this balance mean? Is your bank connected?”
7. After a successful setup, save while offline, reconnect, and ask where the record is.

Record task completion, first click, time, backtracking, requests for help, and the participant's explanation of the result. Ask “What did you expect to happen?” after a hesitation. Avoid guiding them through the flow during the attempt.

Proposed targets, to refine after measuring the baseline:

- At least 4 of the first 5 participants complete each core task without assistance.
- At least 4 of 5 save their first expense within 60 seconds after sign-in.
- Returning users can record an ordinary expense in about 15 seconds.
- Every participant distinguishes manual tracking from a real financial connection.
- Functional checks find older transactions and show offline records without loss/duplication.

Do not average away critical failures: losing a record, blocking a fresh user, or misrepresenting a connection remains a release blocker even if other tasks score well. If adding product instrumentation, log step/completion/error events rather than transaction descriptions, amounts, phone numbers, or SMS content.

## Discussion decisions

1. Confirm the first success: everyday spending, budgeting, or MoMo balance tracking. This proposal assumes everyday spending.
2. Confirm that the friend evaluated a build containing the reviewed flows; record version/build identifier for future feedback.
3. Test the minimal label/form changes before committing to a larger navigation change.

Method references: [Nielsen Norman Group usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) informed the focus on familiar language, consistent controls, visible status, and recovery. [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/) was read as required by the project instructions; implementation should consult the exact versioned pages for affected components.
