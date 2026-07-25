// app.js - CediSmart Web App Main Application Logic

// ---------------------------------------------------------------------------
// 1. API CONFIGURATION & STATE
// ---------------------------------------------------------------------------
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000/api/v1'
  : 'https://cedismart-api.onrender.com/api/v1';

const state = {
  token: localStorage.getItem('access_token') || null,
  refreshToken: localStorage.getItem('refresh_token') || null,
  user: null,
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  pagination: {
    page: 1,
    per_page: 10,
    total: 0
  },
  currentView: 'dashboard',
  parsedSMS: null // Temporarily holds last parsed transaction
};

// ---------------------------------------------------------------------------
// 2. HELPER FUNCTIONS
// ---------------------------------------------------------------------------
const getHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  return headers;
};

const formatCedi = (amount) => {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS'
  }).format(amount).replace('GHS', '₵');
};

const formatDate = (dateStr) => {
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

// ---------------------------------------------------------------------------
// 3. API CLIENT CALLS
// ---------------------------------------------------------------------------
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = getHeaders();
  
  const config = {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  };

  try {
    const response = await fetch(url, config);
    if (response.status === 401) {
      // Token expired or invalid — clear state and redirect to login
      logoutUser();
      throw new Error('Session expired. Please log in again.');
    }
    
    if (response.status === 204) {
      return null;
    }

    const data = await response.json();
    if (!response.ok) {
      const errorMessage = data?.error?.message || data?.detail || 'An API error occurred';
      throw new Error(errorMessage);
    }
    return data;
  } catch (error) {
    console.error(`API Fetch Error on ${endpoint}:`, error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 4. AUTHENTICATION (LOGIN/LOGOUT)
// ---------------------------------------------------------------------------
async function handleLogin(e) {
  e.preventDefault();
  const phoneInput = document.getElementById('login-phone').value.trim();
  const pinInput = document.getElementById('login-pin').value.trim();
  const errorBanner = document.getElementById('login-error');
  
  errorBanner.classList.add('hidden');
  showLoading('login-submit-btn', true);

  try {
    const response = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone: phoneInput, pin: pinInput })
    });

    // Save tokens
    state.token = response.access_token;
    state.refreshToken = response.refresh_token;
    localStorage.setItem('access_token', response.access_token);
    localStorage.setItem('refresh_token', response.refresh_token);

    // Fetch user details
    await fetchUserProfile();
    
    // Switch container
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    
    // Reset forms
    document.getElementById('login-form').reset();
    
    // Load initial data
    await loadAppData();
    navigateToView('dashboard');
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
    
    // Render profile sidebar
    document.getElementById('profile-name').textContent = user.full_name || 'Cedi User';
    document.getElementById('profile-phone').textContent = user.phone;
    
    // Avatar initials
    const initials = (user.full_name || 'Cedi User')
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    document.getElementById('user-avatar-initials').textContent = initials;
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    logoutUser();
  }
}

function logoutUser() {
  // If we have a refresh token, notify the server to blacklist it
  if (state.refreshToken && state.token) {
    fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ refresh_token: state.refreshToken })
    }).catch(err => console.warn('Could not revoke refresh token on logout:', err));
  }

  // Clear local state
  state.token = null;
  state.refreshToken = null;
  state.user = null;
  state.accounts = [];
  state.categories = [];
  state.transactions = [];
  state.budgets = [];

  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');

  // Swap containers
  document.getElementById('app-container').classList.add('hidden');
  document.getElementById('auth-container').classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// 5. APPLIATION DATA LOADERS
// ---------------------------------------------------------------------------
async function loadAppData() {
  try {
    // 1. Fetch categories & accounts first (core metadata dependencies)
    const [accountsData, categoriesData] = await Promise.all([
      apiFetch('/accounts/'),
      apiFetch('/categories/')
    ]);
    state.accounts = accountsData || [];
    state.categories = categoriesData || [];

    // 2. Fetch transaction page and budgets
    const [transactionsPage, budgetsData] = await Promise.all([
      apiFetch(`/transactions/?page=${state.pagination.page}&per_page=${state.pagination.per_page}`),
      apiFetch('/budgets/current')
    ]);
    
    state.transactions = transactionsPage?.data || [];
    state.pagination.total = transactionsPage?.pagination?.total || 0;
    state.budgets = budgetsData || [];

    // Populate modal drop downs
    populateFormSelects();
  } catch (error) {
    console.error('Failed to load application data:', error);
  }
}

