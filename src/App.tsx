// ============================================================================
// App.tsx — الهيكل الرئيسي: مصادقة ← خزينة ← لوحة التحكم وكل الشاشات
// + مسار استرجاع كلمة المرور (/reset-password) من رابط البريد
// ============================================================================
import { useEffect, useState } from 'react';
import { getCurrentSession, onAuthStateChange } from './lib/khizanti_lib_auth';
import { getMyTreasury, listMyTreasuries } from './lib/khizanti_lib_treasury';
import { Treasury } from './lib/khizanti_lib_supabase';

import AuthScreen from './screens/AuthScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import TreasurySetupScreen from './screens/TreasurySetupScreen';
import DashboardScreen, { DashboardTarget } from './screens/DashboardScreen';
import AccountsScreen from './screens/AccountsScreen';
import CashMovementScreen from './screens/CashMovementScreen';
import TransferScreen from './screens/TransferScreen';
import ReconciliationScreen from './screens/ReconciliationScreen';
import AccountStatementScreen from './screens/AccountStatementScreen';
import DailyClosingScreen from './screens/DailyClosingScreen';
import BackupScreen from './screens/BackupScreen';
import ReportsScreen from './screens/ReportsScreen';
import TransactionHistoryScreen from './screens/TransactionHistoryScreen';
import SettingsScreen from './screens/SettingsScreen';
import DraftsScreen from './screens/DraftsScreen';
import TreasuriesScreen from './screens/TreasuriesScreen';
import ZeroOutScreen from './screens/ZeroOutScreen';
import ChangePasswordScreen from './screens/ChangePasswordScreen';
import RecoveryEmailScreen from './screens/RecoveryEmailScreen';
import SyncStatusBanner from './screens/SyncStatusBanner';

type Screen =
  | 'dashboard' | 'accounts' | 'cash_in' | 'cash_out' | 'transfer'
  | 'reconciliation' | 'statement' | 'daily_closing' | 'backup'
  | 'reports' | 'history' | 'settings' | 'drafts' | 'treasuries' | 'zero_out'
  | 'change_password' | 'recovery_email';

type AppState = 'loading' | 'auth' | 'reset_password' | 'treasury_setup' | 'app';

/** هل فُتحت الصفحة من رابط استرجاع كلمة المرور القادم من البريد؟ */
function isRecoveryUrl(): boolean {
  return window.location.pathname === '/reset-password' || window.location.hash.includes('type=recovery');
}

