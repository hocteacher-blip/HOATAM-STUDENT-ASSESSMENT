import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  HardDriveDownload,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { PageHeader } from '../components/common/PageHeader';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { DB_SCHEMA_VERSION } from '../db/database';
import {
  BACKUP_FORMAT_VERSION,
  systemService,
  type BackupRestoreInspection,
  type BackupValidationDetails,
} from '../services/systemService';
import { formatDateTimeVi } from '../utils/labels';

export const BackupRestorePage: React.FC = () => {
  const { notify } = useNotification();
  const { settings, activeTeacher, refreshWorkspace } = useWorkspace();

  const [exporting, setExporting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationDetails, setValidationDetails] = useState<BackupValidationDetails | null>(null);
  const [inspection, setInspection] = useState<BackupRestoreInspection | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge_missing' | 'replace_all'>('merge_missing');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastRestoreResult, setLastRestoreResult] = useState<{
    mode: 'merge_missing' | 'replace_all';
    restoredCount: number;
    skippedCount: number;
    completedAt: string;
  } | null>(null);

  const handleExportBackup = async () => {
    setExporting(true);
    const res = await systemService.createBackupPackage(activeTeacher?.fullName);
    setExporting(false);

    if (!res.ok) {
      notify('error', 'Không thể tạo bản sao lưu', res.error);
      return;
    }

    const blob = new Blob([JSON.stringify(res.data, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hoatam_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    notify(
      'success',
      'Đã tải xuống tệp sao lưu JSON toàn hệ thống',
      `Bao gồm ${Object.keys(res.data.tables).length} bảng dữ liệu · Mã toàn vẹn: ${res.data.checksum}`
    );
    await refreshWorkspace();
  };

  const resetPendingBackup = () => {
    setSelectedFileName('');
    setValidationError(null);
    setValidationDetails(null);
    setInspection(null);
  };

  const handleSelectBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLastRestoreResult(null);
    setSelectedFileName(file.name);
    setValidationError(null);
    setValidationDetails(null);
    setInspection(null);

    if (!file.name.toLowerCase().endsWith('.json')) {
      const msg = 'Định dạng tệp không hợp lệ. Khôi phục hệ thống chỉ chấp nhận tệp sao lưu .json.';
      setValidationError(msg);
      notify('error', 'Sai định dạng tệp sao lưu', msg);
      return;
    }

    try {
      const text = await file.text();
      if (!text.trim()) {
        const msg = 'Tệp sao lưu trống (0 ký tự).';
        setValidationError(msg);
        notify('error', 'Tệp sao lưu trống', msg);
        return;
      }

      const parsed = JSON.parse(text) as unknown;
      const check = systemService.validateBackupPackageDetailed(parsed);
      if (!check.ok) {
        setValidationError(check.error);
        notify('error', 'Tệp sao lưu không hợp lệ hoặc bị hỏng', check.error);
        return;
      }

      const inspectRes = await systemService.inspectBackupAgainstCurrentDb(check.data.pkg);
      if (!inspectRes.ok) {
        setValidationError(inspectRes.error);
        notify('error', 'Không thể đối chiếu dữ liệu', inspectRes.error);
        return;
      }

      setValidationDetails(check.data);
      setInspection(inspectRes.data);
      notify(
        'info',
        'Đã kiểm tra tính toàn vẹn tệp sao lưu',
        `Tìm thấy ${check.data.totalBackupRecords} bản ghi. Vui lòng kiểm tra đối chiếu và xác nhận khôi phục.`
      );
    } catch {
      const msg = 'Không thể phân tích cú pháp JSON. Tệp có thể bị lỗi hoặc không phải bản sao lưu JSON.';
      setValidationError(msg);
      notify('error', 'Lỗi đọc tệp JSON', msg);
    }
  };

  const executeRestore = async () => {
    if (!validationDetails) return;
    setConfirmOpen(false);
    setRestoring(true);
    const res = await systemService.restoreBackupPackage(validationDetails.pkg, restoreMode);
    setRestoring(false);

    if (res.ok) {
      setLastRestoreResult({
        mode: restoreMode,
        restoredCount: res.data.restoredCount,
        skippedCount: res.data.skippedCount,
        completedAt: new Date().toISOString(),
      });
      notify(
        'success',
        'Khôi phục dữ liệu thành công',
        `Đã khôi phục ${res.data.restoredCount} bản ghi (${res.data.skippedCount} bản ghi giữ nguyên).`
      );
      resetPendingBackup();
      await refreshWorkspace();
    } else {
      notify('error', 'Khôi phục thất bại', res.error);
    }
  };

  const pkg = validationDetails?.pkg;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sao lưu – Khôi phục hệ thống (JSON)"
        description="Xuất toàn bộ cơ sở dữ liệu IndexedDB kèm mã kiểm tra toàn vẹn và khôi phục an toàn có đối chiếu dữ liệu trước khi ghi."
        actions={
          <Link
            to="/nhap-xuat"
            className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
          >
            <FileSpreadsheet className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            Sang trang Nhập / Xuất Excel & PDF
          </Link>
        }
      />

      {/* Hướng dẫn phân biệt Excel vs JSON và nơi lưu trữ an toàn */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
            <Info className="h-5 w-5" />
          </div>
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Hướng dẫn an toàn dữ liệu: Phân biệt Excel (.xlsx) và Sao lưu toàn hệ thống (.json)
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  1. Excel (.xlsx) — Trao đổi dữ liệu bảng
                </div>
                <p className="mt-1">
                  Dùng để nhập nhanh danh sách giáo viên, lớp, học sinh, TKB hoặc xuất bảng biểu báo cáo gửi chuyên môn. Excel không chứa cấu trúc liên kết toàn hệ thống.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  2. JSON (.json) — Sao lưu đầy đủ 100%
                </div>
                <p className="mt-1">
                  Đóng gói toàn bộ 23 bảng IndexedDB (năm học, phân công, TKB, đánh giá hằng ngày/tiết/định kỳ, quy tắc, nhật ký) kèm mã kiểm tra toàn vẹn checksum.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  3. Khuyến nghị nơi lưu trữ an toàn
                </div>
                <p className="mt-1">
                  Nên tải tệp sao lưu <code className="font-mono">.json</code> hằng tuần và lưu thêm bản dự phòng lên Google Drive, OneDrive, USB hoặc máy chủ nhà trường.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Cột trái: Xuất sao lưu JSON */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                <DatabaseBackup className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Tạo bản sao lưu toàn bộ dữ liệu (.json)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Lần sao lưu gần nhất: {formatDateTimeVi(settings?.lastBackupAt)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
              <div className="flex justify-between gap-2">
                <span>Đơn vị trường học:</span>
                <strong className="text-slate-900 dark:text-slate-100">
                  {settings?.schoolName ?? 'Trường Tiểu học Hoa Tâm'}
                </strong>
              </div>
              <div className="flex justify-between gap-2">
                <span>Định dạng gói sao lưu:</span>
                <strong className="font-mono text-slate-900 dark:text-slate-100">
                  JSON v{BACKUP_FORMAT_VERSION} (Có mã toàn vẹn)
                </strong>
              </div>
              <div className="flex justify-between gap-2">
                <span>Phiên bản cấu trúc CSDL:</span>
                <strong className="font-mono text-slate-900 dark:text-slate-100">
                  Schema v{DB_SCHEMA_VERSION} (23 bảng)
                </strong>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">
              Tệp sao lưu giữ nguyên toàn bộ dữ liệu lịch sử của các năm học trước, phân công đa vai trò, thời khóa biểu, đánh giá thường xuyên, kết quả định kỳ và nhật ký hệ thống.
            </p>

            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleExportBackup()}
              className="mt-5 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Đang đóng gói sao lưu...' : 'Tạo & Tải tệp sao lưu (.json)'}
            </button>
          </div>

          {lastRestoreResult && (
            <div className="rounded-xl border border-emerald-200 bg-white p-5 dark:border-emerald-900 dark:bg-slate-900">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Khôi phục dữ liệu hoàn tất
                  </div>
                  <p className="mt-1">
                    Chế độ:{' '}
                    <strong>
                      {lastRestoreResult.mode === 'replace_all'
                        ? 'Thay thế toàn bộ dữ liệu'
                        : 'Chỉ bổ sung bản ghi chưa có'}
                    </strong>
                  </p>
                  <p className="mt-0.5 tabular-nums">
                    Đã khôi phục: <strong className="text-emerald-700 dark:text-emerald-400">{lastRestoreResult.restoredCount}</strong> bản ghi · Giữ nguyên / bỏ qua:{' '}
                    <strong>{lastRestoreResult.skippedCount}</strong> bản ghi.
                  </p>
                  <p className="mt-0.5 text-slate-500">
                    Thời điểm: {formatDateTimeVi(lastRestoreResult.completedAt)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cột phải: Kiểm tra, đối chiếu & Khôi phục JSON */}
        <div className="lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <HardDriveDownload className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Khôi phục dữ liệu từ tệp sao lưu JSON
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tệp được kiểm tra phiên bản, cấu trúc bảng và checksum trước khi thay đổi bất kỳ dữ liệu nào.
                  </p>
                </div>
              </div>
              {(pkg || validationError) && (
                <button
                  type="button"
                  onClick={resetPendingBackup}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Chọn tệp khác
                </button>
              )}
            </div>

            <label className="mt-4 flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:border-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Upload className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {selectedFileName ? `Đã chọn: ${selectedFileName}` : 'Chọn tệp sao lưu (.json) để kiểm tra'}
              </span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => void handleSelectBackupFile(e)}
                className="sr-only"
              />
            </label>

            {validationError && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-semibold">Từ chối khôi phục — Tệp sao lưu không hợp lệ</div>
                  <p className="mt-0.5">{validationError}</p>
                </div>
              </div>
            )}

            {pkg && validationDetails && inspection && (
              <div className="mt-5 space-y-5 border-t border-slate-100 pt-5 dark:border-slate-800">
                {/* Trạng thái kiểm tra toàn vẹn & metadata */}
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                      {validationDetails.checksumStatus === 'VERIFIED' ? (
                        <>
                          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Kiểm tra tính toàn vẹn checksum hợp lệ ({pkg.checksum})</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          <span>Bản sao lưu định dạng cũ (không có checksum)</span>
                        </>
                      )}
                    </div>
                    <div>
                      Trường: <strong>{pkg.schoolName || 'Không ghi'}</strong> · Người xuất:{' '}
                      <strong>{pkg.exportedBy || '—'}</strong> · Ngày xuất:{' '}
                      <strong className="font-mono">{formatDateTimeVi(pkg.exportedAt)}</strong>
                    </div>
                    <div className="tabular-nums">
                      Định dạng: <strong className="font-mono">v{pkg.formatVersion}</strong> · Schema:{' '}
                      <strong className="font-mono">v{pkg.dbSchemaVersion}</strong> · Tổng bản ghi trong tệp:{' '}
                      <strong>{validationDetails.totalBackupRecords}</strong>
                    </div>
                  </div>
                </div>

                {validationDetails.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                    {validationDetails.warnings.map((w) => (
                      <div key={w}>• {w}</div>
                    ))}
                  </div>
                )}

                {/* Tổng hợp đối chiếu với dữ liệu hiện tại */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Hiện có trên máy</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                      {inspection.totalCurrentRecords}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Bản ghi mới sẽ thêm</div>
                    <div className="mt-1 text-lg font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                      +{inspection.newRecordsCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Bản ghi trùng ID</div>
                    <div className="mt-1 text-lg font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                      {inspection.overlappingIdCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Chỉ có trên máy</div>
                    <div className="mt-1 text-lg font-semibold text-amber-700 tabular-nums dark:text-amber-400">
                      {inspection.willLoseCurrentOnlyCount}
                    </div>
                  </div>
                </div>

                {/* Bảng đối chiếu chi tiết theo từng bảng */}
                <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-2">Bảng dữ liệu</th>
                        <th className="px-3 py-2 text-right">Trên máy</th>
                        <th className="px-3 py-2 text-right">Trong tệp</th>
                        <th className="px-3 py-2 text-right">Trùng ID</th>
                        <th className="px-3 py-2 text-right">Mới thêm</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {inspection.perTable.map((row) => (
                        <tr key={row.tableKey}>
                          <td className="px-3 py-1.5 font-medium text-slate-800 dark:text-slate-200">
                            {row.tableLabel}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                            {row.currentCount}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                            {row.backupCount}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-500">
                            {row.overlappingCount}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums text-teal-700 dark:text-teal-400">
                            +{row.newCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Chọn chế độ khôi phục */}
                <div className="space-y-2.5">
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'merge_missing'}
                      onChange={() => setRestoreMode('merge_missing')}
                      className="mt-0.5"
                    />
                    <span>
                      <strong className="text-sm text-slate-900 dark:text-slate-100">
                        Chỉ bổ sung bản ghi chưa có (Khuyên dùng · Không ghi đè)
                      </strong>
                      <span className="mt-0.5 block text-slate-600 dark:text-slate-400">
                        Giữ nguyên toàn bộ {inspection.totalCurrentRecords} bản ghi hiện có trên máy, chỉ bổ sung {inspection.newRecordsCount} bản ghi chưa tồn tại ID từ tệp sao lưu.
                      </span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-red-200 p-3 text-xs hover:bg-red-50/40 dark:border-red-900/50 dark:hover:bg-red-950/20">
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'replace_all'}
                      onChange={() => setRestoreMode('replace_all')}
                      className="mt-0.5"
                    />
                    <span>
                      <strong className="text-sm text-red-700 dark:text-red-400">
                        Thay thế toàn bộ dữ liệu hiện tại (Cảnh báo ghi đè)
                      </strong>
                      <span className="mt-0.5 block text-red-700/90 dark:text-red-300/90">
                        Xóa toàn bộ dữ liệu đang có trên máy (bao gồm {inspection.willLoseCurrentOnlyCount} bản ghi chỉ có trên máy này) và khôi phục đúng theo tệp sao lưu.
                      </span>
                    </span>
                  </label>
                </div>

                <button
                  type="button"
                  disabled={restoring}
                  onClick={() => setConfirmOpen(true)}
                  className={`inline-flex min-h-[42px] items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-60 whitespace-nowrap ${
                    restoreMode === 'replace_all'
                      ? 'bg-red-700 hover:bg-red-800'
                      : 'bg-teal-700 hover:bg-teal-800'
                  }`}
                >
                  <ShieldAlert className="h-4 w-4" />
                  {restoring ? 'Đang khôi phục...' : 'Tiếp tục xác nhận khôi phục'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        title={
          restoreMode === 'replace_all'
            ? 'Xác nhận thay thế toàn bộ dữ liệu hiện tại'
            : 'Xác nhận bổ sung dữ liệu từ bản sao lưu'
        }
        message={
          restoreMode === 'replace_all'
            ? `CẢNH BÁO: Thao tác này sẽ xóa toàn bộ ${inspection?.totalCurrentRecords ?? 0} bản ghi hiện có (trong đó có ${inspection?.willLoseCurrentOnlyCount ?? 0} bản ghi chưa có trong tệp sao lưu) và thay bằng ${validationDetails?.totalBackupRecords ?? 0} bản ghi từ tệp JSON. Bạn nên tải bản sao lưu hiện tại trước khi xác nhận.`
            : `Hệ thống sẽ giữ nguyên toàn bộ dữ liệu hiện có và chỉ bổ sung ${inspection?.newRecordsCount ?? 0} bản ghi mới chưa tồn tại ID (bỏ qua ${inspection?.overlappingIdCount ?? 0} bản ghi trùng ID). Bạn muốn tiếp tục?`
        }
        confirmLabel={restoreMode === 'replace_all' ? 'Xác nhận thay thế toàn bộ' : 'Xác nhận bổ sung dữ liệu'}
        isDanger={restoreMode === 'replace_all'}
        onConfirm={() => void executeRestore()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
