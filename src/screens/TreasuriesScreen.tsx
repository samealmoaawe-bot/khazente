// ============================================================================
// TreasuriesScreen.tsx — إدارة أكثر من خزينة واحدة داخل نفس حساب المستخدم:
// عرض الكل، التبديل بينها، وإنشاء خزينة إضافية جديدة
// ============================================================================
import { useEffect, useState } from 'react';
import { Treasury, KhizantiError } from '../lib/khizanti_lib_supabase';
import { listMyTreasuries, createTreasury } from '../lib/khizanti_lib_treasury';
import './AccountsScreen.css';
import './CashMovementScreen.css';

interface TreasuriesScreenProps {
  currentTreasuryId: string;
  onSelect: (treasury: Treasury) => void;
  onDone: () => void;
}

export default function TreasuriesScreen({ currentTreasuryId, onSelect, onDone }: TreasuriesScreenProps) {
  const [treasuries, setTreasuries] = useState<Treasury[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOpening, setNewOpening] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { setTreasuries(await listMyTreasuries()); }
    catch (err) { setError(err instanceof KhizantiError ? err.message : 'تعذّر تحميل الخزائن'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) { setError('يرجى إدخال اسم الخزينة'); return; }
    setSaving(true);
    setError(null);
    try {
      const t = await createTreasury(newName.trim(), newOpening ? Number(newOpening) : 0);
      setShowAdd(false);
      setNewName('');
      setNewOpening('');
      await load();
      onSelect(t);
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر إنشاء الخزينة');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="kh-accounts">
      <header className="kh-movement__header">
        <button className="kh-btn kh-btn--ghost" onClick={onDone} aria-label="رجوع">رجوع</button>
        <h1 className="kh-display">خزائني</h1>
        <button className="kh-btn kh-btn--primary" onClick={() => setShowAdd(true)}>خزينة جديدة</button>
      </header>

      {error && <p className="kh-accounts__error" role="alert">{error}</p>}

      {loading ? (
        <p className="kh-dashboard__hint">جارٍ التحميل…</p>
      ) : (
        <ul className="kh-accounts__list">
          {treasuries.map((t) => (
            <li key={t.id}>
              <button
                className="kh-accounts__row"
                style={{ width: '100%', border: 'none', background: t.id === currentTreasuryId ? 'var(--color-primary-soft)' : 'none', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
                onClick={() => onSelect(t)}
              >
                <span className="kh-accounts__name">
                  {t.name} {t.id === currentTreasuryId && '(الحالية)'}
                  {t.status === 'inactive' && <span className="kh-accounts__badge"> معطّلة</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showAdd && (
        <div className="kh-modal-backdrop" onClick={() => setShowAdd(false)}>
          <form className="kh-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate}>
            <h2>خزينة جديدة</h2>
            <label className="kh-field">
              اسم الخزينة
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required autoFocus />
            </label>
            <label className="kh-field">
              الرصيد النقدي الحالي (اختياري)
              <input type="number" min="0" step="0.01" value={newOpening} onChange={(e) => setNewOpening(e.target.value)} placeholder="0.00" />
            </label>
            <div className="kh-modal__actions">
              <button type="button" className="kh-btn kh-btn--ghost" onClick={() => setShowAdd(false)}>إلغاء</button>
              <button type="submit" className="kh-btn kh-btn--primary" disabled={saving}>{saving ? 'جارٍ الإنشاء…' : 'إنشاء'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
