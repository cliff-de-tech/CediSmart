# CediSmart Frontend -- Phase 3 Design Spec
**Date:** 2026-04-19 (revised after audit)
**Scope:** Walking skeleton -- Auth + Dashboard + Add Transaction
**Author:** Clifford Opoku-Sarkodie

---

## 1. Context

Backend (Phase 2) complete -- all 7 modules built, tested, passing. Frontend starts from a blank Expo project. This spec covers Phase 3: the walking skeleton that proves the full vertical slice (register, view money, record transaction). Remaining screens scoped to Phase 4+.

---

## 2. Design Direction

**Modern Ghanaian Fintech** -- confident, warm, trustworthy.

| Token | Value |
|---|---|
| Primary | #0A6E4A -- deep emerald green |
| Accent | #F5A623 -- warm amber/gold |
| Background | #F8F9FA -- off-white |
| Surface | #FFFFFF -- card white |
| Text primary | #1C1C2E -- dark charcoal |
| Error | #DC2626 -- red |
| Success | #16A34A -- green |
| Warning | #D97706 -- amber |
| Border radius | 16px cards, 12px inputs, 8px badges |
| Typography | DM Sans |

Amounts always formatted through formatGHS(), never raw toFixed() or toLocaleString().

---

## 3. Project Location

cedismart-mobile/ inside the existing CediSmart/ monorepo, alongside cedismart-api/.

---

## 4. Tech Stack

| Concern | Technology |
|---|---|
| Framework | Expo SDK 54, Managed Workflow |
| Language | TypeScript strict mode -- zero any |
| Navigation | React Navigation v6 (Native Stack) |
| Server state | TanStack Query v5 |
| Client state | Zustand |
| HTTP | Axios (real adapter only) |
| Secure storage | Expo SecureStore (tokens only -- never raw PIN) |
| Local storage | MMKV (offline queue, reference data cache) |
| Styling | NativeWind (Tailwind for RN) |
| Forms | React Hook Form + Zod |
| Testing | Jest + React Native Testing Library |

---

## 5. Project Structure

cedismart-mobile/src/
  api/
    adapter.ts         (ApiAdapter interface + factory)
    mock/              (auth, transactions, accounts, budgets)
    real/              (client.ts + auth, transactions, accounts, budgets)
  components/
    ui/                (Button, Input, Card, Badge, Spinner)
    shared/            (AmountDisplay, CategoryBadge, PINPad)
  navigation/
    RootNavigator.tsx  (Auth vs App stack switch)
    AuthNavigator.tsx
    AppNavigator.tsx   (Bottom tab navigator)
  screens/
    auth/              (Register, OTPVerify, SetPIN, Login)
    dashboard/
    transactions/      (AddTransaction)
  stores/
    authStore.ts       (Zustand: user, isAuthenticated, isLoading -- no token values)
    offlineStore.ts    (MMKV-backed offline queue)
  hooks/
    useTransactions.ts, useDashboard.ts, useOfflineSync.ts
  utils/
    currency.ts        (formatGHS -- sole formatting entry point)
    date.ts, uuid.ts   (crypto-safe UUID for client_id)
    session.ts         (in-memory token cache, SecureStore read/write)
  types/
    api.ts             (TypeScript types matching backend schemas)

---

## 6. Navigation Structure

RootNavigator watches authStore.isAuthenticated. Any 401 that exhausts refresh drops the user back to Auth stack.

RootNavigator
  AuthNavigator (Stack)
    WelcomeScreen -> RegisterScreen -> OTPVerifyScreen -> SetPINScreen (new user)
    LoginScreen (returning user)
  AppNavigator (Stack)
    MainTabs (Bottom Tabs)
      DashboardScreen (Ledger)
      ReportsScreen (Insights)
      BudgetsScreen (Vault)
      SettingsScreen (Setup)
    AccountsScreen
    AddTransactionScreen (modal)

---

## 7. API Adapter Pattern

Both mock and real adapters implement ApiAdapter. Factory reads EXPO_PUBLIC_USE_MOCK from .env.
Swap to real: EXPO_PUBLIC_USE_MOCK=false + EXPO_PUBLIC_API_URL. No code changes.

Interface methods:
  auth: initiateRegistration(phone), verifyOTP(phone, otp), setPin(pin) -> TokenPair+User, login(phone, pin), refreshToken(token)
  transactions: create(data), bulkCreate(data[]) -> BulkCreateResult (per-item status keyed by client_id), getSummary(), list(filters)
  accounts: list()
  budgets: getCurrent()
  categories: list()

Note: categories.list() added -- required by AddTransaction picker prefetch.

---

## 8. State Management

### Server state -- TanStack Query

Query keys: dashboard, transactions(filters), budgets, accounts, categories.
No raw API calls in components -- always through custom hooks.
AddTransaction success: invalidate dashboard + transactions.
Logout: queryClient.clear() -- prevents data leaking between users on same device.

