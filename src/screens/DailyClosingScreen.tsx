// ============================================================================
// DailyClosingScreen.tsx — PHASE 11: الإقفال اليومي (اختياري، لا يؤثر على الرصيد)
// معاينة حيّة قبل التسجيل، ثم تسجيل الإقفال عبر create_daily_closing (RPC)
// ============================================================================
import { useEffect, useState } from 'react';
import { KhizantiError, DailyClosing } from '../lib/khizanti_lib_supabase';
import {
  getTreasuryOpeningBalanceAsOf, listTransactionsInRange,
  createDailyClosing, listDailyClosings,
} from '../lib/khizanti_lib_ledger';
import './CashMovementScreen.css'; // kh-field / kh-btn / kh-movement__header / kh-movement__error
import './DashboardScreen.css';    // kh-dashboard__hint
import './DailyClosingScreen.css';

interface DailyClosingScreenProps {
  treasuryId: string;
  onDone: () => void;
}

interface Preview {
  expectedEndOfDay: number;
  totalCashIn: number;
  totalCashOut: number;
  transactionsCount: number;
}

function money(n: number): string {
  return n.toLocaleString('ar-LY', { minimumFractionDigits: 2 });
}
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyClosingScreen({ treasuryId, onDone }: DailyClosingScreenProps) {
  const [closingDate, setClosingDate] = useState(todayDate());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [actualBalance, setActualBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedClosing, setSavedClosing] = useState<DailyClosing | null>(null);
  const [history, setHistory] = useState<DailyClosing[]>([]);

  async function loadPreview() {
    setPreviewLoading(true);
    setError(null);
    try {
      const [openingBefore, dayTxs] = await Promise.all([
        getTreasuryOpeningBalanceAsOf(treasuryId, closingDate),
        listTransactionsInRange(treasuryId, closingDate, closingDate),
      ]);
      const expectedEndOfDay = dayTxs.reduce(
        (bal, t) => bal + (t.type === 'cash_in' ? t.amount : -t.amount), openingBefore,
      );
      setPreview({
        expectedEndOfDay,
        totalCashIn: dayTxs.filter((t) => t.status === 'active' && t.type === 'cash_in').reduce((s, t) => s + t.amount, 0),
        totalCashOut: dayTxs.filter((t) => t.status === 'active' && t.type === 'cash_out').reduce((s, t) => s + t.amount, 0),
        transactionsCount: dayTxs.filter((t) => t.status === 'active').length,
      });
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر تحميل معاينة اليوم');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function loadHistory() {
    try {
      setHistory(await listDailyClosings(treasuryId));
    } catch {
      // فشل تحميل السجل لا يعطّل الشاشة الأساسية
    }
  }

  useEffect(() => {
    loadPreview();
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treasuryId, closingDate]);

  async function handleClose(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await createDailyClosing({
        treasuryId,
        closingDate,
        actualBalance: actualBalance ? Number(actualBalance) : undefined,
        notes: notes.trim() || undefined,
      });
      setSavedClosing(result);
      setActualBalance('');
      setNotes('');
      await loadHistory();
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'لا يمكن تنفيذ العملية');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="kh-closing">
      <header className="kh-movement__header">
        <button className="kh-btn kh-btn--ghost" onClick={onDone} aria-label="رجوع">رجوع</button>
        <h1 className="kh-display">الإقفال اليومي</h1>
        <span />
      </header>

      <p className="kh-closing__hint">
        ميزة اختيارية للمراجعة اليومية فقط — لا تؤثر على أي رصيد محاسبي، ولا تُلزمك بإقفال كل يوم.
      </p>

      <label className="kh-field kh-closing__date-field">
        اليوم المراد إقفاله
        <input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} max={todayDate()} />
      </label>

      {previewLoading ? (
        <p className="kh-dashboard__hint">جارٍ تحميل بيانات اليوم…</p>
      ) : preview && (
        <section className="kh-closing__preview">
          <div><span>الرصيد المتوقع (نهاية اليوم)</span><strong className="kh-amount">{money(preview.expectedEndOfDay)}</strong></div>
          <div><span>إجمالي القبض</span><strong className="kh-amount">{money(preview.totalCashIn)}</strong></div>
          <div><span>إجمالي الصرف</span><strong className="kh-amount">{money(preview.totalCashOut)}</strong></div>
          <div><span>عدد العمليات</span><strong className="kh-amount">{preview.transactionsCount}</strong></div>
        </section>
      )}

      {savedClosing && (
        <section className="kh-closing__result">
          <p>تم تسجيل الإقفال {savedClosing.status === 'closed' ? 'وإغلاقه' : 'كمسودة'} برقم {savedClosing.closing_number}</p>
        </section>
      )}

      <form className="kh-movement__form" onSubmit={handleClose}>
        <label className="kh-field">
          المبلغ الفعلي بعد العدّ (اختياري — اتركه فارغًا لحفظ اليوم كمسودة فقط)
          <input
            type="number" inputMode="decimal" min="0" step="0.01"
            value={actualBalance} onChange={(e) => setActualBalance(e.target.value)}
            placeholder="0.00"
          />
        </label>

        <label className="kh-field">
          ملاحظات (اختياري)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>

        {error && <p className="kh-movement__error" role="alert">{error}</p>}

        <div className="kh-movement__actions">
          <button type="button" className="kh-btn kh-btn--ghost" onClick={onDone}>عودة</button>
          <button type="submit" className="kh-btn kh-btn--action kh-accent--transfer" disabled={saving}>
            {saving ? 'جارٍ التسجيل…' : actualBalance ? 'تسجيل وإغلاق اليوم' : 'حفظ كمسودة'}
          </button>
        </div>
      </form>

      <section className="kh-closing__history">
        <h2>سجل الإقفالات</h2>
        <ul>
          {history.map((c) => (
            <li key={c.id} className="kh-closing__history-row">
              <span className={`kh-closing__status kh-closing__status--${c.status}`}>
                {c.status === 'closed' ? 'مغلق' : 'مسودة'}
              </span>
              <span className="kh-closing__history-date">{c.closing_date} — {c.closing_number}</span>
              <span className="kh-amount">{money(c.expected_balance)}</span>
            </li>
          ))}
          {history.length === 0 && <li className="kh-dashboard__hint">لا توجد إقفالات سابقة</li>}
        </ul>
      </section>
    </div>
  );
}
