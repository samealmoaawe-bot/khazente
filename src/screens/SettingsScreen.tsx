// ============================================================================
// SettingsScreen.tsx
// ============================================================================
import { signOut } from '../lib/khizanti_lib_auth';
import './AccountsScreen.css';
import './CashMovementScreen.css';

export type SettingsTarget =
  | 'daily_closing' | 'backup' | 'history' | 'drafts' | 'treasuries' | 'zero_out'
  | 'change_password' | 'recovery_email';

interface SettingsScreenProps {
  onNavigate: (target: SettingsTarget) => void;
  onDone: () => void;
}

export default function SettingsScreen({ onNavigate, onDone }: SettingsScreenProps) {
  const items: { key: SettingsTarget; label: string; danger?: boolean }[] = [
    { key: 'drafts', label: 'المسودات (بانتظار الترحيل)' },
    { key: 'history', label: 'سجل الحركات' },
    { key: 'treasuries', label: 'خزائني' },
    { key: 'daily_closing', label: 'الإقفال اليومي' },
    { key: 'backup', label: 'النسخ الاحتياطي' },
    { key: 'change_password', label: 'تغيير كلمة المرور' },
    { key: 'recovery_email', label: 'البريد الإلكتروني للاسترجاع' },
    { key: 'zero_out', label: 'تصفير الخزينة', danger: true },
  ];

  return (
    <div className="kh-accounts">
      <header className="kh-movement__header">
        <button className="kh-btn kh-btn--ghost" onClick={onDone} aria-label="رجوع">رجوع</button>
        <h1 className="kh-display">الإعدادات</h1>
        <span />
      </header>

      <ul className="kh-accounts__list">
        {items.map((item) => (
          <li key={item.key}>
            <button
              className="kh-accounts__row"
              style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', color: item.danger ? 'var(--color-danger)' : 'inherit' }}
              onClick={() => onNavigate(item.key)}
            >
              <span className="kh-accounts__name">{item.label}</span>
            </button>
          </li>
        ))}
        <li>
          <button
            className="kh-accounts__row"
            style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', color: 'var(--color-danger)' }}
            onClick={() => signOut()}
          >
            <span className="kh-accounts__name">تسجيل الخروج</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
