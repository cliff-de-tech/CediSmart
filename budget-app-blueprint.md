# CediSmart — Full Product & Technical Blueprint
### Senior CTO Mentorship Document for a Production-Grade Fintech MVP

---

> **Mindset before we start:** You are not building a tutorial. You are building a product that handles people's money and trust. Every decision here — from the data model to the deployment pipeline — should reflect that. Fintech demands correctness over cleverness.

---

## TABLE OF CONTENTS

1. [Product Strategy](#part-1-product-strategy)
2. [Feature Design](#part-2-feature-design)
3. [Tech Stack Decision](#part-3-tech-stack-decision)
4. [System Architecture](#part-4-system-architecture)
5. [AI Agent Workflow](#part-5-ai-agent-workflow)
6. [Phased Execution Plan](#part-6-phased-execution-plan)
7. [IDE Agent Prompts — Phase 2: Backend Core](#part-7-ide-agent-prompts--phase-2-backend-core)
8. [IDE Agent Prompts — Phase 3: Frontend Core](#part-8-ide-agent-prompts--phase-3-frontend-core)
9. [IDE Agent Prompts — Phase 5: Testing & Monitoring](#part-9-ide-agent-prompts--phase-5-testing--monitoring)
10. [IDE Agent Prompts — Phase 6: Deployment](#part-10-ide-agent-prompts--phase-6-deployment)
11. [Manual Work Guide — Phases 4, 5 & 6](#part-11-manual-work-guide--phases-4-5--6)
12. [Architecture Decision Records Template](#part-12-architecture-decision-records-template)

---

## PART 1: PRODUCT STRATEGY

### 1.1 Core Problem Definition

**The real problem isn't "no budgeting app exists."** The problem is that existing tools (Mint, YNAB, Money Manager) are built for Western, bank-account-centric, credit-card-heavy users. They fail the Ghanaian user on multiple dimensions:

| Failure Point | Why It Matters |
|---|---|
| GHS not supported or an afterthought | Every number feels foreign |
| No Mobile Money awareness | MoMo is primary finance infrastructure in Ghana |
| Assumes stable monthly income | Gig/informal income is common |
| Requires credit card to unlock premium | Card penetration is low |
| No offline support | Data costs are real and network is unreliable |
| No local expense categories | "Chop money", "trotro", "susu" don't exist |

**The problem statement:** *Young working Ghanaians have no reliable, culturally-aware tool to understand where their money goes, plan ahead, and work toward financial goals — despite the rise of mobile money making digital transactions more common than ever.*

**This is the one sentence you should repeat to every stakeholder and use to evaluate every feature decision.**

---

### 1.2 Target User Persona

**Primary Persona — "Kofi the Young Professional"**

- Age: 24–35, living in Accra or Kumasi
- Income: GHS 1,800–6,000/month, possibly freelance or salary
- Accounts: MTN MoMo + one bank account (GCB, Ecobank, Absa), some cash
- Tech profile: Android user, moderate smartphone proficiency, uses WhatsApp Business, Paystack links, Hubtel
- Pain points: Knows they're spending too much on food and transport, but has no real picture of it. Gets to the 25th of the month confused about where money went.
- Goals: Save for a laptop, pay rent reliably, eventually build an emergency fund
- Budget for an app: GHS 0–30/month. Would pay if the value is obvious and payment is MoMo.

**Secondary Persona — "Ama the Small Business Owner"**
- Mixes personal and business money (common problem)
- Needs to track income sources, not just expenses
- Would benefit from V2 features like multiple accounts per wallet

**That first persona is you. Build for yourself first.** It is the fastest feedback loop.

---

### 1.3 Realistic MVP Scope

**The MVP answers one question for the user: "Where is my money going?"**

That's it. Not "how do I optimize my money?" Not "how do I invest?" Just awareness.

**MVP = Working answer to that one question, delivered reliably on mobile.**

Out of scope for MVP (ruthlessly):
- Bank statement auto-import
- SMS parsing of MoMo alerts
- Investment tracking
- Multi-user / household budgets
- AI insights
- Notifications beyond basic in-app

---

### 1.4 Monetization Strategy (Ghana-Realistic)

**Model: Freemium with MoMo Payment**

Do not build a paywall that requires a credit card. MTN MoMo and Vodafone Cash are the only realistic payment rails for your market at launch.

**Free Tier (permanent):**
- Up to 3 financial accounts
- Up to 50 transactions per month
- 3 months of history
- Basic reports (monthly summary only)

**Premium Tier — "CediSmart Pro" — GHS 15/month or GHS 120/year:**
- Unlimited transactions and history
- Budget alerts and tracking
- Multi-account unlimited
- Advanced reports (trends, categories over time)
- CSV export
- Savings goals (V2 feature unlocked)

**Why this works:**
- GHS 15 is less than a lunch. The value ask is low.
- Annual plan at GHS 120 gives you upfront cash flow.
- MoMo payment removes the "I don't have a card" objection entirely.
- Integrate Paystack (supports MoMo) for payment processing. They have a solid Ghana presence.

**Do NOT chase ads revenue at MVP stage.** Ads degrade trust in a fintech product and earn negligible revenue at small scale.

---

## PART 2: FEATURE DESIGN

### 2.1 MVP Feature Set (Non-Negotiable)

**Authentication & Onboarding**
- Phone number + OTP registration (NOT email-first — phone is primary identity in Ghana)
- 4–6 digit PIN for app access (local auth)
- Biometric (Face ID / fingerprint) as unlock option
- Simple onboarding: set your monthly income, pick a few spending categories

**Financial Accounts**
- Add accounts: Cash, Mobile Money (MTN, Vodafone, AirtelTigo), Bank Account
- Manual opening balance entry
- Each account has a running balance

**Transactions (Core Engine)**
- Add income / expense transaction
- Assign to account and category
- Date, amount, note
- Edit and delete transactions
- Basic transaction list with search and filter by date/category/account

**Categories**
- System defaults with local context: Food & Chop, Transport/Trotro, Airtime & Data, Rent, Utilities, Entertainment, Health, Savings, Mobile Money Fees
- User-created custom categories
- Each category: name, icon, color, type (income or expense)

**Budgets**
- Set a monthly spending limit per category
- Visual progress bar: spent vs. budget
- Alert when 80% of budget is reached (in-app)

**Dashboard**
- Net position: income vs. expenses this month
- Top 3 spending categories
- Quick "add transaction" button (most used screen — optimize it)
- Recent transactions (last 10)

**Reports**
- Monthly income vs. expense summary
- Breakdown by category (pie or bar chart)
- Month-over-month comparison (simple)

**Offline Support**
- Transactions can be added offline
- Sync when connection is restored
- **This is not optional.** Data costs are real. Network drops happen.

---

### 2.2 V2 Feature Set

- **MoMo SMS Parsing** — Auto-detect MoMo credit/debit alerts via SMS permissions and create transactions. High value, high complexity. Do it right in V2 with proper parsing rules.
- **Bank Statement Import** — CSV and PDF import for GCB, Ecobank, Absa. Parse into transactions.
- **Savings Goals** — "Save GHS 2,000 for laptop by December" with progress tracking.
- **Recurring Transactions** — Mark subscriptions and bills as recurring; auto-remind.
- **Budget Templates** — "50/30/20 rule for GHS 2,300 income" as a starting template.
- **Data Export** — CSV and PDF report export (print for record-keeping).
- **Push Notifications** — Budget breach alerts, weekly spending summary.
- **Multi-Currency** — For users with USD accounts (remittances are common).

---

### 2.3 Scope Creep — Do Not Build These Yet

| Feature | Why It's Tempting | Why It's Premature |
|---|---|---|
| Investment tracking | "Full financial picture" | Requires financial data provider, regulatory exposure |
| Social / sharing | Engagement | Privacy nightmare in fintech, zero demand validation |
| AI spending coach | Impressive demo | Needs 6+ months of user data to be useful; adds cost |
| Open banking API | Automatic sync | No open banking standard in Ghana yet |
| Crypto wallet tracking | Trendy | Completely different user problem |
| Web app | "More users" | Split your focus. Mobile first, always. |

**The rule:** If a feature doesn't directly answer "where is my money going?", it's not MVP.

---

## PART 3: TECH STACK DECISION

### 3.1 Frontend Framework: React Native (Expo Managed Workflow)

**Decision: React Native with Expo**

| Criterion | React Native + Expo | Flutter | Ionic |
|---|---|---|---|
| Learning curve for backend dev | Medium — JS/TS is familiar territory | High — Dart is a new language | Low — but poor native UX |
| Performance for fintech UI | Very good | Excellent | Poor for complex UIs |
| Native device APIs | Expo SDK covers 90% of needs | Full control | Limited |
| AI agent code generation quality | Excellent | Good | Mediocre |
| Offline support libraries | MMKV, WatermelonDB | Hive | Limited |
| Time to first working build | 1–2 days with Expo | 3–5 days | 1 day but technical debt |

**Why not Flutter?** Dart is a new language for you, and the learning curve slows you down when you're also building a backend solo. React Native lets you use TypeScript which you can navigate faster, and IDE agents generate significantly better React Native code.

**Why Expo specifically?** Expo Managed Workflow eliminates the need to deal with Xcode/Android Studio configuration for 90% of development. Use EAS (Expo Application Services) for building production binaries. EAS Build free tier is sufficient for MVP.

**Frontend language:** TypeScript. Non-negotiable. Financial apps require type safety.

---

### 3.2 Backend Architecture: Modular Monolith

**Decision: Modular Monolith, not Microservices**

**Why not Microservices?** Microservices require a DevOps team, service discovery, distributed tracing, network latency management, and independent CI/CD pipelines. You have none of that. Microservices would cost you 3x the development time for zero user-facing benefit at this scale.

**Why not a pure monolith?** A pure monolith with no internal boundaries becomes a ball of mud. You'll be afraid to change anything 6 months in.

**Modular Monolith = Best of Both:**
- Single deployable unit (simple ops)
- Clear internal module boundaries (auth, accounts, transactions, budgets, reports)
- Each module has its own router, service layer, models, and schemas
- Modules communicate through explicit service interfaces, not direct DB queries across modules
- When (if) one module needs to scale, you extract it into a service — but the interface is already clean

**Structure:**
```
app/
├── core/           # Shared: DB, config, security, exceptions
├── modules/
│   ├── auth/       # Registration, login, OTP, tokens
│   ├── accounts/   # Financial account management
│   ├── transactions/
│   ├── categories/
│   ├── budgets/
│   └── reports/
├── workers/        # Background tasks (notifications, aggregation)
└── main.py
```

---

### 3.3 Backend Framework: FastAPI

**Decision: FastAPI**

- **Async by default** — critical for I/O-bound financial operations
- **Pydantic v2** — automatic input validation and serialization (financial data demands validation)
- **Auto-generated OpenAPI docs** — your frontend developer (or future self) will thank you
- **SQLAlchemy 2.0 async** — production-grade ORM with async support
- **Alembic** — for database migrations (you will never touch the DB directly in production)

**Do not use Django for this.** Django REST Framework is excellent, but its ORM is synchronous by default, and its "batteries-included" approach adds weight you don't need.

---

### 3.4 Database: PostgreSQL

**Decision: PostgreSQL — no debate here**

Financial applications require ACID compliance. This is not optional. Your database must guarantee Atomicity, Consistency, Isolation, and Durability. NoSQL trades these guarantees for scale. At your scale, that trade is a terrible deal. You will hit data corruption bugs that are nearly impossible to debug.

**PostgreSQL-specific advantages:**
- `NUMERIC(12,2)` for money — never use FLOAT for currency
- Row-level locking for balance updates
- JSONB for flexible metadata without schema explosion
- Full-text search for transaction notes
- Window functions for running balance calculations

**Supporting databases:**
- **Redis**: Session storage, rate limiting, OTP code TTL, caching report aggregations

---

### 3.5 Hosting Infrastructure (Cost-Aware)

**Budget target: under $25/month until you have paying users**

| Service | Provider | Monthly Cost | Purpose |
|---|---|---|---|
| Backend API | Railway.app (Starter) | $5–10 | FastAPI app container |
| PostgreSQL | Railway.app managed | $5 (or free tier) | Primary database |
| Redis | Railway.app | $5 | Cache & sessions |
| File Storage | Cloudflare R2 | ~$0 | Profile pics, exports |
| CDN / DDoS | Cloudflare (free) | $0 | Always put Cloudflare in front |
| SMS OTP | Termii (Ghana-native) | Pay-per-use ~$0.01/SMS | OTP delivery |
| Mobile Builds | Expo EAS (free tier) | $0 | iOS/Android builds |
| Domain | Namecheap | ~$10/year | — |
| **Total** | | **~$15–20/month** | — |

**Upgrade path:** When you have 500+ active users, move to DigitalOcean App Platform or a small VPS ($12–24/month droplet).

**Production rule:** Never run your database on the same server as your application.

---

### 3.6 Authentication and Security

**Auth Strategy:**
1. **Registration:** Phone number + OTP (SMS via Termii) → set 6-digit PIN
2. **Login:** Phone number + PIN → JWT access token (15 min TTL) + refresh token (30 days)
3. **App unlock:** PIN or biometric (stored on device — never on server)
4. **Token refresh:** Silent refresh in background before expiry
5. **Logout:** Invalidate refresh token in Redis

**Security non-negotiables:**
- HTTPS everywhere — Cloudflare handles TLS termination
- Rate limiting on all auth endpoints (slowapi: 5 OTP requests per phone per hour)
- Store PINs as bcrypt hashes — never plaintext, never MD5
- JWT signing with RS256 (asymmetric) — harder to forge than HS256
- Input sanitization via Pydantic at boundary
- SQL injection prevention via SQLAlchemy ORM — never raw string queries
- CORS: explicit whitelist, not wildcard
- Environment secrets via pydantic-settings — never committed to Git

---

## PART 4: SYSTEM ARCHITECTURE

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   MOBILE CLIENTS                         │
│        iOS (React Native)    Android (React Native)      │
│              ↕ HTTPS/REST + JWT                          │
└─────────────────────┬───────────────────────────────────┘
                      │
            ┌─────────▼─────────┐
            │   Cloudflare CDN   │  ← DDoS protection,
            │   (Reverse Proxy)  │    TLS termination,
            └─────────┬──────────┘    Rate limiting layer
                      │
            ┌─────────▼──────────────────────────────────┐
            │         FastAPI Application Server          │
            │  ┌────────┐ ┌──────────┐ ┌──────────────┐ │
            │  │  auth  │ │transactions│ │   budgets   │ │
            │  │ module │ │  module  │ │   module    │ │
            │  └────────┘ └──────────┘ └──────────────┘ │
            │  ┌──────────────┐ ┌────────────────────┐  │
            │  │  accounts    │ │      reports       │  │
            │  │  module      │ │      module        │  │
            │  └──────────────┘ └────────────────────┘  │
            │              ↕ SQLAlchemy Async ORM        │
            └────┬────────────────────────┬──────────────┘
                 │                        │
    ┌────────────▼──────────┐  ┌──────────▼───────────────┐
    │  PostgreSQL (Primary)  │  │     Redis Cache           │
    │  - users              │  │  - OTP codes (TTL 5min)  │
    │  - accounts           │  │  - JWT refresh tokens     │
    │  - transactions       │  │  - Rate limit counters    │
    │  - categories         │  │  - Report cache (1hr TTL) │
    │  - budgets            │  └──────────────────────────┘
    └───────────────────────┘
                 │
    ┌────────────▼──────────────────────┐
    │  Background Workers (ARQ/Redis)   │
    │  - Budget alert checks            │
    │  - Monthly report generation      │
    │  - Offline sync reconciliation    │
    └───────────────────────────────────┘
                 │
    ┌────────────▼──────────┐   ┌──────────────────────────┐
    │   Cloudflare R2        │   │  Termii SMS Gateway       │
    │   (File Storage)       │   │  (OTP delivery)           │
    │   - Statement exports  │   └──────────────────────────┘
    │   - Profile images     │
    └───────────────────────┘
```

---

### 4.2 REST API Structure

All routes versioned under `/api/v1/`

**Auth Module**
```
POST   /api/v1/auth/register/initiate      # Send OTP to phone
POST   /api/v1/auth/register/verify        # Verify OTP, create user, set PIN
POST   /api/v1/auth/login                  # Phone + PIN → tokens
POST   /api/v1/auth/token/refresh          # Refresh access token
POST   /api/v1/auth/logout                 # Invalidate refresh token
POST   /api/v1/auth/pin/reset/initiate     # Send OTP for PIN reset
POST   /api/v1/auth/pin/reset/confirm      # Verify OTP + set new PIN
```

**Users Module**
```
GET    /api/v1/users/me                    # Get current user profile
PATCH  /api/v1/users/me                    # Update profile (name, currency)
DELETE /api/v1/users/me                    # Account deletion (GDPR-style)
```

**Accounts Module**
```
GET    /api/v1/accounts/                   # List user's accounts
POST   /api/v1/accounts/                   # Create account
GET    /api/v1/accounts/{id}               # Get account detail + balance
PATCH  /api/v1/accounts/{id}               # Update account
DELETE /api/v1/accounts/{id}               # Soft delete if has transactions
GET    /api/v1/accounts/{id}/balance       # Current balance with last sync time
```

**Transactions Module**
```
GET    /api/v1/transactions/               # List (paginated, filtered)
POST   /api/v1/transactions/               # Create transaction
GET    /api/v1/transactions/{id}           # Get detail
PATCH  /api/v1/transactions/{id}           # Update
DELETE /api/v1/transactions/{id}           # Soft delete
POST   /api/v1/transactions/bulk           # Bulk create (offline sync)
GET    /api/v1/transactions/summary        # Quick stats for dashboard
```

**Categories Module**
```
GET    /api/v1/categories/                 # List (system + user custom)
POST   /api/v1/categories/                 # Create custom category
PATCH  /api/v1/categories/{id}             # Update custom category
DELETE /api/v1/categories/{id}             # Delete custom (not system)
```

**Budgets Module**
```
GET    /api/v1/budgets/                    # List budgets for current month
POST   /api/v1/budgets/                    # Create/update budget (upsert)
GET    /api/v1/budgets/current             # Dashboard-ready with spent amounts
DELETE /api/v1/budgets/{id}                # Remove budget
```

**Reports Module**
```
GET    /api/v1/reports/monthly             # Monthly income/expense summary
GET    /api/v1/reports/categories          # Spending by category
GET    /api/v1/reports/trends              # Month-over-month trend
```

**API Design Principles:**
- Consistent error format: `{"error": {"code": "INSUFFICIENT_DATA", "message": "...", "field": "amount"}}`
- Always paginated lists: `{"data": [...], "pagination": {"page": 1, "per_page": 20, "total": 143}}`
- ISO 8601 dates everywhere
- Amounts always in `NUMERIC(14,2)` — prevents float errors

---

### 4.3 Core Data Model

```sql
-- Users
CREATE TABLE users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone              VARCHAR(20) UNIQUE NOT NULL,
    email              VARCHAR(255) UNIQUE,
    full_name          VARCHAR(100),
    pin_hash           VARCHAR(60) NOT NULL,
    currency           CHAR(3) DEFAULT 'GHS',
    is_active          BOOLEAN DEFAULT TRUE,
    is_premium         BOOLEAN DEFAULT FALSE,
    premium_expires_at TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Financial Accounts
CREATE TABLE financial_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    account_type    VARCHAR(20) NOT NULL,   -- 'bank' | 'mobile_money' | 'cash'
    provider        VARCHAR(50),
    opening_balance NUMERIC(14, 2) DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Categories
CREATE TABLE categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = system
    name          VARCHAR(100) NOT NULL,
    icon          VARCHAR(50),
    color         CHAR(7),
    category_type VARCHAR(10) NOT NULL,    -- 'income' | 'expense'
    is_system     BOOLEAN DEFAULT FALSE,
    sort_order    INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Transactions
CREATE TABLE transactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id       UUID NOT NULL REFERENCES financial_accounts(id),
    category_id      UUID NOT NULL REFERENCES categories(id),
    amount           NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    transaction_type VARCHAR(10) NOT NULL,  -- 'income' | 'expense' | 'transfer'
    description      VARCHAR(255),
    transaction_date DATE NOT NULL,
    notes            TEXT,
    is_deleted       BOOLEAN DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    client_id        UUID,                  -- For offline sync deduplication
    UNIQUE(user_id, client_id)
);

-- Budgets
CREATE TABLE budgets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id      UUID NOT NULL REFERENCES categories(id),
    amount           NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    budget_year      SMALLINT NOT NULL,
    budget_month     SMALLINT NOT NULL CHECK (budget_month BETWEEN 1 AND 12),
    alert_at_percent SMALLINT DEFAULT 80,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, category_id, budget_year, budget_month)
);

-- Indexes
CREATE INDEX idx_transactions_user_date     ON transactions(user_id, transaction_date DESC);
CREATE INDEX idx_transactions_user_category ON transactions(user_id, category_id);
CREATE INDEX idx_transactions_account       ON transactions(account_id);
CREATE INDEX idx_budgets_user_period        ON budgets(user_id, budget_year, budget_month);
```

**Key design decisions:**
- UUID primary keys — no sequential IDs that reveal row count
- `NUMERIC(14,2)` for money — never FLOAT
- Soft deletes on transactions — financial data must not be hard-deleted
- `client_id` on transactions — enables safe offline sync without duplicates
- `transaction_date` separate from `created_at` — user may log yesterday's expense today
- System categories via NULL user_id

---

### 4.4 Basic DevSecOps

**Version Control**
- Git with feature branches: `feature/`, `fix/`, `chore/`
- Branch protection on `main` — no direct pushes
- Conventional Commits format: `feat(transactions): add bulk sync endpoint`

**CI Pipeline (GitHub Actions) — on every PR:**
```
- ruff (linting)
- black --check (formatting)
- mypy (type checking)
- pytest with coverage (>80% minimum)
- bandit (security scan)
```

**Environment Management**
- `pydantic-settings` for typed config from environment variables
- `.env.example` committed (never `.env`)
- Separate configs: development, testing, production
- Secrets in Railway environment variables — never in code or Git

**Database Safety**
- All migrations via Alembic — never `ALTER TABLE` by hand in production
- Migration review is mandatory before every production deploy
- Automated daily backups (Railway Postgres does this by default)
- Never expose database port to public internet

**API Security Checklist**
- [ ] Rate limiting on all auth endpoints
- [ ] JWT expiry validated on every request
- [ ] User ownership verified on every resource access
- [ ] Pydantic validation on all request bodies
- [ ] HTTPS enforced at Cloudflare
- [ ] Security headers via middleware (X-Content-Type-Options, X-Frame-Options)

---

## PART 5: AI AGENT WORKFLOW

### 5.1 What You Must Design Manually (Never Delegate)

1. **Data model design** — Especially money-handling fields, relationships, and constraints. A wrong schema costs weeks to fix in production.
2. **API contract design** — The shape of your API is a public interface. Changing it breaks clients.
3. **Security decisions** — Auth flow, token strategy, permission logic. Agents often generate insecure defaults.
4. **Business logic rules** — "Can a user delete a transaction that a budget snapshot references?" An agent will pick an answer without telling you the tradeoff.
5. **Error handling strategy** — What errors are user-facing vs. internal? Agents generate shallow error handling.
6. **Database migrations** — Always review before applying. An agent-generated migration that drops a column is catastrophic.

### 5.2 What You Can Safely Delegate to Agents

- CRUD endpoint scaffolding
- Pydantic schema generation
- Unit test generation (review them after)
- Alembic migration generation (review before running)
- Repetitive utility functions
- React Native UI screens (given a wireframe description)
- TypeScript type generation from OpenAPI spec
- README and inline docstrings

### 5.3 Review Checkpoints

| Checkpoint | What to Review | Red Flags to Catch |
|---|---|---|
| After model generation | Column types, constraints, indexes | FLOAT for money, missing NOT NULL, no indexes on FKs |
| After service layer | Business logic, edge cases, ownership checks | Missing user_id filter, no 404 handling |
| After endpoint generation | HTTP status codes, auth decorator, validation | Missing auth dependency, wrong status codes |
| After migration generation | SQL correctness, no destructive changes | DROP COLUMN on live data, type change without casting |
| After test generation | Tests test behaviour, not just that code runs | Tests that always pass, no failure path testing |
| After frontend component | State management, error states, loading states | No loading indicator, direct API calls in components |

### 5.4 Preventing Agent Over-Reliance

**The "Understand Before You Commit" Rule:** Never commit agent-generated code you cannot explain line by line. If you can't explain it, you can't debug it at 11pm when prod is down.

**The "Smallest Possible Ask" Rule:** Don't say "build me the transactions module." Say "generate a Pydantic schema for the create transaction request with these fields."

**The "Red Team Review" Rule:** After generating a security-sensitive function, prompt the agent again: "What are the security vulnerabilities in this code?"

**Architecture Decision Records (ADRs):** Keep a `/docs/decisions/` folder. For every non-trivial architecture choice, write a 10-line ADR: what the decision is, why you made it, what alternatives were considered.

---

## PART 6: PHASED EXECUTION PLAN

### Prompt Coverage Map

| Phase | Coverage | Prompts Provided | Prompts Still Needed |
|---|---|---|---|
| 1 — Architecture | ❌ By design (manual) | 0 | 0 — manual work |
| 2 — Backend Core | ✅ 100% | Prompts 1–5, 8, 10, 11, 12 | None |
| 3 — Frontend Core | ✅ 100% | Prompts 6–7, 13–19 | None |
| 4 — Integration | ⚠️ Guided manually | 0 | See Part 11 |
| 5 — Testing & Hardening | ✅ ~80% + guided | Prompts 9, 20, 21 | See Part 11 |
| 6 — Deployment | ✅ ~80% + guided | Prompts 9, 22 | See Part 11 |

---

### Phase 1: Planning & Architecture (Week 1–2)
- [ ] Write the data model (schemas on paper first, then SQL)
- [ ] Define all API endpoints (this document as source)
- [ ] Set up GitHub repository with branch protection rules
- [ ] Set up Railway account, provision Postgres + Redis
- [ ] Write ADR-001: Tech stack decisions
- [ ] Create Figma/Excalidraw wireframes for MVP screens (Dashboard, Transactions, Add Transaction, Budgets, Reports)
- [ ] Document all system categories (seeder data)
- **Deliverable:** Architecture doc + repo scaffolded + DB provisioned

### Phase 2: Backend Core (Week 3–6)
- [ ] Project structure setup — **Prompt 1**
- [ ] SQLAlchemy models — **Prompt 2**
- [ ] Auth module — **Prompt 3**
- [ ] Transactions module — **Prompt 4**
- [ ] Reports module — **Prompt 5**
- [ ] Accounts module — **Prompt 10**
- [ ] Categories module — **Prompt 11**
- [ ] Budgets module — **Prompt 12**
- [ ] Database seeder — **Prompt 8**
- [ ] CI/CD pipeline — **Prompt 9**
- **Deliverable:** Fully tested, documented REST API running on Railway

### Phase 3: Frontend Core (Week 7–10)
- [ ] Expo project setup + navigation + API client — **Prompt 6**
- [ ] Auth screens (Register, OTP, Set PIN, Login) — **Prompt 13**
- [ ] Add Transaction screen + offline queue — **Prompt 7**
- [ ] Dashboard screen — **Prompt 14**
- [ ] Transaction List screen — **Prompt 15**
- [ ] Budgets screen — **Prompt 16**
- [ ] Reports screen — **Prompt 17**
- [ ] Accounts screen — **Prompt 18**
- [ ] Settings screen — **Prompt 19**
- **Deliverable:** Fully functional app running on Expo Go on real device

### Phase 4: Integration (Week 11–12)
- [ ] Connect all screens to real API (manual — see Part 11)
- [ ] Token refresh interceptor race condition fix (manual)
- [ ] Offline sync reconciliation + conflict resolution (manual)
- [ ] Paystack MoMo integration (manual — see Part 11)
- [ ] Error state and loading state audit across all screens
- **Deliverable:** End-to-end working app on real device with real backend

### Phase 5: Testing & Hardening (Week 13–14)
- [ ] Sentry integration — **Prompt 20**
- [ ] Locust load test — **Prompt 21**
- [ ] Security audit (manual — see Part 11)
- [ ] Achieve 80%+ backend test coverage
- [ ] Performance: add explain plans, optimize N+1 queries
- [ ] Test on low-end Android (GHS 800 phone minimum)
- **Deliverable:** Production-ready, monitored, hardened application

### Phase 6: Deployment (Week 15–16)
- [ ] EAS Build configuration — **Prompt 22**
- [ ] Production migration runbook (manual — see Part 11)
- [ ] Production environment variables on Railway
- [ ] Alembic migrations run on production database
- [ ] Cloudflare reverse proxy with SSL
- [ ] TestFlight + Google Play Internal Testing
- [ ] Soft launch: 5–10 real users, watch Sentry
- **Deliverable:** Live app with real users

---

## PART 7: IDE AGENT PROMPTS — PHASE 2: BACKEND CORE

---

### PROMPT 1 — Project Scaffolding

```
You are helping scaffold a production-grade FastAPI backend for a fintech budget 
management application. Follow these strict requirements:

Project name: cedismart-api
Python version: 3.11+
Framework: FastAPI with async support

Create the following directory structure:

cedismart-api/
├── app/
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py          # pydantic-settings BaseSettings
│   │   ├── database.py        # Async SQLAlchemy engine + session factory
│   │   ├── redis.py           # Redis connection pool
│   │   ├── security.py        # Password hashing, JWT creation/verification
│   │   ├── dependencies.py    # FastAPI dependency injection (get_db, get_current_user)
│   │   └── exceptions.py      # Custom exception classes + global exception handlers
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   └── models.py
│   │   ├── accounts/
│   │   ├── transactions/
│   │   ├── categories/
│   │   ├── budgets/
│   │   └── reports/
│   └── main.py
├── alembic/
├── tests/
│   ├── conftest.py
│   └── modules/
├── .env.example
├── alembic.ini
├── pyproject.toml
└── Dockerfile

Requirements:
- app/core/config.py: Settings class using pydantic-settings. Fields: DATABASE_URL,
  REDIS_URL, SECRET_KEY, ALGORITHM="RS256", ACCESS_TOKEN_EXPIRE_MINUTES=15,
  REFRESH_TOKEN_EXPIRE_DAYS=30, ENVIRONMENT, DEBUG, TERMII_API_KEY, TERMII_SENDER_ID
- app/core/database.py: Async SQLAlchemy with AsyncSession. Export: async_engine,
  AsyncSessionLocal, Base, get_db dependency
- app/core/security.py: bcrypt PIN hashing (hash_pin, verify_pin). JWT creation with
  RS256. Separate functions for access token and refresh token.
- app/core/exceptions.py: Custom exceptions: AppException(status_code, error_code,
  message). HTTP exception handlers returning consistent JSON:
  {"error": {"code": "...", "message": "...", "field": null}}
- app/main.py: Include all module routers. Add middleware: CORS (configurable origins),
  request ID header, logging middleware. Add global exception handlers.
  Mount health check at GET /health.
- pyproject.toml: All dependencies pinned. Include: fastapi, uvicorn[standard],
  sqlalchemy[asyncio], asyncpg, alembic, pydantic-settings, redis[asyncio],
  bcrypt, python-jose[cryptography], slowapi

Do NOT add any features not listed. Do NOT use synchronous SQLAlchemy anywhere.
```

---

### PROMPT 2 — SQLAlchemy Models

```
Generate SQLAlchemy 2.0 async ORM models for a budget management app.

Strict requirements:
- Use DeclarativeBase from sqlalchemy.orm
- All primary keys are UUID type, generated server-side with gen_random_uuid()
- All timestamps are TIMESTAMPTZ (timezone-aware), not TIMESTAMP
- All money/amount fields must use Numeric(14, 2) — NEVER Float or Double
- Add __table_args__ with explicit index definitions
- All models inherit a TimestampMixin with created_at and updated_at (auto-updated)
- Use Mapped[] type annotations (SQLAlchemy 2.0 style)

Models to generate:

1. User: id (UUID PK), phone (unique, not null), email (unique, nullable),
   full_name (nullable), pin_hash (not null), currency (3 chars, default GHS),
   is_active (bool, default true), is_premium (bool, default false),
   premium_expires_at (nullable timestamptz)

2. FinancialAccount: id, user_id (FK users.id CASCADE), name, account_type
   (enum: bank|mobile_money|cash), provider (nullable), opening_balance
   (Numeric 14,2, default 0), is_active (bool, default true)
   Index: (user_id, is_active)

3. Category: id, user_id (FK, nullable for system categories), name, icon
   (nullable), color (nullable, 7 chars), category_type (enum: income|expense),
   is_system (bool), sort_order (int, default 0)
   Unique constraint: (user_id, name)

4. Transaction: id, user_id (FK CASCADE), account_id (FK), category_id (FK),
   amount (Numeric 14,2, CHECK > 0), transaction_type (enum: income|expense|transfer),
   description (nullable, 255), transaction_date (DATE not null), notes (nullable Text),
   is_deleted (bool, default false), client_id (UUID, nullable)
   Unique constraint: (user_id, client_id) where client_id is not null
   Indexes: (user_id, transaction_date DESC), (user_id, category_id), (account_id)

5. Budget: id, user_id (FK CASCADE), category_id (FK), amount (Numeric 14,2),
   budget_year (SmallInteger), budget_month (SmallInteger, CHECK 1-12),
   alert_at_percent (SmallInteger, default 80)
   Unique constraint: (user_id, category_id, budget_year, budget_month)
   Index: (user_id, budget_year, budget_month)

Add relationship declarations where appropriate.
Do NOT generate migrations. Do NOT add any fields not listed above.
After generating models, list any assumptions you made about relationships or constraints.
```

---

### PROMPT 3 — Auth Module

```
Build the complete authentication module for a FastAPI fintech app.

Security requirements (non-negotiable):
- OTP stored in Redis with 5-minute TTL — never in the database
- OTPs are 6 digits, cryptographically random (secrets.randbelow, not random.randint)
- PIN stored as bcrypt hash (cost factor 12)
- JWT access tokens: 15 minute expiry, RS256 algorithm
- JWT refresh tokens: 30 day expiry, stored in Redis as valid set
- Rate limiting: max 3 OTP send requests per phone per 15 minutes (use slowapi)
- All auth endpoints return generic error messages (don't reveal if phone exists)

Endpoints to implement:

POST /api/v1/auth/register/initiate
  Body: {phone: str}
  Validates phone format (E.164: +233XXXXXXXXX)
  Generates 6-digit OTP, stores in Redis with key "otp:{phone}" TTL 300s
  Calls OTP sending service (inject as dependency, use stub for now)
  Returns: {message: "OTP sent", expires_in: 300}
  Rate limit: 3/15min per IP

POST /api/v1/auth/register/verify
  Body: {phone: str, otp: str, pin: str, full_name: str}
  Validates OTP from Redis (use constant-time comparison: hmac.compare_digest)
  Validates PIN: 6 digits, not all same digit (no 111111)
  Creates user record with hashed PIN
  Deletes OTP from Redis on success
  Returns: {access_token, refresh_token, token_type: "bearer"}

POST /api/v1/auth/login
  Body: {phone: str, pin: str}
  Rate limit: 5 attempts per phone per 15 minutes
  Returns: {access_token, refresh_token, token_type: "bearer"}
  On failure: 401 with generic "Invalid credentials" message

POST /api/v1/auth/token/refresh
  Body: {refresh_token: str}
  Validates refresh token signature AND checks it exists in Redis
  Returns new access_token only

POST /api/v1/auth/logout
  Requires auth. Removes refresh token from Redis. Returns: {message: "Logged out"}

Implementation structure:
- router.py: Only routing logic, calls service functions
- service.py: All business logic, no direct HTTP concerns
- schemas.py: Pydantic v2 schemas with validators
- No inline SQL — use repository pattern or direct async session

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Missing user_id ownership filter on any endpoint
- OTP comparison using == instead of hmac.compare_digest (timing attack)
- Refresh token not invalidated on logout
- PIN validation bypassable with edge case inputs
- Rate limiting only on IP, not on phone number (enumeration attack)
```

---

### PROMPT 4 — Transactions Module

```
Build the transactions module for a production fintech FastAPI app. This is the
core module — it must be correct, well-tested, and handle edge cases.

Business rules (implement all):
- Users can only access their own transactions (always filter by user_id from JWT)
- Amount must be positive; transaction_type determines direction
- transaction_date is user-provided (they may log past transactions)
- Soft delete only (set is_deleted=True, never DELETE FROM)
- Bulk sync endpoint must be idempotent (using client_id for deduplication)
- List endpoint must support pagination (page/per_page, max per_page=100)

Endpoints:

GET /api/v1/transactions/
  Query params: page(int,1), per_page(int,20),
                start_date(date), end_date(date),
                category_id(uuid), account_id(uuid),
                transaction_type(income|expense)
  Returns paginated list ordered by transaction_date DESC, then created_at DESC

POST /api/v1/transactions/
  Body: {account_id, category_id, amount, transaction_type,
         description?, transaction_date, notes?, client_id?}
  Validates: account belongs to user, category belongs to user or is system
  Returns: created transaction with 201 status

GET /api/v1/transactions/{id}
  Returns transaction if belongs to current user, else 404 (not 403)
  Never reveal ownership via different error codes

PATCH /api/v1/transactions/{id}
  Partial update — only fields provided are updated
  Cannot change user_id or account to another user's account
  Returns updated transaction

DELETE /api/v1/transactions/{id}
  Soft delete — sets is_deleted=True. Returns 204 No Content

POST /api/v1/transactions/bulk
  Body: {transactions: List[CreateTransactionSchema]}  (max 100 per call)
  Uses client_id for idempotency — skip if client_id already exists for this user
  Returns: {created: int, skipped: int, errors: List[{client_id, reason}]}

GET /api/v1/transactions/summary
  Returns: {
    current_month: {income: decimal, expense: decimal, net: decimal},
    current_month_vs_last: {income_change_pct: float, expense_change_pct: float}
  }

Service layer requirements:
- All DB queries use async SQLAlchemy
- No N+1 queries — use joinedload or selectinload for related objects
- summary endpoint results cached in Redis for 5 minutes

Generate: router.py, service.py, schemas.py

Then generate tests/modules/transactions/test_service.py with pytest-asyncio covering:
- Create transaction happy path
- Create with invalid account (belongs to different user)
- Bulk sync idempotency
- List pagination
- Soft delete verified

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Any endpoint missing the user_id filter that could expose cross-user data
- Bulk endpoint: can it be used to exhaust DB connections with 100 concurrent calls?
- Does soft delete actually prevent the record from appearing in list queries?
- Is the cache invalidation called on update and delete, not just create?
```

---

### PROMPT 5 — Reports Module

```
Build the reports module for a FastAPI budget app. Reports are read-only,
potentially expensive queries — they must use aggregation, caching, and never
do in-Python calculation that can be done in SQL.

Principle: Do the math in PostgreSQL, not Python.

Endpoints:

GET /api/v1/reports/monthly
  Query: year(int, required), month(int 1-12, required)
  Returns:
  {
    period: "2024-11",
    total_income: "2300.00",
    total_expense: "1850.00",
    net: "450.00",
    transaction_count: 47,
    top_expense_category: {id, name, amount},
    days_with_activity: 18
  }
  SQL: Use SUM with CASE WHEN transaction_type for income/expense split
  Cache: Redis key "report:monthly:{user_id}:{year}:{month}" TTL 1 hour
  Invalidate cache when: new transaction created/updated/deleted for that user+period

GET /api/v1/reports/categories
  Query: start_date(date), end_date(date), transaction_type(income|expense, default expense)
  Returns:
  {
    period: {start, end},
    total: "1850.00",
    categories: [
      {id, name, color, icon, amount, percentage, transaction_count},
      ...ordered by amount DESC
    ]
  }
  SQL: GROUP BY category_id with SUM, ORDER BY SUM DESC
  Calculate percentage in SQL using window functions

GET /api/v1/reports/trends
  Query: months(int, default 6, max 12)
  Returns last N complete months of income/expense summary.
  SQL: Use generate_series to ensure all months present even with no transactions.
  {
    months: [
      {year: 2024, month: 10, income: "2300.00", expense: "1920.00", net: "380.00"},
    ]
  }

Requirements:
- All amounts returned as strings (preserve decimal precision in JSON)
- Use SQLAlchemy Core (select/func) for aggregation, not ORM lazy loading
- Cache all report endpoints in Redis with appropriate TTL
- Add cache invalidation in transaction service on write operations

Generate: router.py, service.py, schemas.py
Do not implement any aggregation logic in Python — all aggregation must be SQL.

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Can a user query another user's report data by manipulating query params?
- If generate_series produces months with no transactions, are amounts returned
  as "0.00" or null (null would break the frontend chart)?
- Is the Redis cache key namespaced by user_id to prevent cross-user cache hits?
- Are the date range params validated to prevent absurdly large ranges that
  could cause slow queries (e.g., 50-year date range)?
```

---

### PROMPT 8 — Database Seeder

```
Write a Python script to seed the production PostgreSQL database with system
categories for a Ghanaian budget app. This runs once on first deployment.

Requirements:
- Script is idempotent: safe to run multiple times (INSERT ... ON CONFLICT DO NOTHING)
- Uses the same SQLAlchemy async session setup as the main app
- System categories have user_id = NULL
- Run via: python -m scripts.seed_categories

Expense categories to seed (with Ionicons icon names):
1.  Food & Chop           (fast-food-outline,           #FF6B35)
2.  Transport & Trotro    (bus-outline,                 #4A90D9)
3.  Airtime & Data        (phone-portrait-outline,      #7ED321)
4.  Rent & Housing        (home-outline,                #9B59B6)
5.  Utilities             (flash-outline,               #F39C12)
6.  Health & Pharmacy     (medical-outline,             #E74C3C)
7.  Clothing & Fashion    (shirt-outline,               #1ABC9C)
8.  Education             (school-outline,              #3498DB)
9.  Entertainment         (game-controller-outline,     #E91E63)
10. Groceries             (basket-outline,              #8BC34A)
11. Mobile Money Fees     (card-outline,                #FF9800)
12. Church & Giving       (heart-outline,               #E91E63)
13. Family Support        (people-outline,              #00BCD4)
14. Savings               (wallet-outline,              #4CAF50)
15. Business Expense      (briefcase-outline,           #607D8B)
16. Other Expense         (ellipsis-horizontal-outline, #9E9E9E)

Income categories to seed:
1. Salary               (cash-outline,         #4CAF50)
2. Freelance            (laptop-outline,        #2196F3)
3. Business Income      (trending-up-outline,   #FF9800)
4. Mobile Money Received(phone-portrait-outline,#9C27B0)
5. Gift & Allowance     (gift-outline,          #F44336)
6. Investment Return    (stats-chart-outline,   #009688)
7. Other Income         (add-circle-outline,    #9E9E9E)

Generate: scripts/seed_categories.py
Include a __main__ block that runs asyncio.run(seed()).
After generating, explain how to run this in a Railway deploy hook.

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Is the ON CONFLICT DO NOTHING scoped correctly — could it silently skip
  a legitimate insert if the unique constraint is too broad?
- Are colour hex values validated before insert?
- If the script is interrupted mid-run, is the database left in a
  consistent partial state, or does it need a transaction wrapper?
```

---

### PROMPT 9 — CI/CD GitHub Actions Pipeline

```
Write a GitHub Actions CI/CD pipeline for a FastAPI + React Native (Expo) project.

Repository structure:
- /backend/   — FastAPI app
- /mobile/    — Expo React Native app

Backend CI (trigger: push to any branch, PR to main):

File: .github/workflows/backend-ci.yml
Jobs:
1. lint-and-type-check:
   - Python 3.11
   - Install: ruff, black, mypy, bandit
   - Run: ruff check . (fail on error)
   - Run: black --check . (fail if formatting needed)
   - Run: mypy app/ --strict (fail on type errors)
   - Run: bandit -r app/ -ll (fail on medium+ severity)

2. test (depends on lint-and-type-check):
   - Services: postgres:16-alpine, redis:7-alpine (as service containers)
   - Set environment: TEST_DATABASE_URL, TEST_REDIS_URL
   - Install dependencies from pyproject.toml
   - Run: alembic upgrade head (against test DB)
   - Run: pytest tests/ --cov=app --cov-report=xml --cov-fail-under=80
   - Upload coverage to Codecov

Backend CD (trigger: push to main only):

File: .github/workflows/backend-deploy.yml
1. Deploy to Railway using railwayapp/railway-github-action
2. After deploy: run health check against production URL
3. If health check fails: post Slack notification (webhook from secret)

Mobile CI (trigger: push to main only):

File: .github/workflows/mobile-ci.yml
1. type-check:
   - Node 20, npm ci
   - Run: npx tsc --noEmit
   - Run: npx eslint src/ --max-warnings 0

Generate all three workflow files with proper YAML syntax.
Add comments explaining each non-obvious step.
Do NOT add EAS Build to CI — that is a manual step.

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Are any secrets referenced in workflow files that are not in GitHub Secrets?
- Does the test job use a real DATABASE_URL that could point to production?
- Is the Railway deploy step gated on the test job passing?
- Could the Slack webhook URL be accidentally logged in workflow output?
```

---

### PROMPT 10 — Accounts Module

```
Build the financial accounts module for a production FastAPI fintech app.
This module manages a user's financial accounts: bank, mobile money, and cash.

Business rules:
- A user can own a maximum of 3 accounts on the free tier (is_premium=False).
  Check this limit in the service layer before creating.
- Deleting an account that has transactions must be a SOFT delete (is_active=False),
  never a hard delete. If the account has no transactions, hard delete is allowed.
- Balance is NOT stored on the account record. It is always computed:
  opening_balance + SUM(income transactions) - SUM(expense transactions)
- Users can only access their own accounts. Always filter by user_id from JWT.

Endpoints:

GET /api/v1/accounts/
  Returns all active accounts for current user, each with computed balance.
  Use a single SQL query with a LEFT JOIN + COALESCE SUM — do not query
  balance in a Python loop (N+1 violation).
  Response: [{id, name, account_type, provider, balance, is_active, created_at}]

POST /api/v1/accounts/
  Body: {name, account_type (bank|mobile_money|cash), provider?, opening_balance?}
  Enforce 3-account free tier limit.
  Returns created account with 201.

GET /api/v1/accounts/{id}
  Returns account detail with computed balance.
  404 if not found or not owned by user.

PATCH /api/v1/accounts/{id}
  Updateable fields: name, provider only.
  opening_balance is NOT updateable after creation (financial integrity).
  account_type is NOT updateable after creation.
  Return 400 with clear message if client attempts to update locked fields.

DELETE /api/v1/accounts/{id}
  Check if account has any transactions (including soft-deleted ones).
  If yes: set is_active=False, return 200 with {message: "Account deactivated"}
  If no: hard delete, return 204.

Structure: router.py, service.py, schemas.py
ORM: async SQLAlchemy, no raw SQL strings. No N+1 queries anywhere.

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Missing user_id ownership filter on any endpoint
- Any endpoint that could expose another user's account data
- Free tier limit bypass: could a user create, delete, recreate to circumvent?
- Integer overflow on balance computation for large transaction sets
- Missing input validation on opening_balance (negative values, extreme values)
```

---

### PROMPT 11 — Categories Module

```
Build the categories module for a production FastAPI fintech app.

Core concept: Two types of categories exist:
- System categories: user_id IS NULL, seeded at deployment, visible to all users
- User categories: user_id = current user, visible only to them

Business rules:
- Users cannot modify or delete system categories (enforce in service layer, not just router)
- Users can create custom categories (max 20 custom categories per user — free tier)
- Category names must be unique per user (including system names — prevent confusion)
- Deleting a category that has transactions attached must be BLOCKED with 409:
  "Category has transactions. Reassign them before deleting."
- A category's type (income|expense) cannot be changed after creation.

Endpoints:

GET /api/v1/categories/
  Query param: type (income|expense|all, default all)
  Returns system categories + user's custom categories merged, ordered by:
  1. System categories first (is_system=True), sorted by sort_order
  2. User categories after, sorted by name
  Response includes: id, name, icon, color, category_type, is_system

POST /api/v1/categories/
  Body: {name, category_type, icon?, color?}
  Enforce 20-category limit for free tier.
  Reject if name conflicts with any system category name (case-insensitive).
  Returns created category with 201.

PATCH /api/v1/categories/{id}
  Only for user-owned categories (reject system category edits with 403).
  Updateable: name, icon, color only. category_type is LOCKED after creation.

DELETE /api/v1/categories/{id}
  Only for user-owned categories.
  Check for any non-deleted transactions referencing this category.
  If found: 409 with message and count of blocking transactions.
  If none: hard delete allowed.

Structure: router.py, service.py, schemas.py

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Can a user delete or modify a system category by guessing its UUID?
- Does the name conflict check properly handle Unicode and case variations?
- Is the 20-category limit checked atomically or is there a race condition window?
- Could a user set icon or color to an XSS payload (flag for future web surface)?
- Is the 409 error leaking internal database error details?
```

---

### PROMPT 12 — Budgets Module

```
Build the budgets module for a production FastAPI fintech app.

Business rules:
- One budget per (user, category, year, month). UPSERT semantics: if a budget
  already exists for that combination, update it. Do not 409.
- Budget progress (spent amount) is computed from transactions — never stored.
- Free tier: max 5 active budgets per month. Premium: unlimited.
- A budget can only be set for an expense category, never income.
- budget_month and budget_year default to current month/year if not provided.

Endpoints:

GET /api/v1/budgets/
  Query: year(int)?, month(int 1-12)? — defaults to current month
  Returns all budgets for that period with computed spent amount and percentage.
  Use a SINGLE query with a JOIN — not a Python loop.
  Response per budget:
  {
    id, category: {id, name, icon, color},
    budgeted_amount, spent_amount, remaining_amount,
    percentage_used, alert_at_percent, is_over_budget,
    period: {year, month}
  }

POST /api/v1/budgets/
  Body: {category_id, amount, year?, month?, alert_at_percent?}
  Enforce free tier limit (5 budgets).
  Validate category is expense type and belongs to user or is system category.
  UPSERT: INSERT ... ON CONFLICT (user_id, category_id, budget_year, budget_month)
  DO UPDATE SET amount=EXCLUDED.amount, alert_at_percent=EXCLUDED.alert_at_percent
  Returns upserted budget with computed progress with 200.

GET /api/v1/budgets/current
  Optimized version for the dashboard — single DB roundtrip.
  Cache: Redis key "budgets:current:{user_id}:{year}:{month}" TTL 5 minutes.
  Invalidate when any transaction is created/updated/deleted.

DELETE /api/v1/budgets/{id}
  Hard delete allowed (budgets are targets, not financial records).
  Verify ownership. Returns 204.

Structure: router.py, service.py, schemas.py
Use SQLAlchemy Core (func.sum, case) for aggregation.

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Can a user set a budget for another user's custom category by providing its UUID?
- Is percentage_used computed correctly when budgeted_amount is 0 (division by zero)?
- Does is_over_budget flag correctly when spent equals budgeted exactly?
- Is the free tier limit enforced in the UPSERT path (updating should not count)?
- Can the Redis cache return stale data for a different user if key collision occurs?
```

---

## PART 8: IDE AGENT PROMPTS — PHASE 3: FRONTEND CORE

---

### PROMPT 6 — React Native Project Setup

```
Set up a production-grade React Native project using Expo SDK 51 with TypeScript.
This is a fintech budget app — it needs to be secure, typed, and well-structured.

Stack:
- Expo Managed Workflow (SDK 51)
- TypeScript (strict mode)
- React Navigation v6 (Native Stack)
- Zustand for global state management
- TanStack Query (React Query v5) for server state
- Axios for HTTP with interceptors
- Expo SecureStore for token storage (NOT AsyncStorage for sensitive data)
- React Native MMKV for non-sensitive local storage (offline queue)
- NativeWind (Tailwind for React Native) for styling

Project structure:

src/
├── api/
│   ├── client.ts          # Axios instance with auth interceptors + token refresh
│   └── endpoints/
│       ├── auth.ts
│       ├── transactions.ts
│       ├── accounts.ts
│       ├── budgets.ts
│       └── reports.ts
├── components/
│   ├── ui/                # Button, Input, Card, Badge, LoadingSpinner
│   └── shared/            # AmountDisplay, CategoryBadge
├── screens/
│   ├── auth/
│   ├── dashboard/
│   ├── transactions/
│   ├── budgets/
│   ├── reports/
│   └── settings/
├── navigation/
│   ├── RootNavigator.tsx  # Auth vs App stack switch
│   ├── AuthNavigator.tsx
│   └── AppNavigator.tsx   # Bottom tab navigator
├── stores/
│   ├── authStore.ts       # Zustand: user, tokens, isAuthenticated
│   └── offlineStore.ts    # Pending offline transactions queue
├── hooks/
│   ├── useTransactions.ts
│   ├── useBudgets.ts
│   └── useReports.ts
├── utils/
│   ├── currency.ts        # formatGHS(amount: number): string
│   ├── date.ts
│   └── validation.ts
└── types/
    └── api.ts             # TypeScript types matching backend schemas

Specific implementation requirements:

src/api/client.ts:
- Axios instance with baseURL from env
- Request interceptor: attach Bearer token from SecureStore
- Response interceptor: on 401, attempt token refresh, retry original request once
- On refresh failure: clear tokens, navigate to login

src/stores/authStore.ts:
- Zustand store with: user, accessToken, isAuthenticated, isLoading
- Actions: login(tokens, user), logout(), updateUser()
- On logout: clear SecureStore tokens

src/utils/currency.ts:
- formatGHS(amount: number | string): string — returns "GHS 2,300.00"
- parseCurrencyInput(input: string): number
- Never use toLocaleString() directly in components

Generate these files with full implementation.
TypeScript strict mode must have zero errors.
Do NOT use any deprecated Expo APIs.

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Is anything sensitive (tokens, PIN) stored in AsyncStorage instead of SecureStore?
- Does the token refresh interceptor handle the race condition where two simultaneous
  401s both attempt a refresh? A lock/mutex is needed — flag if missing.
- Is the axios baseURL hardcoded or read from environment variables?
- After logout, is the TanStack Query cache explicitly cleared to prevent data leaks
  if another user logs in on the same device?
```

---

### PROMPT 7 — Add Transaction Screen

```
Build the "Add Transaction" screen for a React Native Expo app.
This is the most-used screen — optimize for speed and offline resilience.

Screen requirements:
- Works offline: if no network, queue in MMKV store and sync later
- Form fields: Amount, Type (income/expense toggle), Category (picker),
  Account (picker), Date (default today, changeable), Description (optional)
- Amount input: numeric keyboard, large font, shows formatted GHS as user types
- Category and Account open modal bottom sheets (not dropdowns)
- On success: navigate back and show success toast

Component structure:
screens/transactions/AddTransaction.tsx
components/shared/
├── AmountInput.tsx       # Large numeric input with GHS formatting
├── CategoryPicker.tsx    # Bottom sheet with category list + icons
├── AccountPicker.tsx     # Bottom sheet with account list
└── DateSelector.tsx      # Touchable that opens date picker

Implementation requirements:
1. Use React Hook Form for form management
2. Zod schema: amount > 0, category required, account required, date valid
3. On submit:
   a. Check network connectivity (NetInfo from @react-native-community/netinfo)
   b. If online: call POST /api/v1/transactions/ via TanStack Query mutation
   c. If offline: generate UUID client_id, store in MMKV offline queue,
      show "Saved offline" toast
4. After successful online submit: invalidate TanStack Query cache for
   transactions list and dashboard summary
5. Amount display: as user types "2300", show "GHS 2,300.00" above input
6. Error display: field-level errors below each input, not an alert popup

Offline queue shape:
interface OfflineTransaction {
  client_id: string;
  account_id: string;
  category_id: string;
  amount: number;
  transaction_type: 'income' | 'expense';
  description?: string;
  transaction_date: string;  // ISO date
  queued_at: string;         // ISO datetime
}

Include a custom hook useOfflineSync() that: on app foreground + network restore,
reads offline queue, calls bulk sync endpoint, clears successfully synced items.

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Can the amount input accept negative values or non-numeric characters?
- Is the offline queue size bounded? What happens if a user queues 500 transactions?
- Is client_id generated with a cryptographically random UUID, not Math.random()?
- Does useOfflineSync handle partial failures (some items sync, some fail)
  without deleting the failed items from the queue?
```

---

### PROMPT 13 — Auth Screens

```
Build all authentication screens for a React Native Expo app.

Stack: React Navigation Native Stack, React Hook Form + Zod, NativeWind,
Expo SecureStore, TanStack Query mutations, Zustand authStore.

Screens to build:

1. RegisterScreen (screens/auth/RegisterScreen.tsx)
   - Phone number input with Ghana flag prefix (+233)
   - Validate: valid Ghana number format (+233XXXXXXXXX, 9 digits after prefix)
   - On submit: call POST /api/v1/auth/register/initiate
   - On success: navigate to OTPVerifyScreen, pass phone as route param
   - Handle 429 (rate limited): "Too many attempts. Try in 15 minutes."

2. OTPVerifyScreen (screens/auth/OTPVerifyScreen.tsx)
   - 6 individual digit input boxes (not a single text field)
   - Auto-advance focus to next box as user types each digit
   - Auto-submit when 6th digit is entered
   - Countdown timer: "Resend in 4:32" counting down from 5 minutes
   - Resend button enabled after countdown expires
   - On success: navigate to SetPINScreen (new user) or App stack (returning)

3. SetPINScreen (screens/auth/SetPINScreen.tsx)
   - Custom PIN pad (0-9 + backspace), NOT system keyboard
   - Two-step: enter PIN, confirm PIN
   - Show dots (●) not digits as user types
   - Validate: 6 digits, not all identical (reject 111111, 000000, etc.)
   - On mismatch: shake animation, clear both, "PINs do not match"
   - On success: call register/verify endpoint, store tokens in SecureStore,
     set authStore.login(), navigate to App stack

4. LoginScreen (screens/auth/LoginScreen.tsx)
   - Phone input + custom PIN pad (reuse PINPad component)
   - Auto-submit when 6-digit PIN is complete
   - Biometric option: if supported, show fingerprint/face icon.
     On tap: use Expo LocalAuthentication, retrieve stored PIN from SecureStore
   - On 401: shake animation, clear PIN, "Incorrect PIN"
   - On success: store tokens, set authStore, navigate to App stack

Shared component:
components/ui/PINPad.tsx — reusable PIN pad
Props: onComplete(pin: string) => void, onClear() => void

SecureStore keys:
- "access_token"
- "refresh_token"
- "user_pin" (for biometric re-auth only)

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Is the PIN ever logged to console.log or held in component state longer than needed?
- Is SecureStore used for all sensitive data — nothing sensitive in AsyncStorage?
- OTP input: can a user paste a 6-digit string in a way that submits incorrect data?
- If biometric succeeds but stored PIN retrieval fails, is the error handled gracefully?
- Are backend error messages ever displayed verbatim (could leak internal info)?
```

---

### PROMPT 14 — Dashboard Screen

```
Build the Dashboard screen for a React Native fintech app.

Data sources:
- GET /api/v1/transactions/summary
- GET /api/v1/budgets/current

Layout (top to bottom):
1. Greeting: "Good morning, Kofi" based on time of day + current date
2. Net position card: net amount prominent, income/expense smaller below
3. "My Budgets" section: horizontal scroll of budget progress cards
   Each card: category name, progress bar, "GHS X of GHS Y"
   Cards at ≥80% usage: orange highlight. ≥100%: red highlight.
4. "Recent Transactions" section: last 5, with "See all" link
5. FAB: "+" bottom right, navigates to AddTransaction

Implementation requirements:
- TanStack Query for both API calls with separate query keys
- Skeleton loading placeholders (not a spinner) while data loads —
  use animated opacity pulse for skeleton effect
- Pull-to-refresh: re-fetch both queries on pull down
- Negative net: show in red. Positive: green.
- Empty state: if no transactions, show illustration + "Add your first transaction"
  button — do not render empty sections
- Wrap screen in error boundary: shows retry button on API failure
- Budget cards at ≥80%: show a warning icon next to the amount

Navigation targets:
- Budget card tap → BudgetsScreen
- Transaction tap → TransactionDetail
- "See all" → TransactionListScreen
- FAB → AddTransactionScreen

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Is financial data (amounts) passed in navigation params where it could be
  logged by React Navigation's default logging?
- Does pull-to-refresh invalidate the cache or just trigger a re-render of stale data?
- If one API call fails but the other succeeds, does the screen render partial
  data correctly without crashing?
- Are GHS amounts always formatted through the currency utility — never raw toFixed()?
```

---

### PROMPT 15 — Transaction List Screen

```
Build the Transaction List screen for a React Native fintech app.

Data source: GET /api/v1/transactions/ with pagination and filters.

Screen features:
- Paginated flat list (20 per page), infinite scroll.
  Load next page when within 5 items of the bottom.
- Each item: category icon (coloured circle), category name,
  description (or "No description"), formatted date, amount
  (red for expense, green for income)
- Filter chips above list (horizontal scroll):
  All | Income | Expense | [dynamic per-category chips]
  One filter active at a time.
- Month selector at top: < November 2024 >
- Search: icon in header, expands bar, debounce 400ms before API call
- Tap transaction → TransactionDetailScreen
- Long press → action sheet: Edit | Delete | Cancel
  Delete shows confirmation alert before calling DELETE endpoint.

Implementation requirements:
- TanStack Query useInfiniteQuery for paginated infinite scroll
- When month or filter changes: reset to page 1, clear previous results
- Optimistic deletion: remove from list immediately, restore on API failure
- Group transactions by date with header rows ("Today", "Yesterday",
  "Monday, Nov 11") — compute on client from paginated results
- Empty state per filter: "No income transactions this month"

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Does infinite scroll fire duplicate page requests on fast scroll
  (race condition on page increment)?
- Is the optimistic delete correctly rolled back on API failure, leaving
  no inconsistent UI state?
- Does search debounce correctly cancel in-flight requests when the user
  types faster than the debounce window?
- Are soft-deleted transactions (is_deleted=true) ever shown if the API
  returns them in an edge case?
```

---

### PROMPT 16 — Budgets Screen

```
Build the Budgets screen for a React Native fintech app.

Two-part screen:
1. Top: current month summary bar — total budgeted vs total spent
2. Main: list of budget cards for current month

Budget card:
- Category icon + name
- Progress bar (full width): green 0–69%, orange 70–99%, red 100%+
- "GHS X spent of GHS Y budgeted" + percentage on right
- If over budget: "Over by GHS Z" in red below bar

Interactions:
- Tap card: bottom sheet — Edit Budget | Delete Budget
- Edit: pre-filled form with amount + alert percentage slider
- FAB "Add Budget": opens AddBudgetSheet
  Form: expense category picker + amount + alert threshold (50|70|80|90|100 segmented control)
- Month navigation: < Month Year > selector

AddBudgetSheet / EditBudgetSheet:
- Shared component, controlled by mode prop
- Category picker shows only categories not already budgeted this month (for Add)
- Submit calls POST /api/v1/budgets/ (upsert handles both add and edit)
- On success: invalidate budgets query + close sheet

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Is the progress bar capped visually at 100%, or does it overflow when
  spent > budgeted?
- Can the user submit a budget with amount = 0 or a negative number?
- If the category picker for AddBudget is empty (all categories budgeted),
  is there a clear empty state instead of a broken picker?
- Does month navigation correctly re-fetch for the new month, or show cached data?
```

---

### PROMPT 17 — Reports Screen

```
Build the Reports screen for a React Native fintech app.

Data sources:
- GET /api/v1/reports/monthly
- GET /api/v1/reports/categories
- GET /api/v1/reports/trends

Screen layout:

Section 1 — Period selector (month/year navigation bar)

Section 2 — Monthly summary (3 side-by-side cards)
- Income: GHS amount in green
- Expenses: GHS amount in red
- Net: green or red depending on sign

Section 3 — Category breakdown
- Horizontal bar chart (NOT pie — more readable on mobile)
- Each bar: category colour, name, amount, percentage
- Sorted by amount descending
- Show top 6; collapse rest into "Other"
- Use react-native-gifted-charts or Victory Native if available in Expo managed
  workflow without ejecting. If neither available, implement a custom
  FlatList-based bar chart instead (do not eject for a chart library).

Section 4 — 6-Month Trend
- Line chart: two lines — income (green) and expenses (red)
- X-axis: month abbreviations
- Touch data point: tooltip with exact amounts

Implementation:
- Independent loading states per section
- If a section fails: show retry button for that section only
- Month navigation resets and re-fetches all three queries
- Export button in header: disabled with "Coming soon" tooltip (V2 placeholder)

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- If API returns 0 transactions for selected month, do all chart sections
  handle empty data gracefully without crashing?
- Is the "Other" category percentage computed as sum of remaining, not average?
- Does the trend chart handle < 6 months of data (new user) without a broken chart?
- Are amounts in chart tooltips formatted through the currency utility, not raw floats?
```

---

### PROMPT 18 — Accounts Screen

```
Build the Accounts screen for a React Native fintech app.

Data source: GET /api/v1/accounts/

Screen layout:
- Summary row at top: combined balance across all accounts
- List of account cards:
  Account type icon (bank=building, mobile_money=phone, cash=wallet)
  Account name + provider
  Current balance — large, green if positive, red if negative, grey if zero
- "Add Account" FAB — disabled with tooltip if free tier + already 3 accounts

Add Account bottom sheet:
- Account type: segmented control (Bank | Mobile Money | Cash)
- Provider: conditional picker
  Bank: GCB | Ecobank | Absa | Fidelity | Stanbic | Other
  Mobile Money: MTN | Vodafone | AirtelTigo
  Cash: no provider field
- Account name: auto-filled from selection (editable)
- Opening balance: numeric input, default 0

Edit / Deactivate:
- Long press card → action sheet: Edit | Deactivate | Cancel
- Edit: sheet with name and provider fields only
- Deactivate: confirmation alert "This will hide the account but preserve
  all transaction history." → calls DELETE endpoint

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Is total balance computed client-side? If so, is it summing Numeric/string
  amounts correctly — not using float arithmetic that introduces rounding errors?
- Is the 3-account free tier enforcement a client-side block only, or does the
  screen handle the server 400 response as the source of truth?
- For negative balance display — is the red colour distinguishable for
  red-green colour blind users? Use icon + colour, not colour alone.
```

---

### PROMPT 19 — Settings Screen

```
Build the Settings screen for a React Native fintech app.

Sections:

Profile:
- Display name + phone (read-only)
- Edit name: tap to open inline edit + save button

Security:
- Change PIN: navigates to ChangePINScreen (see below)
- Enable biometric: toggle using Expo LocalAuthentication.
  If not available: "Not supported on this device" — disable toggle.
  Store preference in MMKV (not SecureStore — it's a preference, not a secret).

Preferences:
- Currency: greyed out, "More currencies coming soon"

Account:
- Clear offline queue: shows count of pending items.
  Tap to clear with confirmation. Uses offlineStore.clearQueue().
- Export data: "Coming in next update" toast on tap

Danger zone (red-bordered card):
- Delete account: confirmation alert where user must type "DELETE" to confirm.
  On confirm: call DELETE /api/v1/users/me, clear ALL SecureStore and MMKV data,
  navigate to auth stack.
- Logout: confirmation → clear SecureStore tokens → authStore.logout() → LoginScreen

ChangePINScreen:
- Step 1: Enter current PIN (verify via POST /api/v1/auth/login)
- Step 2: Enter new PIN
- Step 3: Confirm new PIN
- On success: call PATCH /api/v1/users/me/pin
  NOTE: This endpoint is not yet defined in the backend — flag as TODO.
- Update stored PIN in SecureStore if biometric is enabled.

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Does account deletion clear ALL local storage — both SecureStore AND MMKV?
  List every key that must be cleared and confirm each is handled.
- After logout, is the TanStack Query cache explicitly cleared? If not, a
  subsequent user logging in could see the previous user's cached data.
- Is the biometric toggle preference persisting correctly across app restarts?
- The "type DELETE" check: is the comparison case-sensitive? Make a deliberate
  decision and document it in a code comment.
```

---

## PART 9: IDE AGENT PROMPTS — PHASE 5: TESTING & MONITORING

---

### PROMPT 20 — Sentry Integration

```
Add error monitoring with Sentry to both the FastAPI backend and the React Native
Expo frontend of a fintech budget app.

Backend (FastAPI):

Install: sentry-sdk[fastapi]

In app/core/config.py: add SENTRY_DSN (optional str, None disables Sentry)

In app/main.py:
- Initialize Sentry before the app is created:
  sentry_sdk.init(
    dsn=settings.SENTRY_DSN,
    environment=settings.ENVIRONMENT,
    traces_sample_rate=0.1,  # 10% — cost control
    send_default_pii=False,  # CRITICAL: never send PII
  )
- Add Sentry middleware to FastAPI

Custom context on every error event:
- user_id (from JWT if authenticated — NOT phone number or name)
- endpoint path and HTTP method
- environment

Sensitive data scrubbing — NEVER capture fields named:
pin, pin_hash, password, token, otp, phone, access_token,
refresh_token, authorization

Never capture:
- Request body on /auth/* endpoints
- Response body on any endpoint

Mobile (React Native / Expo):

Install: @sentry/react-native

In app entry point:
- Sentry.init: DSN from Expo Constants / env
- Set release to EAS build version
- traces_sample_rate: 0.05 (5% — mobile traffic is high)
- send_default_pii: false

Wrap root navigator with Sentry.wrap()

Never capture:
- PIN digits entered in PINPad component
- Auth tokens from SecureStore
- Phone numbers from form state
- Request/response bodies from /auth/* endpoints

In API client (axios interceptor): on 5xx, manually call
Sentry.captureException with endpoint path but WITHOUT request body.

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Is there any path where PIN, phone numbers, or auth tokens could reach
  Sentry — including component state, navigation params, or Zustand snapshots?
- Does the 10% trace sample rate still capture 100% of errors?
  (Traces and errors are separate in Sentry — confirm configured correctly.)
- Is SENTRY_DSN treated as a secret and not committed to Git?
- Could the Sentry middleware accidentally capture request bodies on auth endpoints?
```

---

### PROMPT 21 — Locust Load Test

```
Write a Locust load test script to simulate 100 concurrent users doing realistic
daily usage of a budget management API.

Target: Railway production URL (configurable via --host flag)

User behaviour (one Locust User class):

Setup (on_start, runs once per user):
- Register a unique phone number (+233 + random 9 digits)
- Verify OTP using test-mode code "000000" — NOTE: this requires a backend
  feature where ENVIRONMENT=testing accepts a fixed OTP. Flag this as a
  TODO that must be implemented and must be IMPOSSIBLE to enable in production.
- Store access_token in self.token

Weighted tasks:
- 40%: GET /api/v1/transactions/        (browsing)
- 25%: POST /api/v1/transactions/       (add transaction)
- 15%: GET /api/v1/budgets/current      (dashboard load)
- 10%: GET /api/v1/reports/monthly      (reporting)
- 10%: GET /api/v1/accounts/            (account list)

All requests:
- Include Authorization: Bearer {token} header
- Wait: between(1, 5) seconds between tasks
- Track custom failure if response > 1000ms for GET, > 2000ms for POST

POST /transactions/ random data:
- amount: random 5.00–500.00
- transaction_type: 30% income, 70% expense
- transaction_date: random date within last 30 days
- description: random from 20 Ghanaian-context descriptions
  ("Trotro to Madina", "MTN airtime", "Rice and stew", etc.)
- category_id and account_id: stored in on_start from seed data

Custom stats listener — report thresholds:
- 95th percentile GET < 500ms
- 95th percentile POST < 1000ms
- Error rate < 1%

Generate: tests/load/locustfile.py
Include as comments:
locust -f tests/load/locustfile.py --host https://your-api.railway.app \
  --users 100 --spawn-rate 10

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Does random phone generation guarantee uniqueness across 100 simultaneous starts?
- Is the test-mode OTP bypass flagged unmistakably so it cannot be enabled in prod?
- Do the task weights sum to exactly 100%?
- Does the script handle the case where on_start registration fails (e.g., duplicate
  phone) without causing the entire load test to abort?
```

---

## PART 10: IDE AGENT PROMPTS — PHASE 6: DEPLOYMENT

---

### PROMPT 22 — EAS Build Configuration

```
Configure Expo Application Services (EAS) for production iOS and Android builds
of a fintech React Native app.

Requirements:
- Expo SDK 51, managed workflow
- Two build profiles: preview (internal testing) and production (app store)
- Environment variables injected at build time, not hardcoded

Generate the following files:

1. eas.json
   Profiles:
   preview:
     distribution: internal
     android: { buildType: "apk" }      # Direct install for testing
     ios: { simulator: false }           # Real device via TestFlight
     env:
       EXPO_PUBLIC_API_URL: "https://cedismart-api.railway.app/api/v1"
       EXPO_PUBLIC_SENTRY_DSN: ""        # Empty for preview
       EXPO_PUBLIC_ENV: "preview"
   production:
     distribution: store
     android: { buildType: "app-bundle" }  # AAB required for Play Store
     ios: {}
     env:
       EXPO_PUBLIC_API_URL: "https://cedismart-api.railway.app/api/v1"
       EXPO_PUBLIC_SENTRY_DSN: "set-in-eas-secrets"
       EXPO_PUBLIC_ENV: "production"

2. app.config.ts (dynamic config — NOT app.json)
   - Read all EXPO_PUBLIC_* vars via process.env
   - iOS bundleIdentifier: "com.cedismart.app"
   - Android package: "com.cedismart.app"
   - Permissions to enable: camera (profile pic), notifications (budget alerts)
   - Permissions to explicitly disable: contacts, location, microphone
     (never request permissions the app does not use)
   - Splash screen and icon paths (placeholder paths — developer replaces assets)
   - Configure Sentry plugin if @sentry/react-native is installed

3. src/config/env.ts
   export const ENV = {
     apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
     sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
     environment: process.env.EXPO_PUBLIC_ENV ?? "development",
   } as const;
   Throw a clear startup error if apiUrl is empty string.

After generating, check your own code for the following vulnerabilities
and list findings with severity (Critical / Medium / Low):
- Are any sensitive values (API keys, secrets) hardcoded in eas.json instead
  of being referenced from EAS Secrets?
- Does app.config.ts request any permissions the app does not actually use?
  Over-permissioning reduces user trust and Play Store approval odds.
- EXPO_PUBLIC_ values are bundled into the binary and visible to anyone who
  decompiles the app. Confirm no secrets use this prefix.
- Is the production Sentry DSN correctly routed through EAS Secrets and not
  committed to the repository?
```

---

## PART 11: MANUAL WORK GUIDE — PHASES 4, 5 & 6

These are the areas where no IDE agent prompt was generated — and deliberately so. They require your judgment, context, and ownership.

---

### Phase 4 — Integration: What To Do Manually

**Why no agent prompts here:** Integration is where your frontend's assumptions collide with your backend's reality. The bugs here are not code bugs — they are contract bugs. No agent has the context of both sides of your system simultaneously.

**Token Refresh Race Condition (Do This Yourself)**

The token refresh interceptor scaffolded in Prompt 6 handles the basic case. But sit with it and trace this specific failure scenario manually: two simultaneous API calls both receive a 401. Both fire a refresh request. You now have two refresh tokens being exchanged at the same time — one will invalidate the other, leaving one request permanently broken. The fix is a refresh lock: a shared promise that the second 401 waits on instead of firing a new refresh. The agent will generate the naive version without this lock. Review the interceptor specifically for this case and implement the lock before going to production.

**Paystack MoMo Integration (Do This Yourself)**

Do not delegate this. The Paystack Ghana MoMo flow has specific redirect and webhook behaviour that agents get wrong because training data on it is sparse. Read the Paystack Ghana developer documentation directly at paystack.com/gh/developers. Implement the webhook signature verification by hand using their documented HMAC-SHA512 approach, and test it against their sandbox before writing a single line of production code. Once you understand the webhook flow, you can use the agent to scaffold the handler structure — but the flow understanding must come from you.

**Offline Sync Conflict Resolution (Do This Yourself)**

The `useOfflineSync` hook from Prompt 7 handles the happy path. What the agent cannot anticipate: what happens when a transaction in the offline queue references a category the user deleted while offline? Or an account that was deactivated? Define your conflict resolution rules explicitly before writing code. Write that decision as a comment block at the top of the sync hook. Options: last-write-wins, server-wins, or flag for user review. There is no universally correct answer — but there must be an intentional one.

---

### Phase 5 — Security Audit: What To Do Manually

The vulnerability checks at the end of every agent prompt above catch the obvious. What they cannot catch is financial logic correctness under adversarial input. Run every one of these tests manually against your running API using Bruno or Insomnia:

- Call `GET /api/v1/accounts/{id}` with a valid token but another user's account UUID. Confirm you get 404, not 403, not 200.
- Call `POST /api/v1/transactions/` with a `category_id` that belongs to another user. Confirm rejection.
- Send a transaction with `amount: -500`. Confirm rejection.
- Send a transaction with `amount: 99999999999.99`. Confirm it's handled without overflow.
- Hit any OTP endpoint 6 times in a row. Confirm rate limiting fires.
- Decode your JWT at jwt.io. Confirm it contains no PIN hash, no phone number — only user_id and expiry.
- Log in, copy the access token, wait 16 minutes, use the old token. Confirm 401.
- Call `DELETE /api/v1/users/me` and then immediately try to log in with the same phone. Confirm the account is gone.

No automated scanner will run these tests in the context of your specific business rules. You must.

---

### Phase 6 — Production Migration Runbook: What To Do Manually

Write a `DEPLOY.md` file in your repository root. This is a manual checklist you run before every production deploy. It takes 20 minutes to write once and prevents hours of recovery later. Use this as your starting template:

```markdown
# Production Deploy Checklist

## Pre-Deploy
- [ ] Run `alembic history` — confirm all migrations are in source control
- [ ] Run `alembic upgrade head` on a staging DB copy first
- [ ] Verify the app starts cleanly against the migrated staging DB
- [ ] Review all migration files for destructive operations (DROP COLUMN, type changes)
- [ ] Confirm all new environment variables are set in Railway production

## Deploy
- [ ] Set Railway app to maintenance mode (return 503 from /health temporarily)
- [ ] Run `alembic upgrade head` on production DB
- [ ] Deploy new backend container via GitHub push to main
- [ ] Verify /health returns 200 within 2 minutes of deploy

## Post-Deploy
- [ ] Remove maintenance mode
- [ ] Smoke test: register → login → add transaction → view dashboard → check reports
- [ ] Check Sentry for any new error spikes in the first 15 minutes
- [ ] Check Railway metrics for abnormal CPU or memory usage
- [ ] If anything looks wrong: Railway supports one-click rollback — use it immediately

## Rollback Trigger Conditions
Roll back immediately if any of these occur within 30 minutes of deploy:
- Sentry error rate increases by more than 5x baseline
- /health stops returning 200
- Any user reports inability to log in
- Any financial amount displayed incorrectly
```

---

## PART 12: ARCHITECTURE DECISION RECORDS TEMPLATE

Create a `/docs/decisions/` folder. Write an ADR for every non-trivial architecture choice — even if agent-suggested. This forces you to own every decision.

```markdown
# ADR-001: Use FastAPI over Django REST Framework

Date: 2024-11-15
Status: Accepted

Context:
Need to choose a Python web framework for the CediSmart API.

Decision:
Use FastAPI with async SQLAlchemy 2.0.

Rationale:
- Native async support critical for I/O-bound financial operations
- Pydantic v2 provides validation required for financial input at the boundary
- Auto-generated OpenAPI docs reduce frontend/backend contract friction
- Lighter weight — we only build what we need, no batteries-included overhead

Consequences:
- Team must be comfortable with async/await patterns
- No built-in admin panel (not needed for API-only backend)
- Auth must be implemented manually (handled in auth module)

Alternatives considered:
- Django + DRF: rejected — synchronous ORM by default, heavier startup weight
- Litestar: rejected — smaller community, fewer agent training examples
```

Additional ADRs to write before starting Phase 2:
- ADR-002: Modular monolith over microservices
- ADR-003: PostgreSQL NUMERIC(14,2) for all monetary values
- ADR-004: Soft deletes for transactions
- ADR-005: Phone + PIN authentication (not email + password)
- ADR-006: Offline-first transaction entry with client_id deduplication

---

*Document Version: 2.0 — Complete Edition*
*Covers all 6 phases | 22 agent prompts | 3 manual guides*
*Review this document before starting each phase. Update it when decisions change.*
