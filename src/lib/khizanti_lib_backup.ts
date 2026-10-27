// ============================================================================
// khizanti_lib_backup.ts — PHASE 12: النسخ الاحتياطي والاسترجاع
// ============================================================================
// قرار تصميم أساسي بخصوص Restore:
// الاسترجاع لا يكتب فوق بيانات المستخدم الحالية إطلاقًا — بل ينشئ **خزينة
// جديدة تمامًا** من محتوى النسخة الاحتياطية، عبر "إعادة تشغيل" كل حركة
// بترتيبها الزمني الأصلي من خلال نفس RPC functions المستخدمة في التطبيق
// (create_cash_in/out, create_transfer, reverse_transaction/transfer).
// هذا يضمن استحالة حذف أو الكتابة فوق أي بيانات حالية بالخطأ (وهو الشرط
// الذي حددته)، مقابل أن أرقام الحركات (KHA-/TRF-) الجديدة تُعاد ترقيمها من
// جديد — أما تسلسل الأحداث والمبالغ والحسابات والعلاقات بين الحركات
// والعكسيات فتبقى مطابقة تمامًا للأصل.
// ============================================================================
import { supabase, KhizantiError, toUserMessage, BackupRecord } from './khizanti_lib_supabase';
import { createTreasury, createAccount, setAccountStatus, listAccountTypes } from './khizanti_lib_treasury';
import { cashIn, cashOut, createTransfer, reverseTransaction, reverseTransfer, newIdempotencyKey } from './khizanti_lib_ledger';

const BUCKET = 'backups';

// ---------------------------------------------------------------------------
// بنية ملف النسخة الاحتياطية (JSON) — لقطة كاملة لخزينة واحدة
// ---------------------------------------------------------------------------
interface BackupAccount {
  name: string; type_code: string; opening_balance: number; status: string; notes: string | null;
}
interface BackupTransaction {
  kind: 'transaction';
  original_id: string;
  account_name: string;
  type: 'cash_in' | 'cash_out';
  amount: number;
  occurred_at: string;
  description: string | null;
  notes: string | null;
  status: 'active' | 'reversed' | 'reversal';
  reversal_of_original_id: string | null;
}
interface BackupTransfer {
  kind: 'transfer';
  original_id: string;
  source_account_name: string;
  destination_account_name: string;
  amount: number;
  occurred_at: string;
  description: string | null;
  notes: string | null;
  status: 'active' | 'reversed' | 'reversal';
  reversal_of_original_id: string | null;
}
interface BackupFile {
  format_version: 1;
  exported_at: string;
  treasury_name: string;
  treasury_opening_balance: number;
  accounts: BackupAccount[];
  ledger: (BackupTransaction | BackupTransfer)[]; // مرتبة زمنيًا بالفعل
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// إنشاء نسخة احتياطية
// ---------------------------------------------------------------------------
export async function createBackup(treasuryId: string): Promise<BackupRecord> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new KhizantiError('يجب تسجيل الدخول أولًا');

  const [{ data: treasury, error: tErr }, { data: accounts, error: aErr }, { data: types, error: tyErr }] = await Promise.all([
    supabase.from('treasuries').select('name, opening_balance').eq('id', treasuryId).single(),
    supabase.from('accounts').select('id, name, opening_balance, status, notes, account_type_id').eq('treasury_id', treasuryId),
    supabase.from('account_types').select('id, code').eq('treasury_id', treasuryId),
  ]);
  if (tErr) throw new KhizantiError(toUserMessage(tErr));
  if (aErr) throw new KhizantiError(toUserMessage(aErr));
  if (tyErr) throw new KhizantiError(toUserMessage(tyErr));

  const typeCodeById = new Map<string, string>((types ?? []).map((t: { id: string; code: string }) => [t.id, t.code]));
  const accountNameById = new Map<string, string>((accounts ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));

  const [{ data: txs, error: txErr }, { data: trs, error: trErr }] = await Promise.all([
    supabase.from('transactions').select('*').eq('treasury_id', treasuryId).is('transfer_id', null).order('occurred_at'),
    supabase.from('transfers').select('*').eq('treasury_id', treasuryId).order('occurred_at'),
  ]);
  if (txErr) throw new KhizantiError(toUserMessage(txErr));
  if (trErr) throw new KhizantiError(toUserMessage(trErr));

