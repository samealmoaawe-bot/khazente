// ============================================================================
// ReconciliationScreen.tsx — PHASE 7: "مطابقة المبلغ الفعلي"
// عملية رقابية فقط — لا تُعدّل أي رصيد محاسبي إطلاقًا
// ============================================================================
import { useEffect, useState } from 'react';
import { KhizantiError, Reconciliation } from '../lib/khizanti_lib_supabase';
import { getDashboard, createReconciliation, listReconciliations } from '../lib/khizanti_lib_ledger';
import './CashMovementScreen.css'; // kh-field / kh-btn / kh-movement__error
import './DashboardScreen.css';    // kh-chip / kh-dashboard__hint / kh-dashboard__error-state
import './ReconciliationScreen.css';

interface ReconciliationScreenProps {
  treasuryId: string;
  onDone: () => void;
}

const RESULT_LABEL: Record<Reconciliation['result'], { text: string; className: string }> = {
  matched: { text: 'متساوٍ', className: 'kh-chip--success' },
  shortage: { text: 'عجز', className: 'kh-chip--danger' },
  surplus: { text: 'فائض', className: 'kh-chip--brass' },
};

export default function ReconciliationScreen({ treasuryId, onDone }: ReconciliationScreenProps) {
  const [expectedBalance, setExpectedBalance] = useState<number | null>(null);
  const [lastMatchedDate, setLastMatchedDate] = useState<string | null>(null);
  const [history, setHistory] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [actualBalance, setActualBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Reconciliation | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [dashboard, recs] = await Promise.all([
        getDashboard(treasuryId),
        listReconciliations(treasuryId, 10),
      ]);
      setExpectedBalance(dashboard.expectedBalance);
      setLastMatchedDate(dashboard.lastMatchedDate);
      setHistory(recs);
    } catch (err) {
      setLoadError(err instanceof KhizantiError ? err.message : 'تعذّر تحميل بيانات المطابقة');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treasuryId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actualBalance) { setFormError('يرجى إدخال المبلغ الفعلي الموجود في الخزينة'); return; }
    const numeric = Number(actualBalance);
    if (numeric < 0) { setFormError('المبلغ لا يمكن أن يكون سالبًا'); return; }

    setSaving(true);
    setFormError(null);
    try {
      const result = await createReconciliation({
        treasuryId,
        actualBalance: numeric,
        notes: notes.trim() || undefined,
      });
      setLastResult(result);
      setActualBalance('');
      setNotes('');
      await load(); // تحديث "آخر مطابقة متساوية" والسجل إن تغيّرا
    } catch (err) {
      setFormError(err instanceof KhizantiError ? err.message : 'لا يمكن تنفيذ العملية');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="kh-reconcile">
      <header className="kh-movement__header">
        <button className="kh-btn kh-btn--ghost" onClick={onDone} aria-label="رجوع">رجوع</button>
        <h1 className="kh-display">مطابقة المبلغ الفعلي</h1>
        <span />
      </header>

      {loading ? (
        <p className="kh-dashboard__hint">جارٍ التحميل…</p>
      ) : loadError ? (
        <div className="kh-dashboard__error-state">
          <p>{loadError}</p>
          <button className="kh-btn kh-btn--primary" onClick={load}>إعادة المحاولة</button>
        </div>
      ) : (
        <>
          <section className="kh-reconcile__info">
            <div className="kh-reconcile__info-row">
              <span>آخر مطابقة متساوية</span>
              <strong>{lastMatchedDate ?? 'لا توجد بعد'}</strong>
            </div>
            <div className="kh-reconcile__info-row">
              <span>الرصيد المتوقع حاليًا</span>
              <strong className="kh-amount">
                {expectedBalance?.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
              </strong>
            </div>
          </section>

          {lastResult && (
            <section className={`kh-reconcile__result ${RESULT_LABEL[lastResult.result].className}`}>
              <span className={`kh-chip ${RESULT_LABEL[lastResult.result].className}`}>
                {RESULT_LABEL[lastResult.result].text}
              </span>
              {lastResult.result !== 'matched' && (
                <span className="kh-amount">
                  الفرق: {Math.abs(lastResult.difference).toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
                </span>
              )}
              <p className="kh-reconcile__result-hint">
                لم يتغيّر أي رصيد محاسبي — هذه عملية رقابية فقط. إن كان الفرق معروف السبب، سجّله بحركة تصحيحية مناسبة.
              </p>
            </section>
          )}

          <form className="kh-movement__form" onSubmit={handleSubmit}>
            <label className="kh-field">
              أدخل المبلغ الفعلي الموجود في الخزينة
              <input
                type="number" inputMode="decimal" min="0" step="0.01" autoFocus
                value={actualBalance} onChange={(e) => setActualBalance(e.target.value)}
                placeholder="0.00"
              />
            </label>

            <label className="kh-field">
              ملاحظات (اختياري)
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </label>

            {formError && <p className="kh-movement__error" role="alert">{formError}</p>}

            <div className="kh-movement__actions">
              <button type="button" className="kh-btn kh-btn--ghost" onClick={onDone}>عودة</button>
              <button type="submit" className="kh-btn kh-btn--action kh-accent--transfer" disabled={saving}>
                {saving ? 'جارٍ المطابقة…' : 'مطابقة'}
              </button>
            </div>
          </form>

          <section className="kh-reconcile__history">
            <h2>سجل المطابقات</h2>
            <ul>
              {history.map((r) => (
                <li key={r.id} className="kh-reconcile__history-row">
                  <span className={`kh-chip ${RESULT_LABEL[r.result].className}`}>{RESULT_LABEL[r.result].text}</span>
                  <span className="kh-reconcile__history-date">
                    {new Date(r.occurred_at).toLocaleString('ar-LY', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <span className="kh-amount">
                    {r.actual_balance.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
                  </span>
                </li>
              ))}
              {history.length === 0 && <li className="kh-dashboard__hint">لا توجد مطابقات سابقة</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
