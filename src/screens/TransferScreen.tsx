// ============================================================================
// TransferScreen.tsx — "تحويل" بنظام مسودة ← ترحيل صريح
// ============================================================================
import { useEffect, useState } from 'react';
import { Account, KhizantiError, Transfer } from '../lib/khizanti_lib_supabase';
import { listAccounts, searchAccounts } from '../lib/khizanti_lib_treasury';
import {
  newIdempotencyKey, createDraftTransfer, updateDraftTransfer,
  deleteDraftTransfer, postTransfer,
} from '../lib/khizanti_lib_ledger';
import AccountQuickAddModal from './AccountQuickAddModal';
import './CashMovementScreen.css';
import './TransferScreen.css';

interface TransferScreenProps {
  treasuryId: string;
  onDone: () => void;
  editingDraft?: Transfer | null;
}

type Step = 'pick-source' | 'pick-destination' | 'enter-details' | 'draft-ready' | 'posted';

function nowForInput(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function TransferScreen({ treasuryId, onDone, editingDraft }: TransferScreenProps) {
  const isEditing = !!editingDraft;
  const [step, setStep] = useState<Step>(isEditing ? 'enter-details' : 'pick-source');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [query, setQuery] = useState('');
  const [quickAddFor, setQuickAddFor] = useState<'source' | 'destination' | null>(null);

  const [sourceAccount, setSourceAccount] = useState<Account | null>(null);
  const [destinationAccount, setDestinationAccount] = useState<Account | null>(null);

  const [amount, setAmount] = useState(editingDraft ? String(editingDraft.amount) : '');
  const [occurredAt, setOccurredAt] = useState(editingDraft ? editingDraft.occurred_at.slice(0, 16) : nowForInput());
  const [description, setDescription] = useState(editingDraft?.description ?? '');
  const [notes, setNotes] = useState(editingDraft?.notes ?? '');
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftTransfer, setDraftTransfer] = useState<Transfer | null>(editingDraft ?? null);
  const [postedTransfer, setPostedTransfer] = useState<Transfer | null>(null);

  const isPickingAccount = step === 'pick-source' || step === 'pick-destination';

  useEffect(() => {
    if (!isPickingAccount) return;
    let cancelled = false;
    (async () => {
      try {
        const result = query.trim() ? await searchAccounts(treasuryId, query) : await listAccounts(treasuryId);
        if (cancelled) return;
        const filtered = step === 'pick-destination' && sourceAccount ? result.filter((a) => a.id !== sourceAccount.id) : result;
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

  async function handleSaveDraft() {
    const srcId = sourceAccount?.id ?? editingDraft?.source_account_id;
    const dstId = destinationAccount?.id ?? editingDraft?.destination_account_id;
    if (!srcId || !dstId) { setError('يرجى اختيار الحسابين'); return; }
    const numericAmount = Number(amount);
    if (!amount) { setError('يرجى إدخال المبلغ'); return; }
    if (!numericAmount || numericAmount <= 0) { setError('المبلغ يجب أن يكون أكبر من صفر'); return; }

    setSaving(true);
    setError(null);
    try {
      let result: Transfer;
      if (isEditing && draftTransfer) {
        result = await updateDraftTransfer({
          transferId: draftTransfer.id, sourceAccountId: srcId, destinationAccountId: dstId, amount: numericAmount,
          occurredAt: new Date(occurredAt), description: description.trim() || undefined, notes: notes.trim() || undefined,
        });
      } else {
        result = await createDraftTransfer({
          treasuryId, sourceAccountId: srcId, destinationAccountId: dstId, amount: numericAmount,
          occurredAt: new Date(occurredAt), description: description.trim() || undefined, notes: notes.trim() || undefined,
          idempotencyKey,
        });
      }
      setDraftTransfer(result);
      setStep('draft-ready');
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'لا يمكن حفظ المسودة');
    } finally {
      setSaving(false);
    }
  }

  async function handlePostNow() {
    if (!draftTransfer) return;
    setSaving(true);
    setError(null);
    try {
      const posted = await postTransfer(draftTransfer.id);
      setPostedTransfer(posted);
      setStep('posted');
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر الترحيل');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDraft() {
    if (!draftTransfer) return;
    setSaving(true);
    setError(null);
    try {
      await deleteDraftTransfer(draftTransfer.id);
      onDone();
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر حذف المسودة');
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
    setDraftTransfer(null);
    setPostedTransfer(null);
    setError(null);
    setIdempotencyKey(newIdempotencyKey());
  }

  const sourceLabel = sourceAccount?.name ?? editingDraft?.source_account_id ?? '';
  const destLabel = destinationAccount?.name ?? editingDraft?.destination_account_id ?? '';

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
          <input type="search" autoFocus placeholder="ابحث عن حساب المصدر…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="بحث عن حساب المصدر" />
          {error && <p className="kh-movement__error" role="alert">{error}</p>}
          <ul className="kh-movement__account-list">
            <li>
              <button className="kh-movement__account-item" style={{ color: 'var(--color-brass)', fontWeight: 700 }} onClick={() => setQuickAddFor('source')}>
                + إضافة حساب جديد
              </button>
            </li>
            {accounts.map((a) => (
              <li key={a.id}><button className="kh-movement__account-item" onClick={() => pickSource(a)}>{a.name}</button></li>
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
          <input type="search" autoFocus placeholder="ابحث عن حساب الوجهة…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="بحث عن حساب الوجهة" />
          {error && <p className="kh-movement__error" role="alert">{error}</p>}
          <ul className="kh-movement__account-list">
            <li>
              <button className="kh-movement__account-item" style={{ color: 'var(--color-brass)', fontWeight: 700 }} onClick={() => setQuickAddFor('destination')}>
                + إضافة حساب جديد
              </button>
            </li>
            {accounts.map((a) => (
              <li key={a.id}><button className="kh-movement__account-item" onClick={() => pickDestination(a)}>{a.name}</button></li>
            ))}
            {accounts.length === 0 && <li className="kh-movement__hint">لا توجد نتائج</li>}
          </ul>
        </div>
      )}

      {step === 'enter-details' && (
        <div className="kh-movement__form">
          <div className="kh-transfer__summary">
            <button className="kh-movement__change-account" onClick={() => !isEditing && setStep('pick-source')} disabled={isEditing}>من: <strong>{sourceLabel}</strong></button>
            <span className="kh-transfer__arrow">←</span>
            <button className="kh-movement__change-account" onClick={() => !isEditing && setStep('pick-destination')} disabled={isEditing}>إلى: <strong>{destLabel}</strong></button>
          </div>

          <label className="kh-field">
            المبلغ
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
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
            <button className="kh-btn kh-btn--action" onClick={handleSaveDraft} disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : isEditing ? 'حفظ التعديل' : 'حفظ كمسودة'}
            </button>
          </div>
        </div>
      )}

      {step === 'draft-ready' && draftTransfer && (
        <div className="kh-movement__success">
          <p className="kh-movement__success-title">مسودة تحويل محفوظة — لم تؤثر على أي رصيد بعد</p>
          <p className="kh-movement__success-number">{draftTransfer.transfer_number}</p>
          <p className="kh-amount kh-movement__success-amount">
            {draftTransfer.amount.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
          </p>
          {error && <p className="kh-movement__error" role="alert">{error}</p>}
          <div className="kh-movement__actions" style={{ flexWrap: 'wrap' }}>
            <button className="kh-btn kh-btn--ghost" onClick={() => setStep('enter-details')} disabled={saving}>تعديل</button>
            <button className="kh-btn kh-btn--ghost" style={{ color: 'var(--color-danger)' }} onClick={handleDeleteDraft} disabled={saving}>حذف المسودة</button>
            <button className="kh-btn kh-btn--action" onClick={handlePostNow} disabled={saving}>
              {saving ? 'جارٍ الترحيل…' : 'ترحيل الآن'}
            </button>
          </div>
          <button className="kh-btn kh-btn--ghost" style={{ marginTop: 'var(--space-3)' }} onClick={onDone}>
            حفظ كمسودة والعودة للرئيسية
          </button>
        </div>
      )}

      {step === 'posted' && postedTransfer && (
        <div className="kh-movement__success">
          <p className="kh-movement__success-title">تم ترحيل التحويل بنجاح</p>
          <p className="kh-movement__success-number">{postedTransfer.transfer_number}</p>
          <p className="kh-amount kh-movement__success-amount">
            {postedTransfer.amount.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
          </p>
          <div className="kh-movement__actions">
            <button className="kh-btn kh-btn--ghost" onClick={onDone}>عودة للرئيسية</button>
            <button className="kh-btn kh-btn--action" onClick={resetForAnother}>تحويل آخر</button>
          </div>
        </div>
      )}

      {quickAddFor && (
        <AccountQuickAddModal
          treasuryId={treasuryId}
          onClose={() => setQuickAddFor(null)}
          onCreated={(account) => {
            setQuickAddFor(null);
            if (quickAddFor === 'source') pickSource(account); else pickDestination(account);
          }}
        />
      )}
    </div>
  );
}
