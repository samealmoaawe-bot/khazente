// ============================================================================
// AuthScreen.tsx — تسجيل الدخول / إنشاء حساب — باسم مستخدم فقط
// ============================================================================
import { useState } from 'react';
import { signIn, signUp } from '../lib/khizanti_lib_auth';
import { KhizantiError } from '../lib/khizanti_lib_supabase';
import './AuthScreen.css';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(username, password);
      } else {
        await signUp(username, password);
      }
      onAuthenticated();
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kh-auth">
      <div className="kh-auth__card">
        <h1 className="kh-display kh-auth__title">خزينتي</h1>
        <p className="kh-auth__subtitle">
          {mode === 'login' ? 'تسجيل الدخول إلى خزينتك' : 'إنشاء حساب جديد'}
        </p>

        <form onSubmit={handleSubmit} className="kh-auth__form">
          <label className="kh-field">
            اسم المستخدم
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              placeholder="مثال: ahmed_shop"
              required
            />
          </label>

          <label className="kh-field">
            كلمة المرور
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>

          {mode === 'register' && (
            <label className="kh-field">
              تأكيد كلمة المرور
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
          )}

          {error && <p className="kh-error-text" role="alert">{error}</p>}

          <button type="submit" className="kh-btn kh-btn--primary kh-auth__submit" disabled={loading}>
            {loading ? 'جارٍ التحقق…' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب'}
          </button>
        </form>

        <button
          className="kh-auth__switch"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
        >
          {mode === 'login' ? 'ليس لديك حساب؟ أنشئ واحدًا' : 'لديك حساب بالفعل؟ سجّل الدخول'}
        </button>
      </div>
    </div>
  );
}
