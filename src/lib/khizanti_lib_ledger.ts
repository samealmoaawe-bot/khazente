// ============================================================================
// khizanti_lib_ledger.ts
// كل العمليات المالية الحساسة — تمر حصرًا عبر RPC (لا INSERT مباشر إطلاقًا)
// كل عملية "كتابة" تولّد idempotency key تلقائيًا لحماية مضاعفة الضغط على "حفظ"
// ============================================================================
import {
  supabase, KhizantiError, toUserMessage,
  Transaction, Transfer, Reconciliation, DailyClosing, StatementRow,
} from './khizanti_lib_supabase';

/** معرّف فريد لكل محاولة حفظ — يُنشأ مرة واحدة عند فتح النموذج، وليس عند كل نقرة. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

function assertPositiveAmount(amount: number) {
  if (!amount || amount <= 0) throw new KhizantiError('المبلغ يجب أن يكون أكبر من صفر');
}

// -------------------- قبض / صرف --------------------

export async function cashIn(params: {
  treasuryId: string;
  accountId: string;
  amount: number;
  occurredAt?: Date;
  description?: string;
  notes?: string;
  idempotencyKey: string;
}): Promise<Transaction> {
  assertPositiveAmount(params.amount);
  const { data, error } = await supabase.rpc('create_cash_in', {
    p_treasury_id: params.treasuryId,
    p_account_id: params.accountId,
    p_amount: params.amount,
    p_occurred_at: (params.occurredAt ?? new Date()).toISOString(),
    p_description: params.description ?? null,
    p_notes: params.notes ?? null,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Transaction;
}

export async function cashOut(params: {
  treasuryId: string;
  accountId: string;
  amount: number;
  occurredAt?: Date;
  description?: string;
  notes?: string;
  idempotencyKey: string;
}): Promise<Transaction> {
  assertPositiveAmount(params.amount);
  const { data, error } = await supabase.rpc('create_cash_out', {
    p_treasury_id: params.treasuryId,
    p_account_id: params.accountId,
    p_amount: params.amount,
    p_occurred_at: (params.occurredAt ?? new Date()).toISOString(),
    p_description: params.description ?? null,
    p_notes: params.notes ?? null,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Transaction;
}

// -------------------- تحويل --------------------

export async function createTransfer(params: {
  treasuryId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  occurredAt?: Date;
  description?: string;
  notes?: string;
  idempotencyKey: string;
}): Promise<Transfer> {
  assertPositiveAmount(params.amount);
  if (params.sourceAccountId === params.destinationAccountId) {
    throw new KhizantiError('لا يمكن التحويل إلى نفس الحساب');
  }
  const { data, error } = await supabase.rpc('create_transfer', {
    p_treasury_id: params.treasuryId,
    p_source_account_id: params.sourceAccountId,
    p_destination_account_id: params.destinationAccountId,
    p_amount: params.amount,
    p_occurred_at: (params.occurredAt ?? new Date()).toISOString(),
    p_description: params.description ?? null,
    p_notes: params.notes ?? null,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Transfer;
}

// -------------------- عكس الحركة --------------------

export async function reverseTransaction(transactionId: string, notes?: string): Promise<Transaction> {
  const { data, error } = await supabase.rpc('reverse_transaction', {
    p_transaction_id: transactionId,
    p_notes: notes ?? null,
  });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Transaction;
}

export async function reverseTransfer(transferId: string, notes?: string): Promise<Transfer> {
  const { data, error } = await supabase.rpc('reverse_transfer', {
    p_transfer_id: transferId,
    p_notes: notes ?? null,
  });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Transfer;
}

// -------------------- المطابقة --------------------

export async function createReconciliation(params: {
  treasuryId: string;
  actualBalance: number;
  notes?: string;
  idempotencyKey?: string;
}): Promise<Reconciliation> {
  if (params.actualBalance == null || params.actualBalance < 0) {
    throw new KhizantiError('يرجى إدخال المبلغ الفعلي الموجود في الخزينة');
  }
  const { data, error } = await supabase.rpc('create_reconciliation', {
    p_treasury_id: params.treasuryId,
    p_actual_balance: params.actualBalance,
    p_notes: params.notes ?? null,
    p_idempotency_key: params.idempotencyKey ?? null,
  });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Reconciliation;
}

/** آخر مطابقة تمت (أي نتيجة: متساوٍ/عجز/فائض) — تُستخدم في لوحة التحكم. */
export async function getLastReconciliation(treasuryId: string): Promise<Reconciliation | null> {
  const { data, error } = await supabase
    .from('reconciliations')
    .select('*')
    .eq('treasury_id', treasuryId)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Reconciliation | null;
}

/** سجل المطابقات — لعرض التاريخ الكامل في شاشة المطابقة والتقارير. */
export async function listReconciliations(treasuryId: string, limit = 10): Promise<Reconciliation[]> {
  const { data, error } = await supabase
    .from('reconciliations')
    .select('*')
    .eq('treasury_id', treasuryId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Reconciliation[];
}

/** الحركات المستقلة (قبض/صرف/عكس) فقط — أرجل التحويل تُعرض عبر listTransfers بدلًا من هنا. */
export async function listTransactions(treasuryId: string, limit = 50): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('treasury_id', treasuryId)
    .is('transfer_id', null)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Transaction[];
}

/** كل عمليات التحويل (تُعرض كسطر واحد لكل عملية بدل طرفيها المنفصلين). */
export async function listTransfers(treasuryId: string, limit = 50): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from('transfers')
    .select('*')
    .eq('treasury_id', treasuryId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Transfer[];
}

