// ============================================================================
// AccountStatementScreen.tsx — PHASE 9: كشف حساب + بحث + فلاتر
// يُفتح من شاشة الحسابات بعد اختيار حساب — يطلب فترة زمنية ثم يعرض الحركات
// الرصيد قبل الفترة يُحسب فعليًا من الحركات السابقة (وليس من current_balance)
// ============================================================================
import { useEffect, useState } from 'react';
import { KhizantiError, StatementRow } from '../lib/khizanti_lib_supabase';
import { getAccountStatement } from '../lib/khizanti_lib_ledger';
import './CashMovementScreen.css'; // kh-field / kh-btn / kh-movement__header / kh-movement__error
import './DashboardScreen.css'; // kh-chip
import './AccountStatementScreen.css';

interface AccountStatementScreenProps {
  accountId: string;
  accountName: string;
  onDone: () => void;
}

type Filter = 'all' | 'cash_in' | 'cash_out' | 'transfer';

const TYPE_LABEL: Record<StatementRow['type'], string> = {
  cash_in: 'قبض', cash_out: 'صرف', transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر', opening_balance: 'رصيد افتتاحي', reversal: 'عكس حركة',
};

function isCredit(type: StatementRow['type']): boolean {
  return type === 'cash_in' || type === 'transfer_in' || type === 'opening_balance';
}

function chipClass(type: StatementRow['type']): string {
  if (type === 'cash_in') return 'kh-chip--success';
  if (type === 'cash_out') return 'kh-chip--danger';
  if (type === 'transfer_in' || type === 'transfer_out') return 'kh-chip--brass';
  return '';
}

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AccountStatementScreen({ accountId, accountName, onDone }: AccountStatementScreenProps) {
  const [fromDate, setFromDate] = useState(firstDayOfMonth());
  const [toDate, setToDate] = useState(today());
  const [filter, setFilter] = useState<Filter>('all');
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (fromDate > toDate) { setError('تاريخ البداية يجب أن يسبق تاريخ النهاية'); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await getAccountStatement(accountId, fromDate, toDate);
      setRows(data);
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر تحميل كشف الحساب');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const filteredRows = rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'cash_in') return r.type === 'cash_in';
    if (filter === 'cash_out') return r.type === 'cash_out';
    return r.type === 'transfer_in' || r.type === 'transfer_out';
  });

  const openingBalance = rows.length > 0 ? rows[0].running_balance - signedAmount(rows[0]) : null;
  function signedAmount(r: StatementRow): number {
    return isCredit(r.type) ? r.amount : -r.amount;
  }

  const periodIn = filteredRows.filter((r) => isCredit(r.type)).reduce((sum, r) => sum + r.amount, 0);
  const periodOut = filteredRows.filter((r) => !isCredit(r.type)).reduce((sum, r) => sum + r.amount, 0);
  const closingBalance = rows.length > 0 ? rows[rows.length - 1].running_balance : openingBalance;

  return (
    <div className="kh-statement">
      <header className="kh-movement__header">
        <button className="kh-btn kh-btn--ghost" onClick={onDone} aria-label="رجوع">رجوع</button>
        <h1 className="kh-display">كشف حساب</h1>
        <span />
      </header>

      <p className="kh-statement__account-name">{accountName}</p>

      <div className="kh-statement__dates">
        <label className="kh-field">
          من تاريخ
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="kh-field">
          إلى تاريخ
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <button className="kh-btn kh-btn--primary" onClick={load}>عرض</button>
      </div>

      <div className="kh-statement__filters">
        {([
          ['all', 'الكل'], ['cash_in', 'قبض'], ['cash_out', 'صرف'], ['transfer', 'تحويل'],
        ] as [Filter, string][]).map(([value, label]) => (
          <button
            key={value}
            className={`kh-statement__filter ${filter === value ? 'kh-statement__filter--active' : ''}`}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="kh-movement__error" role="alert">{error}</p>}

      {loading ? (
        <p className="kh-dashboard__hint">جارٍ التحميل…</p>
      ) : (
        <>
          <div className="kh-statement__summary">
            <div><span>الرصيد قبل الفترة</span><strong className="kh-amount">{(openingBalance ?? 0).toLocaleString('ar-LY', { minimumFractionDigits: 2 })}</strong></div>
            <div><span>وارد الفترة</span><strong className="kh-amount kh-statement__in">{periodIn.toLocaleString('ar-LY', { minimumFractionDigits: 2 })}</strong></div>
            <div><span>صادر الفترة</span><strong className="kh-amount kh-statement__out">{periodOut.toLocaleString('ar-LY', { minimumFractionDigits: 2 })}</strong></div>
            <div><span>الرصيد الختامي</span><strong className="kh-amount">{(closingBalance ?? 0).toLocaleString('ar-LY', { minimumFractionDigits: 2 })}</strong></div>
          </div>

          <ul className="kh-statement__list">
            {filteredRows.map((r) => (
              <li key={r.transaction_number} className={r.status !== 'active' ? 'kh-statement__row--muted' : ''}>
                <div className="kh-statement__row">
                  <span className={`kh-chip ${chipClass(r.type)}`}>{TYPE_LABEL[r.type]}</span>
                  <div className="kh-statement__row-details">
                    <span className="kh-statement__number">{r.transaction_number}</span>
                    {r.description && <span className="kh-statement__description">{r.description}</span>}
                  </div>
                  <span className={`kh-amount ${isCredit(r.type) ? 'kh-statement__in' : 'kh-statement__out'}`}>
                    {isCredit(r.type) ? '+' : '−'}{r.amount.toLocaleString('ar-LY', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="kh-statement__row-meta">
                  <span>{new Date(r.occurred_at).toLocaleString('ar-LY', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  <span className="kh-amount">الرصيد بعد الحركة: {r.running_balance.toLocaleString('ar-LY', { minimumFractionDigits: 2 })}</span>
                </div>
              </li>
            ))}
            {filteredRows.length === 0 && <li className="kh-dashboard__hint">لا توجد حركات في هذه الفترة</li>}
          </ul>
        </>
      )}
    </div>
  );
}
