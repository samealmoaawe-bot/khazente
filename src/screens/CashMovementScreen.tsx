// ============================================================================
// CashMovementScreen.tsx — "قبض" و"صرف" بنظام مسودة ← ترحيل صريح
// الحفظ الأول ينشئ مسودة فقط (لا يؤثر على أي رصيد) — لا تصبح حركة حقيقية
// مؤثّرة على الأرصدة إلا بعد الضغط الصريح على "ترحيل الآن".
// ============================================================================
import { useEffect, useState } from 'react';
import { Account, KhizantiError, Transaction } from '../lib/khizanti_lib_supabase';
import { listAccounts, searchAccounts } from '../lib/khizanti_lib_treasury';
import {
  newIdempotencyKey, createDraftCashIn, createDraftCashOut,
  updateDraftTransaction, deleteDraftTransaction, postTransaction,
} from '../lib/khizanti_lib_ledger';
import AccountQuickAddModal from './AccountQuickAddModal';
import './CashMovementScreen.css';

type MovementType = 'cash_in' | 'cash_out';

interface CashMovementScreenProps {
  treasuryId: string;
  type: MovementType;
  onDone: () => void;
  /** لتعديل مسودة موجودة بدل إنشاء واحدة جديدة (قادمة من شاشة المسودات). */
  editingDraft?: Transaction | null;
}

const COPY: Record<MovementType, { title: string; verb: string; accentClass: string; placeholder: string }> = {
  cash_in: { title: 'قبض', verb: 'قبض', accentClass: 'kh-accent--in', placeholder: 'مثال: دفعة من العميل' },
  cash_out: { title: 'صرف', verb: 'صرف', accentClass: 'kh-accent--out', placeholder: 'مثال: شراء بضاعة، سحب شخصي' },
};

