// ============================================================================
// SettingsScreen.tsx — قائمة بسيطة: نقطة الوصول للإقفال اليومي والنسخ
// الاحتياطي وسجل الحركات وتسجيل الخروج (لا تُكرر ما يوجد أصلًا في لوحة التحكم)
// ============================================================================
import { signOut } from '../lib/khizanti_lib_auth';
import './AccountsScreen.css'; // kh-accounts__list / kh-accounts__row (نمط قائمة موحّد)
import './CashMovementScreen.css'; // kh-movement__header

export type SettingsTarget = 'daily_closing' | 'backup' | 'history';

interface SettingsScreenProps {
  onNavigate: (target: SettingsTarget) => void;
  onDone: () => void;
}

export default function SettingsScreen({ onNavigate, onDone }: SettingsScreenProps) {
  const items: { key: SettingsTarget; label: string }[] = [
    { key: 'history', label: 'سجل الحركات' },
    { key: 'daily_closing', label: 'الإقفال اليومي' },
    { key: 'backup', label: 'النسخ الاحتياطي' },
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
              style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
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
