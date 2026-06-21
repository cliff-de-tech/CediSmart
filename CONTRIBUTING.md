# Contributing to CediSmart

Thank you for your interest in contributing to CediSmart! This document provides guidelines for participating in our project.

## Code of Conduct

All contributors are expected to uphold the following principles:

- **Respect** — Treat all team members with professionalism and courtesy
- **Integrity** — Be honest about your capabilities and limitations
- **Focus** — Prioritize user security, financial data accuracy, and system reliability
- **Accountability** — Take ownership of your code and review feedback seriously

---

## Before You Start

### 1. Review Existing Documentation

- Read the [main README](./README.md)
- Review the component-specific READMEs:
  - [Backend API](./cedismart-api/README.md)
  - [Mobile App](./cedismart-mobile/README.md)
  - [Web App](./cedismart-web/README.md)
- Understand the [project architecture](./docs/budget-app-blueprint.md)

### 2. Set Up Your Development Environment

Follow the setup instructions in the relevant component README to get your local environment running.

### 3. Verify Your Setup

```bash
# Backend
cd cedismart-api
python -m pytest --cov=app --cov-fail-under=80

# Mobile
cd cedismart-mobile
npm run type-check
npm run lint

# Web
cd cedismart-web
# Verify page loads: http://localhost:8080
```

---

## Development Workflow

### 1. Branch Naming

Create a branch with a clear, descriptive name using one of these prefixes:

```
feature/<description>          # New feature
bugfix/<description>           # Bug fix
chore/<description>            # Maintenance, refactoring
docs/<description>             # Documentation only
test/<description>             # Test additions or fixes
security/<description>         # Security improvements
perf/<description>             # Performance improvements
```

**Examples:**
- `feature/offline-sync-queue`
- `bugfix/transaction-validation-error`
- `docs/api-endpoint-guide`
- `security/jwt-refresh-token-revocation`

### 2. Make Your Changes

- **One feature per branch** — Keep changes focused and reviewable
- **Incremental commits** — Commit frequently with clear messages
- **No merge commits** — Rebase before pushing
- **Comment complex logic** — Especially financial calculations

### 3. Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type:** `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `perf`, `security`  
**Scope:** Component or module affected (e.g., `auth`, `transactions`, `ui`)  
**Subject:** Present tense, lowercase, no period (max 50 chars)

**Examples:**

```
feat(auth): add biometric login support

- Implement Expo LocalAuthentication integration
- Add PIN as fallback for devices without biometrics
- Update user settings to toggle biometric preference

Closes #42
```

```
fix(transactions): correct decimal precision in amount field

- Use Decimal instead of Float for GHS amounts
- Add validation for amounts > 0
- Fix serialization in API response

Closes #88
```

```
docs(api): update environment variables table

- Add TERMII_API_KEY and TERMII_SENDER_ID
- Clarify RSA_PRIVATE_KEY format (PEM with \n)
```

### 4. Testing Requirements

**Backend (Python):**
- Write tests for all new functionality
- Maintain ≥ 80% code coverage
- Run: `pytest --cov=app --cov-fail-under=80`

**Mobile (React Native):**
- Write unit tests for utilities and hooks
- Test on both iOS and Android simulators
- Run: `npm test` (when testing framework is added)

**Web:**
- Test on Chrome, Firefox, Safari, Edge
- Test on mobile browsers (iOS Safari, Android Chrome)
- Test responsive breakpoints (mobile, tablet, desktop)

### 5. Code Quality

**Backend:**

```bash
# Linting
ruff check .

# Formatting
black --check .

# Type checking
mypy --strict app/

# Security scanning
bandit -r app/ -ll

# All checks
ruff check . && black --check . && mypy --strict app/ && bandit -r app/ -ll
```

**Mobile:**

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Formatting
npm run format

