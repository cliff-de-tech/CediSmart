// app.js - CediSmart Web App v2.0 Main Application Logic

// ---------------------------------------------------------------------------
// 1. API CONFIGURATION & STATE
// ---------------------------------------------------------------------------
const IS_LOCAL =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

const DIRECT_API_URL = IS_LOCAL
  ? 'http://localhost:8000/api/v1'
  : 'https://cedismart-api.onrender.com/api/v1';

// On Netlify/production, prefer same-origin /api/v1 proxy to avoid CORS preflight,
// with automatic fallback to DIRECT_API_URL.
let preferProxy = !IS_LOCAL;

const DEFAULT_AVATAR_URL =
  'https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&w=150&q=80';

const state = {
  token: localStorage.getItem('access_token') || null,
  refreshToken: localStorage.getItem('refresh_token') || null,
  isMasked: localStorage.getItem('cedismart_mask_balance') === 'true',
  aiLanguage: 'english',
  aiMessages: [],
  user: null,
  avatarUrl: localStorage.getItem('cedismart_avatar_url') || DEFAULT_AVATAR_URL,
  accounts: [],
  categories: [],
  transactions: [],
  summary: null,
  budgets: [],
  monthlyReport: null,
  categoryReport: null,
  trendsReport: null,
  pagination: {
    page: 1,
    per_page: 10,
    total: 0,
  },
  currentView: 'dashboard',
  parsedSMS: null,
};

// ---------------------------------------------------------------------------
// 2. HELPER FUNCTIONS & TOASTS
// ---------------------------------------------------------------------------
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast-item ${type === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3600);
}

function normalizeGhanaPhone(raw) {
  const cleaned = (raw || '').replace(/[\s()-]/g, '');
  if (/^0\d{9}$/.test(cleaned)) {
    return '+233' + cleaned.slice(1);
  }
  if (/^233\d{9}$/.test(cleaned)) {
    return '+' + cleaned;
  }
  return cleaned;
}

const getHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  return headers;
};

// Exact match with cedismart-mobile/src/utils/currency.ts formatGHS()
const formatCedi = (amount, options = {}) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount ?? 0);
  const safeVal = Number.isFinite(num) ? num : 0;

  if (options.compact && Math.abs(safeVal) >= 1_000_000) {
    return `₵\u00A0${(safeVal / 1_000_000).toFixed(1)}M`;
  }
  if (options.compact && Math.abs(safeVal) >= 10_000) {
    return `₵\u00A0${(safeVal / 1_000).toFixed(1)}K`;
  }

  const formatted = new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(Math.abs(safeVal))
    .replace('GHS', '₵')
    .replace(/\s+/g, '\u00A0');

  if (options.showSign && safeVal > 0) return `+${formatted}`;
  if (safeVal < 0) return `-${formatted}`;
  return formatted;
};

function getAccountKind(acc) {
  const type = String(acc?.account_type || '').toLowerCase();
  const prov = String(acc?.provider || '').toLowerCase();
  if (
    type === 'mobile_money' ||
    type === 'momo' ||
    prov.includes('momo') ||
    prov.includes('mtn') ||
    prov.includes('telecel') ||
    prov.includes('vodafone') ||
    prov.includes('airteltigo')
  ) {
    return 'momo';
  }
  if (type === 'bank' || prov === 'bank') {
    return 'bank';
  }
  if (type === 'cash' || prov === 'cash') {
    return 'cash';
  }
  return 'cash';
}

function getAccountBadgeLabel(acc) {
  if (acc?.provider) return acc.provider;
  const kind = getAccountKind(acc);
  if (kind === 'momo') return 'Mobile Money';
  if (kind === 'bank') return 'Bank Account';
  return 'Cash Wallet';
}

function getBudgetLimit(b) {
  return parseFloat(b?.budgeted_amount ?? b?.amount_limit ?? b?.amount ?? 0) || 0;
}

function getBudgetSpent(b) {
  return parseFloat(b?.spent_amount ?? b?.amount_spent ?? 0) || 0;
}

function getBudgetCategoryName(b) {
  return (
    b?.category?.name ||
    b?.category_name ||
    state.categories.find((c) => c.id === (b?.category?.id || b?.category_id))?.name ||
    'Category'
  );
}

function getTxnAccountName(txn) {
  return (
    txn?.account?.name ||
    state.accounts.find((a) => a.id === (txn?.account?.id || txn?.account_id))?.name ||
    'Wallet'
  );
}

function getTxnCategoryName(txn) {
  return (
    txn?.category?.name ||
    state.categories.find((c) => c.id === (txn?.category?.id || txn?.category_id))?.name ||
    'Uncategorized'
  );
}

function updateAvatarElements(url) {
  const resolved = url || DEFAULT_AVATAR_URL;
  state.avatarUrl = resolved;
  localStorage.setItem('cedismart_avatar_url', resolved);
  if (state.user?.id) {
    localStorage.setItem(`user_avatar_${state.user.id}`, resolved);
  }
  ['sidebar-avatar-img', 'header-avatar-img', 'settings-avatar-img'].forEach((id) => {
    const img = document.getElementById(id);
    if (img) {
      img.src = resolved;
      img.onerror = () => {
        img.onerror = null;
        img.src = DEFAULT_AVATAR_URL;
      };
    }
  });
}

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateStr).toLocaleDateString('en-GH', options);
};

const showLoading = (elementId, show) => {
  const btn = document.getElementById(elementId);
  if (!btn) return;
  const text = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.spinner');

  if (show) {
    btn.disabled = true;
    if (text) text.classList.add('hidden');
    if (spinner) spinner.classList.remove('hidden');
  } else {
    btn.disabled = false;
    if (text) text.classList.remove('hidden');
    if (spinner) spinner.classList.add('hidden');
  }
};

// Exact match with cedismart-mobile/src/screens/dashboard/DashboardScreen.tsx safeToSpend
function computeSafeToSpend() {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDays = Math.max(1, daysInMonth - now.getDate() + 1);

  let totalLimit = 0;
  let totalSpent = 0;
  state.budgets.forEach((b) => {
    totalLimit += getBudgetLimit(b);
    totalSpent += getBudgetSpent(b);
  });

  const remainingBudget = Math.max(0, totalLimit - totalSpent);
  const safeDaily = totalLimit > 0 ? remainingBudget / remainingDays : 0;
  const status =
    safeDaily > 50 ? 'healthy' : safeDaily > 15 ? 'moderate' : 'tight';

  return {
    totalLimit,
    totalSpent,
    remainingBudget,
    remainingDays,
    safeDaily,
    status,
  };
}