### Client state -- Zustand

authStore holds auth STATE only -- no token values:
  { user: User | null, isAuthenticated: boolean, isLoading: boolean }

Token storage -- single source of truth:
  Persisted: Expo SecureStore (access_token, refresh_token)
  Runtime: in-memory session object in utils/session.ts
  Never: Zustand, AsyncStorage, navigation params, console.log

App launch hydration sequence:
  1. Read access_token + refresh_token from SecureStore
  2. If tokens present: populate in-memory session, set isAuthenticated=true, navigate to App stack
  3. If no tokens: set isAuthenticated=false, navigate to Auth stack
  4. First authenticated API call that gets 401 triggers refresh flow

offlineStore: MMKV-backed OfflineTransaction[] queue. Survives app kill.

### Token refresh lifecycle

Pre-expiry: if access token expires in less than 60 seconds, refresh proactively before the next request.

Concurrent 401 handling (mutex pattern):
  1. First 401 sets refreshInFlight=true, queues the failed request
  2. Subsequent 401s while refreshInFlight=true queue their requests (do not trigger new refresh)
  3. On refresh success: replay all queued requests with new token
  4. On refresh failure: clear queue, clear session, navigate to Login

Refresh failure matrix:
  401 on refresh endpoint -> token revoked or expired; clear session, force login, show Logged out toast
  Network error on refresh -> keep session, surface offline banner, retry on next request
  Refresh succeeds but subsequent request still 401 -> treat as revoked, force logout

Logout and data wipe:
  1. Delete access_token and refresh_token from SecureStore
  2. Clear in-memory session
  3. queryClient.clear()
  4. Clear MMKV offline queue
  5. Set authStore.isAuthenticated=false

### Offline sync flow with idempotency contract

1. AddTransaction submitted
2. Online: POST /transactions/ -> invalidate queries -> success toast
3. Offline: generate crypto UUID as client_id, append to MMKV queue, Saved offline toast
4. App foregrounds / network restores: useOfflineSync fires
5. POST /transactions/bulk with full queue -> backend returns per-item result keyed by client_id
6. For each item in result:
   success -> remove from queue
   409 DUPLICATE_CLIENT_ID -> treat as success, remove from queue (server already has it)
   other error -> leave in queue, retry next cycle
7. Invalidate queries for any successfully synced items

Idempotency contract:
  client_id is a crypto UUID generated once per transaction, stored with the queue item.
  Backend enforces UNIQUE(user_id, client_id). A 409 on client_id means the server already
  processed this item (timeout after server-side success). The client must treat 409 as success.

OfflineTransaction: { client_id (crypto UUID), account_id, category_id, amount (string decimal),
  transaction_type, description?, transaction_date (ISO date), queued_at (ISO datetime) }

---

## 9. Screen Designs

### RegisterScreen
Ghana flag + +233 prefix locked, phone input, inline errors (never alert popup).
429 rate limit: Too many attempts. Try again in 15 minutes.

### OTPVerifyScreen
6 individual digit boxes, auto-advance focus, auto-submit on 6th digit.
5-minute countdown with resend CTA after expiry. Each box accepts exactly one digit.
TalkBack/VoiceOver label per box: OTP digit 1 of 6, OTP digit 2 of 6, etc.

### SetPINScreen / LoginScreen
Custom PINPad (0-9 + backspace), shared component. Dots, never digits.
Shake animation on mismatch, both fields cleared.
PIN never persisted -- raw PIN must not be stored anywhere (SecureStore, AsyncStorage, state).
PIN is used once to authenticate, then discarded from memory.

Biometric unlock (LoginScreen):
  Biometric gates access to stored tokens, not PIN.
  On successful biometric: read access_token from SecureStore biometric-protected entry.
  If biometric fails or tokens are expired: fall back to PIN entry flow.
  Raw PIN is never stored for biometric -- not in SecureStore, not anywhere.

PINPad accessibility: each digit button has accessibilityLabel (0 through 9, Backspace).

### AddTransactionScreen (modal, most-used screen)

Prefetch requirement: accounts and categories must be loaded before this screen opens.
  Strategy: prefetch on App stack mount (not on screen open). Cache in TanStack Query.
  MMKV cache as fallback: persist last-fetched accounts + categories with 24h TTL.
  On first run with no network: show You need an internet connection to set up your first transaction.

Picker states:
  Loading: skeleton rows in bottom sheet
  Empty accounts: No accounts yet. Add one in Accounts. (CTA)
  Empty categories: shows system defaults (always available after first sync)
  Error: Could not load accounts. Pull to retry.

Form fields:
  Income / Expense toggle at top
  Large numeric input with GHS formatted preview above
  Category picker -> bottom sheet
  Account picker -> bottom sheet
  Date selector (defaults today, changeable)
  Optional description field
  React Hook Form + Zod, field-level errors only (no alert popups)
  Submit -> online path or offline queue
  On success: close modal, success toast, invalidate queries