# All checks
npm run type-check && npm run lint && npm run format
```

**Web:**
- No linting configured yet; follow existing code style
- Use Vanilla CSS custom properties and layout classes in style.css consistently (no external framework dependencies)
- Ensure responsive design works at all breakpoints

### 6. Documentation

Update relevant documentation for all changes:

- **Code changes** → Update component README
- **API changes** → Update API endpoint documentation
- **Architecture changes** → Update design spec or blueprint
- **New features** → Add to appropriate README and contributing guide

---

## Pull Request Process

### 1. Pre-PR Checklist

- [ ] Branch is up-to-date with `main`
- [ ] All tests pass locally
- [ ] Code passes linting and formatting checks
- [ ] Coverage maintained or improved
- [ ] Documentation updated
- [ ] No secrets or sensitive data committed
- [ ] Commits follow Conventional Commits
- [ ] One logical feature per PR

### 2. Create Pull Request

**Title format:** `<type>(<scope>): <description>`

**Description template:**

```markdown
## Description
Brief summary of changes

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Breaking change
- [ ] Documentation update

## Related Issues
Closes #<issue_number>

## Changes Made
- Detail 1
- Detail 2
- Detail 3

## Testing
- [ ] Manual testing complete
- [ ] Unit tests added/updated
- [ ] Integration tested (if applicable)

## Screenshots (if UI changes)
<!-- Paste relevant screenshots -->

## Deployment Notes
Any special considerations for deployment or migration?

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] Tests pass locally
- [ ] No new warnings generated
```

### 3. Code Review

Your PR will be reviewed for:

- **Correctness** — Does it work as intended?
- **Security** — Are there potential vulnerabilities?
- **Performance** — Does it impact performance negatively?
- **Maintainability** — Is code clear and well-documented?
- **Testing** — Are edge cases covered?
- **Financial accuracy** — Are calculations correct? (backend only)

**Respond to feedback promptly.** Reviewers may suggest changes or ask clarifying questions.

### 4. Merge Criteria

Your PR can be merged when:

- ✅ All checks pass (tests, linting, type checking)
- ✅ Code review approved
- ✅ Minimum one approval from maintainer
- ✅ No merge conflicts
- ✅ Coverage maintained
- ✅ Documentation updated

---

## Financial Data & Security Considerations

**When working on financial features, remember:**

1. **Money must never be a Float** — Use `Decimal` (Python), `BigDecimal` (if Java), or equivalent
2. **Transactions are never hard-deleted** — Use soft deletes (`is_deleted = True`)
3. **Balances are computed, never stored** — Calculate from opening balance + transactions
4. **Rate limiting & brute force protection** — Auth endpoints must be rate-limited
5. **No sensitive data in logs** — Phone, PIN, OTP, tokens must be excluded
6. **Ownership validation** — Always verify user owns the resource they're accessing
7. **Cryptography** — Use established libraries; never roll your own
8. **Testing with real scenarios** — Test edge cases specific to Ghana (network drops, MoMo latency, etc.)

---

## Troubleshooting

### Build/Test Issues

**Backend:**

```bash
# Clean reinstall
rm -rf .venv
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

**Mobile:**

```bash
# Clear Expo cache
expo start --clear

# Clear node_modules
rm -rf node_modules package-lock.json
npm install
npm start
```

### Type Checking Issues (Backend)

```bash
# If mypy complains about type stubs
mypy --install-types app/
```

### Git Issues

```bash
# Reset to upstream main
git fetch origin
git reset --hard origin/main

# Rebase before submitting PR
git rebase main
git push origin feature/<name> -f
```

---

## Communication

### Getting Help

- **GitHub Issues** — For bugs and feature requests
- **Code Review Comments** — For implementation questions
- **Discussion Forums** — For design discussions (if available)

### Reporting Issues

When reporting a bug, include:

1. **Steps to reproduce** — Exact actions that trigger the bug
2. **Expected behavior** — What should happen
3. **Actual behavior** — What actually happens
4. **Environment** — OS, Python/Node version, browser, etc.
5. **Logs/Screenshots** — Relevant error messages or visual evidence

---

## Recognition

- All contributors are acknowledged in the project
- Significant contributions may be highlighted in release notes
- Your name and role will appear in contributor lists (unless you prefer anonymity)

---

## Questions or Suggestions?

- Open a **GitHub Issue** for questions about the contribution process
- Email project maintainers for sensitive topics
- Check existing issues/PRs before asking — your question may already be answered

---

## License

By contributing to CediSmart, you agree that:

1. Your contributions will be licensed under the [CediSmart Proprietary License](./LICENSE.md)
2. You have the right to grant this license
3. CediSmart may use your contributions for any legal purpose
4. You waive all moral rights to your contributions

---

*Last updated: 2026-06-20*

*Thank you for making CediSmart better!* 🙏