// ---------------------------------------------------------------------------
// 3. RESILIENT API CLIENT WITH PROXY FALLBACK & TOKEN REFRESH
// ---------------------------------------------------------------------------
async function rawFetchWithFallback(endpoint, config) {
  if (preferProxy) {
    try {
      const proxyRes = await fetch(`/api/v1${endpoint}`, config);
      const contentType = proxyRes.headers.get('content-type') || '';
      // If Netlify proxy is active, it returns JSON or 204; if static host 404s with HTML, fallback
      if (proxyRes.status !== 404 || contentType.includes('application/json')) {
        return proxyRes;
      }
      preferProxy = false;
    } catch {
      preferProxy = false;
    }
  }
  return await fetch(`${DIRECT_API_URL}${endpoint}`, config);
}

async function apiFetch(endpoint, options = {}, isRetry = false) {
  const config = {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  };

  try {
    const response = await rawFetchWithFallback(endpoint, config);

    if (
      response.status === 401 &&
      !isRetry &&
      state.refreshToken &&
      !endpoint.includes('/auth/login') &&
      !endpoint.includes('/auth/token/refresh')
    ) {
      // Attempt silent token refresh
      try {
        const refreshRes = await rawFetchWithFallback('/auth/token/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: state.refreshToken }),
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          state.token = refreshData.access_token;
          if (refreshData.refresh_token) {
            state.refreshToken = refreshData.refresh_token;
            localStorage.setItem('refresh_token', refreshData.refresh_token);
          }
          localStorage.setItem('access_token', refreshData.access_token);
          return await apiFetch(endpoint, options, true);
        }
      } catch (refreshErr) {
        console.warn('Silent token refresh failed:', refreshErr);
      }
      logoutUser();
      throw new Error('Your session has expired. Please sign in again.');
    }

    if (response.status === 204) {
      return null;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMessage =
        data?.error?.message ||
        data?.detail ||
        `Request failed (${response.status})`;
      throw new Error(errorMessage);
    }
    return data;
  } catch (error) {
    const msg = error?.message || '';
    if (
      msg === 'Load failed' ||
      msg === 'Failed to fetch' ||
      msg.includes('NetworkError')
    ) {
      throw new Error(
        'Unable to reach CediSmart server. If the server is waking up, please wait a few seconds and try again.'
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 4. AUTHENTICATION (LOGIN / LOGOUT)
// ---------------------------------------------------------------------------
async function handleLogin(e) {
  e.preventDefault();
  const rawPhone = document.getElementById('login-phone').value.trim();
  const phoneInput = normalizeGhanaPhone(rawPhone);
  const pinInput = document.getElementById('login-pin').value.trim();
  const errorBanner = document.getElementById('login-error');

  errorBanner.classList.add('hidden');
  showLoading('login-submit-btn', true);

  try {
    const response = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone: phoneInput, pin: pinInput }),
    });

    state.token = response.access_token;
    state.refreshToken = response.refresh_token;
    localStorage.setItem('access_token', response.access_token);
    localStorage.setItem('refresh_token', response.refresh_token);

    await fetchUserProfile();

    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('login-form').reset();
    document.getElementById('login-phone').value = '+233';

    await loadAppData();
    navigateToView('dashboard');
    showToast('Welcome back to CediSmart!');
  } catch (error) {
    errorBanner.textContent = error.message;
    errorBanner.classList.remove('hidden');
  } finally {
    showLoading('login-submit-btn', false);
  }
}

async function fetchUserProfile() {
  try {
    const user = await apiFetch('/users/me');
    state.user = user;

    const displayName = user.full_name || 'CediSmart Member';
    const displayPhone = user.phone || '';

    const profileNameEl = document.getElementById('profile-name');
    const profilePhoneEl = document.getElementById('profile-phone');
    const settingsNameEl = document.getElementById('settings-avatar-name');
    const settingsPhoneEl = document.getElementById('settings-avatar-phone');

    if (profileNameEl) profileNameEl.textContent = displayName;
    if (profilePhoneEl) profilePhoneEl.textContent = displayPhone;
    if (settingsNameEl) settingsNameEl.textContent = displayName;
    if (settingsPhoneEl) settingsPhoneEl.textContent = displayPhone;

    const fullNameInput = document.getElementById('settings-fullname');
    const emailInput = document.getElementById('settings-email');
    if (fullNameInput) fullNameInput.value = user.full_name || '';
    if (emailInput) emailInput.value = user.email || '';

    const localAvatar =
      localStorage.getItem(`user_avatar_${user.id}`) ||
      localStorage.getItem('cedismart_avatar_url');
    const resolvedAvatar = user.avatar_url || localAvatar || DEFAULT_AVATAR_URL;
    updateAvatarElements(resolvedAvatar);

    // If user had a local custom avatar not yet synced to backend, sync it silently
    if (!user.avatar_url && localAvatar && localAvatar !== DEFAULT_AVATAR_URL) {
      apiFetch('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ avatar_url: localAvatar }),
      }).catch(() => {});
    }
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    logoutUser();
  }
}

function logoutUser() {
  if (state.refreshToken && state.token) {
    rawFetchWithFallback('/auth/logout', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ refresh_token: state.refreshToken }),
    }).catch(() => {});
  }

  state.token = null;
  state.refreshToken = null;
  state.user = null;
  state.accounts = [];
  state.categories = [];
  state.transactions = [];
  state.summary = null;
  state.budgets = [];

  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');

  document.getElementById('app-container').classList.add('hidden');
  document.getElementById('auth-container').classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// 5. APPLICATION DATA LOADERS
// ---------------------------------------------------------------------------
async function loadAppData() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const [
      accountsData,
      categoriesData,
      summaryData,
      transactionsPage,
      budgetsData,
      monthlyRep,
      catRep,
      trendsRep,
    ] = await Promise.all([
      apiFetch('/accounts/').catch(() => []),
      apiFetch('/categories/').catch(() => []),
      apiFetch('/transactions/summary').catch(() => null),
      apiFetch(
        `/transactions/?page=${state.pagination.page}&per_page=${state.pagination.per_page}`
      ).catch(() => ({ data: [], pagination: { total: 0 } })),
      apiFetch('/budgets/').catch(() => []),
      apiFetch(`/reports/monthly?year=${year}&month=${month}`).catch(() => null),
      apiFetch(
        `/reports/categories?start_date=${startDate}&end_date=${endDate}&transaction_type=expense`
      ).catch(() => null),
      apiFetch('/reports/trends?months=6').catch(() => null),
    ]);

    state.accounts = accountsData || [];
    state.categories = categoriesData || [];
    state.summary = summaryData;
    state.transactions = transactionsPage?.data || [];
    state.pagination.total = transactionsPage?.pagination?.total || 0;
    state.budgets = budgetsData || [];
    state.monthlyReport = monthlyRep;
    state.categoryReport = catRep;
    state.trendsReport = trendsRep;

    populateFormSelects();
  } catch (error) {
    console.error('Failed to load application data:', error);
  }
}

