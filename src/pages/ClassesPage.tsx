import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Edit2,
  Plus,
  School,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { Pagination } from '../components/common/Pagination';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { classStudentService, type SchoolClassInput } from '../services/classStudentService';
import { curriculumService } from '../services/curriculumService';
import { teacherService } from '../services/teacherService';
import type {
  SchoolClass,
  Subject,
  Teacher,
  TeacherAssignment,
  TeacherRole,
} from '../types/models';
import { INPUT_CLASS, LABEL_CLASS } from '../utils/labels';

export const ClassesPage: React.FC = () => {
  const { notify } = useNotification();
  const { academicYears, activeYear, refreshWorkspace } = useWorkspace();

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [roles, setRoles] = useState<TeacherRole[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [yearFilter, setYearFilter] = useState<string>(activeYear?.id ?? 'ALL');
  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [archiveFilter, setArchiveFilter] = useState<'ACTIVE' | 'ARCHIVED' | 'ALL'>('ACTIVE');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [form, setForm] = useState<SchoolClassInput>({
    academicYearId: activeYear?.id ?? '',
    code: '',
    name: '',
    gradeLevel: 1,
    homeroomTeacherId: '',
    roomName: '',
    capacity: 35,
    isArchived: false,
    notes: '',
  });

  // Confirm modals
  const [deleteTarget, setDeleteTarget] = useState<SchoolClass | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<SchoolClass | null>(null);

  // Class teaching team modal (multi-teacher per class)
  const [staffClass, setStaffClass] = useState<SchoolClass | null>(null);
  const [newAssignTeacherId, setNewAssignTeacherId] = useState('');
  const [newAssignRoleId, setNewAssignRoleId] = useState('');
  const [newAssignSubjectId, setNewAssignSubjectId] = useState('');

  useEffect(() => {
    if (activeYear?.id && yearFilter === 'ALL' && classes.length === 0) {
      setYearFilter(activeYear.id);
    }
  }, [activeYear?.id]);

  const loadAll = async () => {
    setLoading(true);
    const [cRes, tRes, rRes, subRes, assignRes, stuRes] = await Promise.all([
      classStudentService.listClasses(),
      teacherService.listTeachers(),
      teacherService.listRoles(),
      curriculumService.listSubjects(),
      teacherService.listAssignments(),
      classStudentService.listStudents(),
    ]);

    if (cRes.ok) setClasses(cRes.data);
    if (tRes.ok) setTeachers(tRes.data);
    if (rRes.ok) setRoles(rRes.data);
    if (subRes.ok) setSubjects(subRes.data);
    if (assignRes.ok) setAssignments(assignRes.data);
    if (stuRes.ok) {
      const counts: Record<string, number> = {};
      for (const stu of stuRes.data) {
        counts[stu.classId] = (counts[stu.classId] ?? 0) + 1;
      }
      setStudentCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const yearMap = useMemo(() => new Map(academicYears.map((y) => [y.id, y])), [academicYears]);
  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const assignmentsByClass = useMemo(() => {
    const map = new Map<string, TeacherAssignment[]>();
    for (const a of assignments) {
      if (!a.classId) continue;
      const arr = map.get(a.classId) ?? [];
      arr.push(a);
      map.set(a.classId, arr);
    }
    return map;
  }, [assignments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classes.filter((cls) => {
      if (yearFilter !== 'ALL' && cls.academicYearId !== yearFilter) return false;
      if (gradeFilter && cls.gradeLevel !== Number(gradeFilter)) return false;
      const archived = Boolean(cls.isArchived);
      if (archiveFilter === 'ACTIVE' && archived) return false;
      if (archiveFilter === 'ARCHIVED' && !archived) return false;
      if (!q) return true;
      const homeroomName = cls.homeroomTeacherId
        ? (teacherMap.get(cls.homeroomTeacherId)?.fullName ?? '').toLowerCase()
        : '';
      return (
        cls.code.toLowerCase().includes(q) ||
        cls.name.toLowerCase().includes(q) ||
        (cls.roomName ?? '').toLowerCase().includes(q) ||
        homeroomName.includes(q)
      );
    });
  }, [classes, yearFilter, gradeFilter, archiveFilter, search, teacherMap]);

  useEffect(() => {
    setPage(1);
  }, [yearFilter, gradeFilter, archiveFilter, search]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const openCreate = () => {
    if (academicYears.length === 0) {
      notify('warning', 'Chưa có năm học', 'Hãy tạo năm học trước khi thêm lớp học.');
      return;
    }
    const defaultYearId =
      yearFilter !== 'ALL' ? yearFilter : activeYear?.id ?? academicYears[0].id;
    setEditing(null);
    setForm({
      academicYearId: defaultYearId,
      code: '',
      name: '',
      gradeLevel: 1,
      homeroomTeacherId: '',
      roomName: '',
      capacity: 35,
      isArchived: false,
      notes: '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: SchoolClassInput = {
      ...form,
      homeroomTeacherId: form.homeroomTeacherId || undefined,
      roomName: form.roomName?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
    };

    const res = editing
      ? await classStudentService.updateClass(editing.id, payload)
      : await classStudentService.createClass(payload);

    if (res.ok) {
      notify('success', editing ? 'Đã cập nhật lớp học' : 'Đã tạo lớp học mới');
      setModalOpen(false);
      await loadAll();
      await refreshWorkspace();
    } else {
      notify('error', 'Không thể lưu lớp học', res.error);
    }
  };

  const handleConfirmArchiveToggle = async () => {
    if (!archiveTarget) return;
    const nextArchived = !archiveTarget.isArchived;
    const res = await classStudentService.toggleArchiveClass(archiveTarget.id, nextArchived);
    if (res.ok) {
      notify(
        'success',
        nextArchived
          ? `Đã lưu trữ lớp "${archiveTarget.name}"`
          : `Đã khôi phục lớp "${archiveTarget.name}"`
      );
      await loadAll();
      await refreshWorkspace();
    } else {
      notify('error', 'Không thể thay đổi trạng thái lưu trữ', res.error);
    }
    setArchiveTarget(null);
  };

  const handleAddClassTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffClass || !newAssignTeacherId) return;

    let roleId = newAssignRoleId;
    if (!roleId) {
      if (roles.length > 0) {
        roleId = roles[0].id;
      } else {
        const createdRole = await teacherService.createRole({
          code: 'GV_BO_MON',
          name: 'Giáo viên giảng dạy',
          description: 'Vai trò phân công giảng dạy theo lớp và môn học',
        });
        if (!createdRole.ok) {
          notify('error', 'Không thể tạo vai trò mặc định', createdRole.error);
          return;
        }
        roleId = createdRole.data.id;
      }
    }

    const res = await teacherService.createAssignment({
      academicYearId: staffClass.academicYearId,
      teacherId: newAssignTeacherId,
      roleId,
      classId: staffClass.id,
      subjectId: newAssignSubjectId || undefined,
      isHomeroom: false,
    });

    if (res.ok) {
      notify('success', 'Đã phân công giáo viên tham gia giảng dạy lớp');
      setNewAssignTeacherId('');
      setNewAssignSubjectId('');
      await loadAll();
    } else {
      notify('error', 'Không thể phân công giáo viên', res.error);
    }
  };

  const staffClassAssignments = staffClass ? (assignmentsByClass.get(staffClass.id) ?? []) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Lớp học"
        description="Quản lý lớp tiểu học (Khối 1 – Khối 5), giáo viên chủ nhiệm, giáo viên bộ môn và sĩ số tính từ danh sách học sinh."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Thêm lớp học
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
            placeholder="Tìm mã lớp, tên lớp, GVCN..."
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <select
          aria-label="Lọc theo năm học"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="ALL">Tất cả năm học ({academicYears.length})</option>
          {academicYears.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>

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
          aria-label="Lọc theo trạng thái lưu trữ"
          value={archiveFilter}
          onChange={(e) => setArchiveFilter(e.target.value as 'ACTIVE' | 'ARCHIVED' | 'ALL')}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="ARCHIVED">Đã lưu trữ</option>
          <option value="ALL">Tất cả lớp</option>
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Đang tải danh sách lớp học...
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={School}
          title="Chưa có lớp học nào"
          description="Tạo lớp học (ví dụ: 1A, 2B, 5A1) để tiếp nhận danh sách học sinh và xếp thời khóa biểu."
          actionLabel="Thêm lớp học đầu tiên"
          onAction={openCreate}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Không tìm thấy lớp học nào khớp bộ lọc hiện tại.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Mã lớp</th>
                  <th className="px-4 py-3">Tên lớp</th>
                  <th className="px-4 py-3">Khối · Năm học</th>
                  <th className="px-4 py-3">Giáo viên phụ trách</th>
                  <th className="px-4 py-3">Phòng</th>
                  <th className="px-4 py-3 text-right">Sĩ số</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((cls) => {
                  const extraAssignments = assignmentsByClass.get(cls.id) ?? [];
                  const uniqueExtraTeachers = new Set(extraAssignments.map((a) => a.teacherId)).size;
                  return (
                    <tr
                      key={cls.id}
                      className={
                        cls.isArchived
                          ? 'bg-slate-50/50 opacity-75 dark:bg-slate-900/50'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">{cls.code}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {cls.name}
                          {cls.isArchived && (
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              · Đã lưu trữ
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        Khối {cls.gradeLevel} · {yearMap.get(cls.academicYearId)?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-800 dark:text-slate-200">
                          {cls.homeroomTeacherId
                            ? `GVCN: ${teacherMap.get(cls.homeroomTeacherId)?.fullName ?? '—'}`
                            : 'Chưa gán GVCN'}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {uniqueExtraTeachers > 0
                            ? `+ ${uniqueExtraTeachers} giáo viên bộ môn/hỗ trợ`
                            : 'Chưa thêm giáo viên bộ môn'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                        {cls.roomName || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                        <strong className="text-slate-900 dark:text-slate-100">
                          {studentCounts[cls.id] ?? 0}
                        </strong>
                        {cls.capacity ? ` / ${cls.capacity}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setStaffClass(cls);
                              setNewAssignRoleId(roles[0]?.id ?? '');
                            }}
                            title="Quản lý đội ngũ giáo viên của lớp"
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/60 whitespace-nowrap"
                          >
                            <Users className="h-3.5 w-3.5" />
                            Giáo viên
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(cls);
                              setForm({
                                academicYearId: cls.academicYearId,
                                code: cls.code,
                                name: cls.name,
                                gradeLevel: cls.gradeLevel,
                                homeroomTeacherId: cls.homeroomTeacherId ?? '',
                                roomName: cls.roomName ?? '',
                                capacity: cls.capacity ?? 35,
                                isArchived: Boolean(cls.isArchived),
                                notes: cls.notes ?? '',
                              });
                              setModalOpen(true);
                            }}
                            aria-label={`Sửa ${cls.name}`}
                            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setArchiveTarget(cls)}
                            title={cls.isArchived ? 'Khôi phục lớp học' : 'Lưu trữ lớp học'}
                            aria-label={cls.isArchived ? `Khôi phục ${cls.name}` : `Lưu trữ ${cls.name}`}
                            className="rounded-lg p-2 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/50"
                          >
                            {cls.isArchived ? (
                              <ArchiveRestore className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(cls)}
                            aria-label={`Xóa ${cls.name}`}
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

      {/* Modal thêm/sửa lớp */}
      <Modal
        isOpen={modalOpen}
        title={editing ? 'Cập nhật lớp học' : 'Thêm lớp học mới'}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Năm học *</label>
              <select
                required
                value={form.academicYearId}
                onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}
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
              <label className={LABEL_CLASS}>Khối lớp *</label>
              <select
                value={form.gradeLevel}
                onChange={(e) =>
                  setForm({ ...form, gradeLevel: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })
                }
                className={INPUT_CLASS}
              >
                {[1, 2, 3, 4, 5].map((g) => (
                  <option key={g} value={g}>
                    Khối {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Mã lớp *</label>
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="VD: 1A"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Tên lớp *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Lớp 1A"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className={LABEL_CLASS}>Giáo viên chủ nhiệm</label>
              <select
                value={form.homeroomTeacherId ?? ''}
                onChange={(e) => setForm({ ...form, homeroomTeacherId: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">-- Chưa phân công --</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} ({t.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Phòng học</label>
              <input
                value={form.roomName ?? ''}
                onChange={(e) => setForm({ ...form, roomName: e.target.value })}
                placeholder="VD: P.102"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Chỉ tiêu sĩ số tối đa</label>
              <input
                type="number"
                min={1}
                max={80}
                value={form.capacity ?? 35}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Ghi chú</label>
              <input
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Thông tin bổ sung..."
                className={INPUT_CLASS}
              />
            </div>
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
              {editing ? 'Lưu thay đổi' : 'Tạo lớp học'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal quản lý nhiều giáo viên giảng dạy trong 1 lớp */}
      <Modal
        isOpen={!!staffClass}
        title={staffClass ? `Giáo viên giảng dạy — ${staffClass.name}` : 'Giáo viên giảng dạy'}
        description="Một lớp có thể có giáo viên chủ nhiệm và nhiều giáo viên bộ môn/hỗ trợ tham gia giảng dạy."
        maxWidthClass="max-w-2xl"
        onClose={() => setStaffClass(null)}
      >
        {staffClass && (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 p-3.5 text-sm dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Giáo viên chủ nhiệm
              </div>
              <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                {staffClass.homeroomTeacherId
                  ? `${teacherMap.get(staffClass.homeroomTeacherId)?.fullName ?? '—'} (${teacherMap.get(staffClass.homeroomTeacherId)?.code ?? ''})`
                  : 'Chưa phân công giáo viên chủ nhiệm'}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Giáo viên bộ môn / nhiệm vụ khác ({staffClassAssignments.length})
              </h3>
              {staffClassAssignments.length === 0 ? (
                <div className="mt-2 rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-800">
                  Chưa có giáo viên bộ môn nào được phân công thêm cho lớp này.
                </div>
              ) : (
                <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {staffClassAssignments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {teacherMap.get(a.teacherId)?.fullName ?? 'Giáo viên'}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {[
                            roleMap.get(a.roleId)?.name ?? 'Vai trò',
                            a.subjectId ? `Môn ${subjectMap.get(a.subjectId)?.name ?? ''}` : 'Tất cả môn',
                          ].join(' · ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await teacherService.removeAssignment(a.id);
                          if (res.ok) {
                            notify('success', 'Đã gỡ phân công khỏi lớp');
                            await loadAll();
                          }
                        }}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                      >
                        Gỡ
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => void handleAddClassTeacher(e)}
              className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Thêm giáo viên tham gia giảng dạy lớp {staffClass.name}
              </div>
              {teachers.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Chưa có hồ sơ giáo viên nào trong hệ thống. Vui lòng thêm giáo viên tại phân hệ Giáo viên.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className={LABEL_CLASS}>Giáo viên *</label>
                    <select
                      required
                      value={newAssignTeacherId}
                      onChange={(e) => setNewAssignTeacherId(e.target.value)}
                      className={INPUT_CLASS}
                    >
                      <option value="">-- Chọn giáo viên --</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Vai trò</label>
                    <select
                      value={newAssignRoleId}
                      onChange={(e) => setNewAssignRoleId(e.target.value)}
                      className={INPUT_CLASS}
                    >
                      {roles.length === 0 && <option value="">Giáo viên giảng dạy (mặc định)</option>}
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Môn học phụ trách</label>
                    <select
                      value={newAssignSubjectId}
                      onChange={(e) => setNewAssignSubjectId(e.target.value)}
                      className={INPUT_CLASS}
                    >
                      <option value="">Chung / Không chỉ định</option>
                      {subjects
                        .filter((s) => s.isActive !== false)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                {teachers.length > 0 && (
                  <button
                    type="submit"
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm vào lớp
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!archiveTarget}
        title={archiveTarget?.isArchived ? 'Khôi phục lớp học' : 'Lưu trữ lớp học'}
        message={
          archiveTarget?.isArchived
            ? `Khôi phục lớp "${archiveTarget.name}" về trạng thái đang hoạt động?`
            : `Lưu trữ lớp "${archiveTarget?.name}"? Dữ liệu học sinh và đánh giá cũ của lớp vẫn được giữ nguyên để tra cứu.`
        }
        confirmLabel={archiveTarget?.isArchived ? 'Khôi phục' : 'Lưu trữ lớp'}
        onConfirm={() => void handleConfirmArchiveToggle()}
        onCancel={() => setArchiveTarget(null)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Xác nhận xóa lớp học"
        message={`Xác nhận xóa vĩnh viễn lớp "${deleteTarget?.name}"? Chỉ có thể xóa khi lớp chưa có học sinh.`}
        confirmLabel="Xóa"
        isDanger
        onConfirm={async () => {
          if (!deleteTarget) return;
          const res = await classStudentService.removeClass(deleteTarget.id);
          if (res.ok) {
            notify('success', 'Đã xóa lớp học');
            await refreshWorkspace();
          } else {
            notify('error', 'Không thể xóa lớp', res.error);
          }
          setDeleteTarget(null);
          await loadAll();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
