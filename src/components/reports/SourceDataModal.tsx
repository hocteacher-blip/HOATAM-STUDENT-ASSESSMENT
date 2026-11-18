import React, { useMemo, useState } from 'react';
import { Database, Search, X } from 'lucide-react';
import type { ReportSourceRecord } from '../../services/reportService';
import { INPUT_CLASS } from '../../utils/labels';

interface SourceDataModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  records: ReportSourceRecord[];
  onClose: () => void;
}

export const SourceDataModal: React.FC<SourceDataModalProps> = ({
  open,
  title,
  subtitle,
  records,
  onClose,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((rec) => {
      if (categoryFilter !== 'ALL' && rec.categoryLabel !== categoryFilter) return false;
      if (!q) return true;
      return (
        rec.title.toLowerCase().includes(q) ||
        rec.detail.toLowerCase().includes(q) ||
        (rec.studentName ?? '').toLowerCase().includes(q) ||
        (rec.className ?? '').toLowerCase().includes(q) ||
        (rec.subjectName ?? '').toLowerCase().includes(q) ||
        (rec.teacherName ?? '').toLowerCase().includes(q) ||
        (rec.comment ?? '').toLowerCase().includes(q)
      );
    });
  }, [records, categoryFilter, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </h3>
            </div>
            {subtitle && (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Đóng cửa sổ nguồn dữ liệu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo học sinh, lớp, môn, nhận xét..."
              className={`${INPUT_CLASS} pl-9`}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="ALL">Tất cả nguồn ({records.length})</option>
            <option value="Đánh giá thường xuyên">Đánh giá thường xuyên</option>
            <option value="Kết quả định kỳ chính thức">Kết quả định kỳ chính thức</option>
            <option value="Lịch dạy">Lịch dạy (Tiết TKB)</option>
            <option value="Nhận xét">Nhận xét</option>
          </select>
          <span className="text-xs font-medium text-slate-600 tabular-nums dark:text-slate-400">
            Hiển thị {filtered.length} / {records.length} bản ghi gốc
          </span>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Không có bản ghi nguồn nào phù hợp với điều kiện lọc hiện tại.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400">
                    <th className="py-2 pr-3 font-semibold whitespace-nowrap">Ngày</th>
                    <th className="py-2 pr-3 font-semibold whitespace-nowrap">Phân loại nguồn</th>
                    <th className="py-2 pr-3 font-semibold">Đối tượng / Nội dung</th>
                    <th className="py-2 pr-3 font-semibold whitespace-nowrap">Mức / Trạng thái</th>
                    <th className="py-2 font-semibold">Chi tiết & Nhận xét</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filtered.map((rec) => (
                    <tr key={rec.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 pr-3 font-medium text-slate-700 tabular-nums whitespace-nowrap dark:text-slate-300">
                        {rec.date}
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${
                            rec.categoryLabel === 'Kết quả định kỳ chính thức'
                              ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                              : rec.categoryLabel === 'Đánh giá thường xuyên'
                                ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {rec.categoryLabel}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-800 dark:text-slate-200">
                        <div className="font-medium">{rec.title}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {[rec.className, rec.subjectName, rec.teacherName]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-slate-800 whitespace-nowrap dark:text-slate-200">
                        {rec.statusOrRating}
                      </td>
                      <td className="py-2.5 text-slate-700 dark:text-slate-300">
                        <div>{rec.detail}</div>
                        {rec.comment && (
                          <div className="mt-1 rounded bg-slate-50 px-2 py-1 text-slate-700 italic dark:bg-slate-800/70 dark:text-slate-300">
                            “{rec.comment}”
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
