// ============================================================================
// SyncStatusBanner.tsx — PHASE 13: شريط حالة الاتصال وقائمة الانتظار
// يُوضع مرة واحدة أعلى التطبيق (في الغلاف الرئيسي App.tsx) فوق كل الشاشات
// ============================================================================
import { useOnlineStatus, usePendingQueueCount, flushOfflineQueue } from '../lib/khizanti_lib_sync';
import './SyncStatusBanner.css';

export default function SyncStatusBanner() {
  const online = useOnlineStatus();
  const pendingCount = usePendingQueueCount();

  if (online && pendingCount === 0) return null; // الوضع الطبيعي — لا داعٍ لإظهار أي شيء

  return (
    <div className={`kh-sync-banner ${!online ? 'kh-sync-banner--offline' : ''}`}>
      {!online ? (
        <span>غير متصل بالإنترنت — الحركات الجديدة تُحفظ محليًا وستُرفع تلقائيًا عند عودة الاتصال</span>
      ) : (
        <span>جارٍ رفع {pendingCount} حركة محفوظة محليًا…</span>
      )}
      {online && pendingCount > 0 && (
        <button className="kh-sync-banner__retry" onClick={() => flushOfflineQueue()}>إعادة المحاولة الآن</button>
      )}
    </div>
  );
}
