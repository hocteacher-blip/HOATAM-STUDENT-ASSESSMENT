import React, { useState } from 'react';
import { CalendarRange, Lock, Plus, Trash2, Unlock, X } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';
import { assessmentService } from '../../services/assessmentService';
import {
  AssessmentPeriodType,
  type AcademicYear,
  type AssessmentPeriod,
} from '../../types/models';
import { INPUT_CLASS, LABEL_CLASS, PERIOD_TYPE_LABELS } from '../../utils/labels';

interface ReportPeriodConfigModalProps {
  open: boolean;
  academicYears: AcademicYear[];
  defaultAcademicYearId?: string;
  periods: AssessmentPeriod[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}

export const ReportPeriodConfigModal: React.FC<ReportPeriodConfigModalProps> = ({
  open,
  academicYears,
  defaultAcademicYearId,
  periods,
  onClose,
  onChanged,
}) => {
  const { notify } = useNotification();
  const [yearId, setYearId] = useState<string>(defaultAcademicYearId || academicYears[0]?.id || '');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [periodType, setPeriodType] = useState<AssessmentPeriodType>(AssessmentPeriodType.END_TERM_1);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const targetYearId = yearId || defaultAcademicYearId || academicYears[0]?.id || '';
  const scopedPeriods = targetYearId
    ? periods.filter((p) => p.academicYearId === targetYearId)
    : periods;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetYearId) {
      notify('error', 'Vui lòng chọn năm học');
      return;
    }
    setSubmitting(true);
    const res = await assessmentService.createPeriod({
      academicYearId: targetYearId,
      code: code.trim() || `${periodType}-${Date.now().toString().slice(-4)}`,
      name: name.trim() || PERIOD_TYPE_LABELS[periodType],
      periodType,
      startDate,
      endDate,
      isLocked: false,
    });
    setSubmitting(false);

    if (!res.ok) {
      notify('error', 'Không thể tạo đợt đánh giá', res.error);
      return;
    }
    setCode('');
    setName('');
    notify('success', `Đã thêm đợt đánh giá "${res.data.name}"`);
    await onChanged();
  };

  const handleToggleLock = async (p: AssessmentPeriod) => {
    const res = await assessmentService.togglePeriodLock(p.id, !p.isLocked);
    if (!res.ok) {
      notify('error', 'Không thể cập nhật khóa', res.error);
      return;
    }
    notify('success', p.isLocked ? 'Đã mở khóa đợt đánh giá' : 'Đã khóa đợt đánh giá');
    await onChanged();
  };

  const handleDelete = async (p: AssessmentPeriod) => {
    const res = await assessmentService.removePeriod(p.id);
    if (!res.ok) {
      notify('error', 'Không thể xóa đợt đánh giá', res.error);
      return;
    }
    notify('success', `Đã xóa đợt "${p.name}"`);
    await onChanged();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Cấu hình đợt đánh giá định kỳ (Giữa kỳ / Cuối kỳ / Cả năm)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-auto p-5">
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40"
          >
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Thêm đợt đánh giá mới cho năm học
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLASS}>Năm học</label>
                <select
                  value={targetYearId}
                  onChange={(e) => setYearId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Loại đợt đánh giá</label>
                <select
                  value={periodType}
                  onChange={(e) => setPeriodType(e.target.value as AssessmentPeriodType)}
                  className={INPUT_CLASS}
                >
                  {Object.entries(PERIOD_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Tên hiển thị đợt đánh giá</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`Ví dụ: ${PERIOD_TYPE_LABELS[periodType]}`}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Mã đợt (tùy chọn)</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="VD: HK2-CK"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Từ ngày</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Đến ngày</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={INPUT_CLASS}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting || academicYears.length === 0}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Lưu đợt đánh giá
              </button>
            </div>
          </form>

          <div>
            <h4 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Danh sách đợt đánh giá đã cấu hình ({scopedPeriods.length})
            </h4>
            {scopedPeriods.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Chưa có đợt đánh giá định kỳ nào trong năm học đã chọn.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {scopedPeriods.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {p.name}{' '}
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          ({PERIOD_TYPE_LABELS[p.periodType]})
                        </span>
                      </div>
                      <div className="mt-0.5 text-slate-600 tabular-nums dark:text-slate-400">
                        Mã: {p.code} · Khoảng thời gian: {p.startDate} → {p.endDate}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggleLock(p)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        {p.isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        {p.isLocked ? 'Đang khóa' : 'Đang mở'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(p)}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/40 whitespace-nowrap"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Xóa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
