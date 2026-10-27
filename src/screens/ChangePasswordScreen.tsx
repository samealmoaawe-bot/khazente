// ============================================================================
// ChangePasswordScreen.tsx — تغيير كلمة المرور من داخل الإعدادات
// ============================================================================
import { useState } from 'react';
import { changePassword } from '../lib/khizanti_lib_auth';
import { KhizantiError } from '../lib/khizanti_lib_supabase';
import './AuthScreen.css'; // نفس تصميم بطاقة تسجيل الدخول (kh-auth / kh-auth__card)

interface ChangePasswordScreenProps {
  onDone: () => void;
}

export default function ChangePasswordScreen({ onDone }: ChangePasswordScreenProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('كلمة المرور الجديدة وتأكيدها غير متطابقين');
      return;
    }
    if (newPassword === currentPassword) {
      setError('كلمة المرور الجديدة يجب أن تختلف عن الحالية');
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kh-auth">
      <div className="kh-auth__card">
        <h1 className="kh-display kh-auth__title">تغيير كلمة المرور</h1>
        <p className="kh-auth__subtitle">يلزم إدخال كلمة المرور الحالية للتأكيد</p>

        {success ? (
          <>
            <p className="kh-error-text" style={{ background: '#dcefe3', color: 'var(--color-success)' }}>
              تم تغيير كلمة المرور بنجاح.
            </p>
            <button className="kh-btn kh-btn--primary kh-auth__submit" onClick={onDone}>
              رجوع للإعدادات
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="kh-auth__form">
            <label className="kh-field">
              كلمة المرور الحالية
              <input
                type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password" autoFocus required
              />
            </label>

            <label className="kh-field">
              كلمة المرور الجديدة
              <input
                type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password" minLength={6} required
              />
            </label>

            <label className="kh-field">
              تأكيد كلمة المرور الجديدة
              <input
                type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password" required
              />
            </label>

            {error && <p className="kh-error-text" role="alert">{error}</p>}

            <button type="submit" className="kh-btn kh-btn--primary kh-auth__submit" disabled={loading}>
              {loading ? 'جارٍ التحديث…' : 'تحديث كلمة المرور'}
            </button>
          </form>
        )}

        <button className="kh-auth__switch" onClick={onDone}>إلغاء والعودة</button>
      </div>
    </div>
  );
}
