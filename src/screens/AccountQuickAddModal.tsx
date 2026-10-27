// ============================================================================
// AccountQuickAddModal.tsx — إضافة حساب جديد بسرعة من داخل أي شاشة (قبض/صرف/
// تحويل) بدل الاضطرار للخروج إلى شاشة "الحسابات" أولًا
// ============================================================================
import { useEffect, useState } from 'react';
import { Account, AccountType, KhizantiError } from '../lib/khizanti_lib_supabase';
import { listAccountTypes, createAccount } from '../lib/khizanti_lib_treasury';

interface AccountQuickAddModalProps {
  treasuryId: string;
  onClose: () => void;
  onCreated: (account: Account) => void; // يُختار الحساب الجديد تلقائيًا في الشاشة الأصلية
}

export default function AccountQuickAddModal({ treasuryId, onClose, onCreated }: AccountQuickAddModalProps) {
  const [types, setTypes] = useState<AccountType[]>([]);
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAccountTypes(treasuryId).then((t) => { setTypes(t); setTypeId(t[0]?.id ?? ''); }).catch(() => {});
  }, [treasuryId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const account = await createAccount({ treasuryId, accountTypeId: typeId, name });
      onCreated(account);
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
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="مثال: محل طرابلس" />
        </label>
        <label className="kh-field">
          نوع الحساب
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name_ar}</option>)}
          </select>
        </label>
        {error && <p className="kh-error-text" role="alert">{error}</p>}
        <div className="kh-modal__actions">
          <button type="button" className="kh-btn kh-btn--ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="kh-btn kh-btn--primary" disabled={saving}>
            {saving ? 'جارٍ الحفظ…' : 'إنشاء واختيار'}
          </button>
        </div>
      </form>
    </div>
  );
}
