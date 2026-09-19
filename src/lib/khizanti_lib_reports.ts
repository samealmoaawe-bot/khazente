// ============================================================================
// khizanti_lib_reports.ts — PHASE 10: التقارير + Excel + الطباعة/PDF
// ============================================================================
// قرار تقني مهم بخصوص PDF:
// لا نستخدم مكتبات مثل jsPDF لتوليد PDF مباشرة، لأنها لا تدعم العربية RTL
// بشكل سليم افتراضيًا (لا تشكيل صحيح للحروف، ولا اتجاه صحيح، وتحتاج تضمين
// خط عربي يدويًا). البديل الأصح والمستخدم فعليًا في تطبيقات عربية احترافية
// كثيرة: عرض التقرير كصفحة HTML مُنسّقة لطباعة A4، ثم استخدام أمر طباعة
// المتصفح (window.print) — كل المتصفحات الحديثة توفّر "حفظ كـ PDF" كوجهة
// طباعة، فينتج PDF صحيح تمامًا بنفس تنسيق وخط الصفحة العربي. هذا ما تفعله
// هذه الوحدة عبر printReport()، وهو نفس الزر المستخدم لـ"طباعة" و"PDF" معًا.
// أما Excel فمكتبة SheetJS (xlsx) تتعامل مع النصوص العربية كنص Unicode عادي
// بلا أي مشاكل، فنستخدمها مباشرة لتصدير .xlsx حقيقي من جهة العميل بالكامل.
// ============================================================================
import * as XLSX from 'xlsx';
import {
  listTransactionsInRange, listTransfersInRange, listReconciliationsInRange,
  getTreasuryOpeningBalanceAsOf,
} from './khizanti_lib_ledger';
import { listAccounts, getAccountBalances } from './khizanti_lib_treasury';

export type ReportType =
  | 'treasury'        // تقرير الخزينة (يغطي أيضًا "تقرير حسب الفترة")
  | 'cash_in'         // تقرير القبض
  | 'cash_out'        // تقرير الصرف
  | 'transfers'       // تقرير التحويلات
  | 'accounts'        // تقرير الحسابات
  | 'reconciliations' // تقرير المطابقات
  | 'shortage_surplus'; // تقرير العجز والفائض (فلترة على المطابقات)

export interface ReportColumn { key: string; label: string; }
export interface ReportData {
  reportTitle: string;
  treasuryName: string;
  periodLabel: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: Record<string, string>[];
  totals?: Record<string, string>;
}

function money(n: number): string {
  return n.toLocaleString('ar-LY', { minimumFractionDigits: 2 });
}
function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('ar-LY', { dateStyle: 'medium', timeStyle: 'short' });
}
function statusLabel(status: string): string {
  return status === 'active' ? 'نشطة' : status === 'reversed' ? 'ملغاة' : 'عكسية';
}

// ---------------------------------------------------------------------------
// تقرير الخزينة (يشمل تقرير حسب الفترة) — القبض والصرف مع رصيد جارٍ
// ---------------------------------------------------------------------------
export async function buildTreasuryReport(
  treasuryId: string, treasuryName: string, from: string, to: string,
): Promise<ReportData> {
  const [txs, opening] = await Promise.all([
    listTransactionsInRange(treasuryId, from, to),
    getTreasuryOpeningBalanceAsOf(treasuryId, from),
  ]);

  let running = opening;
  const rows = txs.map((t) => {
    running += t.type === 'cash_in' ? t.amount : -t.amount;
    return {
      'رقم الحركة': t.transaction_number,
      'التاريخ': dateTime(t.occurred_at),
      'النوع': t.type === 'cash_in' ? 'قبض' : 'صرف',
      'البيان': t.description ?? '',
      'المبلغ': money(t.amount),
      'الرصيد': money(running),
      'الحالة': statusLabel(t.status),
    };
  });

  const totalIn = txs.filter((t) => t.status === 'active' && t.type === 'cash_in').reduce((s, t) => s + t.amount, 0);
  const totalOut = txs.filter((t) => t.status === 'active' && t.type === 'cash_out').reduce((s, t) => s + t.amount, 0);

  return {
    reportTitle: 'تقرير الخزينة',
    treasuryName,
    periodLabel: `من ${from} إلى ${to}`,
    generatedAt: dateTime(new Date().toISOString()),
    columns: ['رقم الحركة', 'التاريخ', 'النوع', 'البيان', 'المبلغ', 'الرصيد', 'الحالة'].map((k) => ({ key: k, label: k })),
    rows,
    totals: {
      'الرصيد قبل الفترة': money(opening),
      'إجمالي القبض (النشط)': money(totalIn),
      'إجمالي الصرف (النشط)': money(totalOut),
      'الرصيد الختامي': money(running),
    },
  };
}

