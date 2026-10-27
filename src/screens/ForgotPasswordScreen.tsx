// ============================================================================
// ForgotPasswordScreen.tsx — يعمل فقط لمن أضاف بريدًا حقيقيًا وأكّده مسبقًا
// ============================================================================
import { useState } from 'react';
import { requestPasswordReset } from '../lib/khizanti_lib_auth';
import { KhizantiError } from '../lib/khizanti_lib_supabase';
import './AuthScreen.css';

interface ForgotPasswordScreenProps {
  onBackToLogin: () => void;
}

export default function ForgotPasswordScreen({ onBackToLogin }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر إرسال رابط الاسترجاع');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kh-auth">
      <div className="kh-auth__card">
        <h1 className="kh-display kh-auth__title">نسيت كلمة المرور؟</h1>

        {sent ? (
          <>
            <p className="kh-auth__subtitle">
              إن كان هذا البريد مسجَّلًا ومؤكَّدًا لديك، ستصلك رسالة تحتوي رابط تعيين كلمة مرور جديدة خلال دقائق.
              تحقّق من مجلد الرسائل غير المرغوبة (Spam) أيضًا.
            </p>
            <button className="kh-btn kh-btn--primary kh-auth__submit" onClick={onBackToLogin}>عودة لتسجيل الدخول</button>
          </>
        ) : (
          <>
            <p className="kh-auth__subtitle">
              تعمل هذه الخاصية فقط إن كنت قد أضفت بريدًا إلكترونيًا حقيقيًا وأكّدته مسبقًا من الإعدادات.
              إن لم تُضِفه بعد، تواصل مع من أنشأ حسابك، أو سجّل دخولك باسم المستخدم ثم أضِف البريد من الإعدادات أولًا.
            </p>
            <form onSubmit={handleSubmit} className="kh-auth__form">
              <label className="kh-field">
                البريد الإلكتروني الحقيقي المسجَّل
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  autoFocus required placeholder="example@email.com"
                />
              </label>

              {error && <p className="kh-error-text" role="alert">{error}</p>}

              <button type="submit" className="kh-btn kh-btn--primary kh-auth__submit" disabled={loading}>
                {loading ? 'جارٍ الإرسال…' : 'إرسال رابط الاسترجاع'}
              </button>
            </form>
          </>
        )}

        <button className="kh-auth__switch" onClick={onBackToLogin}>عودة لتسجيل الدخول</button>
      </div>
    </div>
  );
}