function populateFormSelects() {
  const txnAccount = document.getElementById('txn-account');
  const txnCategory = document.getElementById('txn-category');
  const budgetCategory = document.getElementById('budget-category');

  if (txnAccount) {
    txnAccount.innerHTML = state.accounts
      .map((acc) => {
        const badge = getAccountBadgeLabel(acc).toUpperCase();
        return `<option value="${acc.id}">${acc.name} (${badge})</option>`;
      })
      .join('');
  }

  if (txnCategory) {
    txnCategory.innerHTML = state.categories
      .map((cat) => `<option value="${cat.id}">${cat.name}</option>`)
      .join('');
  }

  if (budgetCategory) {
    const expenseCats = state.categories.filter(
      (c) => !c.category_type || c.category_type === 'expense'
    );
    const list = expenseCats.length > 0 ? expenseCats : state.categories;
    budgetCategory.innerHTML = list
      .map((cat) => `<option value="${cat.id}">${cat.name}</option>`)
      .join('');
  }
}

// ---------------------------------------------------------------------------
// 6. ROUTING / NAVIGATION
// ---------------------------------------------------------------------------
function closeMobileSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.add('hidden');
}

function getGreetingTitle() {
  const hour = new Date().getHours();
  const prefix =
    hour < 12 ? 'Good Morning,' : hour < 17 ? 'Good Afternoon,' : 'Good Evening,';
  const rawName = (state.user?.full_name || '').trim();
  if (!rawName) return `${prefix} Chale`;
  const parts = rawName.split(/\s+/);
  const titles = ['Mr.', 'Mrs.', 'Ms.', 'Dr.'];
  const shortName =
    parts.length >= 2 && titles.includes(parts[0])
      ? `${parts[0]} ${parts[1]}`
      : parts[0];
  return `${prefix} ${shortName}`;
}

function navigateToView(viewName) {
  state.currentView = viewName;
  closeMobileSidebar();

  document.querySelectorAll('.nav-item, .mobile-tab-item').forEach((btn) => {
    btn.classList.toggle(
      'active',
      btn.getAttribute('data-view') === viewName
    );
  });

  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.toggle('hidden', sec.id !== `view-${viewName}`);
  });

  const viewTitles = {
    dashboard: {
      title: getGreetingTitle(),
      subtitle: 'Home Overview • Real-time sovereign financial standing',
    },
    accounts: {
      title: 'Accounts & Wallets',
      subtitle: 'Manage your MoMo, Bank, and Cash ledgers',
    },
    transactions: {
      title: 'Transaction Ledger',
      subtitle: 'Search, filter, export, and audit your records',
    },
    budgets: {
      title: 'Smart Budgets',
      subtitle: 'Daily Safe-to-Spend & 50/30/20 category limits',
    },
    parser: {
      title: 'CediSmart AI CFO & SMS Parser',
      subtitle: 'Tri-lingual financial assistant, receipt vision & SMS rescue',
    },
    reports: {
      title: 'Reports & Cash Flow Intelligence',
      subtitle: 'Monthly KPIs, category shares & 6-month velocity',
    },
    settings: {
      title: 'Settings & Guides',
      subtitle: 'Profile, Light/Dark appearance, User Guide & Support',
    },
  };

  const headerConfig = viewTitles[viewName] || {
    title: 'CediSmart',
    subtitle: '',
  };
  document.getElementById('view-title').textContent = headerConfig.title;
  document.getElementById('view-subtitle').textContent = headerConfig.subtitle;

  renderActiveView(viewName);
}

function renderActiveView(viewName) {
  switch (viewName) {
    case 'dashboard':
      renderDashboardView();
      break;
    case 'accounts':
      renderAccountsView();
      break;
    case 'transactions':
      renderTransactionsView();
      break;
    case 'budgets':
      renderBudgetsView();
      break;
    case 'parser':
      renderParserView();
      break;
    case 'reports':
      renderReportsView();
      break;
    case 'settings':
      break;
  }
}

// ---------------------------------------------------------------------------
// 7. VIEW RENDERING ENGINE
// ---------------------------------------------------------------------------

