// ============================================================================
// khizanti_lib_sync.ts — PHASE 13: مزامنة الهاتف/الكمبيوتر
// ============================================================================
// ملاحظة معمارية: البيانات مركزية في Supabase منذ البداية (الخيار B الذي
// اخترته) — فأي حركة تُسجَّل على أي جهاز تصل فورًا لكل الأجهزة عبر نفس
// القاعدة، بلا حاجة لمزامنة تقليدية بين قاعدتي بيانات منفصلتين. ما تبنيه
// هذه الوحدة تحديدًا هو الجزءان الناقصان فعليًا:
//   1) العمل بدون إنترنت: تسجيل حركة أثناء انقطاع الاتصال يُحفظ محليًا في
//      قائمة انتظار (localStorage) بدل أن يفشل، ثم يُرفع تلقائيًا فور عودة
//      الاتصال — بنفس idempotencyKey المُنشأ أصلًا، فلا يمكن أن تتكرر الحركة
//      حتى لو حاول المستخدم الرفع أكثر من مرة.
//   2) التحديث اللحظي: إن كانت الشاشة مفتوحة على جهازين في نفس الوقت،
//      Supabase Realtime يُخطر الجهاز الآخر بالتغيير فور حدوثه (بدل انتظار
//      إعادة تحميل يدوية).
// ============================================================================
import { useEffect, useState } from 'react';
import { supabase, KhizantiError } from './khizanti_lib_supabase';
import { cashIn, cashOut, createTransfer } from './khizanti_lib_ledger';

const QUEUE_KEY = 'khizanti_offline_queue_v1';

type QueueItem =
  | { kind: 'cash_in'; idempotencyKey: string; payload: Parameters<typeof cashIn>[0]; queuedAt: string; lastError?: string }
  | { kind: 'cash_out'; idempotencyKey: string; payload: Parameters<typeof cashOut>[0]; queuedAt: string; lastError?: string }
  | { kind: 'transfer'; idempotencyKey: string; payload: Parameters<typeof createTransfer>[0]; queuedAt: string; lastError?: string };

function getQueue(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function saveQueue(items: QueueItem[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('khizanti-queue-changed'));
}

/** فشل شبكة حقيقي (لا إنترنت) وليس رفضًا منطقيًا من الخادم (مثل مبلغ غير صالح). */
function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true;
  if (err instanceof KhizantiError) return false; // رفض منطقي واضح — لا يُضاف لقائمة الانتظار
  return err instanceof TypeError || String((err as Error)?.message ?? '').toLowerCase().includes('failed to fetch');
}

// ---------------------------------------------------------------------------
// نسخ "واعية بالاتصال" من عمليات الحفظ الحساسة — تُستخدم بدل الاستدعاء المباشر
// في الشاشات التي تريد دعم العمل بلا إنترنت (قبض/صرف/تحويل)
// ---------------------------------------------------------------------------
export interface QueueAwareResult<T> {
  queued: boolean;      // true = حُفظت محليًا بانتظار الاتصال، لم تُنفَّذ بعد
  result: T | null;
}

export async function queueAwareCashIn(payload: Parameters<typeof cashIn>[0]): Promise<QueueAwareResult<Awaited<ReturnType<typeof cashIn>>>> {
  try {
    const result = await cashIn(payload);
    return { queued: false, result };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    saveQueue([...getQueue(), { kind: 'cash_in', idempotencyKey: payload.idempotencyKey, payload, queuedAt: new Date().toISOString() }]);
    return { queued: true, result: null };
  }
}

export async function queueAwareCashOut(payload: Parameters<typeof cashOut>[0]): Promise<QueueAwareResult<Awaited<ReturnType<typeof cashOut>>>> {
  try {
    const result = await cashOut(payload);
    return { queued: false, result };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    saveQueue([...getQueue(), { kind: 'cash_out', idempotencyKey: payload.idempotencyKey, payload, queuedAt: new Date().toISOString() }]);
    return { queued: true, result: null };
  }
}

