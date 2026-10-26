# 🇬🇭 CediSmart API

**Production-grade fintech budget management API for the Ghanaian market.**

CediSmart helps users track spending, manage budgets, and take control of their finances — designed from day one for mobile money (MTN MoMo, Telecel Cash, AirtelTigo Money) and the realities of the Ghanaian market: phone-first identity, offline support, and GHS as the primary currency.

**📚 Project Documentation:**
[Main README](../README.md) · [Mobile App](../cedismart-mobile/README.md) · [Web App](../cedismart-web/README.md) · [Docs](../docs/README.md)

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running the API](#running-the-api)
- [Database Migrations](#database-migrations)
- [Testing](#testing)
- [API Design](#api-design)
- [Financial Data Rules](#financial-data-rules)
- [Security](#security)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Tech Stack

| Layer              | Technology                                      |
| ------------------ | ----------------------------------------------- |
| **Language**       | Python 3.12+                                    |
| **Framework**      | FastAPI (async)                                 |
| **ORM**            | SQLAlchemy 2.0 async (`Mapped[]` annotations)   |
| **Migrations**     | Alembic                                         |
| **Validation**     | Pydantic v2                                     |
| **Database**       | PostgreSQL 16                                   |
| **Cache/Sessions** | Redis 7                                         |
| **Task Queue**     | ARQ (Redis-based background workers)            |
| **Auth**           | JWT (RS256) + bcrypt PIN hashing                |
| **Rate Limiting**  | slowapi                                         |
| **Auth Verification** | Clerk SDK/API                                  |
| **Hosting**        | Render                                          |

---

## Architecture

CediSmart follows a **Modular Monolith** pattern — a single deployable unit with clean internal module boundaries. Each module owns its own router, service, schemas, and models. Modules never directly query another module's tables; they call service functions instead.

```
┌──────────────────────────────────────────────────────┐
│                    FastAPI App                        │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │  Auth   │ │ Accounts │ │  Txns    │ │ Budgets  │ │
│  │ Module  │ │  Module  │ │  Module  │ │  Module  │ │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
│       │           │            │             │       │
│  ┌────▼───────────▼────────────▼─────────────▼────┐  │
│  │              Core Layer                        │  │
│  │  config · database · redis · security · deps   │  │
│  └────────────────┬───────────────────────────────┘  │
└───────────────────┼──────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   PostgreSQL     Redis       Clerk
```

---

## Project Structure

```
cedismart-api/
├── alembic/                    # Database migrations
│   ├── versions/               # Migration files (auto-generated)
│   ├── env.py                  # Async migration environment
│   └── script.py.mako          # Migration template
├── app/
│   ├── core/                   # Shared infrastructure
│   │   ├── config.py           # pydantic-settings (typed env vars)
│   │   ├── database.py         # Async SQLAlchemy engine + session
│   │   ├── dependencies.py     # FastAPI deps (get_db, get_current_user)
│   │   ├── exceptions.py       # Custom exceptions + global handlers
│   │   ├── redis.py            # Async Redis connection pool
│   │   └── security.py         # bcrypt hashing + RS256 JWT
│   ├── modules/
│   │   ├── auth/               # Registration, login, OTP, tokens
│   │   ├── accounts/           # Bank, MoMo, cash accounts
│   │   ├── transactions/       # Income, expenses, transfers
│   │   ├── categories/         # System + custom categories
│   │   ├── budgets/            # Monthly spending targets
│   │   ├── reports/            # Spending analytics + summaries
│   │   └── support/            # AI Support, Voice Assistant, Gemini Neural TTS & Tickets
│   └── main.py                 # App factory, middleware, routers
├── tests/
│   ├── conftest.py             # Shared fixtures (async DB, test client)
│   └── modules/                # Per-module test files
├── .env.example                # Environment variable template
├── .gitignore
├── alembic.ini
├── Dockerfile                  # Multi-stage production build
├── pyproject.toml              # Dependencies + tool config
└── README.md
```

---

## Getting Started

### Prerequisites

- **Python 3.12+**
- **PostgreSQL 16** (production) or SQLite (tests only)
- **Redis 7** (for OTP storage, caching, sessions)

### 1. Clone & Create Virtual Environment

```bash
git clone https://github.com/cliff-de-tech/CediSmart.git
cd CediSmart/cedismart-api
python -m venv .venv

# Activate
# Linux/macOS:
source .venv/bin/activate
# Windows:
.venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -e ".[dev]"
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your actual values (see Environment Variables below)
```

### 4. Generate RSA Keys (for JWT)

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem

# Copy the key contents into .env (replace newlines with \n)
```

### 5. Run Database Migrations

```bash
alembic upgrade head
```

### 6. Start the Server

```bash
uvicorn app.main:app --reload --port 8000
```

---

## Environment Variables

| Variable            | Description                              | Example                                          |
| ------------------- | ---------------------------------------- | ------------------------------------------------ |
| `DATABASE_URL`      | PostgreSQL async connection string       | `postgresql+asyncpg://user:pass@localhost/cedismart` |
| `REDIS_URL`         | Redis connection string                  | `redis://localhost:6379/0`                        |
| `RSA_PRIVATE_KEY`   | PEM-encoded private key (newlines → `\n`)| `-----BEGIN RSA PRIVATE KEY-----\nMIIE...`       |
| `RSA_PUBLIC_KEY`    | PEM-encoded public key (newlines → `\n`) | `-----BEGIN PUBLIC KEY-----\nMIIB...`             |
| `ENVIRONMENT`       | Deployment stage                         | `development` / `staging` / `production`         |
| `DEBUG`             | Enable debug mode + Swagger docs         | `true` / `false`                                 |
| `ALLOWED_ORIGINS`   | Comma-separated CORS origins             | `http://localhost:3000,http://localhost:8081`     |
| `TERMII_API_KEY`    | Termii SMS API key                       | `TL...`                                          |
| `TERMII_SENDER_ID`  | Termii sender ID                         | `CediSmart`                                      |
| `GEMINI_API_KEY`    | Gemini API Key (for SMS parsing & Chat)  | `AIzaSy...` or `AQ...` (AI Studio key)           |
| `MISTRAL_API_KEY`   | Optional Mistral chat, SMS, and speech fallback | Configured on Render |
| `OPENAI_API_KEY`    | Optional OpenAI chat, SMS, and speech fallback | Configured on Render |

See [`.env.example`](.env.example) for the full template with inline comments.


---

## Running the API

```bash
# Development (with auto-reload)
uvicorn app.main:app --reload --port 8000

# Production (via Docker)
docker build -t cedismart-api .
docker run -p 8000:8000 --env-file .env cedismart-api
```

**Health check:** `GET /health` reports `status`, API `version`, and `has_gemini`
(the configuration status). It does not return API keys or key prefixes.

**API docs** (debug mode only): `http://localhost:8000/docs`

---

## Database Migrations

CediSmart uses **Alembic** for all schema changes. Never modify the database directly.

```bash
# Generate a new migration after model changes
alembic revision --autogenerate -m "describe your change"

# Apply all pending migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1

# View migration history
alembic history
```

> ⚠️ **Never edit existing migration files** in `alembic/versions/`. They are part of the migration history and must remain immutable.

---

## Testing

Tests use **SQLite** (via `aiosqlite`) for fast, isolated runs without Docker.

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=term-missing

# Run a specific module's tests
pytest tests/modules/test_auth.py -v
```

**Coverage target:** ≥ 80% (enforced in CI).

Run `ruff check .`, `black --check .`, `mypy app/ --strict`, and `bandit -r app/ -ll`
before opening a pull request. Formatting and linting exclude immutable generated
revisions in `alembic/versions/`; CI still validates the migration chain with
`alembic upgrade head` against PostgreSQL. Coverage traces SQLAlchemy greenlet
switches as well as threads so executed async service code is counted correctly.

CI sets `TEST_DATABASE_URL` to PostgreSQL and `TEST_USE_REAL_REDIS=true`. Test
database connections are unpooled, and Redis connections are closed before each
test event loop ends, so clients are never reused across incompatible loops.

### 🧪 Testing & Verification
All client-side verification SMS checks are offloaded to Clerk. The API only receives a verified Clerk User ID at `/auth/register/clerk` and validates it against the Clerk Backend API using the `CLERK_SECRET_KEY` environment variable.
To bypass SMS check for local tests or Store review submissions, configure **Test Phone Numbers** in the Clerk Dashboard.

---

## API Design

All endpoints are versioned under `/api/v1/`.

### Error Response Envelope

Every error returns a consistent JSON structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Phone number is required",
    "field": "phone"
  }
}
```

### Paginated List Response

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 142
  }
}
```

### HTTP Status Codes

| Code | Usage                                |
| ---- | ------------------------------------ |
| 200  | Success                              |
| 201  | Created                              |
| 204  | No Content (successful delete)       |
| 400  | Bad Request                          |
| 401  | Unauthorized (missing/invalid token) |
| 404  | Not Found (also for ownership errors)|
| 409  | Conflict (duplicate resource)        |
| 422  | Validation Error                     |
| 429  | Rate Limited                         |

### Primary Endpoints Surface

| Module | Method | Path | Description |
|---|---|---|---|
| **Auth** | POST | `/api/v1/auth/register/clerk` | Create user profile after Clerk verification |
| **Auth** | POST | `/api/v1/auth/login` | Phone + PIN authentication |
| **Auth** | POST | `/api/v1/auth/token/refresh` | Rotate access token |
| **Auth** | POST | `/api/v1/auth/logout` | Revoke refresh token |
| **Accounts** | GET, POST | `/api/v1/accounts/` | List and create financial accounts (MoMo, Bank, Cash) |
| **Transactions** | GET, POST | `/api/v1/transactions/` | Paginated ledger history and expense creation |
| **Transactions** | POST | `/api/v1/transactions/parse-sms` | Gemini-powered MoMo SMS parser |
| **Budgets** | GET, POST | `/api/v1/budgets/` | Monthly category spending limits and tracking |
| **Reports** | GET | `/api/v1/reports/monthly` | Spending analytics and category breakdowns |
| **Support** | POST | `/api/v1/support/chat` | Multimodal AI support chat with X-Ray diagnostics & SMS rescue |
| **Support** | POST | `/api/v1/support/voice` | Multimodal voice understanding, intent extraction & verbal bridging |
| **Support** | POST | `/api/v1/support/voice/synthesize` | Gemini Neural TTS voice synthesizer (`Kore` prebuilt voice) |
| **Support** | POST | `/api/v1/support/escalate` | Customer problem reporting & GitHub auto-PR issue creation |
| **Support** | GET | `/api/v1/support/ticket-status/{issue_number}` | Real-time 4-stage ticket tracking |
| **Support** | POST | `/api/v1/support/feedback` | In-app user feedback dispatch to Discord |

Voice requests accept optional `messages` for recent conversation context and
`synthesize_audio` (default `true`). Set `synthesize_audio=false` to receive the
transcript, reply, and action without a TTS request. Clients can request speech
separately through `/api/v1/support/voice/synthesize`.
Standalone timestamp and noise-tag transcripts are returned as an empty string.
Recognition provider failures return `error_code=recognition_unavailable`, an
empty transcript, and no action or audio. Unavailable speech synthesis returns
HTTP 503 with `synthesis_unavailable`.

Chat and voice requests also accept `language` (`en`, `pidgin`, or `twi`),
`auto_pilot`, and `deep_audit`. Auto-Pilot and Deep Audit default to `false`.
Chat, voice, and speech synthesis requests accept `voice_persona` (`akosua`,
`kwame`, or `esi`, default `akosua`). Chat and recognition prompts retain the
selected persona's identity and English/Pidgin/Twi introduction. Speech normalizes
currency to Ghana Cedis and Pesewas. Tests cover persona and voice option
forwarding, current TTS retry order, Auto-Pilot's selection of the
user's active wallet, compound English/Pidgin/Twi transactions, and monthly budget
updates using Decimal amounts, with all provider HTTP responses mocked.
Authenticated voice requests forward the access-token user ID and database
session so live budget and report context uses the signed-in user's account.
Audio tests verify PCM/WAV gain normalization, preserve stereo channels and
sample rates, and leave loud, silent, or 8-bit WAV samples unchanged.

Chat tries Gemini, then Mistral, then OpenAI (or GitHub Models). Provider chat
content must be text; a missing or non-text Mistral reply continues to the next
provider. Tests mock provider HTTP responses, including both speech fallbacks.

---

## Financial Data Rules

These rules are **non-negotiable** — they protect real users' money.

| Rule | Enforcement |
| ---- | ----------- |
| Money fields use `Numeric(14, 2)` | PostgreSQL column type — never Float |
| Transaction amounts are always positive | `CHECK (amount > 0)` constraint |
| Direction via `transaction_type` | `income` / `expense` / `transfer` |
| Balances are never stored | Computed: `opening_balance + SUM(income) - SUM(expense)` |
| No hard deletes on transactions | Soft delete: `is_deleted = True` |
| `transaction_date` ≠ `created_at` | User-provided date, may differ from record creation |
| Offline deduplication via `client_id` | UUID generated client-side, unique per user |

---

## Security

| Mechanism | Implementation |
| --------- | -------------- |
| **PIN storage** | bcrypt hash, cost factor 12 — never plaintext |
| **JWT signing** | RS256 (asymmetric) — never HS256 |
| **OTP storage** | Redis only, 5-minute TTL — never in database |
| **OTP comparison** | `hmac.compare_digest()` — timing-attack safe |
| **Token contents** | `user_id` + `type` only — no PII |
| **Ownership errors** | Return 404, not 403 — prevents enumeration |
| **Rate limiting** | Auth endpoints via slowapi |
| **CORS** | Explicit origin allowlist — never wildcard |
| **Security headers** | HSTS, X-Frame-Options, X-Content-Type-Options |

---

## Deployment

The backend runs on **Render** at `https://cedismart-api.onrender.com`. Supporting services include:

- **PostgreSQL** — configured through `DATABASE_URL`
- **Redis** — configured through `REDIS_URL`
- **Cloudflare** — CDN/proxy in front of all traffic
- **Expo EAS** — Mobile app builds (React Native)

### Render Setup

1. Connect `cliff-de-tech/CediSmart` to the Render web service.
2. Set the service root directory to `cedismart-api` and use its Dockerfile.
3. Set the environment variables listed in `.env.example` in Render.
4. `start.sh` applies migrations and seeds categories before starting Uvicorn on `$PORT`.
5. Use `/health` as the Render health check path.

The GitHub `Backend Health Check` workflow checks `/health` after successful Backend CI
on `main`, and also supports a manual run. It retries transient failures and cold starts.
The default API origin can be overridden with the `PRODUCTION_API_URL` Actions variable.
This checks availability, not whether a specific commit has finished deploying.
Deployment configuration and logs remain in Render; Railway and Slack credentials
are not required by this workflow.

---

## Free Tier Limits

Enforced **server-side** in the service layer — never client-side only.

| Resource              | Free | Premium   |
| --------------------- | ---- | --------- |
| Financial accounts    | 3    | Unlimited |
| Transactions / month  | 50   | Unlimited |
| Custom categories     | 20   | Unlimited |
| Budgets / month       | 5    | Unlimited |
| History               | 3 mo | Unlimited |

## 🚀 Future API Updates

Key backend engine updates planned for subsequent releases:
- ⏰ **ARQ Susu/Recurring Scheduler**: Background cron worker engine utilizing Redis to process monthly recurring transaction postings.
- 👥 **Susu Group Relations**: Multi-tenant database schema changes to link transactions to shared saving pools and compute group balances.
- 💸 **Exchange Rates Engine**: Integration with open-exchange APIs to periodically fetch rates and calculate non-GHS values in PostgreSQL.
- 🛡️ **Gateway Safety**: Setting up Clerk rate limiting policies to prevent account creation spam.

---

## Contributing

1. Create a **feature branch** — never push directly to `main`
2. Every PR must pass: `ruff`, `black --check`, `mypy --strict`, `bandit -ll`
3. Test coverage must remain ≥ 80%
4. No commented-out code or TODOs without linked issues
5. Financial logic changes require explicit review

```bash
# Lint & format check
ruff check .
black --check .
mypy --strict app/

# Security scan
bandit -r app/ -ll
```

---

## License

Proprietary — © 2026 CediSmart. All rights reserved.
