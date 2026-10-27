// ============================================================================
// DashboardScreen.tsx — PHASE 6: لوحة التحكم والأرصدة
// الشاشة الأولى بعد تسجيل الدخول — كل الأرصدة هنا محسوبة من Views، لا أرقام ثابتة
// ============================================================================
import { useEffect, useState } from 'react';
import { AccountBalance, KhizantiError, Reconciliation, Transaction } from '../lib/khizanti_lib_supabase';
import { getAccountBalances } from '../lib/khizanti_lib_treasury';
import { getDashboard, getLastReconciliation, DashboardData } from '../lib/khizanti_lib_ledger';
import { useRealtimeTreasury } from '../lib/khizanti_lib_sync';
import './DashboardScreen.css';

export type DashboardTarget = 'accounts' | 'cash_in' | 'cash_out' | 'transfer' | 'reconciliation' | 'reports' | 'settings';

interface DashboardScreenProps {
  treasuryId: string;
  treasuryName: string;
  onNavigate: (target: DashboardTarget) => void;
  onOpenAccount: (accountId: string) => void;
}

const TYPE_LABEL: Record<Transaction['type'], string> = {
  cash_in: 'قبض',
  cash_out: 'صرف',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
  opening_balance: 'رصيد افتتاحي',
  reversal: 'عكس حركة',
};

const TYPE_CLASS: Record<Transaction['type'], string> = {
  cash_in: 'kh-tx--in',
  cash_out: 'kh-tx--out',
  transfer_in: 'kh-tx--transfer',
  transfer_out: 'kh-tx--transfer',
  opening_balance: 'kh-tx--neutral',
  reversal: 'kh-tx--neutral',
};

const RECONCILIATION_LABEL: Record<Reconciliation['result'], { text: string; className: string }> = {
  matched: { text: 'متساوٍ', className: 'kh-chip--success' },
  shortage: { text: 'عجز', className: 'kh-chip--danger' },
  surplus: { text: 'فائض', className: 'kh-chip--brass' },
};

