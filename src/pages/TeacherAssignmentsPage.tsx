import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  CheckCircle,
  Edit2,
  History,
  Plus,
  Search,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { Pagination } from '../components/common/Pagination';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { curriculumService } from '../services/curriculumService';
import { teacherService, type TeacherAssignmentInput } from '../services/teacherService';
import { timetableService } from '../services/timetableService';
import {
  TeacherAssignmentStatus,
  type Subject,
  type Teacher,
  type TeacherAssignment,
  type TeacherAssignmentHistory,
  type TeacherRole,
  type Timetable,
} from '../types/models';
import {
  ASSIGNMENT_ACTION_LABELS,
  INPUT_CLASS,
  LABEL_CLASS,
  TEACHER_ASSIGNMENT_STATUS_LABELS,
} from '../utils/labels';

export const TeacherAssignmentsPage: React.FC = () => {
  const { notify } = useNotification();
  const {
    academicYears,
    activeYear,
    classes,
    permissions,
    activeTeacher,
    refreshWorkspace,
  } = useWorkspace();

  const [tab, setTab] = useState<'assignments' | 'history'>('assignments');
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [history, setHistory] = useState<TeacherAssignmentHistory[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [roles, setRoles] = useState<TeacherRole[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [timetables, setTimetables] = useState<Timetable[]>([]);

  // Filters
  const [yearFilter, setYearFilter] = useState<string>(activeYear?.id ?? 'ALL');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(TeacherAssignmentStatus.ACTIVE);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherAssignment | null>(null);
  const [adjustReason, setAdjustReason] = useState('');
  const [form, setForm] = useState<TeacherAssignmentInput>({
    academicYearId: activeYear?.id ?? '',
    teacherId: '',
    roleId: '',
    classId: '',
    subjectId: '',
    timetableId: '',
    isHomeroom: false,
    weeklyPeriods: 0,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    status: TeacherAssignmentStatus.ACTIVE,
    notes: '',
  });

  // Transfer modal
  const [transferTarget, setTransferTarget] = useState<TeacherAssignment | null>(null);
  const [transferTeacherId, setTransferTeacherId] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferReason, setTransferReason] = useState('');

  // End / Delete confirm
  const [endTarget, setEndTarget] = useState<TeacherAssignment | null>(null);
  const [endReason, setEndReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TeacherAssignment | null>(null);

  useEffect(() => {
    if (activeYear?.id && yearFilter === 'ALL' && assignments.length === 0) {
      setYearFilter(activeYear.id);
    }
  }, [activeYear?.id]);

  const loadAll = async () => {
    const [aRes, hRes, tRes, rRes, sRes, ttRes] = await Promise.all([
      teacherService.listAssignments(),
      teacherService.listAssignmentHistory(),
      teacherService.listTeachers(),
      teacherService.listRoles(),
      curriculumService.listSubjects(),
      timetableService.listTimetables(),
    ]);
    if (aRes.ok) setAssignments(aRes.data);
    if (hRes.ok) setHistory(hRes.data);
    if (tRes.ok) setTeachers(tRes.data);
    if (rRes.ok) setRoles(rRes.data);
    if (sRes.ok) setSubjects(sRes.data);
    if (ttRes.ok) setTimetables(ttRes.data);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const timetableMap = useMemo(() => new Map(timetables.map((tt) => [tt.id, tt])), [timetables]);
  const yearMap = useMemo(() => new Map(academicYears.map((y) => [y.id, y])), [academicYears]);

  const actorLabel = activeTeacher ? `${activeTeacher.fullName} (${activeTeacher.code})` : 'Quản trị viên';

  const classesInFormYear = useMemo(
    () => classes.filter((c) => c.academicYearId === form.academicYearId && !c.isArchived),
    [classes, form.academicYearId]
  );

  const timetablesForForm = useMemo(
    () =>
      timetables.filter(
        (tt) =>
          tt.academicYearId === form.academicYearId && (!form.classId || tt.classId === form.classId)
      ),
    [timetables, form.academicYearId, form.classId]
  );

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignments.filter((a) => {
      if (yearFilter !== 'ALL' && a.academicYearId !== yearFilter) return false;
      if (teacherFilter && a.teacherId !== teacherFilter) return false;
      if (roleFilter && a.roleId !== roleFilter) return false;
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (!q) return true;
      const tName = (teacherMap.get(a.teacherId)?.fullName ?? '').toLowerCase();
      const cName = a.classId ? (classMap.get(a.classId)?.name ?? '').toLowerCase() : '';
      const sName = a.subjectId ? (subjectMap.get(a.subjectId)?.name ?? '').toLowerCase() : '';
      const rName = (roleMap.get(a.roleId)?.name ?? a.role).toLowerCase();
      return (
        tName.includes(q) ||
        cName.includes(q) ||
        sName.includes(q) ||
        rName.includes(q) ||
        (a.notes ?? '').toLowerCase().includes(q)
      );
    });
  }, [
    assignments,
    yearFilter,
    teacherFilter,
    roleFilter,
    statusFilter,
    search,
    teacherMap,
    classMap,
    subjectMap,
    roleMap,
  ]);

  const filteredHistory = useMemo(() => {
    return history.filter((h) => {
      if (yearFilter !== 'ALL' && h.academicYearId !== yearFilter) return false;
      if (
        teacherFilter &&
        h.previousTeacherId !== teacherFilter &&
        h.newTeacherId !== teacherFilter
      ) {
        return false;
      }
      return true;
    });
  }, [history, yearFilter, teacherFilter]);

  useEffect(() => {
    setPage(1);
  }, [yearFilter, teacherFilter, roleFilter, statusFilter, search, tab]);

  const pagedAssignments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAssignments.slice(start, start + pageSize);
  }, [filteredAssignments, page, pageSize]);

  const pagedHistory = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredHistory.slice(start, start + pageSize);
  }, [filteredHistory, page, pageSize]);

  const handleOpenCreate = () => {
    if (academicYears.length === 0) {
      notify('warning', 'Chưa có năm học', 'Vui lòng tạo năm học trước khi phân công.');
      return;
    }
    const defaultYearId = yearFilter !== 'ALL' ? yearFilter : activeYear?.id ?? academicYears[0].id;
    const defaultRole = roles[0];
    setEditing(null);
    setAdjustReason('');
    setForm({
      academicYearId: defaultYearId,
      teacherId: teachers[0]?.id ?? '',
      roleId: defaultRole?.id ?? '',
      role: defaultRole?.code ?? 'GVBM',
      classId: '',
      subjectId: '',
      timetableId: '',
      isHomeroom: defaultRole?.code === 'GVCN',
      weeklyPeriods: 0,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      status: TeacherAssignmentStatus.ACTIVE,
      notes: '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedRole = roleMap.get(form.roleId);
    const payload: TeacherAssignmentInput = {
      ...form,
      role: selectedRole?.code ?? form.role,
      isHomeroom: form.isHomeroom || selectedRole?.code === 'GVCN',
      classId: form.classId || undefined,
      subjectId: form.subjectId || undefined,
      timetableId: form.timetableId || undefined,
      endDate: form.endDate || undefined,
    };

    const res = editing
      ? await teacherService.updateAssignment(editing.id, payload, adjustReason, actorLabel)
      : await teacherService.createAssignment(payload, actorLabel);

    if (res.ok) {
      notify('success', editing ? 'Đã điều chỉnh phân công' : 'Đã lưu phân công nhiệm vụ');
      setModalOpen(false);
      await loadAll();
      await refreshWorkspace();
    } else {
      notify('error', 'Không thể lưu phân công', res.error);
    }
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferTarget || !transferTeacherId) return;
    const res = await teacherService.transferAssignment({
      assignmentId: transferTarget.id,
      newTeacherId: transferTeacherId,
      effectiveDate: transferDate,
      reason: transferReason,
      actorName: actorLabel,
    });
    if (res.ok) {
      notify(
        'success',
        'Đã chuyển giao nhiệm vụ thành công',
        'Toàn bộ đánh giá cũ vẫn giữ nguyên tên giáo viên thực hiện trước đó.'
      );
      setTransferTarget(null);
      await loadAll();
      await refreshWorkspace();
    } else {
      notify('error', 'Không thể chuyển giao nhiệm vụ', res.error);
    }
  };

  const handleConfirmEnd = async () => {
    if (!endTarget) return;
    const res = await teacherService.endAssignment(
      endTarget.id,
      new Date().toISOString().slice(0, 10),
      endReason,
      actorLabel
    );
    if (res.ok) {
      notify(
        'success',
        'Đã kết thúc nhiệm vụ phân công',
        'Các kết quả đánh giá và báo cáo trước đây vẫn được bảo toàn.'
      );
      await loadAll();
      await refreshWorkspace();
    } else {
      notify('error', 'Không thể kết thúc nhiệm vụ', res.error);
    }
    setEndTarget(null);
    setEndReason('');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phân công nhiệm vụ đa vai trò"
        description="Phân công một giáo viên làm GVCN (một hoặc nhiều lớp), dạy nhiều môn/lớp, hoặc kiêm GVCN + GVBM cùng lớp; hỗ trợ điều chỉnh, kết thúc và chuyển giao mà không mất dữ liệu cũ."
        actions={
          permissions.canManageAssignments ? (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Phân công mới
            </button>
          ) : undefined
        }
      />

      {!permissions.canManageAssignments && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Chế độ chỉ xem: Bạn đang đăng nhập cục bộ với hồ sơ giáo viên{' '}
          <strong>{activeTeacher?.fullName}</strong>. Chỉ <strong>Quản trị viên</strong> hoặc{' '}
          <strong>Người quản lý chuyên môn</strong> mới có quyền tạo, điều chỉnh, kết thúc hoặc chuyển giao phân công.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setTab('assignments')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              tab === 'assignments'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Bảng phân công ({filteredAssignments.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              tab === 'history'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Lịch sử thay đổi ({filteredHistory.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Lọc theo năm học"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="ALL">Tất cả năm học</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc theo giáo viên"
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Tất cả giáo viên</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>

          {tab === 'assignments' && (
            <>
              <select
                aria-label="Lọc theo vai trò"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">Tất cả vai trò</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Lọc theo trạng thái nhiệm vụ"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="ALL">Tất cả trạng thái</option>
                {Object.entries(TEACHER_ASSIGNMENT_STATUS_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {tab === 'assignments' && assignments.length > 0 && (
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên giáo viên, lớp, môn học..."
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
      )}

      {tab === 'assignments' ? (
        assignments.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="Chưa có phân công nhiệm vụ"
            description="Tạo phân công để gắn giáo viên với một hoặc nhiều vai trò, lớp học, môn học và thời khóa biểu."
            actionLabel={permissions.canManageAssignments ? 'Tạo phân công đầu tiên' : undefined}
            onAction={permissions.canManageAssignments ? handleOpenCreate : undefined}
          />
        ) : filteredAssignments.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            Không có phân công nào khớp bộ lọc hiện tại.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Giáo viên</th>
                    <th className="px-4 py-3">Vai trò</th>
                    <th className="px-4 py-3">Lớp · Năm học</th>
                    <th className="px-4 py-3">Môn học · TKB</th>
                    <th className="px-4 py-3">Thời gian</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pagedAssignments.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {teacherMap.get(a.teacherId)?.fullName ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                        {roleMap.get(a.roleId)?.name ?? a.role}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                        {a.classId ? (classMap.get(a.classId)?.name ?? '—') : 'Toàn trường / Khối'} ·{' '}
                        {yearMap.get(a.academicYearId)?.code ?? ''}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                        <div>
                          {a.subjectId
                            ? (subjectMap.get(a.subjectId)?.name ?? '—')
                            : a.isHomeroom
                              ? 'Nhiệm vụ chủ nhiệm'
                              : 'Không giới hạn môn'}
                        </div>
                        {(a.timetableId || (a.weeklyPeriods ?? 0) > 0) && (
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {[
                              a.timetableId ? timetableMap.get(a.timetableId)?.name : null,
                              a.weeklyPeriods ? `${a.weeklyPeriods} tiết/tuần` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-500">
                        {a.startDate || '—'}
                        {a.endDate ? ` → ${a.endDate}` : ''}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">
                        <span
                          className={
                            a.status === TeacherAssignmentStatus.ACTIVE
                              ? 'text-teal-700 dark:text-teal-400'
                              : a.status === TeacherAssignmentStatus.TRANSFERRED
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-500'
                          }
                        >
                          {TEACHER_ASSIGNMENT_STATUS_LABELS[a.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {permissions.canManageAssignments && (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(a);
                                setAdjustReason('');
                                setForm({
                                  academicYearId: a.academicYearId,
                                  teacherId: a.teacherId,
                                  roleId: a.roleId,
                                  role: a.role,
                                  classId: a.classId ?? '',
                                  subjectId: a.subjectId ?? '',
                                  timetableId: a.timetableId ?? '',
                                  isHomeroom: a.isHomeroom,
                                  weeklyPeriods: a.weeklyPeriods ?? 0,
                                  startDate: a.startDate ?? '',
                                  endDate: a.endDate ?? '',
                                  status: a.status,
                                  notes: a.notes ?? '',
                                });
                                setModalOpen(true);
                              }}
                              title="Điều chỉnh phân công"
                              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            {a.status === TeacherAssignmentStatus.ACTIVE && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const candidate = teachers.find((t) => t.id !== a.teacherId);
                                    setTransferTarget(a);
                                    setTransferTeacherId(candidate?.id ?? '');
                                    setTransferDate(new Date().toISOString().slice(0, 10));
                                    setTransferReason('');
                                  }}
                                  title="Chuyển giao nhiệm vụ cho giáo viên khác"
                                  className="rounded-lg p-2 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/60"
                                >
                                  <ArrowRightLeft className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEndTarget(a);
                                    setEndReason('');
                                  }}
                                  title="Kết thúc nhiệm vụ"
                                  className="rounded-lg p-2 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/50"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(a)}
                              title="Xóa bản ghi phân công"
                              className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              totalItems={filteredAssignments.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </div>
        )
      ) : filteredHistory.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Chưa có lịch sử thay đổi phân công nào trong năm học đang chọn.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Ngày hiệu lực</th>
                  <th className="px-4 py-3">Thao tác</th>
                  <th className="px-4 py-3">Vai trò · Lớp · Môn</th>
                  <th className="px-4 py-3">Giáo viên trước → Sau</th>
                  <th className="px-4 py-3">Lý do / Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pagedHistory.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-3 font-mono tabular-nums">{h.effectiveDate}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {ASSIGNMENT_ACTION_LABELS[h.actionType]}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {[
                        h.role,
                        h.classId ? classMap.get(h.classId)?.name : null,
                        h.subjectId ? subjectMap.get(h.subjectId)?.name : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                    <td className="px-4 py-3">
                      {h.previousTeacherId
                        ? (teacherMap.get(h.previousTeacherId)?.fullName ?? '—')
                        : '—'}{' '}
                      →{' '}
                      <strong className="text-teal-700 dark:text-teal-400">
                        {h.newTeacherId ? (teacherMap.get(h.newTeacherId)?.fullName ?? '—') : 'Kết thúc'}
                      </strong>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {h.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            totalItems={filteredHistory.length}
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

      {/* Modal tạo / điều chỉnh phân công */}
      <Modal
        isOpen={modalOpen}
        title={editing ? 'Điều chỉnh phân công nhiệm vụ' : 'Phân công nhiệm vụ giáo viên'}
        description="Một giáo viên có thể được phân công nhiều vai trò, nhiều lớp, nhiều môn học trong cùng năm học."
        maxWidthClass="max-w-xl"
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Năm học *</label>
              <select
                required
                value={form.academicYearId}
                onChange={(e) => setForm({ ...form, academicYearId: e.target.value, classId: '', timetableId: '' })}
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
              <label className={LABEL_CLASS}>Giáo viên *</label>
              <select
                required
                value={form.teacherId}
                onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">-- Chọn giáo viên --</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} ({t.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Vai trò nhiệm vụ *</label>
              <select
                required
                value={form.roleId}
                onChange={(e) => {
                  const r = roleMap.get(e.target.value);
                  setForm({
                    ...form,
                    roleId: e.target.value,
                    role: r?.code ?? '',
                    isHomeroom: r?.code === 'GVCN',
                  });
                }}
                className={INPUT_CLASS}
              >
                <option value="">-- Chọn vai trò --</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Lớp học</label>
              <select
                value={form.classId ?? ''}
                onChange={(e) => setForm({ ...form, classId: e.target.value, timetableId: '' })}
                className={INPUT_CLASS}
              >
                <option value="">Toàn trường / Không giới hạn lớp</option>
                {classesInFormYear.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Khối {c.gradeLevel})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Môn học (tùy chọn với GVCN)</label>
              <select
                value={form.subjectId ?? ''}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">Không chỉ định môn riêng / Chủ nhiệm</option>
                {subjects
                  .filter((s) => s.isActive !== false)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Thời khóa biểu liên kết (tùy chọn)</label>
              <select
                value={form.timetableId ?? ''}
                onChange={(e) => setForm({ ...form, timetableId: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">Không gắn TKB cụ thể</option>
                {timetablesForForm.map((tt) => (
                  <option key={tt.id} value={tt.id}>
                    {tt.name}
                    {tt.classId && classMap.get(tt.classId) ? ` (${classMap.get(tt.classId)?.name})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS}>Ngày bắt đầu</label>
              <input
                type="date"
                value={form.startDate ?? ''}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Ngày kết thúc (nếu có)</label>
              <input
                type="date"
                value={form.endDate ?? ''}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Số tiết/tuần</label>
              <input
                type="number"
                min={0}
                value={form.weeklyPeriods ?? 0}
                onChange={(e) => setForm({ ...form, weeklyPeriods: Number(e.target.value) })}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Trạng thái</label>
              <select
                value={form.status ?? TeacherAssignmentStatus.ACTIVE}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as TeacherAssignmentStatus })
                }
                className={INPUT_CLASS}
              >
                {Object.entries(TEACHER_ASSIGNMENT_STATUS_LABELS).map(([k, label]) => (
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
                  checked={form.isHomeroom}
                  onChange={(e) => setForm({ ...form, isHomeroom: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700"
                />
                Nhiệm vụ chủ nhiệm lớp
              </label>
            </div>
          </div>

          {editing && (
            <div>
              <label className={LABEL_CLASS}>Lý do điều chỉnh phân công</label>
              <input
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Ghi rõ lý do để lưu vào lịch sử thay đổi phân công..."
                className={INPUT_CLASS}
              />
            </div>
          )}

          <div>
            <label className={LABEL_CLASS}>Ghi chú nhiệm vụ</label>
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
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              {editing ? 'Lưu điều chỉnh' : 'Lưu phân công'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Chuyển giao nhiệm vụ */}
      <Modal
        isOpen={!!transferTarget}
        title="Chuyển giao nhiệm vụ cho giáo viên khác"
        description="Hệ thống giữ nguyên toàn bộ đánh giá cũ của giáo viên trước và ghi nhận vết lịch sử chuyển giao."
        onClose={() => setTransferTarget(null)}
      >
        {transferTarget && (
          <form onSubmit={(e) => void handleConfirmTransfer(e)} className="space-y-4">
            <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3 text-xs text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
              Nhiệm vụ hiện tại: <strong>{roleMap.get(transferTarget.roleId)?.name ?? transferTarget.role}</strong>
              {transferTarget.classId ? ` · Lớp ${classMap.get(transferTarget.classId)?.name ?? ''}` : ''}
              {transferTarget.subjectId ? ` · Môn ${subjectMap.get(transferTarget.subjectId)?.name ?? ''}` : ''}
              {' · '}GV hiện tại: <strong>{teacherMap.get(transferTarget.teacherId)?.fullName}</strong>.
            </div>

            <div>
              <label className={LABEL_CLASS}>Giáo viên tiếp nhận *</label>
              <select
                required
                value={transferTeacherId}
                onChange={(e) => setTransferTeacherId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">-- Chọn giáo viên tiếp nhận --</option>
                {teachers
                  .filter((t) => t.id !== transferTarget.teacherId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName} ({t.code})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className={LABEL_CLASS}>Ngày chuyển giao hiệu lực *</label>
              <input
                type="date"
                required
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Lý do chuyển giao</label>
              <textarea
                rows={2}
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="VD: Nghỉ phép dài hạn / Điều chuyển chuyên môn..."
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTransferTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
              >
                Xác nhận chuyển giao
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!endTarget}
        title="Kết thúc nhiệm vụ phân công"
        message={`Xác nhận đánh dấu hoàn thành / kết thúc nhiệm vụ "${roleMap.get(endTarget?.roleId ?? '')?.name ?? endTarget?.role}" của giáo viên ${teacherMap.get(endTarget?.teacherId ?? '')?.fullName ?? ''}? Mọi đánh giá và báo cáo trước đây vẫn được giữ nguyên.`}
        confirmLabel="Kết thúc nhiệm vụ"
        onConfirm={() => void handleConfirmEnd()}
        onCancel={() => setEndTarget(null)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Xác nhận xóa bản ghi phân công"
        message={`Xóa bản ghi phân công của "${teacherMap.get(deleteTarget?.teacherId ?? '')?.fullName ?? ''}"? Lưu ý: nếu muốn lưu vết lịch sử, hãy dùng "Kết thúc nhiệm vụ" hoặc "Chuyển giao".`}
        confirmLabel="Xóa"
        isDanger
        onConfirm={async () => {
          if (!deleteTarget) return;
          const res = await teacherService.removeAssignment(deleteTarget.id);
          if (res.ok) {
            notify('success', 'Đã xóa phân công');
            await refreshWorkspace();
          } else {
            notify('error', 'Không thể xóa', res.error);
          }
          setDeleteTarget(null);
          await loadAll();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
