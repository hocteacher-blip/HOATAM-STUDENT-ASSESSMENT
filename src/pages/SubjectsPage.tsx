import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Edit2,
  Eye,
  EyeOff,
  ListChecks,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { Pagination } from '../components/common/Pagination';
import { useNotification } from '../contexts/NotificationContext';
import {
  curriculumService,
  type CriterionInput,
  type SubjectInput,
} from '../services/curriculumService';
import {
  CriteriaCategory,
  SubjectAssessmentMode,
  type Criterion,
  type Subject,
} from '../types/models';
import {
  CRITERIA_CATEGORY_LABELS,
  INPUT_CLASS,
  LABEL_CLASS,
  SUBJECT_MODE_LABELS,
} from '../utils/labels';

const emptySubject = (order = 1): SubjectInput => ({
  code: '',
  name: '',
  shortName: '',
  gradeLevels: [1, 2, 3, 4, 5],
  assessmentMode: SubjectAssessmentMode.COMMENT_AND_SCORE,
  isCompulsory: true,
  isActive: true,
  displayOrder: order,
  description: '',
});

export const SubjectsPage: React.FC = () => {
  const { notify } = useNotification();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [criteriaList, setCriteriaList] = useState<Criterion[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'HIDDEN' | 'ALL'>('ACTIVE');
  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Add/edit subject modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [form, setForm] = useState<SubjectInput>(emptySubject());

  // Confirm modals
  const [toggleTarget, setToggleTarget] = useState<Subject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);

  // Subject criteria modal
  const [criteriaSubject, setCriteriaSubject] = useState<Subject | null>(null);
  const [criterionForm, setCriterionForm] = useState<CriterionInput>({
    code: '',
    name: '',
    category: CriteriaCategory.SUBJECT_COMPETENCY,
    subjectId: '',
    gradeLevel: undefined,
    description: '',
  });

  const load = async () => {
    setLoading(true);
    const [subRes, criRes] = await Promise.all([
      curriculumService.listSubjects(),
      curriculumService.listCriteria(),
    ]);
    if (subRes.ok) setSubjects(subRes.data);
    if (criRes.ok) setCriteriaList(criRes.data);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const criteriaBySubject = useMemo(() => {
    const map = new Map<string, Criterion[]>();
    for (const c of criteriaList) {
      if (!c.subjectId) continue;
      const arr = map.get(c.subjectId) ?? [];
      arr.push(c);
      map.set(c.subjectId, arr);
    }
    return map;
  }, [criteriaList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subjects.filter((s) => {
      const isActive = s.isActive !== false;
      if (statusFilter === 'ACTIVE' && !isActive) return false;
      if (statusFilter === 'HIDDEN' && isActive) return false;
      if (gradeFilter && !s.gradeLevels.includes(Number(gradeFilter))) return false;
      if (!q) return true;
      return (
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.shortName ?? '').toLowerCase().includes(q)
      );
    });
  }, [subjects, statusFilter, gradeFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, gradeFilter, search]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const toggleGrade = (g: number) => {
    setForm((prev) => ({
      ...prev,
      gradeLevels: prev.gradeLevels.includes(g)
        ? prev.gradeLevels.filter((x) => x !== g)
        : [...prev.gradeLevels, g].sort((a, b) => a - b),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.gradeLevels.length === 0) {
      notify('warning', 'Thiếu khối lớp áp dụng', 'Hãy chọn ít nhất 1 khối lớp (từ 1 đến 5).');
      return;
    }

    const res = editing
      ? await curriculumService.updateSubject(editing.id, form)
      : await curriculumService.createSubject(form);

    if (res.ok) {
      notify('success', editing ? 'Đã cập nhật môn học' : 'Đã thêm môn học mới');
      setModalOpen(false);
      await load();
    } else {
      notify('error', 'Không thể lưu môn học', res.error);
    }
  };

  const handleConfirmToggleActive = async () => {
    if (!toggleTarget) return;
    const currentlyActive = toggleTarget.isActive !== false;
    const res = await curriculumService.toggleSubjectActive(toggleTarget.id, !currentlyActive);
    if (res.ok) {
      notify(
        'success',
        currentlyActive
          ? `Đã ẩn môn "${toggleTarget.name}"`
          : `Đã khôi phục môn "${toggleTarget.name}"`
      );
      await load();
    } else {
      notify('error', 'Không thể cập nhật trạng thái môn học', res.error);
    }
    setToggleTarget(null);
  };

  const openCriteriaDrawer = (subject: Subject) => {
    const existingCount = (criteriaBySubject.get(subject.id) ?? []).length;
    setCriteriaSubject(subject);
    setCriterionForm({
      code: `${subject.code.toUpperCase()}_TC${existingCount + 1}`,
      name: '',
      category: CriteriaCategory.SUBJECT_COMPETENCY,
      subjectId: subject.id,
      gradeLevel: subject.gradeLevels.length === 1 ? subject.gradeLevels[0] : undefined,
      description: '',
    });
  };

  const handleAddSubjectCriterion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!criteriaSubject) return;
    const res = await curriculumService.createCriterion({
      ...criterionForm,
      subjectId: criteriaSubject.id,
    });
    if (res.ok) {
      notify('success', `Đã thêm tiêu chí cho môn ${criteriaSubject.name}`);
      await load();
      const nextCount = (criteriaBySubject.get(criteriaSubject.id)?.length ?? 0) + 2;
      setCriterionForm((prev) => ({
        ...prev,
        code: `${criteriaSubject.code.toUpperCase()}_TC${nextCount}`,
        name: '',
        description: '',
      }));
    } else {
      notify('error', 'Không thể thêm tiêu chí', res.error);
    }
  };

  const selectedSubjectCriteria = criteriaSubject
    ? (criteriaBySubject.get(criteriaSubject.id) ?? [])
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Môn học & Hoạt động giáo dục"
        description="Danh mục môn học/hoạt động giáo dục có thể chỉnh sửa, ẩn/khôi phục và thiết lập bộ tiêu chí đánh giá riêng cho từng môn."
        actions={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setForm(emptySubject(subjects.length + 1));
              setModalOpen(true);
            }}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Thêm môn học
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm mã môn hoặc tên môn..."
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <select
          aria-label="Lọc theo khối lớp"
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">Tất cả khối (1–5)</option>
          {[1, 2, 3, 4, 5].map((g) => (
            <option key={g} value={g}>
              Khối {g}
            </option>
          ))}
        </select>

        <select
          aria-label="Lọc theo trạng thái sử dụng"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ACTIVE' | 'HIDDEN' | 'ALL')}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="ACTIVE">Đang sử dụng</option>
          <option value="HIDDEN">Đã ẩn</option>
          <option value="ALL">Tất cả môn học</option>
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Đang tải danh sách môn học...
        </div>
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Chưa có môn học nào"
          description="Khai báo các môn học và hoạt động giáo dục (Toán, Tiếng Việt, Hoạt động trải nghiệm...) để sử dụng trong thời khóa biểu và bảng đánh giá."
          actionLabel="Thêm môn học đầu tiên"
          onAction={() => {
            setEditing(null);
            setForm(emptySubject(1));
            setModalOpen(true);
          }}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Không có môn học nào khớp điều kiện lọc.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">STT</th>
                  <th className="px-4 py-3">Mã môn</th>
                  <th className="px-4 py-3">Tên môn / Hoạt động</th>
                  <th className="px-4 py-3">Khối áp dụng</th>
                  <th className="px-4 py-3">Hình thức & Trạng thái</th>
                  <th className="px-4 py-3 text-right">Tiêu chí</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((s) => {
                  const isActive = s.isActive !== false;
                  const subCriteria = criteriaBySubject.get(s.id) ?? [];
                  return (
                    <tr
                      key={s.id}
                      className={
                        !isActive
                          ? 'bg-slate-50/60 opacity-75 dark:bg-slate-900/50'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">{s.displayOrder}</td>
                      <td className="px-4 py-3 font-mono text-xs">{s.code}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {s.name}
                          {s.shortName ? ` (${s.shortName})` : ''}
                        </div>
                        {s.description && (
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {s.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums">
                        Khối {s.gradeLevels.join(', ')}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-slate-700 dark:text-slate-300">
                          {SUBJECT_MODE_LABELS[s.assessmentMode]}
                        </div>
                        <div
                          className={
                            isActive
                              ? 'mt-0.5 text-teal-700 dark:text-teal-400'
                              : 'mt-0.5 text-slate-500'
                          }
                        >
                          {isActive ? 'Đang sử dụng' : 'Đã ẩn'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openCriteriaDrawer(s)}
                          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:border-slate-700 dark:text-teal-400 dark:hover:bg-teal-950/60 tabular-nums whitespace-nowrap"
                        >
                          <ListChecks className="h-3.5 w-3.5" />
                          {subCriteria.length} tiêu chí
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(s);
                              setForm({
                                code: s.code,
                                name: s.name,
                                shortName: s.shortName ?? '',
                                gradeLevels: s.gradeLevels,
                                assessmentMode: s.assessmentMode,
                                isCompulsory: s.isCompulsory,
                                isActive: s.isActive !== false,
                                displayOrder: s.displayOrder,
                                description: s.description ?? '',
                              });
                              setModalOpen(true);
                            }}
                            aria-label={`Sửa ${s.name}`}
                            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setToggleTarget(s)}
                            title={isActive ? 'Ẩn môn học' : 'Khôi phục môn học'}
                            aria-label={isActive ? `Ẩn ${s.name}` : `Khôi phục ${s.name}`}
                            className="rounded-lg p-2 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/50"
                          >
                            {isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(s)}
                            aria-label={`Xóa ${s.name}`}
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

      {/* Modal thêm / sửa môn học */}
      <Modal
        isOpen={modalOpen}
        title={editing ? 'Cập nhật môn học' : 'Thêm môn học / hoạt động giáo dục'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS}>Mã môn *</label>
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="VD: TOAN"
                className={INPUT_CLASS}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL_CLASS}>Tên môn học / Hoạt động *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Toán học hoặc Hoạt động trải nghiệm"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS}>Tên viết tắt</label>
              <input
                value={form.shortName ?? ''}
                onChange={(e) => setForm({ ...form, shortName: e.target.value })}
                placeholder="VD: Toán"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Hình thức đánh giá</label>
              <select
                value={form.assessmentMode}
                onChange={(e) =>
                  setForm({ ...form, assessmentMode: e.target.value as SubjectAssessmentMode })
                }
                className={INPUT_CLASS}
              >
                {Object.entries(SUBJECT_MODE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Thứ tự hiển thị</label>
              <input
                type="number"
                min={1}
                value={form.displayOrder}
                onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Áp dụng cho khối lớp *</label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((g) => (
                <label
                  key={g}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={form.gradeLevels.includes(g)}
                    onChange={() => toggleGrade(g)}
                    className="h-3.5 w-3.5 text-teal-700"
                  />
                  Khối {g}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Trạng thái sử dụng</label>
              <select
                value={form.isActive ? 'ACTIVE' : 'HIDDEN'}
                onChange={(e) => setForm({ ...form, isActive: e.target.value === 'ACTIVE' })}
                className={INPUT_CLASS}
              >
                <option value="ACTIVE">Đang sử dụng</option>
                <option value="HIDDEN">Đã ẩn</option>
              </select>
            </div>
            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={form.isCompulsory}
                  onChange={(e) => setForm({ ...form, isCompulsory: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700"
                />
                Môn học bắt buộc
              </label>
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Mô tả / Ghi chú</label>
            <textarea
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              Lưu môn học
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Bộ tiêu chí đánh giá riêng của môn học */}
      <Modal
        isOpen={!!criteriaSubject}
        title={
          criteriaSubject
            ? `Bộ tiêu chí đánh giá — ${criteriaSubject.name}`
            : 'Bộ tiêu chí đánh giá môn học'
        }
        description="Thiết lập các tiêu chí năng lực, yêu cầu cần đạt riêng cho môn học này."
        maxWidthClass="max-w-2xl"
        onClose={() => setCriteriaSubject(null)}
      >
        {criteriaSubject && (
          <div className="space-y-5">
            {selectedSubjectCriteria.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500 dark:border-slate-800">
                Môn học này chưa có tiêu chí đánh giá riêng nào. Hãy thêm tiêu chí bên dưới.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {selectedSubjectCriteria.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        <span className="mr-2 font-mono text-xs text-slate-500">{c.code}</span>
                        {c.name}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {CRITERIA_CATEGORY_LABELS[c.category]} ·{' '}
                        {c.gradeLevel ? `Khối ${c.gradeLevel}` : 'Tất cả khối áp dụng'}
                        {c.description ? ` · ${c.description}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await curriculumService.removeCriterion(c.id);
                        if (res.ok) {
                          notify('success', 'Đã xóa tiêu chí');
                          await load();
                        } else {
                          notify('error', 'Không thể xóa tiêu chí', res.error);
                        }
                      }}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                    >
                      Xóa
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => void handleAddSubjectCriterion(e)}
              className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Thêm tiêu chí mới cho môn {criteriaSubject.name}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={LABEL_CLASS}>Mã tiêu chí *</label>
                  <input
                    required
                    value={criterionForm.code}
                    onChange={(e) => setCriterionForm({ ...criterionForm, code: e.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL_CLASS}>Tên tiêu chí / Yêu cầu cần đạt *</label>
                  <input
                    required
                    value={criterionForm.name}
                    onChange={(e) => setCriterionForm({ ...criterionForm, name: e.target.value })}
                    placeholder="VD: Thực hiện thành thạo phép cộng, trừ trong phạm vi 100"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASS}>Nhóm tiêu chí</label>
                  <select
                    value={criterionForm.category}
                    onChange={(e) =>
                      setCriterionForm({
                        ...criterionForm,
                        category: e.target.value as CriteriaCategory,
                      })
                    }
                    className={INPUT_CLASS}
                  >
                    {Object.entries(CRITERIA_CATEGORY_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS}>Mô tả ngắn</label>
                  <input
                    value={criterionForm.description ?? ''}
                    onChange={(e) =>
                      setCriterionForm({ ...criterionForm, description: e.target.value })
                    }
                    placeholder="Gợi ý quan sát, đánh giá..."
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm tiêu chí
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!toggleTarget}
        title={toggleTarget?.isActive === false ? 'Khôi phục môn học' : 'Ẩn môn học'}
        message={
          toggleTarget?.isActive === false
            ? `Khôi phục môn "${toggleTarget.name}" về trạng thái đang sử dụng?`
            : `Ẩn môn "${toggleTarget?.name}" khỏi danh sách môn đang sử dụng? Toàn bộ tiêu chí và kết quả đánh giá cũ vẫn được giữ nguyên.`
        }
        confirmLabel={toggleTarget?.isActive === false ? 'Khôi phục' : 'Ẩn môn học'}
        onConfirm={() => void handleConfirmToggleActive()}
        onCancel={() => setToggleTarget(null)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Xác nhận xóa môn học"
        message={`Xác nhận xóa vĩnh viễn môn "${deleteTarget?.name}"? Chỉ cho phép xóa khi chưa có tiêu chí hoặc tiết học liên kết.`}
        confirmLabel="Xóa"
        isDanger
        onConfirm={async () => {
          if (!deleteTarget) return;
          const res = await curriculumService.removeSubject(deleteTarget.id);
          if (res.ok) notify('success', 'Đã xóa môn học');
          else notify('error', 'Không thể xóa môn học', res.error);
          setDeleteTarget(null);
          await load();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
