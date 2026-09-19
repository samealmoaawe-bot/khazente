// ============================================================================
// khizanti_lib_treasury.ts
// إدارة الخزينة والحسابات — CRUD مباشر عبر RLS (ليست عمليات مالية حساسة)
// ============================================================================
import { supabase, KhizantiError, toUserMessage, Treasury, Account, AccountType, AccountBalance } from './khizanti_lib_supabase';

/** ينشئ خزينة جديدة للمستخدم الحالي، مع رصيد افتتاحي اختياري. */
export async function createTreasury(name: string, openingBalance = 0): Promise<Treasury> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new KhizantiError('يجب تسجيل الدخول أولًا');

  if (!name || !name.trim()) throw new KhizantiError('يرجى إدخال اسم الخزينة');
  if (openingBalance < 0) throw new KhizantiError('الرصيد الافتتاحي لا يمكن أن يكون سالبًا');

  const { data, error } = await supabase
    .from('treasuries')
    .insert({ user_id: userData.user.id, name: name.trim(), opening_balance: openingBalance })
    .select()
    .single();

  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Treasury;
}

/** الخزينة الأساسية للمستخدم الحالي (الإصدار الأول: خزينة واحدة نشطة). */
export async function getMyTreasury(): Promise<Treasury | null> {
  const { data, error } = await supabase
    .from('treasuries')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Treasury | null;
}

export async function renameTreasury(treasuryId: string, newName: string): Promise<void> {
  if (!newName.trim()) throw new KhizantiError('يرجى إدخال اسم صالح للخزينة');
  const { error } = await supabase
    .from('treasuries')
    .update({ name: newName.trim() })
    .eq('id', treasuryId);
  if (error) throw new KhizantiError(toUserMessage(error));
}

// -------------------- أنواع الحسابات --------------------

export async function listAccountTypes(treasuryId: string): Promise<AccountType[]> {
  const { data, error } = await supabase
    .from('account_types')
    .select('*')
    .eq('treasury_id', treasuryId)
    .order('is_system', { ascending: false });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as AccountType[];
}

// -------------------- الحسابات --------------------

export async function listAccounts(treasuryId: string, opts: { includeInactive?: boolean } = {}): Promise<Account[]> {
  let query = supabase.from('accounts').select('*').eq('treasury_id', treasuryId);
  if (!opts.includeInactive) query = query.eq('status', 'active');
  const { data, error } = await query.order('name', { ascending: true });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Account[];
}

/** بحث سريع بالاسم داخل حسابات المستخدم فقط (RLS تمنع أي تسرّب) */
export async function searchAccounts(treasuryId: string, query: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('treasury_id', treasuryId)
    .eq('status', 'active')
    .ilike('name', `%${query.trim()}%`)
    .order('name', { ascending: true })
    .limit(20);
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Account[];
}

export async function createAccount(params: {
  treasuryId: string;
  accountTypeId: string;
  name: string;
  openingBalance?: number;
  notes?: string;
}): Promise<Account> {
  if (!params.name.trim()) throw new KhizantiError('يرجى إدخال اسم الحساب');
  if ((params.openingBalance ?? 0) < 0) throw new KhizantiError('الرصيد الافتتاحي لا يمكن أن يكون سالبًا');

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      treasury_id: params.treasuryId,
      account_type_id: params.accountTypeId,
      name: params.name.trim(),
      opening_balance: params.openingBalance ?? 0,
      notes: params.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new KhizantiError(toUserMessage(error));
  return data as Account;
}

export async function setAccountStatus(accountId: string, status: 'active' | 'inactive'): Promise<void> {
  const { error } = await supabase.from('accounts').update({ status }).eq('id', accountId);
  if (error) throw new KhizantiError(toUserMessage(error));
}

/** أرصدة كل الحسابات النشطة لخزينة معيّنة (من View محسوبة، وليست أرقامًا مخزَّنة). */
export async function getAccountBalances(treasuryId: string): Promise<AccountBalance[]> {
  const { data, error } = await supabase
    .from('account_balances')
    .select('*')
    .eq('treasury_id', treasuryId)
    .order('name', { ascending: true });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as AccountBalance[];
}
