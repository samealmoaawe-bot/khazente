// ============================================================================
// BackupScreen.tsx — PHASE 12: النسخ الاحتياطي والاسترجاع
// الاسترجاع ينشئ خزينة جديدة دائمًا — لا يمس بياناتك الحالية إطلاقًا
// ============================================================================
import { useEffect, useState } from 'react';
import { BackupRecord, KhizantiError } from '../lib/khizanti_lib_supabase';
import {
  createBackup, listBackups, deleteBackup,
  fetchAndVerifyBackup, restoreBackup, BackupPreview,
} from '../lib/khizanti_lib_backup';
import './CashMovementScreen.css'; // kh-field / kh-btn / kh-movement__header / kh-movement__error
import './DashboardScreen.css';    // kh-dashboard__hint
import './BackupScreen.css';

interface BackupScreenProps {
  treasuryId: string;
  onDone: () => void;
  onRestoredTreasury: (newTreasuryId: string) => void;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} كيلوبايت` : `${(bytes / 1024 / 1024).toFixed(2)} ميغابايت`;
}

export default function BackupScreen({ treasuryId, onDone, onRestoredTreasury }: BackupScreenProps) {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [previewingBackup, setPreviewingBackup] = useState<BackupRecord | null>(null);
  const [newTreasuryName, setNewTreasuryName] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{ done: number; total: number } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setBackups(await listBackups());
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر تحميل النسخ الاحتياطية');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateBackup() {
    setCreating(true);
    setError(null);
    try {
      await createBackup(treasuryId);
      await load();
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر إنشاء النسخة الاحتياطية');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(backup: BackupRecord) {
    setError(null);
    try {
      await deleteBackup(backup);
      await load();
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر حذف النسخة الاحتياطية');
    }
  }

  async function handlePreview(backup: BackupRecord) {
    setError(null);
    setPreviewingBackup(backup);
    setPreview(null);
    try {
      const p = await fetchAndVerifyBackup(backup);
      setPreview(p);
      setNewTreasuryName(`${p.treasuryName} (مستعادة)`);
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر التحقق من النسخة الاحتياطية');
      setPreviewingBackup(null);
    }
  }

  async function handleConfirmRestore() {
    if (!preview) return;
    if (!newTreasuryName.trim()) { setError('يرجى إدخال اسم للخزينة المستعادة'); return; }
    setRestoring(true);
    setError(null);
    setRestoreProgress({ done: 0, total: preview.transactionsCount + preview.transfersCount });
    try {
      const result = await restoreBackup(preview, newTreasuryName.trim(), (done, total) => setRestoreProgress({ done, total }));
      setPreviewingBackup(null);
      setPreview(null);
      onRestoredTreasury(result.treasuryId);
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر إتمام الاسترجاع');
    } finally {
      setRestoring(false);
      setRestoreProgress(null);
    }
  }

  return (
    <div className="kh-backup">
      <header className="kh-movement__header">
        <button className="kh-btn kh-btn--ghost" onClick={onDone} aria-label="رجوع">رجوع</button>
        <h1 className="kh-display">النسخ الاحتياطي</h1>
        <span />
      </header>

      <p className="kh-backup__hint">
        الاسترجاع لا يحذف أو يعدّل أي بيانات حالية — كل استرجاع يُنشئ خزينة جديدة منفصلة تمامًا يمكنك مراجعتها قبل أي قرار.
      </p>

      {error && <p className="kh-movement__error" role="alert">{error}</p>}

      <button className="kh-btn kh-btn--primary kh-backup__create" onClick={handleCreateBackup} disabled={creating}>
        {creating ? 'جارٍ إنشاء النسخة…' : 'إنشاء نسخة احتياطية الآن'}
      </button>

      {loading ? (
        <p className="kh-dashboard__hint">جارٍ التحميل…</p>
      ) : (
        <ul className="kh-backup__list">
          {backups.map((b) => (
            <li key={b.id} className="kh-backup__row">
              <div className="kh-backup__row-main">
                <span className="kh-backup__date">{new Date(b.created_at).toLocaleString('ar-LY', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span className="kh-backup__size">{formatSize(b.size_bytes)}</span>
              </div>
              <div className="kh-backup__row-actions">
                <button className="kh-btn kh-btn--ghost" onClick={() => handlePreview(b)}>استرجاع</button>
                <button className="kh-backup__delete" onClick={() => handleDelete(b)}>حذف</button>
              </div>
            </li>
          ))}
          {backups.length === 0 && <li className="kh-dashboard__hint">لا توجد نسخ احتياطية بعد</li>}
        </ul>
      )}

      {previewingBackup && (
        <div className="kh-modal-backdrop" onClick={() => !restoring && setPreviewingBackup(null)}>
          <div className="kh-modal" onClick={(e) => e.stopPropagation()}>
            <h2>استرجاع نسخة احتياطية</h2>

            {!preview ? (
              <p className="kh-dashboard__hint">جارٍ التحقق من سلامة الملف…</p>
            ) : restoring ? (
              <p className="kh-dashboard__hint">
                جارٍ الاسترجاع… {restoreProgress ? `${restoreProgress.done} / ${restoreProgress.total}` : ''}
              </p>
            ) : (
              <>
                <ul className="kh-backup__preview-summary">
                  <li>الخزينة الأصلية: <strong>{preview.treasuryName}</strong></li>
                  <li>تاريخ النسخة: <strong>{new Date(preview.exportedAt).toLocaleString('ar-LY')}</strong></li>
                  <li>عدد الحسابات: <strong>{preview.accountsCount}</strong></li>
                  <li>عدد الحركات: <strong>{preview.transactionsCount}</strong></li>
                  <li>عدد التحويلات: <strong>{preview.transfersCount}</strong></li>
                </ul>

                <label className="kh-field">
                  اسم الخزينة الجديدة المستعادة
                  <input value={newTreasuryName} onChange={(e) => setNewTreasuryName(e.target.value)} />
                </label>

                <div className="kh-modal__actions">
                  <button className="kh-btn kh-btn--ghost" onClick={() => setPreviewingBackup(null)}>إلغاء</button>
                  <button className="kh-btn kh-btn--primary" onClick={handleConfirmRestore}>
                    تأكيد الاسترجاع في خزينة جديدة
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
