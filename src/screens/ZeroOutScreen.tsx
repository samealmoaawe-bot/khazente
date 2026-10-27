// ============================================================================
// ZeroOutScreen.tsx — تصفير الخزينة دفعة واحدة بعد تأكيد صريح مزدوج.
// ليست مسحًا للرقم: تُنشئ حركة قبض/صرف حقيقية موثَّقة بمقدار الفرق تمامًا،
// قابلة للعكس كأي حركة أخرى إن كانت خطأ.
// ============================================================================
import { useEffect, useState } from 'react';
import { Account, KhizantiError } from '../lib/khizanti_lib_supabase';
import { listAccounts } from '../lib/khizanti_lib_treasury';
import { zeroOutTreasury, getDashboard, newIdempotencyKey } from '../lib/khizanti_lib_ledger';
import './CashMovementScreen.css';
import './DashboardScreen.css';

interface ZeroOutScreenProps {
  treasuryId: string;
  onDone: () => void;
}

export default function ZeroOutScreen({ treasuryId, onDone }: ZeroOutScreenProps) {
  const [expectedBalance, setExpectedBalance] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [confirmStep, setConfirmStep] = useState(0); // 0=لم يبدأ، 1=تأكيد أول، 2=تنفيذ
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [dash, accts] = await Promise.all([getDashboard(treasuryId), listAccounts(treasuryId)]);
        setExpectedBalance(dash.expectedBalance);
        setAccounts(accts);
        setAccountId(accts[0]?.id ?? '');
      } catch (err) {
        setError(err instanceof KhizantiError ? err.message : 'تعذّر تحميل البيانات');
      } finally {
        setLoading(false);
      }
    })();
  }, [treasuryId]);

  async function handleConfirm() {
    if (!accountId) { setError('يرجى اختيار الحساب الذي تُسجَّل عليه حركة التصفير'); return; }
    setSaving(true);
    setError(null);
    try {
      await zeroOutTreasury({ treasuryId, accountId, confirm: true, idempotencyKey: newIdempotencyKey() });
      setDone(true);
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر تنفيذ التصفير');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="kh-movement">
      <header className="kh-movement__header">
        <button className="kh-btn kh-btn--ghost" onClick={onDone} aria-label="رجوع">رجوع</button>
        <h1 className="kh-display">تصفير الخزينة</h1>
        <span />
      </header>

      {loading ? (
        <p className="kh-dashboard__hint">جارٍ التحميل…</p>
      ) : done ? (
        <div className="kh-movement__success">
          <p className="kh-movement__success-title">تم تصفير الخزينة بنجاح</p>
          <button className="kh-btn kh-btn--primary" onClick={onDone}>عودة للرئيسية</button>
        </div>
      ) : (
        <div className="kh-movement__form">
          <p className="kh-error-text" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-ink)' }}>
            هذه العملية تُنشئ حركة {(expectedBalance ?? 0) > 0 ? 'صرف' : 'قبض'} حقيقية بمقدار{' '}
            <strong>{Math.abs(expectedBalance ?? 0).toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل</strong>{' '}
            لتصبح الخزينة صفرًا تمامًا. لن يُحذف أي شيء، ويمكن عكسها لاحقًا كأي حركة أخرى إن كانت خطأ.
          </p>

          <label className="kh-field">
            سجّل حركة التصفير على حساب
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>

          {error && <p className="kh-movement__error" role="alert">{error}</p>}

          {confirmStep === 0 ? (
            <button className="kh-btn kh-btn--action" style={{ background: 'var(--color-danger)' }} onClick={() => setConfirmStep(1)}>
              أريد تصفير الخزينة
            </button>
          ) : (
            <div className="kh-movement__actions">
              <button className="kh-btn kh-btn--ghost" onClick={() => setConfirmStep(0)}>تراجع</button>
              <button className="kh-btn kh-btn--action" style={{ background: 'var(--color-danger)' }} onClick={handleConfirm} disabled={saving}>
                {saving ? 'جارٍ التنفيذ…' : 'تأكيد نهائي — نفّذ التصفير الآن'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
