// ============================================================================
// CashMovementScreen.tsx — PHASE 4: واجهتا "قبض" و"صرف"
// مكوّن واحد يخدم الحالتين (نفس الخطوات، يختلف فقط النوع واللون والتسمية)
// الأولوية: أقل عدد خطوات ممكن لتسجيل حركة (اختيار حساب ← إدخال ← حفظ)
// ============================================================================
import { useEffect, useState } from 'react';
import { Account, KhizantiError, Transaction } from '../lib/khizanti_lib_supabase';
import { listAccounts, searchAccounts } from '../lib/khizanti_lib_treasury';
import { newIdempotencyKey } from '../lib/khizanti_lib_ledger';
import { queueAwareCashIn, queueAwareCashOut } from '../lib/khizanti_lib_sync';
import './CashMovementScreen.css';

type MovementType = 'cash_in' | 'cash_out';

interface CashMovementScreenProps {
  treasuryId: string;
  type: MovementType;
  onDone: () => void; // عودة للوحة التحكم بعد الحفظ أو الإلغاء
}

const COPY: Record<MovementType, { title: string; verb: string; accentClass: string; placeholder: string }> = {
  cash_in: { title: 'قبض', verb: 'قبض', accentClass: 'kh-accent--in', placeholder: 'مثال: دفعة من العميل' },
  cash_out: { title: 'صرف', verb: 'صرف', accentClass: 'kh-accent--out', placeholder: 'مثال: شراء بضاعة، سحب شخصي' },
};

function nowForInput(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16); // صيغة datetime-local
}

export default function CashMovementScreen({ treasuryId, type, onDone }: CashMovementScreenProps) {
  const copy = COPY[type];

  const [step, setStep] = useState<'pick-account' | 'enter-details' | 'success'>('pick-account');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(nowForInput());
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey] = useState(newIdempotencyKey()); // ثابت طوال محاولات الحفظ لهذه الحركة
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTx, setSavedTx] = useState<Transaction | null>(null);
  const [wasQueued, setWasQueued] = useState(false);

  // -------- خطوة 1: اختيار الحساب --------
  useEffect(() => {
    if (step !== 'pick-account') return;
    let cancelled = false;
    (async () => {
      try {
        const result = query.trim()
          ? await searchAccounts(treasuryId, query)
          : await listAccounts(treasuryId);
        if (!cancelled) setAccounts(result);
      } catch {
        if (!cancelled) setError('تعذّر تحميل الحسابات');
      }
    })();
    return () => { cancelled = true; };
  }, [treasuryId, query, step]);

  function pickAccount(account: Account) {
    setSelectedAccount(account);
    setError(null);
    setStep('enter-details');
  }

  // -------- خطوة 2: إدخال بيانات الحركة --------
  async function handleSave() {
    if (!selectedAccount) { setError('يرجى اختيار حساب'); return; }
    const numericAmount = Number(amount);
    if (!amount) { setError('يرجى إدخال المبلغ'); return; }
    if (!numericAmount || numericAmount <= 0) { setError('المبلغ يجب أن يكون أكبر من صفر'); return; }

    setSaving(true);
    setError(null);
    try {
      const fn = type === 'cash_in' ? queueAwareCashIn : queueAwareCashOut;
      const { queued, result } = await fn({
        treasuryId,
        accountId: selectedAccount.id,
        amount: numericAmount,
        occurredAt: new Date(occurredAt),
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        idempotencyKey,
      });
      setSavedTx(result);
      setWasQueued(queued);
      setStep('success');
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'لا يمكن تنفيذ العملية');
    } finally {
      setSaving(false);
    }
  }

  function resetForAnother() {
    setStep('pick-account');
    setSelectedAccount(null);
    setAmount('');
    setDescription('');
    setNotes('');
    setOccurredAt(nowForInput());
    setSavedTx(null);
    setWasQueued(false);
    setError(null);
    // ملاحظة: idempotencyKey الجديد يُولَّد فقط عبر إعادة تركيب المكوّن (key={} من الأب)
    // أو بإعادة تحميل الشاشة — لضمان عدم تكرار حركة سابقة بالخطأ.
  }

  return (
    <div className={`kh-movement ${copy.accentClass}`}>
      <header className="kh-movement__header">
        <button className="kh-btn kh-btn--ghost" onClick={onDone} aria-label="رجوع">رجوع</button>
        <h1 className="kh-display">{copy.title}</h1>
        <span />
      </header>

      {step === 'pick-account' && (
        <div className="kh-movement__pick">
          <input
            type="search"
            autoFocus
            placeholder="ابحث عن الحساب…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="بحث عن حساب"
          />
          {error && <p className="kh-movement__error" role="alert">{error}</p>}
          <ul className="kh-movement__account-list">
            {accounts.map((a) => (
              <li key={a.id}>
                <button className="kh-movement__account-item" onClick={() => pickAccount(a)}>
                  {a.name}
                </button>
              </li>
            ))}
            {accounts.length === 0 && <li className="kh-movement__hint">لا توجد نتائج</li>}
          </ul>
        </div>
      )}

      {step === 'enter-details' && selectedAccount && (
        <div className="kh-movement__form">
          <button className="kh-movement__change-account" onClick={() => setStep('pick-account')}>
            الحساب: <strong>{selectedAccount.name}</strong> — تغيير
          </button>

          <label className="kh-field">
            المبلغ
            <input
              type="number" inputMode="decimal" min="0.01" step="0.01"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00" autoFocus
            />
          </label>

          <label className="kh-field">
            التاريخ والوقت
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </label>

          <label className="kh-field">
            البيان
            <input
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={copy.placeholder}
            />
          </label>

          <label className="kh-field">
            ملاحظات (اختياري)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>

          {error && <p className="kh-movement__error" role="alert">{error}</p>}

          <div className="kh-movement__actions">
            <button className="kh-btn kh-btn--ghost" onClick={onDone}>إلغاء</button>
            <button
              className={`kh-btn kh-btn--action ${copy.accentClass}`}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'جارٍ الحفظ…' : `حفظ ${copy.verb}`}
            </button>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="kh-movement__success">
          {wasQueued ? (
            <>
              <p className="kh-movement__success-title">تم الحفظ محليًا — سيُرفع تلقائيًا عند عودة الاتصال</p>
              <p className="kh-amount kh-movement__success-amount">
                {Number(amount).toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
              </p>
            </>
          ) : savedTx && (
            <>
              <p className="kh-movement__success-title">تم تسجيل الحركة بنجاح</p>
              <p className="kh-movement__success-number">{savedTx.transaction_number}</p>
              <p className="kh-amount kh-movement__success-amount">
                {savedTx.amount.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
              </p>
            </>
          )}
          <div className="kh-movement__actions">
            <button className="kh-btn kh-btn--ghost" onClick={onDone}>عودة للرئيسية</button>
            <button className={`kh-btn kh-btn--action ${copy.accentClass}`} onClick={resetForAnother}>
              تسجيل {copy.verb} أخرى
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
