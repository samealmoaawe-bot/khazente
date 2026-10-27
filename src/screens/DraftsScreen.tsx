// ============================================================================
// DraftsScreen.tsx — كل المسودات (قبض/صرف/تحويل) بانتظار الترحيل أو الحذف أو
// التعديل. هذه الشاشة + "إلغاء الترحيل" في سجل الحركات = دورة التعديل الكاملة
// التي طلبتها دون كتابة فوق أي حركة مُرحَّلة بالفعل.
// ============================================================================
import { useEffect, useState } from 'react';
import { KhizantiError, Transaction, Transfer } from '../lib/khizanti_lib_supabase';
import { listAccounts } from '../lib/khizanti_lib_treasury';
import {
  listDraftTransactions, listDraftTransfers,
  postTransaction, postTransfer, deleteDraftTransaction, deleteDraftTransfer,
} from '../lib/khizanti_lib_ledger';
import CashMovementScreen from './CashMovementScreen';
import TransferScreen from './TransferScreen';
import './DashboardScreen.css'; // kh-chip / kh-dashboard__hint
import './CashMovementScreen.css';

interface DraftsScreenProps {
  treasuryId: string;
  onDone: () => void;
}

const TYPE_LABEL: Record<Transaction['type'], string> = {
  cash_in: 'قبض', cash_out: 'صرف', transfer_out: 'تحويل صادر',
  transfer_in: 'تحويل وارد', opening_balance: 'رصيد افتتاحي', reversal: 'عكس حركة',
};

export default function DraftsScreen({ treasuryId, onDone }: DraftsScreenProps) {
  const [txDrafts, setTxDrafts] = useState<Transaction[]>([]);
  const [transferDrafts, setTransferDrafts] = useState<Transfer[]>([]);
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [txs, transfers, accounts] = await Promise.all([
        listDraftTransactions(treasuryId), listDraftTransfers(treasuryId), listAccounts(treasuryId, { includeInactive: true }),
      ]);
      setTxDrafts(txs);
      setTransferDrafts(transfers);
      setAccountNames(new Map(accounts.map((a) => [a.id, a.name])));
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر تحميل المسودات');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [treasuryId]);

  async function handlePostTx(id: string) {
    setBusyId(id); setError(null);
    try { await postTransaction(id); await load(); }
    catch (err) { setError(err instanceof KhizantiError ? err.message : 'تعذّر الترحيل'); }
    finally { setBusyId(null); }
  }
  async function handlePostTransfer(id: string) {
    setBusyId(id); setError(null);
    try { await postTransfer(id); await load(); }
    catch (err) { setError(err instanceof KhizantiError ? err.message : 'تعذّر الترحيل'); }
    finally { setBusyId(null); }
  }
  async function handleDeleteTx(id: string) {
    setBusyId(id); setError(null);
    try { await deleteDraftTransaction(id); await load(); }
    catch (err) { setError(err instanceof KhizantiError ? err.message : 'تعذّر الحذف'); }
    finally { setBusyId(null); }
  }
  async function handleDeleteTransfer(id: string) {
    setBusyId(id); setError(null);
    try { await deleteDraftTransfer(id); await load(); }
    catch (err) { setError(err instanceof KhizantiError ? err.message : 'تعذّر الحذف'); }
    finally { setBusyId(null); }
  }

  if (editingTx) {
    return (
      <CashMovementScreen
        treasuryId={treasuryId}
        type={editingTx.type === 'cash_out' ? 'cash_out' : 'cash_in'}
        editingDraft={editingTx}
        onDone={() => { setEditingTx(null); load(); }}
      />
    );
  }
  if (editingTransfer) {
    return (
      <TransferScreen
        treasuryId={treasuryId}
        editingDraft={editingTransfer}
        onDone={() => { setEditingTransfer(null); load(); }}
      />
    );
  }

  return (
    <div className="kh-history">
      <header className="kh-movement__header">
        <button className="kh-btn kh-btn--ghost" onClick={onDone} aria-label="رجوع">رجوع</button>
        <h1 className="kh-display">المسودات</h1>
        <span />
      </header>

      <p className="kh-closing__hint" style={{ background: 'var(--color-primary-soft)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)', fontSize: '0.85rem', color: 'var(--color-ink-muted)' }}>
        المسودات لا تؤثر على أي رصيد. رحّلها لتصبح حركة حقيقية، أو عدّلها، أو احذفها بحرية كاملة.
      </p>

      {error && <p className="kh-movement__error" role="alert">{error}</p>}

      {loading ? (
        <p className="kh-dashboard__hint">جارٍ التحميل…</p>
      ) : txDrafts.length === 0 && transferDrafts.length === 0 ? (
        <p className="kh-dashboard__hint">لا توجد مسودات حاليًا</p>
      ) : (
        <ul className="kh-history__list">
          {txDrafts.map((tx) => (
            <li key={tx.id} className="kh-history__row">
              <div className="kh-history__main">
                <span className={`kh-chip ${tx.type === 'cash_in' ? 'kh-chip--success' : 'kh-chip--danger'}`}>{TYPE_LABEL[tx.type]}</span>
                <div className="kh-history__details">
                  <span className="kh-history__number">{tx.transaction_number}</span>
                  <span className="kh-history__account">{accountNames.get(tx.account_id) ?? '—'}</span>
                </div>
                <span className="kh-amount kh-history__amount">{tx.amount.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل</span>
              </div>
              <div className="kh-history__meta" style={{ gap: 'var(--space-2)' }}>
                <button className="kh-btn kh-btn--ghost" onClick={() => setEditingTx(tx)} disabled={busyId === tx.id}>تعديل</button>
                <button className="kh-history__reverse-link" onClick={() => handleDeleteTx(tx.id)} disabled={busyId === tx.id}>حذف</button>
                <button className="kh-btn kh-btn--action kh-accent--transfer" style={{ padding: 'var(--space-1) var(--space-3)' }} onClick={() => handlePostTx(tx.id)} disabled={busyId === tx.id}>
                  {busyId === tx.id ? '...' : 'ترحيل'}
                </button>
              </div>
            </li>
          ))}
          {transferDrafts.map((tr) => (
            <li key={tr.id} className="kh-history__row">
              <div className="kh-history__main">
                <span className="kh-chip kh-chip--brass">تحويل</span>
                <div className="kh-history__details">
                  <span className="kh-history__number">{tr.transfer_number}</span>
                  <span className="kh-history__account">
                    {accountNames.get(tr.source_account_id) ?? '—'} ← {accountNames.get(tr.destination_account_id) ?? '—'}
                  </span>
                </div>
                <span className="kh-amount kh-history__amount">{tr.amount.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل</span>
              </div>
              <div className="kh-history__meta" style={{ gap: 'var(--space-2)' }}>
                <button className="kh-btn kh-btn--ghost" onClick={() => setEditingTransfer(tr)} disabled={busyId === tr.id}>تعديل</button>
                <button className="kh-history__reverse-link" onClick={() => handleDeleteTransfer(tr.id)} disabled={busyId === tr.id}>حذف</button>
                <button className="kh-btn kh-btn--action kh-accent--transfer" style={{ padding: 'var(--space-1) var(--space-3)' }} onClick={() => handlePostTransfer(tr.id)} disabled={busyId === tr.id}>
                  {busyId === tr.id ? '...' : 'ترحيل'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