// ---------------------------------------------------------------------------
// تقرير القبض / تقرير الصرف — نفس البنية بفلترة النوع
// ---------------------------------------------------------------------------
async function buildCashReport(
  treasuryId: string, treasuryName: string, from: string, to: string, type: 'cash_in' | 'cash_out',
): Promise<ReportData> {
  const txs = (await listTransactionsInRange(treasuryId, from, to)).filter((t) => t.type === type);
  const accounts = await listAccounts(treasuryId, { includeInactive: true });
  const nameMap = new Map(accounts.map((a) => [a.id, a.name]));

  const rows = txs.map((t) => ({
    'رقم الحركة': t.transaction_number,
    'التاريخ': dateTime(t.occurred_at),
    'الحساب': nameMap.get(t.account_id) ?? '—',
    'البيان': t.description ?? '',
    'المبلغ': money(t.amount),
    'الحالة': statusLabel(t.status),
  }));

  const total = txs.filter((t) => t.status === 'active').reduce((s, t) => s + t.amount, 0);

  return {
    reportTitle: type === 'cash_in' ? 'تقرير القبض' : 'تقرير الصرف',
    treasuryName,
    periodLabel: `من ${from} إلى ${to}`,
    generatedAt: dateTime(new Date().toISOString()),
    columns: ['رقم الحركة', 'التاريخ', 'الحساب', 'البيان', 'المبلغ', 'الحالة'].map((k) => ({ key: k, label: k })),
    rows,
    totals: { [type === 'cash_in' ? 'إجمالي القبض' : 'إجمالي الصرف']: money(total) },
  };
}
export const buildCashInReport = (t: string, n: string, f: string, to: string) => buildCashReport(t, n, f, to, 'cash_in');
export const buildCashOutReport = (t: string, n: string, f: string, to: string) => buildCashReport(t, n, f, to, 'cash_out');

// ---------------------------------------------------------------------------
// تقرير التحويلات
// ---------------------------------------------------------------------------
export async function buildTransfersReport(
  treasuryId: string, treasuryName: string, from: string, to: string,
): Promise<ReportData> {
  const [transfers, accounts] = await Promise.all([
    listTransfersInRange(treasuryId, from, to),
    listAccounts(treasuryId, { includeInactive: true }),
  ]);
  const nameMap = new Map(accounts.map((a) => [a.id, a.name]));

  const rows = transfers.map((t) => ({
    'رقم التحويل': t.transfer_number,
    'التاريخ': dateTime(t.occurred_at),
    'من حساب': nameMap.get(t.source_account_id) ?? '—',
    'إلى حساب': nameMap.get(t.destination_account_id) ?? '—',
    'المبلغ': money(t.amount),
    'الحالة': statusLabel(t.status),
  }));

  const total = transfers.filter((t) => t.status === 'active').reduce((s, t) => s + t.amount, 0);

  return {
    reportTitle: 'تقرير التحويلات',
    treasuryName,
    periodLabel: `من ${from} إلى ${to}`,
    generatedAt: dateTime(new Date().toISOString()),
    columns: ['رقم التحويل', 'التاريخ', 'من حساب', 'إلى حساب', 'المبلغ', 'الحالة'].map((k) => ({ key: k, label: k })),
    rows,
    totals: { 'إجمالي التحويلات (لا يؤثر على نقد الخزينة)': money(total) },
  };
}