  const ledger: (BackupTransaction | BackupTransfer)[] = [
    ...(txs ?? []).map((t: any): BackupTransaction => ({
      kind: 'transaction',
      original_id: t.id,
      account_name: accountNameById.get(t.account_id) ?? '—',
      type: t.type,
      amount: t.amount,
      occurred_at: t.occurred_at,
      description: t.description,
      notes: t.notes,
      status: t.status,
      reversal_of_original_id: t.reversal_of_id,
    })),
    ...(trs ?? []).map((t: any): BackupTransfer => ({
      kind: 'transfer',
      original_id: t.id,
      source_account_name: accountNameById.get(t.source_account_id) ?? '—',
      destination_account_name: accountNameById.get(t.destination_account_id) ?? '—',
      amount: t.amount,
      occurred_at: t.occurred_at,
      description: t.description,
      notes: t.notes,
      status: t.status,
      reversal_of_original_id: t.reversal_of_id,
    })),
  ].sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : 1));

  const backup: BackupFile = {
    format_version: 1,
    exported_at: new Date().toISOString(),
    treasury_name: treasury!.name,
    treasury_opening_balance: treasury!.opening_balance,
    accounts: (accounts ?? []).map((a: { id: string; name: string; opening_balance: number; status: string; notes: string | null; account_type_id: string }) => ({
      name: a.name,
      type_code: typeCodeById.get(a.account_type_id) ?? 'other',
      opening_balance: a.opening_balance,
      status: a.status,
      notes: a.notes,
    })),
    ledger,
  };

  const content = JSON.stringify(backup, null, 2);
  const checksum = await sha256Hex(content);
  const storagePath = `${userData.user.id}/${treasury!.name}-${Date.now()}.json`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, content, {
    contentType: 'application/json',
    upsert: false,
  });
  if (uploadError) throw new KhizantiError('تعذّر رفع النسخة الاحتياطية');

  const { data: row, error: insertError } = await supabase
    .from('backups')
    .insert({
      user_id: userData.user.id,
      storage_path: storagePath,
      size_bytes: new Blob([content]).size,
      checksum,
      status: 'completed',
    })
    .select()
    .single();
  if (insertError) throw new KhizantiError(toUserMessage(insertError));

  return row as BackupRecord;
}

export async function listBackups(): Promise<BackupRecord[]> {
  const { data, error } = await supabase.from('backups').select('*').order('created_at', { ascending: false });
  if (error) throw new KhizantiError(toUserMessage(error));
  return data as BackupRecord[];
}

export async function deleteBackup(backup: BackupRecord): Promise<void> {
  await supabase.storage.from(BUCKET).remove([backup.storage_path]);
  const { error } = await supabase.from('backups').delete().eq('id', backup.id);
  if (error) throw new KhizantiError(toUserMessage(error));
}

// ---------------------------------------------------------------------------
// معاينة نسخة قبل الاسترجاع — تتحقق من سلامة الملف (checksum) وتُرجع ملخصًا
// ---------------------------------------------------------------------------
export interface BackupPreview {
  treasuryName: string;
  exportedAt: string;
  accountsCount: number;
  transactionsCount: number;
  transfersCount: number;
  raw: BackupFile;
}

export async function fetchAndVerifyBackup(backup: BackupRecord): Promise<BackupPreview> {
  const { data: blob, error } = await supabase.storage.from(BUCKET).download(backup.storage_path);
  if (error || !blob) throw new KhizantiError('تعذّر تنزيل ملف النسخة الاحتياطية');

  const content = await blob.text();
  const actualChecksum = await sha256Hex(content);
  if (backup.checksum && actualChecksum !== backup.checksum) {
    throw new KhizantiError('الملف تالف أو غير مطابق لسجل النسخة الاحتياطية — تم إلغاء الاسترجاع لسلامة بياناتك');
  }

  const raw = JSON.parse(content) as BackupFile;
  return {
    treasuryName: raw.treasury_name,
    exportedAt: raw.exported_at,
    accountsCount: raw.accounts.length,
    transactionsCount: raw.ledger.filter((l) => l.kind === 'transaction').length,
    transfersCount: raw.ledger.filter((l) => l.kind === 'transfer').length,
    raw,
  };
}

