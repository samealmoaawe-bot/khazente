// ============================================================================
// TransferScreen.tsx — PHASE 5: واجهة "تحويل"
// من حساب ← إلى حساب ← المبلغ والتفاصيل ← حفظ (عملية واحدة ذرّية عبر RPC)
// ============================================================================
import { useEffect, useState } from 'react';
import { Account, KhizantiError, Transfer } from '../lib/khizanti_lib_supabase';
import { listAccounts, searchAccounts } from '../lib/khizanti_lib_treasury';
import { newIdempotencyKey } from '../lib/khizanti_lib_ledger';
import { queueAwareTransfer } from '../lib/khizanti_lib_sync';
import './CashMovementScreen.css'; // إعادة استخدام كل الأنماط المشتركة (kh-field, kh-btn...)
import './TransferScreen.css';

interface TransferScreenProps {
  treasuryId: string;
  onDone: () => void;
}

type Step = 'pick-source' | 'pick-destination' | 'enter-details' | 'success';

function nowForInput(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function TransferScreen({ treasuryId, onDone }: TransferScreenProps) {
  const [step, setStep] = useState<Step>('pick-source');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState('');

  const [sourceAccount, setSourceAccount] = useState<Account | null>(null);
  const [destinationAccount, setDestinationAccount] = useState<Account | null>(null);

  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(nowForInput());
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey] = useState(newIdempotencyKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTransfer, setSavedTransfer] = useState<Transfer | null>(null);
  const [wasQueued, setWasQueued] = useState(false);

  const isPickingAccount = step === 'pick-source' || step === 'pick-destination';

  // تحميل/بحث الحسابات في أي من خطوتي الاختيار
  useEffect(() => {
    if (!isPickingAccount) return;
    let cancelled = false;
    (async () => {
      try {
        const result = query.trim()
          ? await searchAccounts(treasuryId, query)
          : await listAccounts(treasuryId);
        if (cancelled) return;
        // في خطوة اختيار الوجهة، نستبعد حساب المصدر نفسه من القائمة
        const filtered = step === 'pick-destination' && sourceAccount
          ? result.filter((a) => a.id !== sourceAccount.id)
          : result;
        setAccounts(filtered);
      } catch {
        if (!cancelled) setError('تعذّر تحميل الحسابات');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treasuryId, query, step]);

  function pickSource(account: Account) {
    setSourceAccount(account);
    setQuery('');
    setError(null);
    setStep('pick-destination');
  }

  function pickDestination(account: Account) {
    setDestinationAccount(account);
    setQuery('');
    setError(null);
    setStep('enter-details');
  }

  async function handleSave() {
    if (!sourceAccount || !destinationAccount) { setError('يرجى اختيار الحسابين'); return; }
    const numericAmount = Number(amount);
    if (!amount) { setError('يرجى إدخال المبلغ'); return; }
    if (!numericAmount || numericAmount <= 0) { setError('المبلغ يجب أن يكون أكبر من صفر'); return; }

    setSaving(true);
    setError(null);
    try {
      const { queued, result } = await queueAwareTransfer({
        treasuryId,
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destinationAccount.id,
        amount: numericAmount,
        occurredAt: new Date(occurredAt),
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        idempotencyKey,
      });
      setSavedTransfer(result);
      setWasQueued(queued);
      setStep('success');
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'لا يمكن تنفيذ العملية');
    } finally {
      setSaving(false);
    }
  }

  function resetForAnother() {
    setStep('pick-source');
    setSourceAccount(null);
    setDestinationAccount(null);
    setAmount('');
    setDescription('');
    setNotes('');
    setOccurredAt(nowForInput());
    setSavedTransfer(null);
    setWasQueued(false);
    setError(null);
    // ملاحظة: يُستحسن أن يمرّر الأب key={} جديد عند "تحويل آخر" لضمان idempotencyKey جديد تمامًا
  }

  return (
    <div className="kh-movement kh-accent--transfer">
      <header className="kh-movement__header">
        <button className="kh-btn kh-btn--ghost" onClick={onDone} aria-label="رجوع">رجوع</button>
        <h1 className="kh-display">تحويل</h1>
        <span />
      </header>

      {step === 'pick-source' && (
        <div className="kh-movement__pick">
          <p className="kh-transfer__step-label">من حساب</p>
          <input
            type="search" autoFocus placeholder="ابحث عن حساب المصدر…"
            value={query} onChange={(e) => setQuery(e.target.value)}
            aria-label="بحث عن حساب المصدر"
          />
          {error && <p className="kh-movement__error" role="alert">{error}</p>}
          <ul className="kh-movement__account-list">
            {accounts.map((a) => (
              <li key={a.id}>
                <button className="kh-movement__account-item" onClick={() => pickSource(a)}>{a.name}</button>
              </li>
            ))}
            {accounts.length === 0 && <li className="kh-movement__hint">لا توجد نتائج</li>}
          </ul>
        </div>
      )}

      {step === 'pick-destination' && sourceAccount && (
        <div className="kh-movement__pick">
          <button className="kh-movement__change-account" onClick={() => setStep('pick-source')}>
            من: <strong>{sourceAccount.name}</strong> — تغيير
          </button>
          <p className="kh-transfer__step-label">إلى حساب</p>
          <input
            type="search" autoFocus placeholder="ابحث عن حساب الوجهة…"
            value={query} onChange={(e) => setQuery(e.target.value)}
            aria-label="بحث عن حساب الوجهة"
          />
          {error && <p className="kh-movement__error" role="alert">{error}</p>}
          <ul className="kh-movement__account-list">
            {accounts.map((a) => (
              <li key={a.id}>
                <button className="kh-movement__account-item" onClick={() => pickDestination(a)}>{a.name}</button>
              </li>
            ))}
            {accounts.length === 0 && <li className="kh-movement__hint">لا توجد نتائج</li>}
          </ul>
        </div>
      )}

      {step === 'enter-details' && sourceAccount && destinationAccount && (
        <div className="kh-movement__form">
          <div className="kh-transfer__summary">
            <button className="kh-movement__change-account" onClick={() => setStep('pick-source')}>
              من: <strong>{sourceAccount.name}</strong>
            </button>
            <span className="kh-transfer__arrow">←</span>
            <button className="kh-movement__change-account" onClick={() => setStep('pick-destination')}>
              إلى: <strong>{destinationAccount.name}</strong>
            </button>
          </div>

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
            <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </label>

          <label className="kh-field">
            البيان (اختياري)
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: تسوية بين حسابين" />
          </label>

          <label className="kh-field">
            ملاحظات (اختياري)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>

          {error && <p className="kh-movement__error" role="alert">{error}</p>}

          <div className="kh-movement__actions">
            <button className="kh-btn kh-btn--ghost" onClick={onDone}>إلغاء</button>
            <button className="kh-btn kh-btn--action" onClick={handleSave} disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ التحويل'}
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
          ) : savedTransfer && (
            <>
              <p className="kh-movement__success-title">تم تنفيذ التحويل بنجاح</p>
              <p className="kh-movement__success-number">{savedTransfer.transfer_number}</p>
              <p className="kh-amount kh-movement__success-amount">
                {savedTransfer.amount.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
              </p>
            </>
          )}
          <div className="kh-movement__actions">
            <button className="kh-btn kh-btn--ghost" onClick={onDone}>عودة للرئيسية</button>
            <button className="kh-btn kh-btn--action" onClick={resetForAnother}>تحويل آخر</button>
          </div>
        </div>
      )}
    </div>
  );
}