/** حركات مستقلة (قبض/صرف) ضمن فترة محدَّدة — للتقارير. */
export async function listTransactionsInRange(treasuryId: string, fromDate: string, toDate: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('treasury_id', treasuryId)
    .is('transfer_id', null)
    .gte('occurred_at', `${fromDate}T00:00:00`)
    .lte('occurred_at', `${toDate}T23:59:59`)
    .order('occurred_at', { ascending: true });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Transaction[];
}

/** عمليات التحويل ضمن فترة محدَّدة — للتقارير. */
export async function listTransfersInRange(treasuryId: string, fromDate: string, toDate: string): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from('transfers')
    .select('*')
    .eq('treasury_id', treasuryId)
    .gte('occurred_at', `${fromDate}T00:00:00`)
    .lte('occurred_at', `${toDate}T23:59:59`)
    .order('occurred_at', { ascending: true });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Transfer[];
}

/** المطابقات ضمن فترة محدَّدة — لتقرير المطابقات وتقرير العجز والفائض. */
export async function listReconciliationsInRange(treasuryId: string, fromDate: string, toDate: string): Promise<Reconciliation[]> {
  const { data, error } = await supabase
    .from('reconciliations')
    .select('*')
    .eq('treasury_id', treasuryId)
    .gte('occurred_at', `${fromDate}T00:00:00`)
    .lte('occurred_at', `${toDate}T23:59:59`)
    .order('occurred_at', { ascending: true });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Reconciliation[];
}

/** الرصيد النقدي للخزينة كما كان تمامًا في بداية تاريخ معيّن (لحساب "الرصيد قبل الفترة"). */
export async function getTreasuryOpeningBalanceAsOf(treasuryId: string, dateISO: string): Promise<number> {
  const [treasuryRes, txRes] = await Promise.all([
    supabase.from('treasuries').select('opening_balance').eq('id', treasuryId).single(),
    supabase.from('transactions').select('type, amount')
      .eq('treasury_id', treasuryId).is('transfer_id', null).lt('occurred_at', `${dateISO}T00:00:00`),
  ]);
  if (treasuryRes.error) throw new KhizantiError(toUserMessage(treasuryRes.error));
  if (txRes.error) throw new KhizantiError(toUserMessage(txRes.error));
  const base = treasuryRes.data?.opening_balance ?? 0;
  const sum = (txRes.data ?? []).reduce(
    (acc: number, t: { type: string; amount: number }) =>
      acc + (t.type === 'cash_in' ? t.amount : t.type === 'cash_out' ? -t.amount : 0),
    0,
  );
  return base + sum;
}

// -------------------- الإقفال اليومي (اختياري) --------------------

export async function createDailyClosing(params: {
  treasuryId: string;
  closingDate: string; // 'YYYY-MM-DD'
  actualBalance?: number;
  notes?: string;
}): Promise<DailyClosing> {
  const { data, error } = await supabase.rpc('create_daily_closing', {
    p_treasury_id: params.treasuryId,
    p_closing_date: params.closingDate,
    p_actual_balance: params.actualBalance ?? null,
    p_notes: params.notes ?? null,
  });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as DailyClosing;
}

/** سجل الإقفالات اليومية السابقة. */
export async function listDailyClosings(treasuryId: string, limit = 15): Promise<DailyClosing[]> {
  const { data, error } = await supabase
    .from('daily_closings')
    .select('*')
    .eq('treasury_id', treasuryId)
    .order('closing_date', { ascending: false })
    .limit(limit);
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as DailyClosing[];
}

// -------------------- كشف حساب لفترة --------------------

export async function getAccountStatement(
  accountId: string,
  fromDate: string, // 'YYYY-MM-DD'
  toDate: string,
): Promise<StatementRow[]> {
  const { data, error } = await supabase.rpc('get_account_statement', {
    p_account_id: accountId,
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as StatementRow[];
}

// -------------------- لوحة التحكم (تجميع عدة Views في نداء واحد منطقي) --------------------

export interface DashboardData {
  expectedBalance: number;
  totalCashIn: number;
  totalCashOut: number;
  transactionsCount: number;
  lastMatchedDate: string | null;
  recentTransactions: Transaction[];
}

export async function getDashboard(treasuryId: string): Promise<DashboardData> {
  const [expectedRes, totalsRes, treasuryRes, recentRes] = await Promise.all([
    supabase.from('treasury_expected_balance').select('expected_balance').eq('treasury_id', treasuryId).single(),
    supabase.from('treasury_totals').select('total_cash_in,total_cash_out,transactions_count').eq('treasury_id', treasuryId).single(),
    supabase.from('treasuries').select('last_matched_date').eq('id', treasuryId).single(),
    supabase.from('transactions').select('*').eq('treasury_id', treasuryId).order('occurred_at', { ascending: false }).limit(10),
  ]);

  if (expectedRes.error) throw new KhizantiError(toUserMessage(expectedRes.error));
  if (totalsRes.error) throw new KhizantiError(toUserMessage(totalsRes.error));
  if (treasuryRes.error) throw new KhizantiError(toUserMessage(treasuryRes.error));
  if (recentRes.error) throw new KhizantiError(toUserMessage(recentRes.error));

  return {
    expectedBalance: expectedRes.data?.expected_balance ?? 0,
    totalCashIn: totalsRes.data?.total_cash_in ?? 0,
    totalCashOut: totalsRes.data?.total_cash_out ?? 0,
    transactionsCount: totalsRes.data?.transactions_count ?? 0,
    lastMatchedDate: treasuryRes.data?.last_matched_date ?? null,
    recentTransactions: (recentRes.data ?? []) as Transaction[],
  };
}
