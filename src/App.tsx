// ============================================================================
// App.tsx — الهيكل الرئيسي: مصادقة ← خزينة ← لوحة التحكم وكل الشاشات
// ============================================================================
import { useEffect, useState } from 'react';
import { getCurrentSession, onAuthStateChange } from './lib/khizanti_lib_auth';
import { getMyTreasury } from './lib/khizanti_lib_treasury';
import { Treasury } from './lib/khizanti_lib_supabase';

import AuthScreen from './screens/AuthScreen';
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
import SyncStatusBanner from './screens/SyncStatusBanner';

type Screen =
  | 'dashboard' | 'accounts' | 'cash_in' | 'cash_out' | 'transfer'
  | 'reconciliation' | 'statement' | 'daily_closing' | 'backup'
  | 'reports' | 'history' | 'settings';

type AppState = 'loading' | 'auth' | 'treasury_setup' | 'app';

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
      const session = await getCurrentSession();
      if (session) await loadAfterAuth();
      else setState('auth');
    })();

    const unsubscribe = onAuthStateChange((isLoggedIn) => {
      if (!isLoggedIn) {
        setTreasury(null);
        setState('auth');
      }
    });
    return unsubscribe;
  }, []);

  function handleNavigate(target: DashboardTarget | 'history') {
    setScreen(target as Screen);
  }

  function openAccountStatement(accountId: string, accountName?: string) {
    setSelectedAccount({ id: accountId, name: accountName ?? '' });
    setScreen('statement');
  }

  if (state === 'loading') {
    return <p className="kh-dashboard__hint">جارٍ التحميل…</p>;
  }

  if (state === 'auth') {
    return <AuthScreen onAuthenticated={loadAfterAuth} />;
  }

  if (state === 'treasury_setup') {
    return (
      <TreasurySetupScreen
        onCreated={(t) => { setTreasury(t); setState('app'); }}
      />
    );
  }

  // state === 'app' — treasury مضمون غير فارغ هنا
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
        />
      )}

      {(screen === 'cash_in' || screen === 'cash_out') && (
        <CashMovementScreen
          treasuryId={t.id}
          type={screen}
          onDone={() => setScreen('dashboard')}
        />
      )}

      {screen === 'transfer' && (
        <TransferScreen treasuryId={t.id} onDone={() => setScreen('dashboard')} />
      )}

      {screen === 'reconciliation' && (
        <ReconciliationScreen treasuryId={t.id} onDone={() => setScreen('dashboard')} />
      )}

      {screen === 'statement' && selectedAccount && (
        <AccountStatementScreen
          accountId={selectedAccount.id}
          accountName={selectedAccount.name}
          onDone={() => setScreen('accounts')}
        />
      )}

      {screen === 'daily_closing' && (
        <DailyClosingScreen treasuryId={t.id} onDone={() => setScreen('dashboard')} />
      )}

      {screen === 'backup' && (
        <BackupScreen
          treasuryId={t.id}
          onDone={() => setScreen('dashboard')}
          onRestoredTreasury={(newId) => {
            // الخزينة المستعادة منفصلة تمامًا — نبقي المستخدم على خزينته الحالية
            // ونكتفي بإعلامه؛ التبديل بين عدة خزائن خارج نطاق الإصدار الأول.
            setScreen('dashboard');
            alert('تم إنشاء خزينة جديدة من النسخة الاحتياطية بنجاح. سنضيف لاحقًا إمكانية التبديل بين عدة خزائن.');
            void newId;
          }}
        />
      )}

      {screen === 'reports' && (
        <ReportsScreen treasuryId={t.id} treasuryName={t.name} onDone={() => setScreen('dashboard')} />
      )}

      {screen === 'history' && (
        <TransactionHistoryScreen treasuryId={t.id} onDone={() => setScreen('dashboard')} />
      )}

      {screen === 'settings' && (
        <SettingsScreen
          onNavigate={(target) => setScreen(target)}
          onDone={() => setScreen('dashboard')}
        />
      )}
    </>
  );
}
