# 🌐 CediSmart Web

**Responsive web interface for CediSmart budget management platform.**

A lightweight web application providing an alternative access point to the CediSmart platform. Designed for desktop and tablet users, with responsive design and core budget tracking functionality.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Setup](#environment-setup)
- [Running Locally](#running-locally)
- [Building for Production](#building-for-production)
- [Styling Guide](#styling-guide)
- [Contributing](#contributing)

---

## Features

✅ **Responsive Design** — Works on desktop, tablet, and mobile browsers  
✅ **Dashboard** — Overview of accounts and recent transactions  
✅ **Transaction Management** — View, add, and edit transactions  
✅ **Budget Tracking** — Monitor spending against monthly targets  
✅ **Reports** — Charts and analytics for spending patterns  
✅ **Accounts** — Manage bank and mobile money accounts  
✅ **Settings** — User profile and preferences  
✅ **Dark Mode** — System theme preference support  
✅ **JWT Authentication** — Secure login via OTP  

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Markup** | HTML5 | Semantic, accessible markup |
| **Styling** | CSS3 + Tailwind | Utility-first, responsive design |
| **Script** | Vanilla JS (ES6+) | No framework overhead for MVP |
| **HTTP Client** | Fetch API | Native browser support, minimal dependency |
| **State Management** | LocalStorage + IndexedDB | Client-side persistence |
| **Build Tool** | Vite (optional) | Fast dev server and bundle optimization |

**Future:** Consider upgrading to React/Vue if complexity increases beyond simple dashboard displays.

---

## Project Structure

```
cedismart-web/
├── index.html                  # Main entry point
├── app.js                       # Application initialization
├── style.css                    # Global styles + Tailwind
├── assets/
│   ├── images/                 # Logo, icons, illustrations
│   ├── fonts/                  # Custom fonts
│   └── manifest.json           # PWA manifest
├── pages/
│   ├── dashboard.html          # Main dashboard
│   ├── transactions.html       # Transaction list
│   ├── budgets.html            # Budget management
│   ├── reports.html            # Analytics
│   ├── accounts.html           # Account management
│   ├── settings.html           # User settings
│   ├── auth.html               # Login/Register
│   └── privacy.html            # Legal pages
├── components/                  # Reusable UI components
│   ├── header.js
│   ├── sidebar.js
│   ├── card.js
│   ├── modal.js
│   └── forms.js
├── utils/
│   ├── api.js                  # API client wrapper
│   ├── auth.js                 # Authentication helpers
│   ├── storage.js              # LocalStorage/IndexedDB wrappers
│   ├── currency.js             # GHS formatting
│   ├── date.js                 # Date parsing + formatting
│   └── notifications.js        # Toast/alert helpers
├── pages/
│   ├── auth/
│   │   ├── register.html
│   │   ├── login.html
│   │   └── reset-pin.html
│   ├── app/
│   │   ├── dashboard.html
│   │   ├── transactions.html
│   │   ├── budgets.html
│   │   ├── reports.html
│   │   ├── accounts.html
│   │   └── settings.html
│   └── static/
│       ├── privacy.html
│       ├── terms.html
│       └── about.html
├── .env.example                # Environment variables template
├── package.json                # Dependencies (optional)
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js 18+** (optional, only if using build tool)
- **Modern browser** — Chrome, Firefox, Safari, Edge (2023+)
- **CediSmart API** running or accessible via URL

### 1. Clone Repository

```bash
git clone https://github.com/cliff-de-tech/CediSmart.git
cd CediSmart/cedismart-web
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API endpoint
```

`.env` template:

```bash
# API Endpoint
VITE_API_BASE_URL=http://localhost:8000

# Feature Flags
VITE_ENABLE_DARK_MODE=true
VITE_ENABLE_REPORTS=true
VITE_ENABLE_PWA=false  # Progressive Web App

# Optional: Analytics
VITE_ANALYTICS_ID=
```

### 3. Run Locally (Simple HTTP Server)

```bash
# Python 3
python -m http.server 8080

# Node.js http-server
npx http-server -p 8080

# Or use Live Server VS Code extension
```

Open `http://localhost:8080` in your browser.

### 4. (Optional) Build with Vite

If you want faster builds and dev reload:

```bash
npm install
npm run dev
# Runs at http://localhost:5173 with hot reload
```

---

## Environment Setup

### `.env` Variables

| Variable | Description | Example |
|---|---|---|
| `VITE_API_BASE_URL` | API endpoint | `http://localhost:8000` or `https://api.cedismart.com` |
| `VITE_ENABLE_DARK_MODE` | Dark mode toggle | `true` / `false` |
| `VITE_ENABLE_REPORTS` | Show reports section | `true` / `false` |
| `VITE_ENABLE_PWA` | Progressive Web App features | `true` / `false` |

---

## Running Locally

### Quick Start (No Build Tool)

```bash
# Serve static files
python -m http.server 8080
# or: npx http-server

# Open browser
# http://localhost:8080
```

### With Vite (Development Mode)

```bash
npm install
npm run dev

# Hot reload enabled
# Fast refresh on save
```

### Environment Detection

The app automatically detects the API endpoint:

1. Load from `.env` (or environment variable)
2. Fallback to `http://localhost:8000`
3. Allow manual override in settings

---

## Building for Production

### Static Build (Recommended for MVP)

```bash
# Just upload the cedismart-web folder to your hosting:
# - Vercel
# - Netlify
# - GitHub Pages
# - Firebase Hosting
# - Cloudflare Pages

# Ensure .env is set with production API URL
```

### With Vite Build

```bash
npm run build
# Creates optimized dist/ folder

# Deploy dist/ to your hosting provider
```

### Deployment Checklist

- [ ] Update `VITE_API_BASE_URL` to production API endpoint
- [ ] Set `VITE_ENABLE_PWA=true` if hosting on HTTPS with service worker
- [ ] Configure CORS on CediSmart API to allow web origin
- [ ] Test authentication flow end-to-end
- [ ] Verify API calls in browser DevTools
- [ ] Test on mobile browsers (iOS Safari, Android Chrome)
- [ ] Set up error monitoring (Sentry, etc.) — optional

---

## Styling Guide

CediSmart Web uses **Tailwind CSS** for styling. All utility classes are available in `style.css`.

### Color Scheme

```css
/* Primary (Brand Green) */
--primary: #10b981
--primary-light: #d1fae5
--primary-dark: #059669

/* Secondary (Slate) */
--secondary: #64748b
--secondary-light: #f1f5f9
--secondary-dark: #1e293b

/* Status */
--success: #22c55e
--warning: #f59e0b
--error: #ef4444
--info: #3b82f6
```

### Example Component

```html
<!-- Button -->
<button class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition">
  Add Transaction
</button>

<!-- Card -->
<div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-4">
  <h3 class="text-lg font-semibold mb-2">Account Balance</h3>
  <p class="text-2xl font-bold text-primary">₵ 1,234.50</p>
</div>

<!-- Form Input -->
<input type="text" 
  class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" 
  placeholder="Phone number">
```

---

## API Integration

### Authentication

```javascript
// app.js
const API_BASE = process.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Login
async function login(phone, pin) {
  const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin }),
  });
  
  const data = await response.json();
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data;
}

// Authenticated Request
async function getTransactions(month) {
  const token = localStorage.getItem('access_token');
  
  const response = await fetch(
    `${API_BASE}/api/v1/transactions?month=${month}`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );
  
  return response.json();
}
```

---

## Contributing

1. **Code style:** Follow existing CSS/JS patterns
2. **Accessibility:** Use semantic HTML, test with screen readers
3. **Responsive:** Test on mobile, tablet, and desktop
4. **Performance:** Keep bundle small, minimize API calls
5. **Security:** Never hardcode secrets, validate input

---

## Browser Support

| Browser | Version | Notes |
|---|---|---|
| Chrome | 90+ | Full support |
| Firefox | 88+ | Full support |
| Safari | 14+ | Full support |
| Edge | 90+ | Full support |
| Mobile Safari | 14+ | Touch-optimized |
| Mobile Chrome | 90+ | Touch-optimized |

---

## License

Proprietary — © 2026 CediSmart. All rights reserved.
