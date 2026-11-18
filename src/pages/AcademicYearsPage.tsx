import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Edit2,
  Eye,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { Pagination } from '../components/common/Pagination';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  academicYearService,
  type AcademicYearInput,
  type AcademicYearSummary,
} from '../services/academicYearService';
import { classStudentService } from '../services/classStudentService';
import { AcademicYearStatus, type AcademicYear, type SchoolClass } from '../types/models';
import { ACADEMIC_YEAR_STATUS_LABELS, INPUT_CLASS, LABEL_CLASS } from '../utils/labels';

const emptyForm = (): AcademicYearInput => {
  const year = new Date().getFullYear();
  return {
    code: `${year}-${year + 1}`,
    name: `Năm học ${year}-${year + 1}`,
    startDate: `${year}-09-05`,
    endDate: `${year + 1}-05-31`,
    semester1EndDate: `${year + 1}-01-15`,
    semester2StartDate: `${year + 1}-01-18`,
    status: AcademicYearStatus.ACTIVE,
    isCurrent: true,
    notes: '',
  };
};

export const AcademicYearsPage: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { activeYear, setActiveYearId, refreshWorkspace } = useWorkspace();

  const [items, setItems] = useState<AcademicYear[]>([]);
  const [summaries, setSummaries] = useState<Record<string, AcademicYearSummary>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicYear | null>(null);
  const [form, setForm] = useState<AcademicYearInput>(emptyForm());

  const [deleteTarget, setDeleteTarget] = useState<AcademicYear | null>(null);
  const [activateTarget, setActivateTarget] = useState<AcademicYear | null>(null);

  const [inspectYear, setInspectYear] = useState<AcademicYear | null>(null);
  const [inspectClasses, setInspectClasses] = useState<SchoolClass[]>([]);
  const [inspectStudentCounts, setInspectStudentCounts] = useState<Record<string, number>>({});
  const [inspectLoading, setInspectLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const [yearsRes, summaryRes] = await Promise.all([
      academicYearService.list(),
      academicYearService.getYearSummaries(),
    ]);
    if (yearsRes.ok) setItems(yearsRes.data);
    else notify('error', 'Lỗi tải năm học', yearsRes.error);
    if (summaryRes.ok) setSummaries(summaryRes.data);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.notes ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, search, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (item: AcademicYear) => {
    setEditing(item);
    setForm({
      code: item.code,
      name: item.name,
      startDate: item.startDate,
      endDate: item.endDate,
      semester1EndDate: item.semester1EndDate,
      semester2StartDate: item.semester2StartDate,
      status: item.status,
      isCurrent: item.isCurrent,
      notes: item.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = editing
      ? await academicYearService.update(editing.id, form)
      : await academicYearService.create(form);

    if (res.ok) {
      notify('success', editing ? 'Đã cập nhật năm học' : 'Đã thêm năm học mới');
      setModalOpen(false);
      await load();
      await refreshWorkspace();
    } else {
      notify('error', 'Không thể lưu năm học', res.error);
    }
  };

  const handleConfirmSetActive = async () => {
    if (!activateTarget) return;
    const res = await academicYearService.setActiveYear(activateTarget.id);
    if (res.ok) {
      notify(
        'success',
        `Đã chọn "${activateTarget.name}" làm năm học hiện hành`,
        'Dữ liệu các năm học khác vẫn được giữ nguyên.'
      );
      setActivateTarget(null);
      await load();
      await refreshWorkspace();
    } else {
      notify('error', 'Không thể kích hoạt năm học', res.error);
      setActivateTarget(null);
    }
  };

  const handleInspectYear = async (year: AcademicYear) => {
    setInspectYear(year);
    setInspectLoading(true);
    const [clsRes, stuRes] = await Promise.all([
      classStudentService.listClasses(year.id),
      classStudentService.listStudents({ academicYearId: year.id }),
    ]);
    setInspectClasses(clsRes.ok ? clsRes.data : []);
    const counts: Record<string, number> = {};
    if (stuRes.ok) {
      for (const s of stuRes.data) {
        counts[s.classId] = (counts[s.classId] ?? 0) + 1;
      }
    }
    setInspectStudentCounts(counts);
    setInspectLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await academicYearService.remove(deleteTarget.id);
    if (res.ok) {
      notify('success', `Đã xóa năm học ${deleteTarget.name}`);
      setDeleteTarget(null);
      await load();
      await refreshWorkspace();
    } else {
      notify('error', 'Không thể xóa năm học', res.error);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Năm học"
        description="Thiết lập năm học, chuyển đổi năm học hiện hành và xem lại dữ liệu lịch sử từng năm mà không làm mất dữ liệu cũ."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Thêm năm học
          </button>
        }
      />

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mã hoặc tên năm học..."
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <select
            aria-label="Lọc theo trạng thái năm học"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Tất cả trạng thái ({items.length})</option>
            {Object.entries(ACADEMIC_YEAR_STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Đang tải danh sách năm học...
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Chưa có năm học nào"
          description="Hãy tạo năm học đầu tiên để bắt đầu quản lý lớp học, học sinh và đánh giá."
          actionLabel="Tạo năm học đầu tiên"
          onAction={openCreate}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Không tìm thấy năm học nào khớp điều kiện lọc.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Mã</th>
                  <th className="px-4 py-3">Tên năm học</th>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Dữ liệu lưu trữ</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pagedItems.map((item) => {
                  const summary = summaries[item.id];
                  const isViewedInWorkspace = activeYear?.id === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        {item.code}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {item.name}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {[
                            item.isCurrent ? 'Năm học hiện hành' : null,
                            isViewedInWorkspace ? 'Đang xem trong không gian làm việc' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Năm học lưu trữ'}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {item.startDate} → {item.endDate}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {summary
                          ? `${summary.classesCount} lớp · ${summary.studentsCount} HS · ${summary.assessmentsCount} đánh giá`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span
                          className={
                            item.status === AcademicYearStatus.ACTIVE
                              ? 'text-teal-700 dark:text-teal-400'
                              : item.status === AcademicYearStatus.ARCHIVED
                                ? 'text-slate-500 dark:text-slate-400'
                                : 'text-amber-700 dark:text-amber-400'
                          }
                        >
                          {ACADEMIC_YEAR_STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleInspectYear(item)}
                            title="Xem dữ liệu năm học"
                            aria-label={`Xem dữ liệu ${item.name}`}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Xem dữ liệu
                          </button>
                          {!item.isCurrent && (
                            <button
                              type="button"
                              onClick={() => setActivateTarget(item)}
                              title="Chọn làm năm học hiện hành"
                              aria-label={`Đặt ${item.name} làm hiện hành`}
                              className="rounded-lg p-2 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/60"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            aria-label={`Sửa ${item.name}`}
                            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            aria-label={`Xóa ${item.name}`}
                            className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            totalItems={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        title={editing ? 'Cập nhật năm học' : 'Thêm năm học mới'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Mã năm học *</label>
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="VD: 2026-2027"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Tên năm học *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Năm học 2026-2027"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Ngày bắt đầu *</label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Ngày kết thúc *</label>
              <input
                type="date"
                required
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Kết thúc học kỳ I</label>
              <input
                type="date"
                value={form.semester1EndDate}
                onChange={(e) => setForm({ ...form, semester1EndDate: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Bắt đầu học kỳ II</label>
              <input
                type="date"
                value={form.semester2StartDate}
                onChange={(e) => setForm({ ...form, semester2StartDate: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Trạng thái</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as AcademicYearStatus })}
                className={INPUT_CLASS}
              >
                {Object.entries(ACADEMIC_YEAR_STATUS_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.isCurrent}
                  onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700"
                />
                Đặt làm năm học hiện hành
              </label>
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Ghi chú</label>
            <textarea
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              {editing ? 'Lưu thay đổi' : 'Tạo năm học'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!inspectYear}
        title={inspectYear ? `Dữ liệu ${inspectYear.name}` : 'Dữ liệu năm học'}
        description={
          inspectYear
            ? `${ACADEMIC_YEAR_STATUS_LABELS[inspectYear.status]} · ${inspectYear.startDate} → ${inspectYear.endDate}`
            : undefined
        }
        maxWidthClass="max-w-2xl"
        onClose={() => setInspectYear(null)}
      >
        {inspectYear && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Lớp học</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {summaries[inspectYear.id]?.classesCount ?? inspectClasses.length}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Học sinh</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {summaries[inspectYear.id]?.studentsCount ?? 0}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Bản ghi đánh giá</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {summaries[inspectYear.id]?.assessmentsCount ?? 0}
                </div>
              </div>
            </div>

            {inspectLoading ? (
              <div className="py-6 text-center text-sm text-slate-500">Đang tải danh sách lớp...</div>
            ) : inspectClasses.length === 0 ? (
              <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
                Năm học này chưa có lớp học nào.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2">Mã lớp</th>
                      <th className="px-3 py-2">Tên lớp</th>
                      <th className="px-3 py-2">Khối</th>
                      <th className="px-3 py-2 text-right">Sĩ số</th>
                      <th className="px-3 py-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {inspectClasses.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2 font-mono">{c.code}</td>
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{c.name}</td>
                        <td className="px-3 py-2 tabular-nums">Khối {c.gradeLevel}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {inspectStudentCounts[c.id] ?? 0}
                        </td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                          {c.isArchived ? 'Đã lưu trữ' : 'Đang hoạt động'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={async () => {
                  await setActiveYearId(inspectYear.id);
                  notify(
                    'success',
                    `Đang xem dữ liệu "${inspectYear.name}"`,
                    'Các phân hệ Lớp học, Học sinh và Đánh giá đã chuyển sang năm học này (dữ liệu lịch sử giữ nguyên).'
                  );
                  setInspectYear(null);
                  navigate('/hoc-sinh');
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
              >
                Mở năm học này để xem chi tiết
              </button>
              <button
                type="button"
                onClick={() => setInspectYear(null)}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!activateTarget}
        title="Chuyển năm học hiện hành"
        message={`Chọn "${activateTarget?.name}" làm năm học hiện hành? Toàn bộ dữ liệu lớp học, học sinh và đánh giá của các năm học cũ vẫn được bảo toàn nguyên vẹn.`}
        confirmLabel="Xác nhận chuyển"
        onConfirm={() => void handleConfirmSetActive()}
        onCancel={() => setActivateTarget(null)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Xác nhận xóa năm học"
        message={`Bạn có chắc muốn xóa "${deleteTarget?.name}"? Hệ thống chỉ cho phép xóa khi chưa có lớp học, học sinh hoặc kỳ đánh giá liên kết.`}
        confirmLabel="Xóa năm học"
        isDanger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
