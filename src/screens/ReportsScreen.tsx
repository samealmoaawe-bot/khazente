// ============================================================================
// ReportsScreen.tsx — PHASE 10: التقارير + Excel + الطباعة/PDF
// ============================================================================
import { useState } from 'react';
import { KhizantiError } from '../lib/khizanti_lib_supabase';
import {
  ReportType, ReportData, exportToExcel, printReport,
  buildTreasuryReport, buildCashInReport, buildCashOutReport,
  buildTransfersReport, buildAccountsReport,
  buildReconciliationsFullReport, buildShortageSurplusReport,
} from '../lib/khizanti_lib_reports';
import './CashMovementScreen.css'; // kh-field / kh-btn / kh-movement__header
import './ReportsScreen.css';

interface ReportsScreenProps {
  treasuryId: string;
  treasuryName: string;
  onDone: () => void;
}

const REPORT_OPTIONS: { value: ReportType; label: string; needsPeriod: boolean }[] = [
  { value: 'treasury', label: 'تقرير الخزينة (حسب الفترة)', needsPeriod: true },
  { value: 'cash_in', label: 'تقرير القبض', needsPeriod: true },
  { value: 'cash_out', label: 'تقرير الصرف', needsPeriod: true },
  { value: 'transfers', label: 'تقرير التحويلات', needsPeriod: true },
  { value: 'accounts', label: 'تقرير الحسابات', needsPeriod: false },
  { value: 'reconciliations', label: 'تقرير المطابقات', needsPeriod: true },
  { value: 'shortage_surplus', label: 'تقرير العجز والفائض', needsPeriod: true },
];

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsScreen({ treasuryId, treasuryName, onDone }: ReportsScreenProps) {
  const [reportType, setReportType] = useState<ReportType>('treasury');
  const [fromDate, setFromDate] = useState(firstDayOfMonth());
  const [toDate, setToDate] = useState(today());
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOption = REPORT_OPTIONS.find((o) => o.value === reportType)!;

  async function handleGenerate() {
    if (selectedOption.needsPeriod && fromDate > toDate) {
      setError('تاريخ البداية يجب أن يسبق تاريخ النهاية');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let data: ReportData;
      switch (reportType) {
        case 'treasury': data = await buildTreasuryReport(treasuryId, treasuryName, fromDate, toDate); break;
        case 'cash_in': data = await buildCashInReport(treasuryId, treasuryName, fromDate, toDate); break;
        case 'cash_out': data = await buildCashOutReport(treasuryId, treasuryName, fromDate, toDate); break;
        case 'transfers': data = await buildTransfersReport(treasuryId, treasuryName, fromDate, toDate); break;
        case 'accounts': data = await buildAccountsReport(treasuryId, treasuryName); break;
        case 'reconciliations': data = await buildReconciliationsFullReport(treasuryId, treasuryName, fromDate, toDate); break;
        case 'shortage_surplus': data = await buildShortageSurplusReport(treasuryId, treasuryName, fromDate, toDate); break;
      }
      setReport(data);
    } catch (err) {
      setError(err instanceof KhizantiError ? err.message : 'تعذّر إنشاء التقرير');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kh-reports">
      <header className="kh-movement__header kh-no-print">
        <button className="kh-btn kh-btn--ghost" onClick={onDone} aria-label="رجوع">رجوع</button>
        <h1 className="kh-display">التقارير</h1>
        <span />
      </header>

      <div className="kh-reports__controls kh-no-print">
        <label className="kh-field">
          نوع التقرير
          <select value={reportType} onChange={(e) => { setReportType(e.target.value as ReportType); setReport(null); }}>
            {REPORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {selectedOption.needsPeriod && (
          <div className="kh-reports__dates">
            <label className="kh-field">
              من تاريخ
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="kh-field">
              إلى تاريخ
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </div>
        )}

        {error && <p className="kh-movement__error" role="alert">{error}</p>}

        <button className="kh-btn kh-btn--primary" onClick={handleGenerate} disabled={loading}>
          {loading ? 'جارٍ إنشاء التقرير…' : 'عرض التقرير'}
        </button>
      </div>

      {report && (
        <>
          <div className="kh-reports__actions kh-no-print">
            <button className="kh-btn kh-btn--ghost" onClick={printReport}>طباعة / PDF</button>
            <button className="kh-btn kh-btn--ghost" onClick={() => exportToExcel(report)}>تصدير Excel</button>
          </div>

          {/* -------- منطقة قابلة للطباعة فقط (انظر @media print في CSS) -------- */}
          <div className="kh-report-print-area">
            <header className="kh-report-print-header">
              <h2>{report.reportTitle}</h2>
              <p>{report.treasuryName}</p>
              <p>{report.periodLabel}</p>
              <p className="kh-report-print-meta">تاريخ الإصدار: {report.generatedAt}</p>
            </header>

            <table className="kh-report-table">
              <thead>
                <tr>{report.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {report.rows.map((row, i) => (
                  <tr key={i}>{report.columns.map((c) => <td key={c.key}>{row[c.key]}</td>)}</tr>
                ))}
                {report.rows.length === 0 && (
                  <tr><td colSpan={report.columns.length} className="kh-report-empty">لا توجد بيانات في هذه الفترة</td></tr>
                )}
              </tbody>
            </table>

            {report.totals && (
              <table className="kh-report-totals">
                <tbody>
                  {Object.entries(report.totals).map(([label, value]) => (
                    <tr key={label}><td>{label}</td><td className="kh-amount">{value}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