// ---------------------------------------------------------------------------
// تقرير الحسابات — لقطة حالية بالأرصدة (لا يتأثر بالفترة الزمنية)
// ---------------------------------------------------------------------------
export async function buildAccountsReport(treasuryId: string, treasuryName: string): Promise<ReportData> {
  const [accounts, balances] = await Promise.all([
    listAccounts(treasuryId, { includeInactive: true }),
    getAccountBalances(treasuryId),
  ]);
  const balanceMap = new Map(balances.map((b) => [b.account_id, b.current_balance]));

  const rows = accounts.map((a) => ({
    'اسم الحساب': a.name,
    'الرصيد الافتتاحي': money(a.opening_balance),
    'الرصيد الحالي': money(balanceMap.get(a.id) ?? a.opening_balance),
    'الحالة': a.status === 'active' ? 'نشط' : 'معطّل',
  }));

  const totalBalance = accounts.reduce((s, a) => s + (balanceMap.get(a.id) ?? a.opening_balance), 0);

  return {
    reportTitle: 'تقرير الحسابات',
    treasuryName,
    periodLabel: `بتاريخ ${new Date().toISOString().slice(0, 10)}`,
    generatedAt: dateTime(new Date().toISOString()),
    columns: ['اسم الحساب', 'الرصيد الافتتاحي', 'الرصيد الحالي', 'الحالة'].map((k) => ({ key: k, label: k })),
    rows,
    totals: { 'إجمالي أرصدة الحسابات': money(totalBalance) },
  };
}

// ---------------------------------------------------------------------------
// تقرير المطابقات / تقرير العجز والفائض
// ---------------------------------------------------------------------------
async function buildReconciliationsReport(
  treasuryId: string, treasuryName: string, from: string, to: string, onlyDiscrepancies: boolean,
): Promise<ReportData> {
  let recs = await listReconciliationsInRange(treasuryId, from, to);
  if (onlyDiscrepancies) recs = recs.filter((r) => r.result !== 'matched');

  const resultLabel = { matched: 'متساوٍ', shortage: 'عجز', surplus: 'فائض' } as const;

  const rows = recs.map((r) => ({
    'التاريخ': dateTime(r.occurred_at),
    'الرصيد المتوقع': money(r.expected_balance),
    'المبلغ الفعلي': money(r.actual_balance),
    'الفرق': money(r.difference),
    'النتيجة': resultLabel[r.result],
    'ملاحظات': r.notes ?? '',
  }));

  return {
    reportTitle: onlyDiscrepancies ? 'تقرير العجز والفائض' : 'تقرير المطابقات',
    treasuryName,
    periodLabel: `من ${from} إلى ${to}`,
    generatedAt: dateTime(new Date().toISOString()),
    columns: ['التاريخ', 'الرصيد المتوقع', 'المبلغ الفعلي', 'الفرق', 'النتيجة', 'ملاحظات'].map((k) => ({ key: k, label: k })),
    rows,
  };
}
export const buildReconciliationsFullReport = (t: string, n: string, f: string, to: string) =>
  buildReconciliationsReport(t, n, f, to, false);
export const buildShortageSurplusReport = (t: string, n: string, f: string, to: string) =>
  buildReconciliationsReport(t, n, f, to, true);

// ---------------------------------------------------------------------------
// التصدير: Excel (فعلي بالكامل من جهة العميل)
// ---------------------------------------------------------------------------
export function exportToExcel(report: ReportData): void {
  const sheetRows = report.rows.map((r) => {
    const ordered: Record<string, string> = {};
    report.columns.forEach((c) => { ordered[c.label] = r[c.key] ?? ''; });
    return ordered;
  });
  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, report.reportTitle.slice(0, 31));
  XLSX.writeFile(workbook, `${report.reportTitle}-${report.treasuryName}.xlsx`);
}

// ---------------------------------------------------------------------------
// الطباعة / PDF: تُنفَّذ عبر window.print() على عنصر مُنسَّق لـ A4
// (انظر ReportsScreen.css لقواعد @media print)
// ---------------------------------------------------------------------------
export function printReport(): void {
  window.print();
}
