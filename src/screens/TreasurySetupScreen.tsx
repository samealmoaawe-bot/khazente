// ============================================================================
// TreasurySetupScreen.tsx — تُعرض مرة واحدة بعد الدخول إن لم توجد خزينة بعد
// ============================================================================
import { useState } from 'react';
import { createTreasury } from '../lib/khizanti_lib_treasury';
import { KhizantiError, Treasury } from '../lib/khizanti_lib_supabase';
import './AuthScreen.css'; // إعادة استخدام تصميم البطاقة المركزية نفسه

interface TreasurySetupScreenProps {
  onCreated: (treasury: Treasury) => void;
}

export default function TreasurySetupScreen({ onCreated }: TreasurySetupScreenProps) {
  const [name, setName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('يرجى إدخال اسم الخزينة'); return; }

    setLoading(true);
    setError(null);
    try {
      const treasury = await createTreasury(name.trim(), openingBalance ? Number(openingBalance) : 0);
      onCreated(treasury);
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر إنشاء الخزينة');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kh-auth">
      <div className="kh-auth__card">
        <h1 className="kh-display kh-auth__title">إنشاء خزينتك</h1>
        <p className="kh-auth__subtitle">أول مرة تستخدم فيها التطبيق — سمِّ خزينتك وابدأ</p>

        <form onSubmit={handleSubmit} className="kh-auth__form">
          <label className="kh-field">
            اسم الخزينة
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="مثال: M A MOBILE" autoFocus required
            />
          </label>

          <label className="kh-field">
            الرصيد النقدي الحالي عند بدء الاستخدام (اختياري)
            <input
              type="number" inputMode="decimal" min="0" step="0.01"
              value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="0.00"
            />
          </label>

          {error && <p className="kh-error-text" role="alert">{error}</p>}

          <button type="submit" className="kh-btn kh-btn--primary kh-auth__submit" disabled={loading}>
            {loading ? 'جارٍ الإنشاء…' : 'إنشاء الخزينة والمتابعة'}
          </button>
        </form>
      </div>
    </div>
  );
}