export async function queueAwareTransfer(payload: Parameters<typeof createTransfer>[0]): Promise<QueueAwareResult<Awaited<ReturnType<typeof createTransfer>>>> {
  try {
    const result = await createTransfer(payload);
    return { queued: false, result };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    saveQueue([...getQueue(), { kind: 'transfer', idempotencyKey: payload.idempotencyKey, payload, queuedAt: new Date().toISOString() }]);
    return { queued: true, result: null };
  }
}

// ---------------------------------------------------------------------------
// رفع قائمة الانتظار فور عودة الاتصال (بالترتيب، وبنفس idempotencyKey لكل عنصر)
// ---------------------------------------------------------------------------
export async function flushOfflineQueue(): Promise<{ synced: number; remaining: number }> {
  const items = getQueue();
  const remainingItems: QueueItem[] = [];
  let synced = 0;
  let stoppedEarly = false;

  for (let i = 0; i < items.length; i++) {
    if (stoppedEarly) { remainingItems.push(items[i]); continue; }
    const item = items[i];
    try {
      if (item.kind === 'cash_in') await cashIn(item.payload);
      else if (item.kind === 'cash_out') await cashOut(item.payload);
      else await createTransfer(item.payload);
      synced += 1;
    } catch (err) {
      if (isNetworkError(err)) {
        // ما زلنا بلا اتصال فعليًا — نتوقف ونُبقي هذا العنصر والبقية كما هي بترتيبها
        stoppedEarly = true;
        remainingItems.push(item);
      } else {
        // رفض منطقي حقيقي (نادر جدًا هنا لأن idempotencyKey يمنع التكرار) — نُبقيه ظاهرًا مع سبب الفشل
        remainingItems.push({ ...item, lastError: err instanceof KhizantiError ? err.message : 'فشل غير متوقع' });
      }
    }
  }

  saveQueue(remainingItems);
  return { synced, remaining: remainingItems.length };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushOfflineQueue(); });
}

// ---------------------------------------------------------------------------
// Hooks للواجهة
// ---------------------------------------------------------------------------
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

export function usePendingQueueCount(): number {
  const [count, setCount] = useState(getQueue().length);
  useEffect(() => {
    const update = () => setCount(getQueue().length);
    window.addEventListener('khizanti-queue-changed', update);
    return () => window.removeEventListener('khizanti-queue-changed', update);
  }, []);
  return count;
}

/** يعيد أي حركات فشلت نهائيًا برفض منطقي (نادر) بحيث يمكن للمستخدم مراجعتها وحذفها يدويًا. */
export function getFailedQueueItems(): QueueItem[] {
  return getQueue().filter((i) => i.lastError);
}
export function discardQueueItem(idempotencyKey: string): void {
  saveQueue(getQueue().filter((i) => i.idempotencyKey !== idempotencyKey));
}

// ---------------------------------------------------------------------------
// تحديث لحظي عند تغيّر بيانات الخزينة من جهاز آخر (يتطلب تنفيذ
// khizanti_schema_addendum_realtime.sql أولًا على Supabase)
// ---------------------------------------------------------------------------
export function useRealtimeTreasury(treasuryId: string | null, onChange: () => void): void {
  useEffect(() => {
    if (!treasuryId) return;

    // تجميع الأحداث المتلاحقة (مثل عشرات التغييرات أثناء استرجاع نسخة احتياطية)
    // في نداء تحديث واحد بدل إعادة تحميل كاملة لكل حدث على حدة.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedOnChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(onChange, 800);
    };

    const channel = supabase
      .channel(`treasury-${treasuryId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `treasury_id=eq.${treasuryId}` }, debouncedOnChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers', filter: `treasury_id=eq.${treasuryId}` }, debouncedOnChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'treasuries', filter: `id=eq.${treasuryId}` }, debouncedOnChange)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treasuryId]);
}
