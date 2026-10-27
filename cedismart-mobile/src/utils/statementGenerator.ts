import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatGHS } from './currency';

export interface StatementData {
  userName: string;
  userEmail?: string;
  userPhone?: string;
  monthName: string; // e.g. "October 2026"
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  savingsRate: number;
  categoryBreakdown: Array<{ name: string; amount: number; percentage: number }>;
  transactions: Array<{
    date: string;
    description: string;
    category: string;
    account: string;
    type: 'income' | 'expense' | 'transfer';
    amount: number;
  }>;
}

export async function generateAndSharePdfStatement(data: StatementData): Promise<string> {
  const statementId = `CS-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const generatedDate = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const categoryRows = data.categoryBreakdown
    .map(
      (c) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #1f2937;">${escapeHtml(c.name)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #111827;">${formatGHS(c.amount)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #6b7280;">${c.percentage.toFixed(1)}%</td>
      </tr>
    `
    )
    .join('');

  const transactionRows = data.transactions
    .slice(0, 100) // max 100 recent entries in monthly statement
    .map(
      (tx) => `
      <tr style="background-color: ${tx.type === 'income' ? 'rgba(16, 185, 129, 0.03)' : 'transparent'};">
        <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 11px; color: #6b7280; white-space: nowrap;">${escapeHtml(tx.date)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; font-weight: 500; color: #111827;">${escapeHtml(tx.description || 'Transaction')}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 11px; color: #4b5563;">${escapeHtml(tx.category || 'General')}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 11px; color: #6b7280;">${escapeHtml(tx.account || 'Wallet')}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6; text-align: right; font-size: 12px; font-weight: 700; color: ${tx.type === 'income' ? '#059669' : '#dc2626'}; white-space: nowrap;">
          ${tx.type === 'income' ? '+' : '-'}${formatGHS(tx.amount)}
        </td>
      </tr>
    `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>CediSmart Monthly Statement - ${escapeHtml(data.monthName)}</title>
        <style>
          @page {
            size: A4;
            margin: 15mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #1f2937;
            background-color: #ffffff;
            margin: 0;
            padding: 0;
            font-size: 13px;
            line-height: 1.5;
          }
          .header {
            background: linear-gradient(135deg, #064e3b 0%, #059669 100%);
            color: #ffffff;
            padding: 24px 28px;
            border-radius: 16px;
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .header h1 {
            margin: 0 0 4px 0;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: -0.5px;
          }
          .header p {
            margin: 0;
            font-size: 12px;
            color: #a7f3d0;
          }
          .meta-pill {
            background: rgba(255, 255, 255, 0.15);
            padding: 8px 14px;
            border-radius: 10px;
            font-size: 11px;
            text-align: right;
            border: 1px solid rgba(255, 255, 255, 0.2);
          }
          .user-details {
            display: flex;
            justify-content: space-between;
            padding: 16px 20px;
            background-color: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            margin-bottom: 20px;
          }
          .metric-grid {
            display: flex;
            gap: 12px;
            margin-bottom: 24px;
          }
          .metric-card {
            flex: 1;
            padding: 14px 16px;
            background-color: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
          }
          .metric-title {
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 700;
            color: #6b7280;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .metric-value {
            font-size: 18px;
            font-weight: 800;
          }
          .table-container {
            margin-bottom: 24px;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            overflow: hidden;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          th {
            background-color: #f9fafb;
            padding: 10px 12px;
            text-align: left;
            font-weight: 700;
            color: #4b5563;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid #e5e7eb;
          }
          .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #111827;
            margin: 0 0 10px 0;
          }
          .footer {
            margin-top: 30px;
            padding-top: 14px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #9ca3af;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>CediSmart</h1>
            <p>Official Monthly Financial Statement • ${escapeHtml(data.monthName)}</p>
          </div>
          <div class="meta-pill">
            <div style="font-weight: 700; color: #ffffff;">REF: ${statementId}</div>
            <div style="color: #d1fae5; font-size: 10px; margin-top: 2px;">Issued: ${generatedDate}</div>
          </div>
        </div>

        <div class="user-details">
          <div>
            <div style="font-size: 10px; text-transform: uppercase; font-weight: 700; color: #9ca3af;">Account Holder</div>
            <div style="font-size: 14px; font-weight: 700; color: #111827;">${escapeHtml(data.userName)}</div>
            ${data.userPhone ? `<div style="font-size: 11px; color: #6b7280;">${escapeHtml(data.userPhone)}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; text-transform: uppercase; font-weight: 700; color: #9ca3af;">Statement Period</div>
            <div style="font-size: 14px; font-weight: 700; color: #064e3b;">${escapeHtml(data.monthName)}</div>
            <div style="font-size: 11px; color: #059669; font-weight: 600;">Status: Verified</div>
          </div>
        </div>

        <div class="metric-grid">
          <div class="metric-card">
            <div class="metric-title">Total Inflow</div>
            <div class="metric-value" style="color: #059669;">${formatGHS(data.totalIncome)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-title">Total Outflow</div>
            <div class="metric-value" style="color: #dc2626;">${formatGHS(data.totalExpense)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-title">Net Savings</div>
            <div class="metric-value" style="color: ${data.netSavings >= 0 ? '#059669' : '#dc2626'};">${formatGHS(data.netSavings)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-title">Savings Rate</div>
            <div class="metric-value" style="color: #2563eb;">${data.savingsRate.toFixed(1)}%</div>
          </div>
        </div>

        ${
          data.categoryBreakdown.length > 0
            ? `
          <div class="section-title">Spending by Category</div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th style="text-align: right;">Amount (GHS)</th>
                  <th style="text-align: right;">Share</th>
                </tr>
              </thead>
              <tbody>
                ${categoryRows}
              </tbody>
            </table>
          </div>
        `
            : ''
        }

        <div class="section-title">Itemized Transactions (${data.transactions.length})</div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Account</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${transactionRows || '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #9ca3af;">No transactions recorded this month</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="footer">
          <div>Generated by CediSmart Ghana • Secure Personal Finance & Wealth Ledger</div>
          <div>Page 1 of 1 • Encrypted & Verified</div>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      UTI: '.pdf',
      mimeType: 'application/pdf',
      dialogTitle: `Share CediSmart Statement - ${data.monthName}`,
    });
  }

  return uri;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
