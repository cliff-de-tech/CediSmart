# CediSmart

> A production-grade, full-stack personal finance platform built for the Ghanaian market.
> Phone-first. Mobile-money aware. Offline-capable.

![Backend CI](https://github.com/cliff-de-tech/CediSmart/actions/workflows/backend-ci.yml/badge.svg)
![Coverage](https://img.shields.io/badge/coverage-85%25-brightgreen)
![Python](https://img.shields.io/badge/python-3.11%2B-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)
![React Native](https://img.shields.io/badge/React%20Native-0.81.5-61dafb)
![License](https://img.shields.io/badge/license-Proprietary-red)

**📚 Documentation:**
[API README](./cedismart-api/README.md) · [Mobile README](./cedismart-mobile/README.md) · [Web README](./cedismart-web/README.md) · [OpenAPI Docs (local)](http://localhost:8000/docs)

---

## 📚 Quick Start By Role

| I'm a... | Start here |
|---|---|
| **Backend Engineer** | [API README](./cedismart-api/README.md) — Full setup, architecture, testing |
| **Mobile Developer** | [Mobile README](./cedismart-mobile/README.md) — Expo setup, navigation, offline sync |
| **Frontend/Web Dev** | [Web README](./cedismart-web/README.md) — HTML/CSS/JS setup, API integration |
| **DevOps/Deployment** | [API README § Deployment](./cedismart-api/README.md#deployment) — Railway, Docker, CI/CD |
| **Product Manager** | [Budget Blueprint](./docs/budget-app-blueprint.md) — Features, roadmap, design |
| **Compliance/Legal** | [Docs README](./docs/README.md) — Privacy, terms, regulations |

---

## Quick Navigation

- [The Problem](#the-problem)
- [What This Is](#what-this-is)
- [Backend — Production API](#backend--production-api)
  - [Tech Stack](#tech-stack)
  - [Architecture](#architecture)
  - [API Surface](#api-surface)
  - [Key Engineering Decisions](#key-engineering-decisions)
  - [Security Posture](#security-posture)
  - [Testing](#testing)
  - [CI/CD](#cicd)
- [Mobile App — In Progress](#mobile-app--in-progress)
- [Web App — MVP](#web-app--mvp)
- [Project Status](#project-status)
- [Running Locally](#running-locally)
- [About](#about)

---

## The Problem

Most budgeting apps are designed for bank-account-first economies. Ghana is different.

- The majority of financial activity flows through **MTN MoMo and Vodafone/Telecel Cash**, not traditional bank accounts
- A significant portion of users are on **prepaid data** — every kilobyte counts
- Networks drop. Transactions must survive being offline
- Identity is a **phone number**, not an email address

CediSmart is built from first principles for this reality — not adapted from a Western template.

> 💡 **Design principle:** optimize for reliability under constrained connectivity before optimizing for feature breadth.

---

## What This Is

CediSmart is a **monorepo** containing a production-grade REST API (complete) and a React Native mobile app (in progress). It is not a tutorial project. It handles real money and is engineered accordingly.

```text
CediSmart/
├── cedismart-api/      # FastAPI backend — Python 3.11+
└── mobile/             # React Native (Expo) — in progress
```

---

## Backend — Production API

The backend is **fully implemented and tested**. 31 endpoints across 7 modules, 85%+ test coverage, CI/CD on GitHub Actions.

> ✅ **Current state:** Backend feature-complete for core budgeting, accounts, auth, reporting, and guardrails.

### Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | FastAPI (async) | Native async, auto-generated OpenAPI, Pydantic v2 validation |
| ORM | SQLAlchemy 2.0 async | Type-safe queries, async-native, no raw SQL |
| Database | PostgreSQL 16 | `NUMERIC(14,2)` for money — Float is never acceptable in fintech |
| Cache | Redis 7 | OTP storage (5-min TTL), JWT revocation, report caching |
| Auth | RS256 JWT + bcrypt | Asymmetric signing, per-token revocation via `jti` claims |
| SMS/OTP | Termii API | Ghana-native SMS gateway — lower latency than Twilio for GH numbers |
| Rate Limiting | slowapi | Auth endpoints protected at 3–5 req/15min per IP |
| Migrations | Alembic | Schema history is immutable — no direct DB edits, ever |
| Config | pydantic-settings | Fully typed environment variables — no `os.getenv()` scattered in code |

### Architecture

CediSmart uses a **Modular Monolith** — a single deployable unit with enforced module boundaries. This is a deliberate choice over microservices: it avoids distributed system complexity at MVP scale while preserving clean boundaries for future extraction.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        FastAPI Application                            │
│                                                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│  │   Auth   │ │ Accounts │ │  Trans-  │ │ Budgets  │                 │
│  │  Module  │ │  Module  │ │ actions  │ │  Module  │  Reports Module │
│  │          │ │          │ │  Module  │ │          │                 │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘                 │
│       │            │            │             │                        │
│  ┌────▼────────────▼────────────▼─────────────▼────────────────────┐   │
│  │                        Core Layer                               │   │
│  │          config · database · redis · security                   │   │
│  │          dependencies · exceptions · sms                        │   │
│  └─────────────────────────┬───────────────────────────────────────┘   │
└────────────────────────────┼───────────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         PostgreSQL        Redis          Termii
         (Railway)        (Railway)      (SMS GW)
                                           │
                              ┌────────────┘
                              ▼
                         Cloudflare
                        (CDN + Proxy)
```

### API Surface

All endpoints versioned under `/api/v1/`. Every response uses a consistent error envelope: `{"error": {"code": "...", "message": "...", "field": null}}`.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register/initiate` | Send OTP via Termii SMS |
| POST | `/auth/register/verify` | Verify OTP, create account, issue JWT |
| POST | `/auth/login` | Phone + PIN authentication |
| POST | `/auth/token/refresh` | Rotate access token via refresh token |
| POST | `/auth/logout` | Revoke refresh token from Redis |
| POST | `/auth/pin/reset/initiate` | Send PIN reset OTP |
| POST | `/auth/pin/reset/confirm` | Verify OTP, update PIN hash |
| GET | `/users/me` | Fetch authenticated user profile |
| PATCH | `/users/me` | Update name, email, currency |
| DELETE | `/users/me` | GDPR-style anonymisation + token revocation |
| GET | `/accounts/` | List accounts with computed real-time balances |
| POST | `/accounts/` | Create bank / MoMo / cash account |
| GET | `/accounts/{id}` | Account detail + balance |
| PATCH | `/accounts/{id}` | Update name or provider |
| DELETE | `/accounts/{id}` | Hard delete (no txns) or soft deactivate (has txns) |
| GET | `/categories/` | List system + user categories |
| POST | `/categories/` | Create custom category |
| PATCH | `/categories/{id}` | Update custom category |
| DELETE | `/categories/{id}` | Delete if no active transactions |
| GET | `/transactions/` | Paginated, filtered transaction list |
| POST | `/transactions/` | Create income / expense / transfer |
| POST | `/transactions/bulk` | Idempotent bulk create for offline sync |
| GET | `/transactions/summary` | Current month vs last month income/expense |
| GET | `/transactions/{id}` | Transaction detail |
| PATCH | `/transactions/{id}` | Update transaction |
| DELETE | `/transactions/{id}` | Soft delete (`is_deleted=True`) |
| GET | `/budgets/` | Monthly budgets with computed spend progress |
| GET | `/budgets/current` | Current month dashboard budgets |
| POST | `/budgets/` | Upsert monthly budget (create or update) |
| DELETE | `/budgets/{id}` | Delete budget |
| GET | `/reports/monthly` | Monthly income / expense / top category |
| GET | `/reports/categories` | Category breakdown with percentages |
| GET | `/reports/trends` | Month-over-month income/expense trend (1–12 months) |

### Key Engineering Decisions

These are the decisions that separate a learning project from production fintech code.

- **Money is never a Float.**
  All monetary values are `NUMERIC(14, 2)` in PostgreSQL and `Decimal` in Python throughout the entire stack. `Float` arithmetic introduces rounding errors that silently corrupt financial records.

- **Account balances are never stored.**
  Balance = `opening_balance + SUM(income) − SUM(expense)`, computed at query time via a single SQL aggregation. Storing a cached balance introduces drift bugs when writes partially fail.

- **OTP timing attacks are mitigated.**
  OTP comparison uses `hmac.compare_digest()` instead of `==` to avoid early-return timing leaks.

- **Phone enumeration is prevented.**
  PIN reset initiation returns an identical response whether phone exists or not.

- **Refresh tokens are individually revocable.**
  Each refresh token carries a `jti`; Redis stores active JTIs with TTL for per-device logout.

- **Race conditions on free-tier limits are prevented.**
  Limit checks use `SELECT ... FOR UPDATE` to serialize concurrent writes.

- **Transactions are never hard-deleted.**
  Deletion is logical (`is_deleted = True`) to preserve audit trail integrity.

- **JWT uses RS256, not HS256.**
  Asymmetric signing separates signing authority (private key) from verification (public key).

### Security Posture

| Vector | Mitigation |
|---|---|
| PIN brute-force | bcrypt cost factor 12 + 5 attempts / 15 min rate limit |
| OTP brute-force | 6-digit + 3 sends / 15 min + `hmac.compare_digest` |
| Token replay | `jti` tracked in Redis — logout is immediate |
| Resource enumeration | Ownership errors return 404, never 403 |
| Injection | SQLAlchemy ORM only — no raw SQL strings |
| Sensitive data in logs | Phone, PIN, OTP, tokens excluded from logs |
| CORS | Explicit origin allowlist — `*` never used |
| Transport | HSTS enforced via middleware + Cloudflare SSL |

### Testing

```text
69 tests · 85.46% coverage · 0 failures
```

| Module | Coverage |
|---|---|
| `core/security.py` | 100% |
| `core/sms.py` | 100% |
| `modules/auth/router.py` | 100% |
| `modules/transactions/router.py` | 100% |
| `modules/reports/router.py` | 100% |
| Overall | 85.46% |

Tests run against **SQLite** locally for speed and **PostgreSQL 16** in CI. The CI pipeline enforces:

- `ruff` — linting
- `black --check` — formatting
- `mypy --strict` — type checking (zero `Any` tolerance)
- `bandit -ll` — static security scan
- `pytest --cov-fail-under=80` — coverage gate

### CI/CD

Three GitHub Actions workflows:

| Workflow | Trigger | What it does |
|---|---|---|
| `backend-ci.yml` | Push / PR to `main` | Lint → type-check → bandit → pytest (Postgres + Redis services) |
| `backend-deploy.yml` | Push to `main` (CI passes) | Railway deploy → health check → Slack alert on failure |
| `mobile-ci.yml` | Push to `mobile/**` | TypeScript check → ESLint (zero warnings) |

---

## Mobile App — In Progress

React Native (Expo SDK 54, Managed Workflow) with TypeScript strict mode.

> 📱 **See [Mobile README](./cedismart-mobile/README.md) for full setup instructions.**

| Layer | Technology |
|---|---|
| Navigation | React Navigation v6 |
| Server state | TanStack Query v5 |
| Global state | Zustand |
| HTTP client | Axios with RS256 JWT interceptors |
| Secure storage | Expo SecureStore (tokens, PIN — never AsyncStorage) |
| Offline queue | MMKV |
| Styling | NativeWind (Tailwind for React Native) |
| Forms | React Hook Form + Zod |
| Error monitoring | Sentry |

**Planned screens:** Registration → OTP → Set PIN → Login → Dashboard → Transactions → Add Transaction → Budgets → Reports → Accounts → Settings.

---

## Web App — MVP

Responsive web interface for desktop and tablet users. Built with vanilla HTML/CSS/JS + Tailwind, no framework overhead for MVP.

> 🌐 **See [Web README](./cedismart-web/README.md) for full setup instructions.**

| Layer | Technology |
|---|---|
| Markup | HTML5 + Semantic elements |
| Styling | Tailwind CSS v3 |
| Scripting | Vanilla JavaScript (ES6+) |
| HTTP | Fetch API + custom wrapper |
| State | LocalStorage + IndexedDB |
| Build (optional) | Vite |

**Core features:** Dashboard, transaction management, budget tracking, analytics, account management, settings, OAuth login.

---

## Project Status

| Phase | Description | Status |
|---|---|---|
| 1 | Planning & Architecture | Partial |
| 2 | Backend Core (all prompts) | **Complete** |
| 3 | Frontend Core (React Native) | In progress |
| 4 | Integration (manual) | Not started |
| 5 | Testing & Hardening | Partial (backend coverage done) |
| 6 | Deployment | Not started |

> 📌 **Roadmap focus (Q2 2026):** finish mobile core flows, then backend/mobile integration and end-to-end QA.

---

## Running Locally

### Backend API

```bash
cd cedismart-api

# Create virtual environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install dependencies
pip install -e ".[dev]"

# Configure
cp .env.example .env               # Fill in DATABASE_URL, RSA keys, etc.

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 8000
```

**Docs at:** `http://localhost:8000/docs` (DEBUG=true only)

**Full guide:** [cedismart-api/README.md](./cedismart-api/README.md)

---

### Mobile App

```bash
cd cedismart-mobile

# Install dependencies
npm install

# Start Expo dev server
npm start

# Press i (iOS Simulator), a (Android), or w (Web)
```

**Full guide:** [cedismart-mobile/README.md](./cedismart-mobile/README.md)

---

### Web App

```bash
cd cedismart-web

# Option 1: Simple HTTP server (no build)
python -m http.server 8080
# or: npx http-server

# Option 2: With Vite (hot reload)
npm install
npm run dev
```

**Open:** `http://localhost:8080` (or `http://localhost:5173` with Vite)

**Full guide:** [cedismart-web/README.md](./cedismart-web/README.md)

---

## About

Built by **Clifford Darko Opoku-Sarkodie** — Backend Engineer targeting FAANG, remote-first global companies, and African fintech startups.

This project exists to demonstrate production-grade engineering in a domain (African fintech) that is underrepresented in many portfolios: real market constraints, real security requirements, and real-world architecture tradeoffs.

---

*© 2026 CediSmart. All rights reserved.*
