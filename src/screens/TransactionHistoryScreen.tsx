// ============================================================================
// TransactionHistoryScreen.tsx — PHASE 8: سجل الحركات + عكس الحركة
// يدمج الحركات المستقلة (قبض/صرف) مع عمليات التحويل في سجل زمني واحد
// لا حذف نهائي إطلاقًا — فقط عكس (Reversal) يبقي الأصل ظاهرًا مع حالته
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { Account, KhizantiError, Transaction, Transfer } from '../lib/khizanti_lib_supabase';
import { listAccounts } from '../lib/khizanti_lib_treasury';
import { listTransactions, listTransfers, reverseTransaction, reverseTransfer } from '../lib/khizanti_lib_ledger';
import './DashboardScreen.css'; // kh-chip
import './TransactionHistoryScreen.css';

interface TransactionHistoryScreenProps {
  treasuryId: string;
  onDone: () => void;
}

type FeedItem =
  | { kind: 'transaction'; id: string; occurredAt: string; data: Transaction }
  | { kind: 'transfer'; id: string; occurredAt: string; data: Transfer };

const TYPE_LABEL: Record<Transaction['type'], string> = {
  cash_in: 'قبض', cash_out: 'صرف', transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر', opening_balance: 'رصيد افتتاحي', reversal: 'عكس حركة',
};

export default function TransactionHistoryScreen({ treasuryId, onDone }: TransactionHistoryScreenProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [txs, trs, accounts] = await Promise.all([
        listTransactions(treasuryId, 100),
        listTransfers(treasuryId, 100),
        listAccounts(treasuryId, { includeInactive: true }),
      ]);
      setTransactions(txs);
      setTransfers(trs);
      setAccountNames(new Map(accounts.map((a: Account) => [a.id, a.name])));
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر تحميل سجل الحركات');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treasuryId]);

  // خرائط سريعة لإيجاد رابط "عُكست بواسطة..." / "عكس لحركة رقم..."
  const txById = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);
  const trById = useMemo(() => new Map(transfers.map((t) => [t.id, t])), [transfers]);
  const txReversalOfOriginal = useMemo(() => {
    const map = new Map<string, Transaction>(); // original.id -> reversal transaction
    transactions.forEach((t) => { if (t.reversal_of_id) map.set(t.reversal_of_id, t); });
    return map;
  }, [transactions]);
  const trReversalOfOriginal = useMemo(() => {
    const map = new Map<string, Transfer>();
    transfers.forEach((t) => { if (t.reversal_of_id) map.set(t.reversal_of_id, t); });
    return map;
  }, [transfers]);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [
      ...transactions.map((t): FeedItem => ({ kind: 'transaction', id: t.id, occurredAt: t.occurred_at, data: t })),
      ...transfers.map((t): FeedItem => ({ kind: 'transfer', id: t.id, occurredAt: t.occurred_at, data: t })),
    ];
    return items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  }, [transactions, transfers]);

  async function handleReverse(item: FeedItem) {
    setProcessingId(item.id);
    setError(null);
    try {
      if (item.kind === 'transaction') {
        await reverseTransaction(item.id);
      } else {
        await reverseTransfer(item.id);
      }
      setConfirmingId(null);
      await load();
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'لا يمكن تنفيذ العملية');
    } finally {
      setProcessingId(null);
    }
  }

  function renderStatusNote(item: FeedItem): string | null {
    if (item.kind === 'transaction') {
      const t = item.data;
      if (t.status === 'reversed') {
        const rev = txReversalOfOriginal.get(t.id);
        return rev ? `عُكست بواسطة الحركة رقم ${rev.transaction_number}` : 'مُلغاة';
      }
      if (t.status === 'reversal' && t.reversal_of_id) {
        const original = txById.get(t.reversal_of_id);
        return original ? `عكس للحركة رقم ${original.transaction_number}` : 'حركة عكسية';
      }
    } else {
      const t = item.data;
      if (t.status === 'reversed') {
        const rev = trReversalOfOriginal.get(t.id);
        return rev ? `عُكس بواسطة التحويل رقم ${rev.transfer_number}` : 'مُلغى';
      }
      if (t.status === 'reversal' && t.reversal_of_id) {
        const original = trById.get(t.reversal_of_id);
        return original ? `عكس للتحويل رقم ${original.transfer_number}` : 'تحويل عكسي';
      }
    }
    return null;
  }

  return (
    <div className="kh-history">
      <header className="kh-movement__header">
        <button className="kh-btn kh-btn--ghost" onClick={onDone} aria-label="رجوع">رجوع</button>
        <h1 className="kh-display">سجل الحركات</h1>
        <span />
      </header>

      {error && <p className="kh-movement__error" role="alert">{error}</p>}

      {loading ? (
        <p className="kh-dashboard__hint">جارٍ التحميل…</p>
      ) : feed.length === 0 ? (
        <p className="kh-dashboard__hint">لا توجد حركات بعد</p>
      ) : (
        <ul className="kh-history__list">
          {feed.map((item) => {
            const statusNote = renderStatusNote(item);
            const isActive = item.data.status === 'active';
            const number = item.kind === 'transaction' ? item.data.transaction_number : item.data.transfer_number;
            const label = item.kind === 'transaction' ? TYPE_LABEL[item.data.type] : 'تحويل';
            const accountLabel = item.kind === 'transaction'
              ? accountNames.get(item.data.account_id) ?? '—'
              : `${accountNames.get(item.data.source_account_id) ?? '—'} ← ${accountNames.get(item.data.destination_account_id) ?? '—'}`;

            return (
              <li key={item.id} className={`kh-history__row ${!isActive ? 'kh-history__row--muted' : ''}`}>
                <div className="kh-history__main">
                  <span className={`kh-chip ${item.kind === 'transaction' && item.data.type === 'cash_in' ? 'kh-chip--success' : item.kind === 'transaction' && item.data.type === 'cash_out' ? 'kh-chip--danger' : 'kh-chip--brass'}`}>
                    {label}
                  </span>
                  <div className="kh-history__details">
                    <span className="kh-history__number">{number}</span>
                    <span className="kh-history__account">{accountLabel}</span>
                    {statusNote && <span className="kh-history__note">{statusNote}</span>}
                  </div>
                  <span className="kh-amount kh-history__amount">
                    {item.data.amount.toLocaleString('ar-LY', { minimumFractionDigits: 2 })} د.ل
                  </span>
                </div>

                <div className="kh-history__meta">
                  <span className="kh-history__time">
                    {new Date(item.occurredAt).toLocaleString('ar-LY', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>

                  {isActive && (
                    confirmingId === item.id ? (
                      <span className="kh-history__confirm">
                        متأكد من عكس هذه الحركة؟
                        <button
                          className="kh-btn kh-btn--ghost"
                          onClick={() => handleReverse(item)}
                          disabled={processingId === item.id}
                        >
                          {processingId === item.id ? 'جارٍ العكس…' : 'تأكيد'}
                        </button>
                        <button className="kh-btn kh-btn--ghost" onClick={() => setConfirmingId(null)}>تراجع</button>
                      </span>
                    ) : (
                      <button className="kh-history__reverse-link" onClick={() => setConfirmingId(item.id)}>
                        عكس الحركة
                      </button>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
