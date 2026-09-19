// ============================================================================
// AccountsScreen.tsx — PHASE 3: واجهة "الحسابات"
// قائمة + بحث + إضافة حساب + تعطيل/تفعيل — مبنية فوق khizanti_lib_treasury.ts
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import {
  Account, AccountType, AccountBalance, KhizantiError,
} from '../lib/khizanti_lib_supabase';
import {
  listAccounts, listAccountTypes, searchAccounts,
  createAccount, setAccountStatus, getAccountBalances,
} from '../lib/khizanti_lib_treasury';
import './AccountsScreen.css';

interface AccountsScreenProps {
  treasuryId: string;
  onOpenStatement: (accountId: string) => void; // ينتقل لشاشة كشف الحساب (مرحلة قادمة)
}

interface AccountRow extends Account {
  balance: number;
  typeName: string;
}

export default function AccountsScreen({ treasuryId, onOpenStatement }: AccountsScreenProps) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);

  async function loadAll() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [accts, balances, types] = await Promise.all([
        listAccounts(treasuryId, { includeInactive: showInactive }),
        getAccountBalances(treasuryId),
        listAccountTypes(treasuryId),
      ]);
      const balanceMap = new Map(balances.map((b: AccountBalance) => [b.account_id, b.current_balance]));
      const typeMap = new Map(types.map((t) => [t.id, t.name_ar]));
      setAccounts(
        accts.map((a) => ({
          ...a,
          balance: balanceMap.get(a.id) ?? a.opening_balance,
          typeName: typeMap.get(a.account_type_id) ?? 'أخرى',
        })),
      );
      setAccountTypes(types);
    } catch (err) {
      setErrorMsg(err instanceof KhizantiError ? err.message : 'تعذّر تحميل الحسابات');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treasuryId, showInactive]);

  // بحث فوري محلي إذا كانت القائمة قصيرة، وإلا نستدعي searchAccounts عند الكتابة
  useEffect(() => {
    if (!query.trim()) {
      loadAll();
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await searchAccounts(treasuryId, query);
        const balances = await getAccountBalances(treasuryId);
        const balanceMap = new Map(balances.map((b) => [b.account_id, b.current_balance]));
        const typeMap = new Map(accountTypes.map((t) => [t.id, t.name_ar]));
        setAccounts(
          results.map((a) => ({
            ...a,
            balance: balanceMap.get(a.id) ?? a.opening_balance,
            typeName: typeMap.get(a.account_type_id) ?? 'أخرى',
          })),
        );
      } catch {
        // فشل البحث لا يعطّل الشاشة — القائمة تبقى كما هي
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const visibleAccounts = useMemo(
    () => accounts.filter((a) => showInactive || a.status === 'active'),
    [accounts, showInactive],
  );

  async function handleToggleStatus(account: AccountRow) {
    const next = account.status === 'active' ? 'inactive' : 'active';
    try {
      await setAccountStatus(account.id, next);
      await loadAll();
    } catch (err) {
      setErrorMsg(err instanceof KhizantiError ? err.message : 'تعذّر تحديث حالة الحساب');
    }
  }

  return (
    <div className="kh-accounts">
      <header className="kh-accounts__header">
        <h1 className="kh-display">الحسابات</h1>
        <button className="kh-btn kh-btn--primary" onClick={() => setModalOpen(true)}>
          إضافة حساب
        </button>
      </header>

      <div className="kh-accounts__search">
        <input
          type="search"
          placeholder="ابحث بالاسم…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="بحث في الحسابات"
        />
        <label className="kh-accounts__toggle">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          إظهار المعطّلة
        </label>
      </div>

      {errorMsg && <p className="kh-accounts__error" role="alert">{errorMsg}</p>}

      {loading ? (
        <p className="kh-accounts__hint">جارٍ التحميل…</p>
      ) : visibleAccounts.length === 0 ? (
        <div className="kh-accounts__empty">
          <p>لا توجد حسابات بعد.</p>
          <button className="kh-btn kh-btn--primary" onClick={() => setModalOpen(true)}>
            أضف أول حساب
          </button>
        </div>
      ) : (
        <ul className="kh-accounts__list">
          {visibleAccounts.map((account) => (
            <li
              key={account.id}
              className={`kh-accounts__row ${account.status === 'inactive' ? 'kh-accounts__row--inactive' : ''}`}
              onClick={() => onOpenStatement(account.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onOpenStatement(account.id)}
            >
              <div className="kh-accounts__row-main">
                <span className="kh-accounts__name">{account.name}</span>
                <span className="kh-accounts__type">{account.typeName}</span>
                {account.status === 'inactive' && <span className="kh-accounts__badge">معطّل</span>}
              </div>
              <div className="kh-accounts__row-side">
                <span className="kh-amount kh-accounts__balance">
                  {account.balance.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
                </span>
                <button
                  className="kh-btn kh-btn--ghost"
                  onClick={(e) => { e.stopPropagation(); handleToggleStatus(account); }}
                >
                  {account.status === 'active' ? 'تعطيل' : 'تفعيل'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {isModalOpen && (
        <AddAccountModal
          treasuryId={treasuryId}
          accountTypes={accountTypes}
          onClose={() => setModalOpen(false)}
          onCreated={() => { setModalOpen(false); loadAll(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// نموذج إضافة حساب — مكوّن داخلي بسيط
// ---------------------------------------------------------------------------
function AddAccountModal({
  treasuryId, accountTypes, onClose, onCreated,
}: {
  treasuryId: string;
  accountTypes: AccountType[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState(accountTypes[0]?.id ?? '');
  const [openingBalance, setOpeningBalance] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createAccount({
        treasuryId,
        accountTypeId: typeId,
        name,
        openingBalance: openingBalance ? Number(openingBalance) : 0,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر إنشاء الحساب');
      setSaving(false);
    }
  }

  return (
    <div className="kh-modal-backdrop" onClick={onClose}>
      <form className="kh-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>إضافة حساب جديد</h2>

        <label className="kh-field">
          اسم الحساب
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: محل طرابلس" required autoFocus />
        </label>

        <label className="kh-field">
          نوع الحساب
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
            {accountTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name_ar}</option>
            ))}
          </select>
        </label>

        <label className="kh-field">
          الرصيد الافتتاحي (اختياري)
          <input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)}
            placeholder="0.00"
          />
        </label>

        {error && <p className="kh-accounts__error" role="alert">{error}</p>}

        <div className="kh-modal__actions">
          <button type="button" className="kh-btn kh-btn--ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="kh-btn kh-btn--primary" disabled={saving}>
            {saving ? 'جارٍ الحفظ…' : 'حفظ الحساب'}
          </button>
        </div>
      </form>
    </div>
  );
}