function nowForInput(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function CashMovementScreen({ treasuryId, type, onDone, editingDraft }: CashMovementScreenProps) {
  const copy = COPY[type];
  const isEditing = !!editingDraft;

  const [step, setStep] = useState<'pick-account' | 'enter-details' | 'draft-ready' | 'posted'>(
    isEditing ? 'enter-details' : 'pick-account',
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const [amount, setAmount] = useState(editingDraft ? String(editingDraft.amount) : '');
  const [occurredAt, setOccurredAt] = useState(
    editingDraft ? editingDraft.occurred_at.slice(0, 16) : nowForInput(),
  );
  const [description, setDescription] = useState(editingDraft?.description ?? '');
  const [notes, setNotes] = useState(editingDraft?.notes ?? '');
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftTx, setDraftTx] = useState<Transaction | null>(editingDraft ?? null);
  const [postedTx, setPostedTx] = useState<Transaction | null>(null);

  useEffect(() => {
    if (step !== 'pick-account') return;
    let cancelled = false;
    (async () => {
      try {
        const result = query.trim() ? await searchAccounts(treasuryId, query) : await listAccounts(treasuryId);
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

  async function handleSaveDraft() {
    const accountId = selectedAccount?.id ?? editingDraft?.account_id;
    if (!accountId) { setError('يرجى اختيار حساب'); return; }
    const numericAmount = Number(amount);
    if (!amount) { setError('يرجى إدخال المبلغ'); return; }
    if (!numericAmount || numericAmount <= 0) { setError('المبلغ يجب أن يكون أكبر من صفر'); return; }

    setSaving(true);
    setError(null);
    try {
      let result: Transaction;
      if (isEditing && draftTx) {
        result = await updateDraftTransaction({
          transactionId: draftTx.id, accountId, amount: numericAmount,
          occurredAt: new Date(occurredAt), description: description.trim() || undefined, notes: notes.trim() || undefined,
        });
      } else {
        const fn = type === 'cash_in' ? createDraftCashIn : createDraftCashOut;
        result = await fn({
          treasuryId, accountId, amount: numericAmount, occurredAt: new Date(occurredAt),
          description: description.trim() || undefined, notes: notes.trim() || undefined, idempotencyKey,
        });
      }
      setDraftTx(result);
      setStep('draft-ready');
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'لا يمكن حفظ المسودة');
    } finally {
      setSaving(false);
    }
  }

  async function handlePostNow() {
    if (!draftTx) return;
    setSaving(true);
    setError(null);
    try {
      const posted = await postTransaction(draftTx.id);
      setPostedTx(posted);
      setStep('posted');
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر الترحيل');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDraft() {
    if (!draftTx) return;
    setSaving(true);
    setError(null);
    try {
      await deleteDraftTransaction(draftTx.id);
      onDone();
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر حذف المسودة');
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
    setDraftTx(null);
    setPostedTx(null);
    setError(null);
    setIdempotencyKey(newIdempotencyKey());
  }

  const accountLabel = selectedAccount?.name ?? editingDraft?.account_id ?? '';

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
            type="search" autoFocus placeholder="ابحث عن الحساب…"
            value={query} onChange={(e) => setQuery(e.target.value)} aria-label="بحث عن حساب"
          />
          {error && <p className="kh-movement__error" role="alert">{error}</p>}
          <ul className="kh-movement__account-list">
            <li>
              <button className="kh-movement__account-item" style={{ color: 'var(--color-brass)', fontWeight: 700 }} onClick={() => setShowQuickAdd(true)}>
                + إضافة حساب جديد
              </button>
            </li>
            {accounts.map((a) => (
              <li key={a.id}>
                <button className="kh-movement__account-item" onClick={() => pickAccount(a)}>{a.name}</button>
              </li>
            ))}
            {accounts.length === 0 && <li className="kh-movement__hint">لا توجد نتائج</li>}
          </ul>
        </div>
      )}

      {step === 'enter-details' && (
        <div className="kh-movement__form">
          <button className="kh-movement__change-account" onClick={() => !isEditing && setStep('pick-account')} disabled={isEditing}>
            الحساب: <strong>{accountLabel}</strong>{!isEditing && ' — تغيير'}
          </button>

          <label className="kh-field">
            المبلغ
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
          </label>

          <label className="kh-field">
            التاريخ والوقت
            <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </label>

          <label className="kh-field">
            البيان
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={copy.placeholder} />
          </label>

          <label className="kh-field">
            ملاحظات (اختياري)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>

          {error && <p className="kh-movement__error" role="alert">{error}</p>}

          <div className="kh-movement__actions">
            <button className="kh-btn kh-btn--ghost" onClick={onDone}>إلغاء</button>
            <button className={`kh-btn kh-btn--action ${copy.accentClass}`} onClick={handleSaveDraft} disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : isEditing ? 'حفظ التعديل' : 'حفظ كمسودة'}
            </button>
          </div>
        </div>
      )}

      {step === 'draft-ready' && draftTx && (
        <div className="kh-movement__success">
          <p className="kh-movement__success-title">مسودة محفوظة — لم تؤثر على أي رصيد بعد</p>
          <p className="kh-movement__success-number">{draftTx.transaction_number}</p>
          <p className="kh-amount kh-movement__success-amount">
            {draftTx.amount.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
          </p>
          {error && <p className="kh-movement__error" role="alert">{error}</p>}
          <div className="kh-movement__actions" style={{ flexWrap: 'wrap' }}>
            <button className="kh-btn kh-btn--ghost" onClick={() => setStep('enter-details')} disabled={saving}>تعديل</button>
            <button className="kh-btn kh-btn--ghost" style={{ color: 'var(--color-danger)' }} onClick={handleDeleteDraft} disabled={saving}>حذف المسودة</button>
            <button className={`kh-btn kh-btn--action ${copy.accentClass}`} onClick={handlePostNow} disabled={saving}>
              {saving ? 'جارٍ الترحيل…' : 'ترحيل الآن'}
            </button>
          </div>
          <button className="kh-btn kh-btn--ghost" style={{ marginTop: 'var(--space-3)' }} onClick={onDone}>
            حفظ كمسودة والعودة للرئيسية (يمكن ترحيلها لاحقًا من المسودات)
          </button>
        </div>
      )}

      {step === 'posted' && postedTx && (
        <div className="kh-movement__success">
          <p className="kh-movement__success-title">تم ترحيل الحركة بنجاح</p>
          <p className="kh-movement__success-number">{postedTx.transaction_number}</p>
          <p className="kh-amount kh-movement__success-amount">
            {postedTx.amount.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
          </p>
          <div className="kh-movement__actions">
            <button className="kh-btn kh-btn--ghost" onClick={onDone}>عودة للرئيسية</button>
            <button className={`kh-btn kh-btn--action ${copy.accentClass}`} onClick={resetForAnother}>
              تسجيل {copy.verb} أخرى
            </button>
          </div>
        </div>
      )}

      {showQuickAdd && (
        <AccountQuickAddModal
          treasuryId={treasuryId}
          onClose={() => setShowQuickAdd(false)}
          onCreated={(account) => { setShowQuickAdd(false); pickAccount(account); }}
        />
      )}
    </div>
  );
}
