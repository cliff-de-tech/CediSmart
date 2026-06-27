# 📱 CediSmart Mobile

**Production-grade React Native budget management app for iOS and Android.**

A modern, offline-capable mobile app for the CediSmart fintech platform. Built with Expo, TypeScript, and NativeWind for a fast, responsive experience on limited bandwidth networks.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Setup](#environment-setup)
- [Running Locally](#running-locally)
- [Navigation Structure](#navigation-structure)
- [State Management](#state-management)
- [Offline Support](#offline-support)
- [Building for Stores](#building-for-stores)
- [Development Workflow](#development-workflow)
- [Contributing](#contributing)

---

## Features

✅ **Phone-first authentication** — OTP via SMS  
✅ **Offline transactions** — Queue and sync when connectivity returns  
✅ **Multiple account types** — Bank, Mobile Money (MTN MoMo, Telecel Cash, AirtelTigo Money), Cash  
✅ **Budget tracking** — Real-time progress against monthly targets  
✅ **Transaction history** — Fast, searchable transaction log  
✅ **Spending analytics** — Monthly trends, category breakdown  
✅ **Biometric login** — Face ID / fingerprint (iOS/Android)  
✅ **Secure PIN storage** — Encrypted via device native storage  
✅ **Dark mode** — Native system theme support  
✅ **Push notifications** — Budget alerts and transaction confirmations  
✅ **Multi-language ready** — i18n framework in place  

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Framework** | Expo (SDK 54) | Managed workflow — no native code needed for MVP |
| **Language** | TypeScript (strict) | Type safety across the entire app |
| **React** | React 19.1 | Latest hooks, concurrent rendering |
| **Navigation** | React Navigation v6 | Industry-standard, production-proven |
| **HTTP Client** | Axios | JWT interceptors, request/response middleware |
| **Server State** | TanStack Query v5 | Automatic caching, background refetch, offline support |
| **Global State** | Zustand | Lightweight, no boilerplate, type-safe |
| **Forms** | React Hook Form + Zod | Performant, DRY validation, type-inferred schemas |
| **Styling** | NativeWind v2 | Tailwind for React Native — responsive, utility-first |
| **Secure Storage** | Expo SecureStore | Platform-native encryption (Keychain/Keystore) |
| **Notifications** | Expo Notifications | Push alerts from backend |
| **Authentication** | Expo LocalAuthentication | Biometric (Face/Fingerprint) |
| **Offline Queue** | MMKV | Fast, persistent key-value store for sync queue |
| **Charts** | react-native-gifted-charts | Lightweight transaction and budget visualizations |
| **Icons** | lucide-react-native | Consistent, customizable icon library |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│          React Navigation Stack                  │
│  ┌────────────┐ ┌──────────┐ ┌──────────────┐   │
│  │   Auth     │ │   App    │ │   Modal      │   │
│  │ Navigator  │ │ Navigator│ │ Navigator    │   │
│  └────────────┘ └──────────┘ └──────────────┘   │
└──────────────────┬──────────────────────────────┘
                   │
         ┌─────────┼─────────┐
         │         │         │
    ┌────▼──┐ ┌────▼──┐ ┌───▼────┐
    │ Zustand│ │ Axios │ │  Query │
    │ Stores │ │Client │ │ Client │
    └────┬──┘ └───┬───┘ └───┬────┘
         │        │         │
    ┌────▼────────▼─────────▼─────┐
    │   Secure Storage (Keychain)  │
    │   MMKV (Offline Queue)       │
    │   Device Cache               │
    └──────────────────────────────┘
         │
    ┌────▼──────────────┐
    │  CediSmart API    │
    │  (FastAPI)        │
    └───────────────────┘
```

---

## Project Structure

```
cedismart-mobile/
├── src/
│   ├── api/
│   │   ├── client.ts                 # Axios instance + JWT interceptor
│   │   ├── mock/                     # Mock endpoints for offline dev
│   │   └── real/                     # Real API endpoints
│   ├── components/
│   │   ├── shared/                   # Reusable UI components
│   │   │   ├── Header.tsx
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   └── ...
│   │   └── ui/                       # Screens-specific UI parts
│   ├── hooks/
│   │   ├── useAuth.ts               # Authentication logic
│   │   ├── useOfflineSync.ts        # Offline queue sync
│   │   └── ...
│   ├── navigation/
│   │   ├── AppNavigator.tsx         # Main app stack
│   │   ├── AuthNavigator.tsx        # Auth flow stack
│   │   └── RootNavigator.tsx        # Root with linking
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── RegisterScreen.tsx
│   │   │   ├── LoginScreen.tsx
│   │   │   └── SetPinScreen.tsx
│   │   ├── dashboard/
│   │   ├── transactions/
│   │   ├── budgets/
│   │   ├── reports/
│   │   └── settings/
│   ├── stores/
│   │   ├── authStore.ts            # Auth + user info
│   │   ├── offlineStore.ts         # Offline queue + connectivity
│   │   └── themeStore.ts           # Dark mode preference
│   ├── types/
│   │   └── index.ts                # Global TypeScript interfaces
│   └── utils/
│       ├── currency.ts             # GHS formatting
│       ├── notifications.ts        # Toast/alert helpers
│       ├── secureStorage.ts        # Keychain wrapper
│       └── dateFormat.ts           # Date parsing + formatting
├── assets/                          # Icons, fonts, splash images
├── app.json                         # Expo app config
├── app.tsx                          # Root component
├── tailwind.config.js               # NativeWind config
├── tsconfig.json                    # TypeScript config (strict)
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js 18+** and **npm** (or **yarn**)
- **Expo CLI:** `npm install -g expo-cli`
- **Xcode 15+** (for iOS simulator, macOS only)
- **Android Studio** (for Android emulator or device)
- **CediSmart API** running locally or accessible via URL

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/cliff-de-tech/CediSmart.git
cd CediSmart/cedismart-mobile
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env:
# - EXPO_PUBLIC_API_BASE_URL=http://localhost:8000 (or production URL)
# - SENTRY_DSN=https://... (optional, for error tracking)
```

### 3. Start Expo Dev Server

```bash
npm start
# or: expo start
```

The Expo CLI will display options:

```
› Press i │ open iOS Simulator
› Press a │ open Android Emulator
› Press w │ open web (limited support)
› Press r │ reload app
› Press m │ toggle menu
```

---

## Environment Setup

### `.env` Template

```bash
# API
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000

# Auth (if using OAuth)
# OAUTH_CLIENT_ID=...
# OAUTH_REDIRECT_URL=...

# Error Tracking (optional)
SENTRY_DSN=

# Feature Flags
EXPO_PUBLIC_ENABLE_MOCK_API=false  # Use mock data for offline dev
EXPO_PUBLIC_DEBUG_MODE=false        # Log API requests/responses
```

### Required Permissions

The app requests these permissions:

| Permission | Why |
|---|---|
| `CAMERA` | Transaction receipt capture (future) |
| `PHOTO_LIBRARY` | Profile picture upload |
| `CONTACTS` | Money transfer recipient autocomplete (future) |
| `BIOMETRIC` | Face ID / fingerprint login |
| `NOTIFICATIONS` | Budget alerts and transaction confirmations |

All permissions are requested **at runtime**, not in the manifest — giving users full control.

---

## Running Locally

### Option 1: iOS Simulator (macOS only)

```bash
npm start
# Press i
```

### Option 2: Android Emulator

```bash
# First, start Android Studio and launch a virtual device
npm start
# Press a
```

### Option 3: Physical Device

1. Install the **Expo Go** app from App Store / Play Store
2. Run `npm start`
3. Scan the QR code displayed in your terminal
4. App loads in Expo Go (great for quick testing, slower than native build)

### Option 4: Web (Limited Support)

```bash
npm start
# Press w
```

> ⚠️ Web support is **read-only** for development. Use a simulator for full feature testing.

---

## Navigation Structure

```
RootNavigator
├── AuthNavigator (when not logged in)
│   ├── WelcomeScreen (welcome & gate check)
│   ├── RegisterScreen (registration initiation)
│   ├── OTPVerifyScreen (verification code check)
│   ├── SetPINScreen (initial PIN creation)
│   └── LoginScreen (phone + PIN authentication)
│
└── AppNavigator (when logged in)
    ├── DashboardScreen (main dashboard hero card + activity)
    ├── AddTransactionScreen (manually enter transaction details)
    ├── BudgetsScreen (manage monthly spending goals)
    ├── ReportsScreen (spending trends and breakdown)
    ├── AccountsScreen (link MoMo portals and bank accounts)
    └── SettingsScreen (profile, change PIN, Ghana Card KYC)
```

Each navigator manages its own state via React Navigation's linking configuration.

---

## State Management

### Zustand Stores

**`authStore`** — Authentication state
- `user` — Current user profile
- `tokens` — Access + refresh JWT
- `login()` — Handle OTP verification
- `logout()` — Clear tokens and user
- `refreshToken()` — Silent refresh on app resume

**`offlineStore`** — Offline capability
- `isOnline` — Network connectivity status
- `syncQueue` — Pending transactions to sync
- `addToQueue()` — Enqueue transaction
- `sync()` — Flush queue when online

**`themeStore`** — UI preferences
- `isDarkMode` — Theme preference
- `toggleTheme()` — Switch theme

### TanStack Query

```typescript
// Example: Fetch transactions with automatic caching
const { data, isLoading, error } = useQuery({
  queryKey: ['transactions', month],
  queryFn: () => api.getTransactions(month),
  staleTime: 5 * 60 * 1000,  // 5 minutes
});
```

Query automatically:
- ✅ Caches responses
- ✅ De-duplicates requests
- ✅ Refetches in background
- ✅ Handles offline gracefully (returns cached data)

---

## Offline Support

### How It Works

1. **User goes offline** → App detects via `NetInfo`
2. **User tries to create transaction** → Stored in MMKV queue + local state
3. **UI shows "pending sync" badge**
4. **Connection returns** → `useOfflineSync` hook triggers
5. **Queue flushed to API** → Transactions synced server-side
6. **Local state merged** → Transaction marked "synced"

### Offline Queue Example

```typescript
// screens/transactions/AddTransactionScreen.tsx
const handleSubmit = async (data) => {
  const tx = await createTransaction(data);
  
  if (!isOnline) {
    offlineStore.addToQueue(tx);  // Queue locally
    return;
  }
  
  // Normal sync to API
  await api.createTransaction(tx);
};
```

### Testing Offline Mode

```bash
# In Expo dev menu:
1. Press m (menu)
2. Toggle "Disable Fast Refresh"
3. Restart app with airplane mode ON
4. Test creating transactions (should queue)
5. Disable airplane mode
6. Transactions auto-sync
```

---

## Building for Stores

### iOS (TestFlight → App Store)

```bash
eas build --platform ios
# Follow the prompts to sign certificates

# Upload to TestFlight
eas submit --platform ios
```

### Android (Google Play)

```bash
eas build --platform android --local
# Creates .aab for Play Store

eas submit --platform android
```

See [Expo EAS docs](https://docs.expo.dev/eas/build/) for full CI/CD setup.

---

## Development Workflow

### Scripts

```bash
# Start dev server
npm start

# Type check
npm run type-check

# Lint
npm run lint

# Format
npm run format

# Test (if Jest/Vitest added)
npm test
```

### Environment-Specific Builds

```bash
# Development build with debug symbols
eas build --platform ios --profile preview

# Production build for App Store
eas build --platform ios --profile production
```

### Debugging

- **React DevTools:** `npm run react-devtools` (if installed)
- **Debugger:** Open Chrome DevTools via Expo CLI menu
- **Network logs:** Enable `EXPO_PUBLIC_DEBUG_MODE=true` in `.env`

---

## 🧪 Beta Testing & Verification Bypass

To streamline the testing process for beta testers and store reviewers, a **universal OTP bypass** is configured:

1. **Initiate Sign Up / Log In**: Enter any valid phone number format on the registration/login screen.
2. **Security Verification**: On the OTP entry screen, enter **`123456`**.
3. **Outcome**: The verification process will instantly succeed in all environments, allowing you to proceed with setting up a PIN or accessing the dashboard.
4. **App Display**: The registration and login screens display a helpful **"Beta Mode"** notice explaining this bypass code.

---

## Contributing

1. **Branch naming:** `feature/`, `bugfix/`, `chore/` prefixes
2. **Commit messages:** Conventional Commits (feat:, fix:, docs:, etc.)
3. **Code style:** `npm run format` before pushing
4. **Type safety:** No `any` — `@typescript-eslint/no-explicit-any` enforced
5. **Testing:** Add tests for new hooks and utilities

```bash
# Before submitting PR
npm run format
npm run lint
npm run type-check
```

---

## License

Proprietary — © 2026 CediSmart. All rights reserved.
