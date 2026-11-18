import React, { useEffect, useState } from 'react';
import { RefreshCw, Save, ShieldCheck, Sparkles, Wifi } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { PWAInstallButton } from '../components/common/PWAInstallButton';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { DB_NAME, DB_SCHEMA_VERSION } from '../db/database';
import {
  applyPwaUpdate,
  checkForPwaUpdate,
  refreshPwaCacheMetrics,
  subscribePwaStatus,
  type PwaRuntimeStatus,
} from '../services/pwaService';
import { systemService } from '../services/systemService';
import type { AuditLog } from '../types/models';
import { formatDateTimeVi, INPUT_CLASS, LABEL_CLASS } from '../utils/labels';

export const SettingsPage: React.FC = () => {
  const { notify } = useNotification();
  const {
    settings,
    theme,
    setTheme,
    teachers,
    operatorMode,
    activeTeacher,
    permissions,
    setLocalOperator,
    refreshWorkspace,
  } = useWorkspace();

  const [schoolName, setSchoolName] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [principalName, setPrincipalName] = useState('');
  const [circularStandard, setCircularStandard] = useState('');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pwaStatus, setPwaStatus] = useState<PwaRuntimeStatus>({
    supported: false,
    isControlled: false,
    isRegistered: false,
    offlineReady: false,
    needRefresh: false,
    cacheCount: 0,
    cachedEntryCount: 0,
  });
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribePwaStatus(setPwaStatus);
    void refreshPwaCacheMetrics();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (settings) {
      setSchoolName(settings.schoolName);
      setDepartmentName(settings.departmentName);
      setPrincipalName(settings.principalName);
      setCircularStandard(settings.circularStandard);
    }
    const loadLogs = async () => {
      const res = await systemService.listAuditLogs(50);
      if (res.ok) setLogs(res.data);
    };
    void loadLogs();
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.isAdmin) {
      notify('error', 'Không có quyền', 'Chỉ Quản trị viên mới được phép thay đổi thông tin cấu hình trường học.');
      return;
    }
    const res = await systemService.updateSettings({
      schoolName: schoolName.trim(),
      departmentName: departmentName.trim(),
      principalName: principalName.trim(),
      circularStandard: circularStandard.trim(),
    });
    if (res.ok) {
      notify('success', 'Đã lưu cài đặt hệ thống');
      await refreshWorkspace();
    } else {
      notify('error', 'Không thể lưu cài đặt', res.error);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt hệ thống"
        description="Cấu hình thông tin đơn vị trường học, giao diện sáng/tối, ứng dụng ngoại tuyến PWA và nhật ký hệ thống."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          onSubmit={(e) => void handleSave(e)}
          className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Thông tin trường học & Quy chuẩn
            </h2>
            {!permissions.isAdmin && (
              <span className="text-xs text-amber-700 dark:text-amber-400">Chỉ xem</span>
            )}
          </div>

          <div>
            <label className={LABEL_CLASS}>Tên trường tiểu học</label>
            <input
              disabled={!permissions.isAdmin}
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Phòng / Sở Giáo dục và Đào tạo</label>
            <input
              disabled={!permissions.isAdmin}
              value={departmentName}
              onChange={(e) => setDepartmentName(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Hiệu trưởng</label>
              <input
                disabled={!permissions.isAdmin}
                value={principalName}
                onChange={(e) => setPrincipalName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Văn bản áp dụng</label>
              <input
                disabled={!permissions.isAdmin}
                value={circularStandard}
                onChange={(e) => setCircularStandard(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {permissions.isAdmin && (
            <button
              type="submit"
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              <Save className="h-4 w-4" />
              Lưu cấu hình
            </button>
          )}
        </form>

        <div className="lg:col-span-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Giao diện & Ứng dụng ngoại tuyến (PWA)
            </h2>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Chế độ hiển thị
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Chuyển đổi giữa giao diện sáng và tối
                </div>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => void setTheme('light')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    theme === 'light'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Sáng
                </button>
                <button
                  type="button"
                  onClick={() => void setTheme('dark')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    theme === 'dark'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Tối
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Cơ sở dữ liệu cục bộ IndexedDB
                </div>
                <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {DB_NAME} · Schema v{DB_SCHEMA_VERSION}
                </div>
              </div>
              <PWAInstallButton />
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Wifi className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                  Trạng thái bộ nhớ đệm ngoại tuyến (Service Worker)
                </div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {pwaStatus.offlineReady && pwaStatus.isControlled
                    ? 'Sẵn sàng chạy ngoại tuyến'
                    : pwaStatus.isRegistered
                      ? 'Đã đăng ký Service Worker'
                      : import.meta.env.DEV
                        ? 'Chế độ Dev (SW bật ở bản production)'
                        : 'Chưa lưu bộ nhớ đệm'}
                </span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Bộ nhớ đệm: <span className="font-mono tabular-nums">{pwaStatus.cacheCount}</span> kho lưu trữ ·{' '}
                <span className="font-mono tabular-nums">{pwaStatus.cachedEntryCount}</span> tài nguyên đã lưu cục bộ
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={checkingUpdate}
                  onClick={async () => {
                    setCheckingUpdate(true);
                    const res = await checkForPwaUpdate();
                    setCheckingUpdate(false);
                    notify(res.checked ? 'success' : 'info', res.message);
                  }}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                  Kiểm tra cập nhật ứng dụng
                </button>
                {pwaStatus.needRefresh && (
                  <button
                    type="button"
                    onClick={() => void applyPwaUpdate()}
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
                  >
                    Áp dụng bản cập nhật & Tải lại
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Hồ sơ thao tác cục bộ trên thiết bị
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Dùng để chuyển nhanh giữa chế độ Quản trị viên cục bộ và hồ sơ từng Giáo viên nhằm kiểm tra phân quyền, phạm vi lớp/môn và luồng nghiệp vụ trên thiết bị này. Tính năng này lưu cục bộ trong IndexedDB, không phải cơ chế đăng nhập bảo mật đa thiết bị.
            </p>
            <select
              value={operatorMode === 'ADMIN' ? 'ADMIN' : activeTeacher?.id ?? 'ADMIN'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'ADMIN') {
                  void setLocalOperator('ADMIN');
                } else {
                  void setLocalOperator('TEACHER', val);
                }
              }}
              className={INPUT_CLASS}
            >
              <option value="ADMIN">Quản trị viên hệ thống (Cục bộ)</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName} ({t.code})
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Trợ lý AI & Bảo vệ dữ liệu học sinh
                </h2>
              </div>
              <button
                type="button"
                disabled={!permissions.isAdmin}
                aria-pressed={settings?.aiEnabled !== false}
                onClick={async () => {
                  if (!permissions.isAdmin) {
                    notify('error', 'Không có quyền', 'Chỉ Quản trị viên mới được phép bật/tắt Trợ lý AI.');
                    return;
                  }
                  const nextEnabled = settings?.aiEnabled === false;
                  const res = await systemService.updateSettings({ aiEnabled: nextEnabled });
                  if (res.ok) {
                    notify(
                      'success',
                      nextEnabled ? 'Đã bật Trợ lý AI gợi ý' : 'Đã tắt Trợ lý AI — chỉ dùng chế độ cục bộ'
                    );
                    await refreshWorkspace();
                  } else {
                    notify('error', 'Không thể cập nhật tùy chọn AI', res.error);
                  }
                }}
                className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${
                  settings?.aiEnabled !== false
                    ? 'bg-teal-700 text-white hover:bg-teal-800'
                    : 'border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {settings?.aiEnabled !== false ? 'Đang bật Trợ lý AI (Nhấn để tắt)' : 'Đang tắt Trợ lý AI (Nhấn để bật)'}
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Dữ liệu gửi tới Trợ lý AI được ẩn danh hóa (không gửi họ tên, ngày sinh, mã học sinh hay số điện thoại phụ huynh) và đi qua lớp dịch vụ trung gian trên máy chủ. AI chỉ đưa ra gợi ý tham khảo, không tự xác nhận kết quả chính thức; khi tắt AI hoặc ngoại tuyến, mọi chức năng quản lý và đánh giá vẫn hoạt động bình thường.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Nhật ký thao tác dữ liệu ({logs.length})
        </h2>
        {logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Chưa có nhật ký nào.</p>
        ) : (
          <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {logs.map((log) => (
              <div key={log.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-800 dark:text-slate-200">
                  <span className="mr-2 font-mono text-xs text-teal-700 dark:text-teal-400">
                    {log.action}
                  </span>
                  <span className="mr-2 font-mono text-xs text-slate-500">{log.entityTable}</span>
                  {log.summary}
                </div>
                <div className="font-mono text-xs text-slate-500 tabular-nums">
                  {formatDateTimeVi(log.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