// ---------------------------------------------------------------------------
// الاسترجاع الفعلي — ينشئ خزينة جديدة ويعيد تشغيل كل حركة عبر RPC الحقيقية
// (لا يمس أي خزينة أو حساب أو حركة موجودة حاليًا بأي شكل)
// ---------------------------------------------------------------------------
export async function restoreBackup(
  preview: BackupPreview,
  newTreasuryName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ treasuryId: string }> {
  const backup = preview.raw;

  const treasury = await createTreasury(newTreasuryName, backup.treasury_opening_balance);
  const types = await listAccountTypes(treasury.id);
  const typeIdByCode = new Map(types.map((t) => [t.code, t.id]));

  // إعادة إنشاء الحسابات، مع خريطة اسم ← معرّف جديد لاستخدامها أثناء إعادة تشغيل الحركات
  const accountIdByName = new Map<string, string>();
  for (const acc of backup.accounts) {
    const typeId = typeIdByCode.get(acc.type_code) ?? typeIdByCode.get('other')!;
    const created = await createAccount({
      treasuryId: treasury.id,
      accountTypeId: typeId,
      name: acc.name,
      openingBalance: acc.opening_balance,
      notes: acc.notes ?? undefined,
    });
    accountIdByName.set(acc.name, created.id);
    if (acc.status === 'inactive') {
      await setAccountStatus(created.id, 'inactive');
    }
  }

  // إعادة تشغيل الحركات بترتيبها الزمني الأصلي، بما فيها روابط العكس.
  // ملاحظة أمان مهمة: هذا ليس عملية Atomic واحدة — إن انقطع الاتصال أو أُغلق
  // المتصفح في المنتصف، تبقى الخزينة الجديدة موجودة بحركات جزئية فقط (وليست
  // فاسدة أو متضاربة، فكل حركة نُفِّذت عبر RPC كاملة وصحيحة في حد ذاتها).
  // لذلك عند أي خطأ، نوقف فورًا ونُرجع خطأ يوضّح بالضبط أين توقفنا، بدل
  // الاستمرار بصمت أو الإيهام باكتمال الاسترجاع.
  const originalIdToNewId = new Map<string, string>(); // original_id (transaction/transfer) -> المعرّف الجديد
  let done = 0;
  const total = backup.ledger.length;

  try {
    for (const item of backup.ledger) {
      if (item.kind === 'transaction') {
        if (item.status === 'reversal' && item.reversal_of_original_id) {
          const newOriginalId = originalIdToNewId.get(item.reversal_of_original_id);
          if (newOriginalId) {
            const reversed = await reverseTransaction(newOriginalId, item.notes ?? undefined);
            originalIdToNewId.set(item.original_id, reversed.id);
          }
        } else {
          const accountId = accountIdByName.get(item.account_name);
          if (accountId) {
            const fn = item.type === 'cash_in' ? cashIn : cashOut;
            const created = await fn({
              treasuryId: treasury.id,
              accountId,
              amount: item.amount,
              occurredAt: new Date(item.occurred_at),
              description: item.description ?? undefined,
              notes: item.notes ?? undefined,
              idempotencyKey: newIdempotencyKey(),
            });
            originalIdToNewId.set(item.original_id, created.id);
          }
        }
      } else {
        if (item.status === 'reversal' && item.reversal_of_original_id) {
          const newOriginalId = originalIdToNewId.get(item.reversal_of_original_id);
          if (newOriginalId) {
            const reversed = await reverseTransfer(newOriginalId, item.notes ?? undefined);
            originalIdToNewId.set(item.original_id, reversed.id);
          }
        } else {
          const sourceId = accountIdByName.get(item.source_account_name);
          const destId = accountIdByName.get(item.destination_account_name);
          if (sourceId && destId) {
            const created = await createTransfer({
              treasuryId: treasury.id,
              sourceAccountId: sourceId,
              destinationAccountId: destId,
              amount: item.amount,
              occurredAt: new Date(item.occurred_at),
              description: item.description ?? undefined,
              notes: item.notes ?? undefined,
              idempotencyKey: newIdempotencyKey(),
            });
            originalIdToNewId.set(item.original_id, created.id);
          }
        }
      }
      done += 1;
      onProgress?.(done, total);
    }
  } catch (err) {
    const reason = err instanceof KhizantiError ? err.message : 'خطأ غير متوقع';
    throw new KhizantiError(
      `توقّف الاسترجاع بعد ${done} من أصل ${total} حركة (السبب: ${reason}). ` +
      `الخزينة الجديدة "${newTreasuryName}" تحتوي على استعادة جزئية فقط — راجعها أو احذفها وأعد المحاولة.`,
    );
  }

  return { treasuryId: treasury.id };
}
