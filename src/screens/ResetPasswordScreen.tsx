// ============================================================================
// ResetPasswordScreen.tsx — تُعرض عند فتح رابط الاسترجاع القادم من البريد
// (Supabase ينشئ جلسة استرجاع مؤقتة تلقائيًا بفضل detectSessionInUrl: true)
// ============================================================================
import { useState } from 'react';
import { confirmPasswordReset } from '../lib/khizanti_lib_auth';
import { KhizantiError } from '../lib/khizanti_lib_supabase';
import './AuthScreen.css';

interface ResetPasswordScreenProps {
  onCompleted: () => void;
}

export default function ResetPasswordScreen({ onCompleted }: ResetPasswordScreenProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'انتهت صلاحية الرابط أو حدث خطأ — اطلب رابطًا جديدًا');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kh-auth">
      <div className="kh-auth__card">
        <h1 className="kh-display kh-auth__title">تعيين كلمة مرور جديدة</h1>

        {done ? (
          <>
            <p className="kh-error-text" style={{ background: '#dcefe3', color: 'var(--color-success)' }}>
              تم تحديث كلمة المرور بنجاح.
            </p>
            <button className="kh-btn kh-btn--primary kh-auth__submit" onClick={onCompleted}>
              متابعة إلى التطبيق
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="kh-auth__form">
            <label className="kh-field">
              كلمة المرور الجديدة
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} autoFocus required />
            </label>
            <label className="kh-field">
              تأكيد كلمة المرور الجديدة
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} required />
            </label>

            {error && <p className="kh-error-text" role="alert">{error}</p>}

            <button type="submit" className="kh-btn kh-btn--primary kh-auth__submit" disabled={loading}>
              {loading ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور الجديدة'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
