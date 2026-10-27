// ============================================================================
// RecoveryEmailScreen.tsx — إضافة/تحديث البريد الحقيقي لتفعيل "نسيت كلمة
// المرور"، وعرض حالته الحالية
// ============================================================================
import { useEffect, useState } from 'react';
import { getCurrentEmailInfo, addRecoveryEmail } from '../lib/khizanti_lib_auth';
import { KhizantiError } from '../lib/khizanti_lib_supabase';
import './AuthScreen.css';

interface RecoveryEmailScreenProps {
  onDone: () => void;
}

export default function RecoveryEmailScreen({ onDone }: RecoveryEmailScreenProps) {
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [isReal, setIsReal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getCurrentEmailInfo()
      .then((info) => { setCurrentEmail(info.email); setIsReal(info.isReal); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await addRecoveryEmail(newEmail);
      setSent(true);
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر إضافة البريد');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="kh-auth">
      <div className="kh-auth__card">
        <h1 className="kh-display kh-auth__title">البريد الإلكتروني للاسترجاع</h1>

        {loading ? (
          <p className="kh-auth__subtitle">جارٍ التحميل…</p>
        ) : sent ? (
          <>
            <p className="kh-error-text" style={{ background: '#dcefe3', color: 'var(--color-success)' }}>
              أُرسل رابط تأكيد إلى {newEmail}. افتحه لتفعيل هذا البريد — بعدها تعمل خاصية "نسيت كلمة المرور" وتستطيع الدخول به مباشرة أيضًا.
            </p>
            <button className="kh-btn kh-btn--primary kh-auth__submit" onClick={onDone}>رجوع للإعدادات</button>
          </>
        ) : (
          <>
            <p className="kh-auth__subtitle">
              {isReal
                ? `بريدك الحالي المؤكَّد: ${currentEmail}. يمكنك تحديثه أدناه.`
                : 'لم تُضِف بريدًا حقيقيًا بعد — خاصية "نسيت كلمة المرور" غير متاحة حتى تضيفه وتؤكّده.'}
            </p>
            <form onSubmit={handleSubmit} className="kh-auth__form">
              <label className="kh-field">
                {isReal ? 'بريد جديد' : 'بريدك الإلكتروني الحقيقي'}
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoFocus required placeholder="example@email.com" />
              </label>

              {error && <p className="kh-error-text" role="alert">{error}</p>}

              <button type="submit" className="kh-btn kh-btn--primary kh-auth__submit" disabled={saving}>
                {saving ? 'جارٍ الإرسال…' : 'إرسال رابط التأكيد'}
              </button>
            </form>
          </>
        )}

        <button className="kh-auth__switch" onClick={onDone}>إلغاء والعودة</button>
      </div>
    </div>
  );
}