function populateFormSelects() {
  const accountSelects = [
    document.getElementById('txn-account')
  ];
  const categorySelects = [
    document.getElementById('txn-category')
  ];

  // Populate Accounts
  accountSelects.forEach(select => {
    if (!select) return;
    select.innerHTML = state.accounts.map(acc => 
      `<option value="${acc.id}">${acc.name} (${acc.provider.toUpperCase()})</option>`
    ).join('');
  });

  // Populate Categories
  categorySelects.forEach(select => {
    if (!select) return;
    select.innerHTML = state.categories.map(cat => 
      `<option value="${cat.id}">${cat.name}</option>`
    ).join('');
  });
}

// ---------------------------------------------------------------------------
// 6. ROUTING / NAVIGATION
// ---------------------------------------------------------------------------
function navigateToView(viewName) {
  state.currentView = viewName;
  
  // Update sidebar buttons
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.getAttribute('data-view') === viewName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Swap sections
  document.querySelectorAll('.view-section').forEach(sec => {
    if (sec.id === `view-${viewName}`) {
      sec.classList.remove('hidden');
    } else {
      sec.classList.add('hidden');
    }
  });

  // Update headers
  const viewTitles = {
    dashboard: { title: 'Dashboard', subtitle: "Here's your real-time financial standing" },
    accounts: { title: 'Accounts', subtitle: 'Manage your Bank, MoMo, and Cash ledgers' },
    transactions: { title: 'Transaction Ledger', subtitle: 'Search, filter, and audit your records' },
    parser: { title: 'Gemini AI SMS Parser', subtitle: 'Automatically process raw text alerts on-the-fly' },
    reports: { title: 'Reports & Spending Trends', subtitle: 'Visual breakdown of your category budgets' }
  };

  const headerConfig = viewTitles[viewName] || { title: 'CediSmart', subtitle: '' };
  document.getElementById('view-title').textContent = headerConfig.title;
  document.getElementById('view-subtitle').textContent = headerConfig.subtitle;

  // Trigger local view rendering
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
    case 'parser':
      renderParserView();
      break;
    case 'reports':
      renderReportsView();
      break;
  }
}

// ---------------------------------------------------------------------------
// 7. VIEW RENDERING ENGINE
// ---------------------------------------------------------------------------