// --- A. DASHBOARD VIEW ---
function renderDashboardView() {
  let totalBalance = 0;
  let momoTotal = 0;
  let bankTotal = 0;
  let cashTotal = 0;

  state.accounts.forEach((acc) => {
    const bal = parseFloat(acc.balance || 0);
    totalBalance += bal;
    const kind = getAccountKind(acc);
    if (kind === 'momo') momoTotal += bal;
    else if (kind === 'bank') bankTotal += bal;
    else cashTotal += bal;
  });

  // Compute monthly income & expense matching Mobile DashboardScreen.tsx (summary.current_month)
  let monthIncome = parseFloat(
    state.summary?.current_month?.income ??
      state.monthlyReport?.total_income ??
      0
  );
  let monthExpense = parseFloat(
    state.summary?.current_month?.expense ??
      state.monthlyReport?.total_expense ??
      0
  );

  const {
    safeDaily,
    totalLimit,
    remainingBudget,
    remainingDays,
    status,
  } = computeSafeToSpend();
  const maskLabel = document.getElementById('mask-balance-label');
  const maskIcon = document.getElementById('mask-balance-icon');
  if (maskLabel) maskLabel.textContent = state.isMasked ? 'Show' : 'Hide';
  if (maskIcon) maskIcon.textContent = state.isMasked ? '🙈' : '👁️';

  document.getElementById('dash-net-balance').textContent = state.isMasked
    ? '₵ ••••'
    : formatCedi(totalBalance);
  document.getElementById('dash-momo-balance').textContent = state.isMasked
    ? '₵ ••••'
    : formatCedi(momoTotal);
  document.getElementById('dash-bank-balance').textContent = state.isMasked
    ? '₵ ••••'
    : formatCedi(bankTotal);
  document.getElementById('dash-cash-balance').textContent = state.isMasked
    ? '₵ ••••'
    : formatCedi(cashTotal);

  const monthIncEl = document.getElementById('dash-month-income');
  const monthExpEl = document.getElementById('dash-month-expense');
  if (monthIncEl) {
    monthIncEl.textContent = state.isMasked ? '₵ ••••' : formatCedi(monthIncome);
  }
  if (monthExpEl) {
    monthExpEl.textContent = state.isMasked ? '₵ ••••' : formatCedi(monthExpense);
  }

  const safeEl = document.getElementById('dash-safe-to-spend');
  const safeValEl = document.getElementById('dash-safe-daily-val');
  const safeBanner = document.getElementById('hero-safe-banner');

  if (safeEl) {
    safeEl.textContent =
      totalLimit > 0
        ? `${remainingDays} ${remainingDays === 1 ? 'day' : 'days'} left • ${state.isMasked ? '₵ ••••' : formatCedi(remainingBudget)} left`
        : 'Set a monthly budget to see your daily target';
  }
  if (safeValEl) {
    safeValEl.textContent = state.isMasked ? '₵ ••••' : formatCedi(safeDaily);
  }
  if (safeBanner) {
    safeBanner.classList.remove('moderate', 'tight');
    if (totalLimit > 0) {
      if (status === 'tight') safeBanner.classList.add('tight');
      else if (status === 'moderate') safeBanner.classList.add('moderate');
    }
  }

  // Top 5 Recent Transactions
  const tbody = document.getElementById('dash-transactions-body');
  if (state.transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No transactions yet. Click Log Transaction to record your first entry!</td></tr>`;
  } else {
    tbody.innerHTML = state.transactions
      .slice(0, 5)
      .map((txn) => {
        const acc = getTxnAccountName(txn);
        const cat = getTxnCategoryName(txn);
        const amountClass =
          txn.transaction_type === 'income' ? 'text-income' : 'text-expense';
        const amountPrefix = txn.transaction_type === 'income' ? '+' : '-';
        const displayAmt = state.isMasked
          ? '₵ ••••'
          : `${amountPrefix} ${formatCedi(txn.amount)}`;

        return `
          <tr>
            <td data-label="Date">${formatDate(txn.transaction_date)}</td>
            <td data-label="Description" class="font-medium">${txn.description || cat}</td>
            <td data-label="Category"><span class="badge-tag">${cat}</span></td>
            <td data-label="Account" class="text-secondary">${acc}</td>
            <td data-label="Amount" class="text-right ${amountClass} font-semibold">${displayAmt}</td>
          </tr>
        `;
      })
      .join('');
  }

  // Monthly Budgets Summary
  const budgetList = document.getElementById('dash-budgets-list');
  if (state.budgets.length === 0) {
    budgetList.innerHTML = `<div class="text-center text-muted py-4">No monthly budgets configured yet. Click Manage to set category limits or run the 50/30/20 AI generator.</div>`;
  } else {
    budgetList.innerHTML = state.budgets
      .slice(0, 5)
      .map((b) => {
        const catName = getBudgetCategoryName(b);
        const limit = getBudgetLimit(b);
        const spent = getBudgetSpent(b);
        const percent =
          b.percentage_used !== undefined
            ? parseFloat(b.percentage_used)
            : limit > 0
            ? (spent / limit) * 100
            : 0;

        let progressColor = 'success';
        if (percent >= 100) progressColor = 'danger';
        else if (percent >= 80) progressColor = 'warning';

        return `
          <div class="budget-item">
            <div class="budget-info">
              <span class="budget-name">${catName} <span class="badge" style="margin-left: 6px; font-size: 0.7rem;">${Math.round(percent)}%</span></span>
              <span class="budget-values">${
                state.isMasked
                  ? '₵ •••• / ₵ ••••'
                  : `${formatCedi(spent)} / ${formatCedi(limit)}`
              }</span>
            </div>
            <div class="progress-bar-wrapper">
              <div class="progress-bar ${progressColor}" style="width: ${Math.min(percent, 100)}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }
}

// --- B. ACCOUNTS VIEW ---
function renderAccountsView() {
  const container = document.getElementById('accounts-list-container');
  if (state.accounts.length === 0) {
    container.innerHTML = `
      <div class="panel-card text-center py-4">
        <div class="empty-state">
          <span class="empty-icon">🏦</span>
          <p>No accounts configured yet. Click Add Account to add MTN MoMo, Telecel Cash, Bank, or Cash.</p>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = state.accounts
      .map((acc) => {
        const kind = getAccountKind(acc);
        const providerClass = `provider-${kind}`;
        const badgeLabel = getAccountBadgeLabel(acc);
        return `
          <div class="account-card ${providerClass}">
            <span class="account-type-tag">${badgeLabel}</span>
            <div>
              <h4>${acc.name}</h4>
            </div>
            <div>
              <span class="account-balance-amount">${
                state.isMasked ? '₵ ••••' : formatCedi(acc.balance)
              }</span>
            </div>
            <div class="account-footer">
              <span class="account-id-hint">Active Ledger</span>
              <button class="btn-action-delete" onclick="handleDeleteAccount('${acc.id}')" title="Delete Account">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }
}

// --- C. TRANSACTIONS VIEW ---
function renderTransactionsView() {
  const tbody = document.getElementById('txns-list-body');

  if (state.transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No transactions logged. Click Log Transaction to add one.</td></tr>`;
    document.getElementById('pagination-prev').disabled = true;
    document.getElementById('pagination-next').disabled = true;
    document.getElementById('pagination-text').textContent = 'Showing 0 of 0';
    return;
  }

  tbody.innerHTML = state.transactions
    .map((txn) => {
      const acc = getTxnAccountName(txn);
      const cat = getTxnCategoryName(txn);
      const amountClass =
        txn.transaction_type === 'income' ? 'text-income' : 'text-expense';
      const amountPrefix = txn.transaction_type === 'income' ? '+' : '-';

      return `
        <tr>
          <td data-label="Date">${formatDate(txn.transaction_date)}</td>
          <td data-label="Description" class="font-medium">${txn.description || cat}</td>
          <td data-label="Category"><span class="badge-tag">${cat}</span></td>
          <td data-label="Account" class="text-secondary">${acc}</td>
          <td data-label="Type"><span class="badge-type ${txn.transaction_type}">${txn.transaction_type}</span></td>
          <td data-label="Amount" class="text-right ${amountClass} font-semibold">${amountPrefix} ${formatCedi(txn.amount)}</td>
          <td data-label="Action" class="text-center">
            <button class="btn-action-delete" onclick="handleDeleteTransaction('${txn.id}')" title="Delete record">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  const start = (state.pagination.page - 1) * state.pagination.per_page + 1;
  const end = Math.min(
    state.pagination.page * state.pagination.per_page,
    state.pagination.total
  );
  document.getElementById('pagination-text').textContent = `Showing ${
    state.pagination.total === 0 ? 0 : start
  }-${end} of ${state.pagination.total}`;

  document.getElementById('pagination-prev').disabled =
    state.pagination.page === 1;
  document.getElementById('pagination-next').disabled =
    end >= state.pagination.total;
}

// --- D. SMART BUDGETS VIEW ---
function renderBudgetsView() {
  const { totalLimit, totalSpent, remainingDays, safeDaily } =
    computeSafeToSpend();
  const overallPct =
    totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;

  document.getElementById('budgets-safe-daily').textContent =
    formatCedi(safeDaily);
  document.getElementById('budgets-days-left').textContent =
    `${remainingDays} days remaining in month`;
  document.getElementById('budgets-total-limit').textContent =
    formatCedi(totalLimit);
  document.getElementById('budgets-total-spent').textContent =
    formatCedi(totalSpent);
  document.getElementById('budgets-overall-pct').textContent =
    `${overallPct}% of monthly budget used`;

  const container = document.getElementById('budgets-full-list');
  if (state.budgets.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 36px 16px;">
        <span class="empty-icon">📊</span>
        <p>No category budgets set for this month. Click <strong>+ Set Category Limit</strong> or use the <strong>50/30/20 Smart Generator</strong>.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.budgets
    .map((b) => {
      const catName = getBudgetCategoryName(b);
      const limit = getBudgetLimit(b);
      const spent = getBudgetSpent(b);
      const remaining =
        b.remaining_amount !== undefined
          ? parseFloat(b.remaining_amount)
          : Math.max(0, limit - spent);
      const percent =
        b.percentage_used !== undefined
          ? parseFloat(b.percentage_used)
          : limit > 0
          ? (spent / limit) * 100
          : 0;

      let progressColor = 'success';
      if (percent >= 100) progressColor = 'danger';
      else if (percent >= 80) progressColor = 'warning';

      return `
        <div class="budget-item" style="padding-bottom: 14px; border-bottom: 1px solid var(--border-color);">
          <div class="budget-info" style="align-items: center;">
            <div>
              <span class="budget-name">${catName}</span>
              <span class="badge" style="margin-left: 8px;">${Math.round(percent)}%</span>
              <span style="display: block; font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">${formatCedi(Math.max(0, remaining))} left</span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="budget-values">${formatCedi(spent)} / ${formatCedi(limit)}</span>
              <button class="btn-action-delete" onclick="handleDeleteBudget('${b.id}')" title="Remove Budget">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
          <div class="progress-bar-wrapper">
            <div class="progress-bar ${progressColor}" style="width: ${Math.min(percent, 100)}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

// --- E. GEMINI SMS PARSER PREVIEW ---
function renderParserView() {
  const container = document.getElementById('parser-preview-body');
  if (!state.parsedSMS) return;

  const { amount, transaction_type, description, category_suggestion, notes } =
    state.parsedSMS;
  const typeClass =
    transaction_type === 'income' ? 'badge-type income' : 'badge-type expense';

  container.innerHTML = `
    <div class="parsed-record-box">
      <div class="parsed-header-summary">
        <div>
          <span class="parsed-amount-label">Extracted Amount</span>
          <h4 class="parsed-amount-value">${formatCedi(amount)}</h4>
        </div>
        <span class="${typeClass}">${transaction_type}</span>
      </div>

      <div class="parsed-details-list">
        <div class="parsed-field-row">
          <span class="parsed-field-label">Counterparty / Description:</span>
          <span class="parsed-field-val">${description || 'MoMo Transaction'}</span>
        </div>
        <div class="parsed-field-row">
          <span class="parsed-field-label">Suggested Category:</span>
          <span class="parsed-field-val"><span class="badge-tag">${category_suggestion || 'General'}</span></span>
        </div>
        <div class="parsed-field-row">
          <span class="parsed-field-label">Notes:</span>
          <span class="parsed-field-val">${notes || 'Parsed by Gemini 2.5 Flash'}</span>
        </div>
      </div>

      <button id="add-parsed-ledger-btn" class="btn btn-primary btn-block" onclick="commitParsedTransaction()">
        <span>💾 Save Transaction to Ledger</span>
      </button>
    </div>
  `;
}

// --- F. REPORTS & ANALYTICS VIEW ---
function renderReportsView() {
  // Use backend monthly report if available, else compute from loaded transactions
  let totalIncome = parseFloat(state.monthlyReport?.total_income ?? 0);
  let totalExpenses = parseFloat(state.monthlyReport?.total_expense ?? 0);

  if (!state.monthlyReport) {
    state.transactions.forEach((txn) => {
      const val = parseFloat(txn.amount || 0);
      if (txn.transaction_type === 'expense') totalExpenses += val;
      else totalIncome += val;
    });
  }

  const netSavings =
    state.monthlyReport?.net_savings !== undefined
      ? parseFloat(state.monthlyReport.net_savings)
      : totalIncome - totalExpenses;
  const savingsRate =
    state.monthlyReport?.savings_rate !== undefined
      ? parseFloat(state.monthlyReport.savings_rate)
      : totalIncome > 0
      ? ((totalIncome - totalExpenses) / totalIncome) * 100
      : 0;

  document.getElementById('report-total-income').textContent =
    formatCedi(totalIncome);
  document.getElementById('report-total-expense').textContent =
    formatCedi(totalExpenses);
  document.getElementById('report-net-savings').textContent =
    formatCedi(netSavings);
  document.getElementById('report-savings-rate').textContent =
    `Savings Rate: ${savingsRate.toFixed(1)}%`;

  // Category Breakdown
  const container = document.getElementById('report-categories-container');
  const apiCats = state.categoryReport?.categories || [];

  if (apiCats.length > 0) {
    container.innerHTML = apiCats
      .map((c) => {
        const pct = parseFloat(c.percentage || 0);
        return `
          <div class="category-report-row">
            <div class="category-report-meta">
              <span class="category-report-name">${c.name || c.category_name}</span>
              <span class="category-report-percent">${formatCedi(c.amount || c.total)} (${pct.toFixed(1)}%)</span>
            </div>
            <div class="progress-bar-wrapper">
              <div class="progress-bar success" style="width: ${Math.min(pct, 100)}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
  } else {
    container.innerHTML = `<div class="text-center text-muted py-4">Log expenses this month to see your category breakdown.</div>`;
  }

  // 6-Month Cash Flow Trend
  const trendsContainer = document.getElementById('report-trends-container');
  const monthsList = state.trendsReport?.months || state.trendsReport?.trends || [];
  if (trendsContainer) {
    if (monthsList.length === 0) {
      trendsContainer.innerHTML = `<div class="text-center text-muted py-4">6-month cash flow trends will appear as you log transactions.</div>`;
    } else {
      trendsContainer.innerHTML = monthsList
        .map((m) => {
          const inc = parseFloat(m.income ?? m.total_income ?? 0);
          const exp = parseFloat(m.expense ?? m.total_expense ?? 0);
          const label = m.month_label || `${m.year}-${String(m.month).padStart(2, '0')}`;
          return `
            <div style="margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color);">
              <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 4px;">
                <strong>${label}</strong>
                <span><span class="text-income">+${formatCedi(inc)}</span> · <span class="text-expense">-${formatCedi(exp)}</span></span>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }
}

// ---------------------------------------------------------------------------
// 8. INTERACTIVE ACTIONS & AI CFO HANDLERS
// ---------------------------------------------------------------------------
function appendAiMessage(role, text) {
  const box = document.getElementById('ai-messages-box');
  if (!box) return;
  const wrapper = document.createElement('div');
  wrapper.className = `ai-msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble';
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  box.appendChild(wrapper);
  box.scrollTop = box.scrollHeight;
}

async function handleAiChatSubmit(e, imageBase64 = null, imageMime = null) {
  if (e) e.preventDefault();
  const input = document.getElementById('ai-chat-input');
  const text = (input?.value || '').trim() || (imageBase64 ? 'Please scan this receipt and extract the transaction details.' : '');
  if (!text) return;

  if (input) input.value = '';
  appendAiMessage('user', imageBase64 ? `📷 [Receipt Attached] ${text}` : text);
  state.aiMessages.push({ role: 'user', content: text });

  const sendBtn = document.getElementById('ai-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const autoPilot = document.getElementById('ai-autopilot-toggle')?.checked || false;
    const deepAudit = document.getElementById('ai-deepaudit-toggle')?.checked || false;
    const autoSpeak = document.getElementById('ai-autospeak-toggle')?.checked || false;

    const payload = {
      messages: state.aiMessages.slice(-10),
      support_type: 'financial_advice',
      user_name: state.user?.full_name || 'Chale',
      phone: state.user?.phone || undefined,
      language: state.aiLanguage,
      auto_pilot: autoPilot,
      deep_audit: deepAudit,
    };
    if (imageBase64) {
      payload.image_base64 = imageBase64;
      payload.image_mime_type = imageMime || 'image/jpeg';
    }

    const res = await apiFetch('/support/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const reply = res?.response || 'I processed your request.';
    state.aiMessages.push({ role: 'assistant', content: reply });
    appendAiMessage('assistant', reply);

    // Refresh app data in case AI logged a transaction or updated a budget
    await loadAppData();

    if (autoSpeak && reply) {
      try {
        const ttsRes = await apiFetch('/support/voice/synthesize', {
          method: 'POST',
          body: JSON.stringify({
            text: reply.slice(0, 450),
            voice_name: 'Kore',
          }),
        });
        if (ttsRes?.audio_base64) {
          const mime = ttsRes.audio_mime_type || 'audio/wav';
          const audio = new Audio(`data:${mime};base64,${ttsRes.audio_base64}`);
          audio.play().catch(() => {});
        }
      } catch (ttsErr) {
        console.warn('TTS playback skipped:', ttsErr);
      }
    }
  } catch (err) {
    appendAiMessage('assistant', `Sorry Chale, ${err.message}`);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

async function handleParseSMS() {
  const smsInput = document.getElementById('parser-sms-input').value.trim();
  if (!smsInput) {
    showToast('Please paste an SMS message first.', 'error');
    return;
  }

  showLoading('parser-submit-btn', true);
  try {
    const result = await apiFetch('/transactions/parse-sms', {
      method: 'POST',
      body: JSON.stringify({ sms_text: smsInput, sms: smsInput }),
    });

    state.parsedSMS = result;
    renderParserView();
    showToast('SMS parsed with Gemini AI!');
  } catch (error) {
    showToast(`AI Parsing failed: ${error.message}`, 'error');
  } finally {
    showLoading('parser-submit-btn', false);
  }
}

async function commitParsedTransaction() {
  if (!state.parsedSMS) return;
  const btn = document.getElementById('add-parsed-ledger-btn');
  if (btn) btn.disabled = true;

  try {
    let accountId = state.accounts[0]?.id;
    const momoAcc = state.accounts.find((a) => getAccountKind(a) === 'momo');
    if (momoAcc) accountId = momoAcc.id;

    if (!accountId) {
      showToast('Please create at least one account under Accounts first.', 'error');
      return;
    }

    let categoryId = state.categories[0]?.id;
    const matchedCat = state.categories.find(
      (c) =>
        c.name.toLowerCase() ===
        (state.parsedSMS.category_suggestion || '').toLowerCase()
    );
    if (matchedCat) categoryId = matchedCat.id;

    await apiFetch('/transactions/', {
      method: 'POST',
      body: JSON.stringify({
        account_id: accountId,
        category_id: categoryId,
        amount: parseFloat(state.parsedSMS.amount).toFixed(2),
        transaction_type: state.parsedSMS.transaction_type || 'expense',
        description: state.parsedSMS.description || 'MoMo SMS Transaction',
        transaction_date: new Date().toISOString().split('T')[0],
      }),
    });

    showToast('Transaction saved to ledger!');
    state.parsedSMS = null;
    document.getElementById('parser-sms-input').value = '';
    await loadAppData();
    navigateToView('dashboard');
  } catch (error) {
    showToast(`Failed to save: ${error.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleAddTransaction(e) {
  e.preventDefault();
  const errorBanner = document.getElementById('txn-error');
  errorBanner.classList.add('hidden');

  const amount = parseFloat(document.getElementById('txn-amount').value);
  const type = document.getElementById('txn-type').value;
  const desc = document.getElementById('txn-desc').value.trim();
  const accId = document.getElementById('txn-account').value;
  const catId = document.getElementById('txn-category').value;
  const dateStr = document.getElementById('txn-date').value;

  try {
    await apiFetch('/transactions/', {
      method: 'POST',
      body: JSON.stringify({
        account_id: accId,
        category_id: catId,
        amount: amount.toFixed(2),
        transaction_type: type,
        description: desc,
        transaction_date: dateStr,
      }),
    });

    document.getElementById('txn-modal').classList.remove('active');
    document.getElementById('txn-form').reset();
    document.getElementById('txn-date').value = new Date()
      .toISOString()
      .split('T')[0];

    await loadAppData();
    renderActiveView(state.currentView);
    showToast('Transaction logged!');
  } catch (error) {
    errorBanner.textContent = error.message;
    errorBanner.classList.remove('hidden');
  }
}

async function handleAddAccount(e) {
  e.preventDefault();
  const errorBanner = document.getElementById('account-error');
  errorBanner.classList.add('hidden');

  const name = document.getElementById('account-name').value.trim();
  const providerRaw = document.getElementById('account-provider').value;
  const balance = parseFloat(
    document.getElementById('account-balance').value || 0
  );

  const accountTypeMap = {
    momo: 'mobile_money',
    mobile_money: 'mobile_money',
    bank: 'bank',
    cash: 'cash',
  };
  const accountType = accountTypeMap[providerRaw] || 'mobile_money';
  let providerName = null;
  if (accountType === 'mobile_money') {
    providerName = name.toLowerCase().includes('telecel')
      ? 'Telecel Cash'
      : name.toLowerCase().includes('airtel')
      ? 'AT Money'
      : 'MTN MoMo';
  } else if (accountType === 'bank') {
    providerName = name;
  }

  try {
    await apiFetch('/accounts/', {
      method: 'POST',
      body: JSON.stringify({
        name,
        account_type: accountType,
        provider: providerName,
        opening_balance: parseFloat(balance.toFixed(2)),
      }),
    });

    document.getElementById('account-modal').classList.remove('active');
    document.getElementById('account-form').reset();

    await loadAppData();
    renderActiveView(state.currentView);
    showToast('Account created!');
  } catch (error) {
    errorBanner.textContent = error.message;
    errorBanner.classList.remove('hidden');
  }
}

async function handleUpsertBudget(e) {
  e.preventDefault();
  const errorBanner = document.getElementById('budget-error');
  errorBanner.classList.add('hidden');

  const categoryId = document.getElementById('budget-category').value;
  const limit = parseFloat(document.getElementById('budget-limit').value);

  try {
    await apiFetch('/budgets/', {
      method: 'POST',
      body: JSON.stringify({
        category_id: categoryId,
        amount: parseFloat(limit.toFixed(2)),
        alert_at_percent: 80,
      }),
    });

    document.getElementById('budget-modal').classList.remove('active');
    document.getElementById('budget-form').reset();

    await loadAppData();
    renderActiveView(state.currentView);
    showToast('Monthly budget limit saved!');
  } catch (error) {
    errorBanner.textContent = error.message;
    errorBanner.classList.remove('hidden');
  }
}

async function handleGenerate503020() {
  const incomeInput = document.getElementById('generator-income-input');
  const income = parseFloat(incomeInput?.value || 0);
  if (!income || income < 100) {
    showToast('Enter a valid monthly income (at least GH₵ 100).', 'error');
    return;
  }

  const expenseCats = state.categories.filter(
    (c) => !c.category_type || c.category_type === 'expense'
  );
  const cats = (expenseCats.length > 0 ? expenseCats : state.categories).slice(
    0,
    5
  );
  if (cats.length === 0) {
    showToast('No categories available to allocate budgets.', 'error');
    return;
  }

  showLoading('generate-503020-btn', true);
  try {
    const weights = [0.3, 0.2, 0.15, 0.15, 0.2];
    for (let i = 0; i < cats.length; i++) {
      const share = Math.max(50, Math.round(income * (weights[i] || 0.15)));
      await apiFetch('/budgets/', {
        method: 'POST',
        body: JSON.stringify({
          category_id: cats[i].id,
          amount: parseFloat(share.toFixed(2)),
          alert_at_percent: 80,
        }),
      });
    }
    await loadAppData();
    renderBudgetsView();
    showToast('50/30/20 Smart Budgets generated!');
  } catch (err) {
    showToast(`Budget generation paused: ${err.message}`, 'error');
  } finally {
    showLoading('generate-503020-btn', false);
  }
}

async function handleExportCSV() {
  if (state.transactions.length === 0) {
    showToast('No transactions to export.', 'error');
    return;
  }
  const headers = ['Date', 'Type', 'Category', 'Account', 'Amount (GHS)', 'Description'];
  const rows = state.transactions.map((t) => {
    const acc = getTxnAccountName(t);
    const cat = getTxnCategoryName(t);
    return [
      t.transaction_date,
      t.transaction_type,
      `"${cat.replace(/"/g, '""')}"`,
      `"${acc.replace(/"/g, '""')}"`,
      t.amount,
      `"${(t.description || '').replace(/"/g, '""')}"`,
    ].join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CediSmart_Ledger_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV ledger exported!');
}

function compressAvatarImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

window.handleDeleteTransaction = async function (txnId) {
  if (!confirm('Delete this transaction record?')) return;
  try {
    await apiFetch(`/transactions/${txnId}`, { method: 'DELETE' });
    await loadAppData();
    renderActiveView(state.currentView);
    showToast('Transaction deleted.');
  } catch (error) {
    showToast(`Failed to delete: ${error.message}`, 'error');
  }
};

window.handleDeleteAccount = async function (accountId) {
  if (!confirm('Remove this account from your active ledger?')) return;
  try {
    await apiFetch(`/accounts/${accountId}`, { method: 'DELETE' });
    await loadAppData();
    renderActiveView(state.currentView);
    showToast('Account removed.');
  } catch (error) {
    showToast(`Failed to remove account: ${error.message}`, 'error');
  }
};

window.handleDeleteBudget = async function (budgetId) {
  if (!confirm('Delete this monthly budget limit?')) return;
  try {
    await apiFetch(`/budgets/${budgetId}`, { method: 'DELETE' });
    await loadAppData();
    renderActiveView(state.currentView);
    showToast('Budget limit removed.');
  } catch (error) {
    showToast(`Failed to delete budget: ${error.message}`, 'error');
  }
};

// ---------------------------------------------------------------------------
// 9. INITIALIZATION & EVENT LISTENERS
// ---------------------------------------------------------------------------
function applyTheme(mode) {
  const isLight = mode === 'light';
  document.body.classList.toggle('light-theme', isLight);
  localStorage.setItem('cedismart_theme', isLight ? 'light' : 'dark');
  const icon = isLight ? '🌙' : '☀️';
  const authBtn = document.getElementById('auth-theme-toggle');
  const appBtn = document.getElementById('app-theme-toggle');
  if (authBtn) authBtn.textContent = icon;
  if (appBtn) appBtn.textContent = icon;
}

document.addEventListener('DOMContentLoaded', async () => {
  // 0. Theme Initialization
  const savedTheme = localStorage.getItem('cedismart_theme') || 'dark';
  applyTheme(savedTheme);

  const toggleTheme = () => {
    const next = document.body.classList.contains('light-theme') ? 'dark' : 'light';
    applyTheme(next);
  };
  document.getElementById('auth-theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('app-theme-toggle')?.addEventListener('click', toggleTheme);
  document.getElementById('theme-btn-light')?.addEventListener('click', () => applyTheme('light'));
  document.getElementById('theme-btn-dark')?.addEventListener('click', () => applyTheme('dark'));

  // Date Header
  const today = new Date();
  const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
  const dateDisplay = document.getElementById('live-date-display');
  if (dateDisplay) {
    dateDisplay.textContent = today.toLocaleDateString('en-US', options);
  }

  const dateInput = document.getElementById('txn-date');
  if (dateInput) {
    dateInput.value = today.toISOString().split('T')[0];
  }

  // 1. Check Login Status
  if (state.token) {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    await fetchUserProfile();
    await loadAppData();
    navigateToView('dashboard');
  } else {
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('auth-container').classList.remove('hidden');
  }

  // 2. Auth Listeners
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('logout-btn')?.addEventListener('click', logoutUser);

  // 3. Mobile Drawer & Navigation
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  mobileMenuBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    backdrop?.classList.toggle('hidden', !sidebar?.classList.contains('open'));
  });
  backdrop?.addEventListener('click', closeMobileSidebar);

  document.querySelectorAll('.nav-item, .mobile-tab-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      navigateToView(view);
    });
  });

  document.getElementById('dash-view-all-txns')?.addEventListener('click', () => navigateToView('transactions'));
  document.getElementById('dash-view-all-budgets')?.addEventListener('click', () => navigateToView('budgets'));
  document.getElementById('header-ai-btn')?.addEventListener('click', () => navigateToView('parser'));
  document.getElementById('sidebar-profile-trigger')?.addEventListener('click', () => navigateToView('settings'));
  document.getElementById('header-profile-btn')?.addEventListener('click', () => navigateToView('settings'));

  // Quick-Action Liquid Glass Squish Buttons on Dashboard
  document.getElementById('qa-add-expense')?.addEventListener('click', () => {
    document.getElementById('txn-modal')?.classList.add('active');
  });
  document.getElementById('qa-import-sms')?.addEventListener('click', () => {
    navigateToView('parser');
    setTimeout(() => document.getElementById('parser-sms-input')?.focus(), 150);
  });
  document.getElementById('qa-open-accounts')?.addEventListener('click', () => navigateToView('accounts'));
  document.getElementById('qa-open-aicfo')?.addEventListener('click', () => {
    navigateToView('parser');
    setTimeout(() => document.getElementById('ai-chat-input')?.focus(), 150);
  });

  // Privacy Balance Masking Toggle
  document.getElementById('mask-balance-btn')?.addEventListener('click', () => {
    state.isMasked = !state.isMasked;
    localStorage.setItem('cedismart_mask_balance', String(state.isMasked));
    renderActiveView(state.currentView);
  });

  // 4. Modals Triggers
  const txnModal = document.getElementById('txn-modal');
  const accountModal = document.getElementById('account-modal');
  const budgetModal = document.getElementById('budget-modal');

  document.getElementById('quick-add-btn')?.addEventListener('click', () => txnModal.classList.add('active'));
  document.getElementById('add-txn-btn')?.addEventListener('click', () => txnModal.classList.add('active'));
  document.getElementById('modal-close-btn')?.addEventListener('click', () => txnModal.classList.remove('active'));
  document.getElementById('modal-cancel-btn')?.addEventListener('click', () => txnModal.classList.remove('active'));

  document.getElementById('add-account-btn')?.addEventListener('click', () => accountModal.classList.add('active'));
  document.getElementById('account-modal-close-btn')?.addEventListener('click', () => accountModal.classList.remove('active'));
  document.getElementById('account-modal-cancel-btn')?.addEventListener('click', () => accountModal.classList.remove('active'));

  document.getElementById('open-budget-modal-btn')?.addEventListener('click', () => budgetModal.classList.add('active'));
  document.getElementById('budget-modal-close-btn')?.addEventListener('click', () => budgetModal.classList.remove('active'));
  document.getElementById('budget-modal-cancel-btn')?.addEventListener('click', () => budgetModal.classList.remove('active'));

  document.getElementById('txn-form')?.addEventListener('submit', handleAddTransaction);
  document.getElementById('account-form')?.addEventListener('submit', handleAddAccount);
  document.getElementById('budget-form')?.addEventListener('submit', handleUpsertBudget);
  document.getElementById('generate-503020-btn')?.addEventListener('click', handleGenerate503020);
  document.getElementById('export-csv-btn')?.addEventListener('click', handleExportCSV);

  // 5. AI CFO Chat & SMS Parser
  document.getElementById('parser-submit-btn')?.addEventListener('click', handleParseSMS);
  document.getElementById('fill-sample-sms-btn')?.addEventListener('click', () => {
    const input = document.getElementById('parser-sms-input');
    if (input) {
      input.value =
        'Payment made for GHS 85.00 to SHELL AIRPORT SERVICE STATION. Current Balance: GHS 1,240.50. Transaction ID: 4920184920. Fee charged: GHS 0.50.';
    }
  });

  document.getElementById('ai-chat-form')?.addEventListener('submit', (e) => handleAiChatSubmit(e));

  document.querySelectorAll('#ai-lang-selector .lang-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#ai-lang-selector .lang-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      state.aiLanguage = pill.getAttribute('data-lang') || 'english';
      showToast(`AI Language set to ${pill.textContent.trim()}`);
    });
  });

  document.getElementById('ai-receipt-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      handleAiChatSubmit(null, base64, file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);
  });

  // 6. Settings Profile, Avatar & Feedback Forms
  document.getElementById('avatar-upload-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressAvatarImage(file);
      updateAvatarElements(dataUrl);
      await apiFetch('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ avatar_url: dataUrl }),
      });
      showToast('Profile photo updated and synced!');
    } catch (err) {
      showToast(`Photo update failed: ${err.message}`, 'error');
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('avatar-reset-btn')?.addEventListener('click', async () => {
    try {
      updateAvatarElements(DEFAULT_AVATAR_URL);
      await apiFetch('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ avatar_url: DEFAULT_AVATAR_URL }),
      });
      showToast('Profile photo reset to default.');
    } catch (err) {
      showToast(`Reset failed: ${err.message}`, 'error');
    }
  });

  document.getElementById('profile-update-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('settings-fullname').value.trim();
    const email = document.getElementById('settings-email').value.trim();
    try {
      await apiFetch('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: fullName || undefined,
          email: email || undefined,
        }),
      });
      await fetchUserProfile();
      showToast('Profile updated!');
    } catch (err) {
      showToast(`Update failed: ${err.message}`, 'error');
    }
  });

  document.getElementById('web-feedback-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kind = document.getElementById('feedback-kind').value;
    const title = document.getElementById('feedback-title').value.trim();
    const desc = document.getElementById('feedback-desc').value.trim();
    try {
      if (kind === 'bug') {
        await apiFetch('/users/report-bug', {
          method: 'POST',
          body: JSON.stringify({
            title,
            description: desc,
            device_info: navigator.userAgent,
          }),
        });
      } else {
        await apiFetch('/support/feedback', {
          method: 'POST',
          body: JSON.stringify({
            feedback_type: kind,
            description: `${title} — ${desc}`,
            user_name: state.user?.full_name || 'Web User',
            phone: state.user?.phone || undefined,
          }),
        });
      }
      document.getElementById('web-feedback-form').reset();
      showToast('Thank you! Your submission was received.');
    } catch (err) {
      showToast(`Submission failed: ${err.message}`, 'error');
    }
  });

  // 7. Pagination & Search Filters
  document.getElementById('pagination-prev')?.addEventListener('click', async () => {
    if (state.pagination.page > 1) {
      state.pagination.page--;
      await loadAppData();
      renderTransactionsView();
    }
  });

  document.getElementById('pagination-next')?.addEventListener('click', async () => {
    const end = state.pagination.page * state.pagination.per_page;
    if (end < state.pagination.total) {
      state.pagination.page++;
      await loadAppData();
      renderTransactionsView();
    }
  });

  const filterInput = document.getElementById('txn-search-input');
  const filterType = document.getElementById('txn-type-filter');

  const executeFilters = async () => {
    const search = filterInput.value.trim();
    const type = filterType.value;
    state.pagination.page = 1;

    let query = `/transactions/?page=1&per_page=${state.pagination.per_page}`;
    if (search) query += `&search=${encodeURIComponent(search)}`;
    if (type) query += `&transaction_type=${type}`;

    try {
      const transactionsPage = await apiFetch(query);
      state.transactions = transactionsPage?.data || [];
      state.pagination.total = transactionsPage?.pagination?.total || 0;
      renderTransactionsView();
    } catch (e) {
      console.warn('Failed to filter transactions:', e);
    }
  };

  filterInput?.addEventListener('input', executeFilters);
  filterType?.addEventListener('change', executeFilters);
});