export default function DashboardScreen({ treasuryId, treasuryName, onNavigate, onOpenAccount }: DashboardScreenProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
  const [lastReconciliation, setLastReconciliation] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [dashboard, balances, reconciliation] = await Promise.all([
        getDashboard(treasuryId),
        getAccountBalances(treasuryId),
        getLastReconciliation(treasuryId),
      ]);
      setData(dashboard);
      setAccounts(balances);
      setAccountNames(new Map(balances.map((a) => [a.account_id, a.name])));
      setLastReconciliation(reconciliation);
    } catch (err) {
      setErrorMsg(err instanceof KhizantiError ? err.message : 'تعذّر تحميل بيانات الخزينة');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treasuryId]);

  // تحديث تلقائي فور تسجيل حركة من جهاز آخر (يتطلب khizanti_schema_addendum_realtime.sql)
  useRealtimeTreasury(treasuryId, load);

  if (loading) {
    return <p className="kh-dashboard__hint">جارٍ تحميل بيانات الخزينة…</p>;
  }

  if (errorMsg || !data) {
    return (
      <div className="kh-dashboard__error-state">
        <p>{errorMsg ?? 'تعذّر تحميل البيانات'}</p>
        <button className="kh-btn kh-btn--primary" onClick={load}>إعادة المحاولة</button>
      </div>
    );
  }

  const reconciliationChip = lastReconciliation ? RECONCILIATION_LABEL[lastReconciliation.result] : null;

  return (
    <div className="kh-dashboard">
      <header className="kh-dashboard__header">
        <h1 className="kh-display">{treasuryName}</h1>
        <button className="kh-btn kh-btn--ghost" onClick={() => onNavigate('settings')} aria-label="الإعدادات">
          الإعدادات
        </button>
      </header>

      {/* -------- الرصيد الحالي: أهم رقم في الشاشة -------- */}
      <section className="kh-dashboard__hero">
        <p className="kh-dashboard__hero-label">الرصيد النقدي المتوقع</p>
        <p className="kh-amount kh-dashboard__hero-amount">
          {data.expectedBalance.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} <span>د.ل</span>
        </p>
        <button className="kh-dashboard__reconciliation-row" onClick={() => onNavigate('reconciliation')}>
          {reconciliationChip ? (
            <>
              <span className={`kh-chip ${reconciliationChip.className}`}>{reconciliationChip.text}</span>
              <span className="kh-dashboard__reconciliation-date">
                آخر مطابقة متساوية: {data.lastMatchedDate ?? '—'}
              </span>
            </>
          ) : (
            <span className="kh-dashboard__reconciliation-date">لم تُجرَ أي مطابقة بعد — اضغط للبدء</span>
          )}
        </button>
      </section>

      {/* -------- إجراءات سريعة -------- */}
      <section className="kh-dashboard__quick-actions">
        <button className="kh-quick-action kh-accent--in" onClick={() => onNavigate('cash_in')}>قبض</button>
        <button className="kh-quick-action kh-accent--out" onClick={() => onNavigate('cash_out')}>صرف</button>
        <button className="kh-quick-action kh-accent--transfer" onClick={() => onNavigate('transfer')}>تحويل</button>
      </section>

      {/* -------- إحصائيات -------- */}
      <section className="kh-dashboard__stats">
        <div className="kh-stat">
          <p className="kh-stat__label">إجمالي القبض</p>
          <p className="kh-amount kh-stat__value kh-stat__value--in">
            {data.totalCashIn.toLocaleString('ar-LY', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="kh-stat">
          <p className="kh-stat__label">إجمالي الصرف</p>
          <p className="kh-amount kh-stat__value kh-stat__value--out">
            {data.totalCashOut.toLocaleString('ar-LY', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="kh-stat">
          <p className="kh-stat__label">عدد الحركات</p>
          <p className="kh-amount kh-stat__value">{data.transactionsCount}</p>
        </div>
      </section>

      {/* -------- الحسابات -------- */}
      <section className="kh-dashboard__section">
        <div className="kh-dashboard__section-header">
          <h2>الحسابات</h2>
          <button className="kh-link" onClick={() => onNavigate('accounts')}>عرض الكل</button>
        </div>
        <ul className="kh-dashboard__accounts">
          {accounts.slice(0, 6).map((a) => (
            <li key={a.account_id}>
              <button className="kh-dashboard__account-row" onClick={() => onOpenAccount(a.account_id)}>
                <span>{a.name}</span>
                <span className="kh-amount">{a.current_balance.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل</span>
              </button>
            </li>
          ))}
          {accounts.length === 0 && <li className="kh-dashboard__hint">لا توجد حسابات بعد</li>}
        </ul>
      </section>

      {/* -------- آخر العمليات -------- */}
      <section className="kh-dashboard__section">
        <div className="kh-dashboard__section-header">
          <h2>آخر العمليات</h2>
          <button className="kh-link" onClick={() => onNavigate('reports')}>التقارير</button>
        </div>
        <ul className="kh-dashboard__transactions">
          {data.recentTransactions.map((tx) => (
            <li key={tx.id} className={tx.status !== 'active' ? 'kh-dashboard__tx-row--muted' : ''}>
              <div className="kh-dashboard__tx-row">
                <span className={`kh-chip ${TYPE_CLASS[tx.type]}`}>{TYPE_LABEL[tx.type]}</span>
                <span className="kh-dashboard__tx-account">{accountNames.get(tx.account_id) ?? '—'}</span>
                <span className="kh-amount kh-dashboard__tx-amount">
                  {tx.amount.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
                </span>
              </div>
              <span className="kh-dashboard__tx-time">
                {new Date(tx.occurred_at).toLocaleString('ar-LY', { dateStyle: 'medium', timeStyle: 'short' })}
                {tx.status === 'reversed' && ' — ملغاة'}
                {tx.status === 'reversal' && ' — حركة عكسية'}
              </span>
            </li>
          ))}
          {data.recentTransactions.length === 0 && <li className="kh-dashboard__hint">لا توجد عمليات بعد</li>}
        </ul>
      </section>
    </div>
  );
}