### DashboardScreen
Layout top to bottom:
1. Greeting: Good morning, [user.full_name first word] -- fallback: Good morning! if name not set
2. Net position card -- large bold GHS amount (green positive / red negative), income + expense below
3. Budget strip -- horizontal scroll; amber >=80%, red >=100%, warning icon + text label at >=80%
4. Recent transactions -- last 5 rows + See all link (placeholder in Phase 3)
5. FAB -- + bottom-right opens AddTransactionScreen as modal
Skeleton loaders (pulsing opacity) while loading. Pull-to-refresh. ErrorBoundary with retry button.
Empty state: illustration + Add your first transaction CTA.

---

## 10. Error Handling

Never display raw backend messages to users. Error code map:

| Backend code | User message |
|---|---|
| RATE_LIMITED | Too many attempts. Try again in 15 minutes. |
| INVALID_OTP | Incorrect code. Check your SMS. |
| INVALID_CREDENTIALS | Incorrect PIN. Try again. |
| ACCOUNT_NOT_FOUND | Something went wrong. Please try again. |
| DUPLICATE_CLIENT_ID | (silent -- treat as success, remove from queue) |
| Network error | No internet connection. |

Loading: skeleton loaders on data screens, inline spinner on buttons during mutation.
Empty states: contextual (No expense transactions this month), never generic (No data).
Security: amounts never in navigation params, no console.log of amounts/tokens/phones.

---

## 11. Accessibility

Touch targets: minimum 44x44pt for all interactive elements (buttons, pickers, FAB, PINPad digits).

VoiceOver / TalkBack labels:
  PINPad digits: accessibilityLabel='0' through '9', 'Backspace'
  PIN dots: accessibilityLabel='PIN entered: X of 6 digits' (count only, never value)
  OTP boxes: accessibilityLabel='OTP digit N of 6'
  Amount input: accessibilityLabel='Transaction amount in Ghana Cedis'
  FAB: accessibilityLabel='Add transaction'

Non-color cues for budget thresholds:
  >=80%: amber color + warning icon + text label (Warning: 80% used)
  >=100%: red color + alert icon + text label (Over budget)
  Never rely on color alone to convey budget status.

Dynamic text: use relative font sizes (sp units via NativeWind text-base etc.) not fixed px.
Contrast: primary green #0A6E4A on white passes WCAG AA (ratio > 4.5:1). Verify amber on white at implementation.

---

## 12. Testing Strategy

Unit tests (Jest):
- currency.ts: formatGHS() -- zero, large numbers, string input edge cases
- uuid.ts: output is valid UUID v4
- offlineStore: enqueue, dequeue, partial failure retention, 409 treated as success
- Zod schemas: valid/invalid form inputs
- session.ts: hydration, clear, in-memory cache behaviour

Integration tests (Jest + React Native Testing Library):
- AddTransactionScreen: online path submits, offline path queues, validation blocks
- AddTransactionScreen: picker shows error state when accounts/categories fail to load
- useOfflineSync: 409 on client_id removes item from queue (not kept as failure)
- useOfflineSync: non-409 failure leaves item in queue
- Auth flow: 401 on refresh clears session and redirects to Login
- Auth flow: concurrent 401s trigger only one refresh (mutex)

Mock adapter doubles as test fixture -- no separate mocking library needed.
Not in scope Phase 3: visual regression, E2E (Detox), real API integration.
CI: tsc --noEmit + eslint --max-warnings 0 + Jest.

---

## 13. Security Checklist

- [ ] No sensitive data in AsyncStorage -- SecureStore only
- [ ] Raw PIN never persisted anywhere (SecureStore, MMKV, state, logs)
- [ ] Biometric gates token access, not PIN -- no stored PIN for biometric
- [ ] Token refresh interceptor handles concurrent 401s with mutex lock
- [ ] Refresh failure (401 on refresh) -> full session wipe + forced login
- [ ] queryClient.clear() + MMKV queue clear on logout
- [ ] client_id generated with expo-crypto, not Math.random()
- [ ] 409 DUPLICATE_CLIENT_ID treated as success in offline sync (not retried)
- [ ] OTP boxes reject multi-character paste
- [ ] Axios baseURL from env var, never hardcoded
- [ ] Backend error messages sanitised before display
- [ ] Amounts never in navigation params -- IDs only

---

## 14. Out of Scope (Phase 3)

- Transaction List, Budgets, Reports, Accounts, Settings screens (Phase 4)
- Paystack MoMo integration (Phase 4)
- E2E tests with Detox (Phase 5)
- SMS MoMo parsing (V2)
- Push notifications (V2)
- Railway production deployment (Phase 4 prerequisite)

> [!NOTE]
> All subsequent phases (Phase 4, Phase 5, Phase 6) are now fully complete. All screens, backend reporting, transaction lists, budget limits, user cascades, and production deployment pipeline configurations have been successfully implemented.