export default function App() {
  const [state, setState] = useState<AppState>('loading');
  const [treasury, setTreasury] = useState<Treasury | null>(null);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string } | null>(null);

  async function loadAfterAuth() {
    try {
      const existing = await getMyTreasury();
      if (existing) {
        setTreasury(existing);
        setState('app');
      } else {
        setState('treasury_setup');
      }
    } catch {
      setState('treasury_setup');
    }
  }

  useEffect(() => {
    (async () => {
      // الأولوية القصوى: لو الصفحة فُتحت من رابط الاسترجاع، لا نُكمل التدفق العادي
      // (لأن Supabase أنشأ جلسة استرجاع مؤقتة، وستبدو كمستخدم "مسجَّل دخوله" عاديًا)
      if (isRecoveryUrl()) {
        setState('reset_password');
        return;
      }
      const session = await getCurrentSession();
      if (session) await loadAfterAuth();
      else setState('auth');
    })();

    const unsubscribe = onAuthStateChange((isLoggedIn, isPasswordRecovery) => {
      if (isPasswordRecovery) {
        setState('reset_password');
        return;
      }
      if (!isLoggedIn) {
        setTreasury(null);
        setState('auth');
      }
    });
    return unsubscribe;
  }, []);

  function handleNavigate(target: DashboardTarget | 'history' | 'drafts' | 'treasuries' | 'zero_out') {
    setScreen(target as Screen);
  }

  function openAccountStatement(accountId: string, accountName?: string) {
    setSelectedAccount({ id: accountId, name: accountName ?? '' });
    setScreen('statement');
  }

  async function switchToTreasuryById(treasuryId: string) {
    try {
      const all = await listMyTreasuries();
      const found = all.find((tr) => tr.id === treasuryId);
      if (found) { setTreasury(found); setScreen('dashboard'); }
    } catch {
      // فشل التبديل التلقائي لا يعطّل التطبيق
    }
  }

  if (state === 'loading') {
    return <p className="kh-dashboard__hint">جارٍ التحميل…</p>;
  }

  if (state === 'reset_password') {
    return (
      <ResetPasswordScreen
        onCompleted={() => {
          window.history.replaceState({}, '', '/'); // تنظيف الرابط (إزالة /reset-password والـ token)
          setState('loading');
          loadAfterAuth();
        }}
      />
    );
  }

  if (state === 'auth') {
    return <AuthScreen onAuthenticated={loadAfterAuth} />;
  }

  if (state === 'treasury_setup') {
    return <TreasurySetupScreen onCreated={(t) => { setTreasury(t); setState('app'); }} />;
  }

  const t = treasury!;

  return (
    <>
      <SyncStatusBanner />

      {screen === 'dashboard' && (
        <DashboardScreen
          treasuryId={t.id}
          treasuryName={t.name}
          onNavigate={handleNavigate}
          onOpenAccount={(accountId) => openAccountStatement(accountId)}
        />
      )}

      {screen === 'accounts' && (
        <AccountsScreen
          treasuryId={t.id}
          onOpenStatement={(accountId) => openAccountStatement(accountId)}
          onDone={() => setScreen('dashboard')}
        />
      )}

      {(screen === 'cash_in' || screen === 'cash_out') && (
        <CashMovementScreen treasuryId={t.id} type={screen} onDone={() => setScreen('dashboard')} />
      )}

      {screen === 'transfer' && <TransferScreen treasuryId={t.id} onDone={() => setScreen('dashboard')} />}

      {screen === 'reconciliation' && <ReconciliationScreen treasuryId={t.id} onDone={() => setScreen('dashboard')} />}

      {screen === 'statement' && selectedAccount && (
        <AccountStatementScreen
          accountId={selectedAccount.id}
          accountName={selectedAccount.name}
          onDone={() => setScreen('accounts')}
        />
      )}

      {screen === 'daily_closing' && <DailyClosingScreen treasuryId={t.id} onDone={() => setScreen('dashboard')} />}

      {screen === 'backup' && (
        <BackupScreen
          treasuryId={t.id}
          onDone={() => setScreen('dashboard')}
          onRestoredTreasury={(newId) => { switchToTreasuryById(newId); }}
        />
      )}

      {screen === 'reports' && (
        <ReportsScreen treasuryId={t.id} treasuryName={t.name} onDone={() => setScreen('dashboard')} />
      )}

      {screen === 'history' && <TransactionHistoryScreen treasuryId={t.id} onDone={() => setScreen('dashboard')} />}

      {screen === 'drafts' && <DraftsScreen treasuryId={t.id} onDone={() => setScreen('dashboard')} />}

      {screen === 'treasuries' && (
        <TreasuriesScreen
          currentTreasuryId={t.id}
          onSelect={(selected) => { setTreasury(selected); setScreen('dashboard'); }}
          onDone={() => setScreen('dashboard')}
        />
      )}

      {screen === 'zero_out' && <ZeroOutScreen treasuryId={t.id} onDone={() => setScreen('dashboard')} />}

      {screen === 'change_password' && <ChangePasswordScreen onDone={() => setScreen('settings')} />}

      {screen === 'recovery_email' && <RecoveryEmailScreen onDone={() => setScreen('settings')} />}

      {screen === 'settings' && (
        <SettingsScreen onNavigate={(target) => setScreen(target)} onDone={() => setScreen('dashboard')} />
      )}
    </>
  );
}