// --- A. DASHBOARD VIEW ---
function renderDashboardView() {
  // Compute balances
  let totalBalance = 0;
  let momoTotal = 0;
  let bankTotal = 0;
  let cashTotal = 0;

  state.accounts.forEach(acc => {
    const bal = parseFloat(acc.balance || 0);
    totalBalance += bal;
    
    if (acc.provider === 'momo') momoTotal += bal;
    else if (acc.provider === 'bank') bankTotal += bal;
    else if (acc.provider === 'cash') cashTotal += bal;
  });

  // Render values
  document.getElementById('dash-net-balance').textContent = formatCedi(totalBalance);
  document.getElementById('dash-momo-balance').textContent = formatCedi(momoTotal);
  document.getElementById('dash-bank-balance').textContent = formatCedi(bankTotal);
  document.getElementById('dash-cash-balance').textContent = formatCedi(cashTotal);

  // Render Top 5 Recent Transactions
  const tbody = document.getElementById('dash-transactions-body');
  if (state.transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No transactions found. Click Log Transaction to add one!</td></tr>`;
  } else {
    tbody.innerHTML = state.transactions.slice(0, 5).map(txn => {
      const acc = state.accounts.find(a => a.id === txn.account_id)?.name || 'Unknown Account';
      const cat = state.categories.find(c => c.id === txn.category_id)?.name || 'Uncategorized';
      const amountClass = txn.transaction_type === 'income' ? 'text-income' : 'text-expense';
      const amountPrefix = txn.transaction_type === 'income' ? '+' : '-';
      
      return `
        <tr>
          <td>${formatDate(txn.transaction_date)}</td>
          <td class="font-medium">${txn.description}</td>
          <td><span class="badge-tag">${cat}</span></td>
          <td class="text-secondary">${acc}</td>
          <td class="text-right ${amountClass} font-semibold">${amountPrefix} ${formatCedi(txn.amount)}</td>
        </tr>
      `;
    }).join('');
  }

  // Render Budgets Progress
  const budgetList = document.getElementById('dash-budgets-list');
  if (state.budgets.length === 0) {
    budgetList.innerHTML = `<div class="text-center text-muted py-4">No monthly budgets set up. Click Manage to configure category limits.</div>`;
  } else {
    budgetList.innerHTML = state.budgets.slice(0, 4).map(b => {
      const catName = state.categories.find(c => c.id === b.category_id)?.name || 'Other';
      const limit = parseFloat(b.amount_limit || 0);
      const spent = parseFloat(b.amount_spent || 0);
      const percent = limit > 0 ? (spent / limit) * 100 : 0;
      
      let progressColor = 'success';
      if (percent >= 100) progressColor = 'danger';
      else if (percent >= 80) progressColor = 'warning';

      return `
        <div class="budget-item">
          <div class="budget-info">
            <span class="budget-name">${catName}</span>
            <span class="budget-values">${formatCedi(spent)} / ${formatCedi(limit)}</span>
          </div>
          <div class="progress-bar-wrapper">
            <div class="progress-bar ${progressColor}" style="width: ${Math.min(percent, 100)}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// --- B. ACCOUNTS VIEW ---
function renderAccountsView() {
  const container = document.getElementById('accounts-list-container');
  if (state.accounts.length === 0) {
    container.innerHTML = `
      <div class="panel-card text-center py-5 w-full">
        <div class="empty-state">
          <span class="empty-icon">🏦</span>
          <p>No accounts configured yet. Add an account to get started.</p>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = state.accounts.map(acc => {
      const providerClass = `provider-${acc.provider}`;
      return `
        <div class="account-card ${providerClass}">
          <span class="account-type-tag">${acc.provider}</span>
          <div>
            <h4>${acc.name}</h4>
          </div>
          <div>
            <span class="account-balance-amount">${formatCedi(acc.balance)}</span>
          </div>
          <div class="account-footer">
            <span class="account-id-hint">ID: ${acc.id.slice(0, 8)}...</span>
            <button class="btn-action-delete" onclick="handleDeleteAccount('${acc.id}')" title="Delete Account">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
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

  tbody.innerHTML = state.transactions.map(txn => {
    const acc = state.accounts.find(a => a.id === txn.account_id)?.name || 'Unknown Account';
    const cat = state.categories.find(c => c.id === txn.category_id)?.name || 'Uncategorized';
    const amountClass = txn.transaction_type === 'income' ? 'text-income' : 'text-expense';
    const amountPrefix = txn.transaction_type === 'income' ? '+' : '-';
    
    return `
      <tr>
        <td>${formatDate(txn.transaction_date)}</td>
        <td class="font-medium">${txn.description}</td>
        <td><span class="badge-tag">${cat}</span></td>
        <td class="text-secondary">${acc}</td>
        <td><span class="badge-type ${txn.transaction_type}">${txn.transaction_type}</span></td>
        <td class="text-right ${amountClass} font-semibold">${amountPrefix} ${formatCedi(txn.amount)}</td>
        <td class="text-center">
          <button class="btn-action-delete" onclick="handleDeleteTransaction('${txn.id}')" title="Delete record">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Handle pagination display
  const start = (state.pagination.page - 1) * state.pagination.per_page + 1;
  const end = Math.min(state.pagination.page * state.pagination.per_page, state.pagination.total);
  document.getElementById('pagination-text').textContent = `Showing ${state.pagination.total === 0 ? 0 : start}-${end} of ${state.pagination.total}`;

  document.getElementById('pagination-prev').disabled = state.pagination.page === 1;
  document.getElementById('pagination-next').disabled = end >= state.pagination.total;
}

// --- D. GEMINI AI PARSER VIEW ---
function renderParserView() {
  const container = document.getElementById('parser-preview-body');
  
  if (!state.parsedSMS) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🤖</span>
        <p>Extracted variables will be displayed here in real time once you click Parse.</p>
      </div>
    `;
    return;
  }

  const { amount, transaction_type, description, category_suggestion, notes } = state.parsedSMS;
  const typeClass = transaction_type === 'income' ? 'badge-type income' : 'badge-type expense';

  container.innerHTML = `
    <div class="parsed-record-box">
      <div class="parsed-header-summary">
        <div>
          <span class="parsed-amount-label">Transaction Value</span>
          <h4 class="parsed-amount-value">${formatCedi(amount)}</h4>
        </div>
        <span class="${typeClass}">${transaction_type}</span>
      </div>

      <div class="parsed-details-list">
        <div class="parsed-field-row">
          <span class="parsed-field-label">Description / Sender:</span>
          <span class="parsed-field-val">${description}</span>
        </div>
        <div class="parsed-field-row">
          <span class="parsed-field-label">AI Suggested Category:</span>
          <span class="parsed-field-val"><span class="badge-tag">${category_suggestion || 'Other'}</span></span>
        </div>
        <div class="parsed-field-row">
          <span class="parsed-field-label">Extra Notes:</span>
          <span class="parsed-field-val">${notes || 'None'}</span>
        </div>
      </div>

      <button id="add-parsed-ledger-btn" class="btn btn-primary btn-block" onclick="commitParsedTransaction()">
        <span>💾 Save Transaction to Ledger</span>
      </button>
    </div>
  `;
}

// --- E. REPORTS VIEW ---
function renderReportsView() {
  // 1. Calculate category breakdown percentages
  const categoriesTotal = {};
  let totalExpenses = 0;
  let totalIncome = 0;

  state.transactions.forEach(txn => {
    const val = parseFloat(txn.amount || 0);
    if (txn.transaction_type === 'expense') {
      totalExpenses += val;
      const catName = state.categories.find(c => c.id === txn.category_id)?.name || 'Other';
      categoriesTotal[catName] = (categoriesTotal[catName] || 0) + val;
    } else {
      totalIncome += val;
    }
  });

  // Update summary totals
  document.getElementById('report-total-income').textContent = formatCedi(totalIncome);
  document.getElementById('report-total-expense').textContent = formatCedi(totalExpenses);
  document.getElementById('report-net-savings').textContent = formatCedi(totalIncome - totalExpenses);

  // Render category breakdown list
  const container = document.getElementById('report-categories-container');
  const sortedCategories = Object.entries(categoriesTotal).sort((a, b) => b[1] - a[1]);
  
  if (sortedCategories.length === 0) {
    container.innerHTML = `<div class="text-center text-muted py-4">No expense logs to chart. Set categories and log expenses!</div>`;
  } else {
    container.innerHTML = sortedCategories.map(([name, spent]) => {
      const pct = totalExpenses > 0 ? (spent / totalExpenses) * 100 : 0;
      return `
        <div class="category-report-row">
          <div class="category-report-meta">
            <span class="category-report-name">${name}</span>
            <span class="category-report-percent">${formatCedi(spent)} (${pct.toFixed(1)}%)</span>
          </div>
          <div class="progress-bar-wrapper">
            <div class="progress-bar success" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// ---------------------------------------------------------------------------
// 8. INTERACTIVE ACTIONS / EVENT HANDLERS
// ---------------------------------------------------------------------------
async function handleParseSMS() {
  const smsInput = document.getElementById('parser-sms-input').value.trim();
  if (!smsInput) return;

  showLoading('parser-submit-btn', true);
  try {
    const result = await apiFetch('/transactions/parse-sms', {
      method: 'POST',
      body: JSON.stringify({ sms: smsInput })
    });
    
    state.parsedSMS = result;
    renderParserView();
  } catch (error) {
    alert(`AI Parsing failed: ${error.message}`);
  } finally {
    showLoading('parser-submit-btn', false);
  }
}

async function commitParsedTransaction() {
  if (!state.parsedSMS) return;
  const btn = document.getElementById('add-parsed-ledger-btn');
  if (btn) btn.disabled = true;

  try {
    // 1. Resolve suitable account (first momo account if available, else first account)
    let accountId = state.accounts[0]?.id;
    const momoAcc = state.accounts.find(a => a.provider === 'momo');
    if (momoAcc) accountId = momoAcc.id;

    if (!accountId) {
      alert('Please create at least one account first under Accounts view.');
      return;
    }

    // 2. Resolve category id (find match or default to 'Other')
    let categoryId = state.categories[0]?.id;
    const matchedCat = state.categories.find(c => c.name.toLowerCase() === (state.parsedSMS.category_suggestion || '').toLowerCase());
    if (matchedCat) categoryId = matchedCat.id;

    // 3. Post to API
    await apiFetch('/transactions/', {
      method: 'POST',
      body: JSON.stringify({
        account_id: accountId,
        category_id: categoryId,
        amount: parseFloat(state.parsedSMS.amount).toFixed(2),
        transaction_type: state.parsedSMS.transaction_type,
        description: state.parsedSMS.description,
        transaction_date: new Date().toISOString().split('T')[0]
      })
    });

    alert('Transaction added to ledger successfully!');
    state.parsedSMS = null;
    document.getElementById('parser-sms-input').value = '';
    
    // Reload and redirect
    await loadAppData();
    navigateToView('dashboard');
  } catch (error) {
    alert(`Failed to save parsed transaction: ${error.message}`);
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
        transaction_date: dateStr
      })
    });

    // Close modal
    document.getElementById('txn-modal').classList.remove('active');
    document.getElementById('txn-form').reset();
    
    // Reload data & refresh view
    await loadAppData();
    renderActiveView(state.currentView);
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
  const provider = document.getElementById('account-provider').value;
  const balance = parseFloat(document.getElementById('account-balance').value || 0);

  try {
    await apiFetch('/accounts/', {
      method: 'POST',
      body: JSON.stringify({
        name: name,
        provider: provider,
        opening_balance: balance.toFixed(2)
      })
    });

    // Close modal
    document.getElementById('account-modal').classList.remove('active');
    document.getElementById('account-form').reset();
    
    // Reload and render
    await loadAppData();
    renderActiveView(state.currentView);
  } catch (error) {
    errorBanner.textContent = error.message;
    errorBanner.classList.remove('hidden');
  }
}

// Exposed to global context for easy element onclick triggers
window.handleDeleteTransaction = async function(txnId) {
  if (!confirm('Are you sure you want to delete this transaction record?')) return;
  try {
    await apiFetch(`/transactions/${txnId}`, { method: 'DELETE' });
    await loadAppData();
    renderActiveView(state.currentView);
  } catch (error) {
    alert(`Failed to delete transaction: ${error.message}`);
  }
};

window.handleDeleteAccount = async function(accountId) {
  if (!confirm('Delete account? WARNING: Soft-deactivating active accounts preserves reports. Hard deletes are permanent.')) return;
  try {
    await apiFetch(`/accounts/${accountId}`, { method: 'DELETE' });
    await loadAppData();
    renderActiveView(state.currentView);
  } catch (error) {
    alert(`Failed to delete account: ${error.message}`);
  }
};

// ---------------------------------------------------------------------------
// 9. EVENT LISTENERS SETUP
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Set date headers
  const today = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('live-date-display').textContent = today.toLocaleDateString('en-US', options);

  // Set default date picker values
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
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', logoutUser);

  // 3. Navigation Swapping
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      navigateToView(view);
    });
  });

  document.getElementById('dash-view-all-txns').addEventListener('click', () => navigateToView('transactions'));
  document.getElementById('dash-view-all-budgets').addEventListener('click', () => navigateToView('reports'));

  // 4. Modals Triggers
  const txnModal = document.getElementById('txn-modal');
  const accountModal = document.getElementById('account-modal');

  document.getElementById('quick-add-btn').addEventListener('click', () => txnModal.classList.add('active'));
  document.getElementById('add-txn-btn').addEventListener('click', () => txnModal.classList.add('active'));
  document.getElementById('modal-close-btn').addEventListener('click', () => txnModal.classList.remove('active'));
  document.getElementById('modal-cancel-btn').addEventListener('click', () => txnModal.classList.remove('active'));

  document.getElementById('add-account-btn').addEventListener('click', () => accountModal.classList.add('active'));
  document.getElementById('account-modal-close-btn').addEventListener('click', () => accountModal.classList.remove('active'));
  document.getElementById('account-modal-cancel-btn').addEventListener('click', () => accountModal.classList.remove('active'));

  // Submit handlers
  document.getElementById('txn-form').addEventListener('submit', handleAddTransaction);
  document.getElementById('account-form').addEventListener('submit', handleAddAccount);

  // 5. AI Parser Trigger
  document.getElementById('parser-submit-btn').addEventListener('click', handleParseSMS);

  // 6. Pagination handlers
  document.getElementById('pagination-prev').addEventListener('click', async () => {
    if (state.pagination.page > 1) {
      state.pagination.page--;
      await loadAppData();
      renderTransactionsView();
    }
  });

  document.getElementById('pagination-next').addEventListener('click', async () => {
    const end = state.pagination.page * state.pagination.per_page;
    if (end < state.pagination.total) {
      state.pagination.page++;
      await loadAppData();
      renderTransactionsView();
    }
  });

  // 7. Filter and Search listeners
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

  filterInput.addEventListener('input', executeFilters);
  filterType.addEventListener('change', executeFilters);
});
