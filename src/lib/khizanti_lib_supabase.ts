// ============================================================================
// khizanti_lib_supabase.ts
// تهيئة عميل Supabase + الأنواع (Types) المشتركة المطابقة لـ Database Schema
// ============================================================================
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// يجب تعريف هذين المتغيرين في .env.local (Vite/Next) — لا تضع القيم هنا مباشرة
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// فحص مبكر وواضح بدل ترك مكتبة Supabase ترمي خطأ داخليًا غامضًا لاحقًا —
// هذا الخطأ يظهر في Console فورًا حتى لو حدث أثناء تحميل الوحدة (قبل أي render)
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'متغيرات البيئة غير مضبوطة: تأكد من وجود ملف .env.local في جذر المشروع فيه ' +
    'VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY، ثم أعد تشغيل npm run dev (لا يكفي تعديل الملف فقط).',
  );
}
if (SUPABASE_URL.includes('/rest/') || SUPABASE_URL.includes('/auth/')) {
  throw new Error(
    'VITE_SUPABASE_URL يجب أن يكون رابط المشروع الأساسي فقط (مثال: https://xxxx.supabase.co) ' +
    'بدون /rest/v1/ أو أي مسار إضافي — المكتبة تضيف هذه المسارات بنفسها.',
  );
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,        // يبقي الجلسة محفوظة محليًا (ضروري لـ PWA)
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// -------------------- الأنواع المطابقة لقاعدة البيانات --------------------

export type AccountStatus = 'active' | 'inactive';
export type TreasuryStatus = 'active' | 'inactive';
export type TransactionType =
  | 'cash_in' | 'cash_out' | 'transfer_out' | 'transfer_in'
  | 'opening_balance' | 'reversal';
export type TransactionStatus = 'active' | 'reversed' | 'reversal';
export type ReconciliationResult = 'matched' | 'shortage' | 'surplus';

export interface Treasury {
  id: string;
  user_id: string;
  name: string;
  currency_code: string;
  opening_balance: number;
  opening_balance_date: string;
  last_matched_reconciliation_id: string | null;
  last_matched_date: string | null;
  status: TreasuryStatus;
  created_at: string;
  updated_at: string;
}

export interface AccountType {
  id: string;
  treasury_id: string;
  code: string;
  name_ar: string;
  is_system: boolean;
}

export interface Account {
  id: string;
  treasury_id: string;
  account_type_id: string;
  name: string;
  opening_balance: number;
  opening_balance_date: string;
  status: AccountStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountBalance {
  account_id: string;
  treasury_id: string;
  name: string;
  current_balance: number;
}

export interface Transaction {
  id: string;
  transaction_number: string;
  treasury_id: string;
  account_id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  occurred_at: string;
  description: string | null;
  notes: string | null;
  status: TransactionStatus;
  reversal_of_id: string | null;
  transfer_id: string | null;
}

export interface Transfer {
  id: string;
  transfer_number: string;
  treasury_id: string;
  source_account_id: string;
  destination_account_id: string;
  amount: number;
  occurred_at: string;
  description: string | null;
  notes: string | null;
  status: TransactionStatus;
  reversal_of_id: string | null;
}

export interface Reconciliation {
  id: string;
  treasury_id: string;
  occurred_at: string;
  expected_balance: number;
  actual_balance: number;
  difference: number;
  result: ReconciliationResult;
  notes: string | null;
}

export interface DailyClosing {
  id: string;
  closing_number: string;
  treasury_id: string;
  closing_date: string;
  expected_balance: number;
  actual_balance: number | null;
  total_cash_in: number;
  total_cash_out: number;
  transactions_count: number;
  status: 'draft' | 'closed';
}

export interface StatementRow {
  transaction_number: string;
  occurred_at: string;
  type: TransactionType;
  amount: number;
  description: string | null;
  notes: string | null;
  status: TransactionStatus;
  running_balance: number;
}

export interface BackupRecord {
  id: string;
  user_id: string;
  storage_path: string;
  size_bytes: number | null;
  checksum: string | null;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
  restored_at: string | null;
}

// خطأ موحّد يُعرض في الواجهة برسالة عربية مفهومة (وليس رسالة Postgres الخام)
export class KhizantiError extends Error {}

/** يحوّل أي خطأ من Supabase/Postgres إلى رسالة عربية آمنة للعرض للمستخدم. */
export function toUserMessage(error: unknown): string {
  const raw = (error as { message?: string })?.message ?? '';
  // رسائل RPC المخصصة (raise exception '...') تصل كما هي بالعربية — نعرضها مباشرة
  if (raw && !raw.toLowerCase().includes('permission denied') && !raw.includes('duplicate key')) {
    return raw;
  }
  if (raw.includes('duplicate key')) return 'هذه البيانات مسجّلة مسبقًا';
  return 'تعذّر تنفيذ العملية، يرجى المحاولة مرة أخرى';
}
