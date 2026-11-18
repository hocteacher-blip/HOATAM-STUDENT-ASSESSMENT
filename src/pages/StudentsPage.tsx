import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Edit2,
  Eye,
  GraduationCap,
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
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  classStudentService,
  type StudentInput,
  type StudentProfileDetails,
} from '../services/classStudentService';
import { curriculumService } from '../services/curriculumService';
import {
  StudentGender,
  StudentStatus,
  type Student,
  type Subject,
} from '../types/models';
import {
  DAILY_EVALUATION_STATUS_LABELS,
  INPUT_CLASS,
  LABEL_CLASS,
  RATING_LEVEL_LABELS,
  STUDENT_GENDER_LABELS,
  STUDENT_STATUS_LABELS,
} from '../utils/labels';

export const StudentsPage: React.FC = () => {
  const { notify } = useNotification();
  const { academicYears, activeYear, classes } = useWorkspace();

  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [yearFilter, setYearFilter] = useState<string>(activeYear?.id ?? 'ALL');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Add/edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [pendingImportantSave, setPendingImportantSave] = useState<StudentInput | null>(null);
  const [form, setForm] = useState<StudentInput>({
    studentCode: '',
    fullName: '',
    dateOfBirth: '2017-01-01',
    gender: StudentGender.OTHER,
    classId: '',
    academicYearId: activeYear?.id ?? '',
    guardianName: '',
    guardianPhone: '',
    address: '',
    status: StudentStatus.STUDYING,
    notes: '',
  });

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);

  // Class transfer modal
  const [transferStudent, setTransferStudent] = useState<Student | null>(null);
  const [transferTargetClassId, setTransferTargetClassId] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transferReason, setTransferReason] = useState('');
  const [transferNextStatus, setTransferNextStatus] = useState<StudentStatus>(StudentStatus.STUDYING);

  // Profile detail modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileDetails, setProfileDetails] = useState<StudentProfileDetails | null>(null);
  const [profileTab, setProfileTab] = useState<'info' | 'transfers' | 'assessments'>('info');

  useEffect(() => {
    if (activeYear?.id && yearFilter === 'ALL' && students.length === 0) {
      setYearFilter(activeYear.id);
    }
  }, [activeYear?.id]);

  const loadData = async () => {
    setLoading(true);
    const [stuRes, subRes] = await Promise.all([
      classStudentService.listStudents(),
      curriculumService.listSubjects(),
    ]);
    if (stuRes.ok) setStudents(stuRes.data);
    else notify('error', 'Không thể tải danh sách học sinh', stuRes.error);
    if (subRes.ok) setSubjects(subRes.data);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const yearMap = useMemo(() => new Map(academicYears.map((y) => [y.id, y])), [academicYears]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);

  const classesForYearFilter = useMemo(() => {
    if (yearFilter === 'ALL') return classes;
    return classes.filter((c) => c.academicYearId === yearFilter);
  }, [classes, yearFilter]);

  const activeAssignableClasses = useMemo(
    () => classes.filter((c) => !c.isArchived),
    [classes]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (yearFilter !== 'ALL' && s.academicYearId !== yearFilter) return false;
      if (selectedClassId && s.classId !== selectedClassId) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.studentCode.toLowerCase().includes(q) ||
        (s.guardianName ?? '').toLowerCase().includes(q) ||
        (s.guardianPhone ?? '').toLowerCase().includes(q) ||
        (classMap.get(s.classId)?.name ?? '').toLowerCase().includes(q)
      );
    });
  }, [students, yearFilter, selectedClassId, statusFilter, search, classMap]);

  useEffect(() => {
    setPage(1);
  }, [yearFilter, selectedClassId, statusFilter, search]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const openCreate = () => {
    const candidateClasses =
      yearFilter !== 'ALL'
        ? activeAssignableClasses.filter((c) => c.academicYearId === yearFilter)
        : activeAssignableClasses;
    const defaultClass = candidateClasses[0] ?? activeAssignableClasses[0] ?? classes[0];
    if (!defaultClass) {
      notify(
        'warning',
        'Chưa có lớp học',
        'Vui lòng tạo ít nhất 1 năm học và 1 lớp học trước khi thêm học sinh.'
      );
      return;
    }
    setEditing(null);
    setForm({
      studentCode: '',
      fullName: '',
      dateOfBirth: '2017-01-01',
      gender: StudentGender.OTHER,
      classId: selectedClassId || defaultClass.id,
      academicYearId: defaultClass.academicYearId,
      guardianName: '',
      guardianPhone: '',
      address: '',
      status: StudentStatus.STUDYING,
      notes: '',
    });
    setModalOpen(true);
  };

  const commitStudentSave = async (payload: StudentInput) => {
    const res = editing
      ? await classStudentService.updateStudent(editing.id, payload)
      : await classStudentService.createStudent(payload);

    if (res.ok) {
      notify('success', editing ? 'Đã cập nhật hồ sơ học sinh' : 'Đã thêm học sinh mới');
      setModalOpen(false);
      setPendingImportantSave(null);
      await loadData();
    } else {
      notify('error', 'Không thể lưu hồ sơ học sinh', res.error);
      setPendingImportantSave(null);
    }
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetClass = classMap.get(form.classId);
    const payload: StudentInput = {
      ...form,
      academicYearId: targetClass?.academicYearId ?? activeYear?.id ?? form.academicYearId,
      guardianName: form.guardianName?.trim() || undefined,
      guardianPhone: form.guardianPhone?.trim() || undefined,
      address: form.address?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
    };

    if (
      editing &&
      editing.status !== payload.status &&
      (payload.status === StudentStatus.TRANSFERRED || payload.status === StudentStatus.DROPPED_OUT)
    ) {
      setPendingImportantSave(payload);
      return;
    }

    await commitStudentSave(payload);
  };

  const openTransferModal = (stu: Student) => {
    const options = activeAssignableClasses.filter((c) => c.id !== stu.classId);
    if (options.length === 0) {
      notify('warning', 'Chưa có lớp đích khả dụng', 'Cần có ít nhất một lớp học khác để chuyển lớp.');
      return;
    }
    setTransferStudent(stu);
    setTransferTargetClassId(options[0].id);
    setTransferDate(new Date().toISOString().slice(0, 10));
    setTransferReason('');
    setTransferNextStatus(StudentStatus.STUDYING);
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferStudent || !transferTargetClassId) return;
    const res = await classStudentService.transferStudentClass({
      studentId: transferStudent.id,
      targetClassId: transferTargetClassId,
      transferDate,
      reason: transferReason,
      nextStatus: transferNextStatus,
    });
    if (res.ok) {
      const targetName = classMap.get(transferTargetClassId)?.name ?? 'lớp mới';
      notify(
        'success',
        `Đã chuyển lớp cho học sinh ${transferStudent.fullName}`,
        `Đã chuyển sang ${targetName} và giữ nguyên toàn bộ lịch sử đánh giá cũ.`
      );
      setTransferStudent(null);
      await loadData();
    } else {
      notify('error', 'Không thể chuyển lớp', res.error);
    }
  };

  const openProfileModal = async (stu: Student) => {
    setProfileOpen(true);
    setProfileTab('info');
    setProfileLoading(true);
    const res = await classStudentService.getStudentProfileDetails(stu.id);
    if (res.ok) {
      setProfileDetails(res.data);
    } else {
      notify('error', 'Không thể tải hồ sơ học sinh', res.error);
      setProfileOpen(false);
    }
    setProfileLoading(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Học sinh"
        description="Quản lý hồ sơ học sinh, tra cứu, chuyển lớp không mất lịch sử đánh giá và theo dõi tiến bộ học tập."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Thêm học sinh
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
            placeholder="Tìm mã HS, họ tên, SĐT phụ huynh..."
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <select
          aria-label="Lọc theo năm học"
          value={yearFilter}
          onChange={(e) => {
            setYearFilter(e.target.value);
            setSelectedClassId('');
          }}
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
          aria-label="Lọc theo lớp học"
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">Tất cả các lớp ({classesForYearFilter.length})</option>
          {classesForYearFilter.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Lọc theo trạng thái học tập"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STUDENT_STATUS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Đang tải danh sách học sinh...
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Chưa có học sinh nào"
          description="Bạn có thể thêm từng học sinh tại đây hoặc nhập hàng loạt từ tệp Excel ở phân hệ Nhập/xuất dữ liệu."
          actionLabel="Thêm học sinh"
          onAction={openCreate}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Không tìm thấy học sinh nào khớp tiêu chí tìm kiếm.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Mã HS</th>
                  <th className="px-4 py-3">Họ và tên</th>
                  <th className="px-4 py-3">Lớp · Năm học</th>
                  <th className="px-4 py-3">Ngày sinh</th>
                  <th className="px-4 py-3">Giới tính</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paged.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {s.studentCode}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void openProfileModal(s)}
                        className="text-left font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100 dark:hover:text-teal-400"
                      >
                        {s.fullName}
                      </button>
                      {(s.guardianName || s.guardianPhone) && (
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {[s.guardianName, s.guardianPhone].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                      {[
                        classMap.get(s.classId)?.name ?? '—',
                        yearMap.get(s.academicYearId)?.code,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums">{s.dateOfBirth}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {STUDENT_GENDER_LABELS[s.gender]}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      <span
                        className={
                          s.status === StudentStatus.STUDYING
                            ? 'text-teal-700 dark:text-teal-400'
                            : s.status === StudentStatus.DROPPED_OUT || s.status === StudentStatus.TRANSFERRED
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400'
                        }
                      >
                        {STUDENT_STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void openProfileModal(s)}
                          title="Xem hồ sơ và lịch sử đánh giá"
                          aria-label={`Xem hồ sơ ${s.fullName}`}
                          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openTransferModal(s)}
                          title="Chuyển lớp (giữ nguyên lịch sử đánh giá)"
                          aria-label={`Chuyển lớp ${s.fullName}`}
                          className="rounded-lg p-2 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/60"
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(s);
                            setForm({
                              studentCode: s.studentCode,
                              fullName: s.fullName,
                              dateOfBirth: s.dateOfBirth,
                              gender: s.gender,
                              classId: s.classId,
                              academicYearId: s.academicYearId,
                              guardianName: s.guardianName ?? '',
                              guardianPhone: s.guardianPhone ?? '',
                              address: s.address ?? '',
                              status: s.status,
                              notes: s.notes ?? '',
                            });
                            setModalOpen(true);
                          }}
                          aria-label={`Sửa ${s.fullName}`}
                          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(s)}
                          aria-label={`Xóa ${s.fullName}`}
                          className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      {/* Modal thêm/sửa học sinh */}
      <Modal
        isOpen={modalOpen}
        title={editing ? 'Cập nhật hồ sơ học sinh' : 'Thêm học sinh mới'}
        maxWidthClass="max-w-xl"
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={(e) => void handleSaveSubmit(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Mã học sinh *</label>
              <input
                required
                value={form.studentCode}
                onChange={(e) => setForm({ ...form, studentCode: e.target.value })}
                placeholder="VD: HS2026001"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Họ và tên *</label>
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="VD: Trần Minh An"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS}>Lớp học *</label>
              <select
                required
                disabled={Boolean(editing)}
                value={form.classId}
                onChange={(e) => setForm({ ...form, classId: e.target.value })}
                className={`${INPUT_CLASS} disabled:opacity-60`}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({yearMap.get(c.academicYearId)?.code ?? ''})
                  </option>
                ))}
              </select>
              {editing && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Dùng thao tác "Chuyển lớp" để giữ lịch sử lớp cũ.
                </p>
              )}
            </div>
            <div>
              <label className={LABEL_CLASS}>Ngày sinh</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Giới tính (tùy chọn)</label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value as StudentGender })}
                className={INPUT_CLASS}
              >
                {Object.entries(STUDENT_GENDER_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Họ tên phụ huynh</label>
              <input
                value={form.guardianName ?? ''}
                onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Số điện thoại liên hệ</label>
              <input
                value={form.guardianPhone ?? ''}
                onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Trạng thái học tập</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatus })}
                className={INPUT_CLASS}
              >
                {Object.entries(STUDENT_STATUS_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Địa chỉ liên hệ</label>
              <input
                value={form.address ?? ''}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Địa chỉ gia đình..."
                className={INPUT_CLASS}
              />
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
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              {editing ? 'Lưu thay đổi' : 'Thêm học sinh'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Chuyển lớp (giữ nguyên lịch sử đánh giá cũ) */}
      <Modal
        isOpen={!!transferStudent}
        title={transferStudent ? `Chuyển lớp — ${transferStudent.fullName}` : 'Chuyển lớp học sinh'}
        description="Ghi nhận lịch sử chuyển lớp và bảo toàn toàn bộ kết quả đánh giá trước đây."
        onClose={() => setTransferStudent(null)}
      >
        {transferStudent && (
          <form onSubmit={(e) => void handleConfirmTransfer(e)} className="space-y-4">
            <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3 text-xs text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
              Lớp hiện tại:{' '}
              <strong>{classMap.get(transferStudent.classId)?.name ?? '—'}</strong> · Năm học{' '}
              {yearMap.get(transferStudent.academicYearId)?.name ?? '—'}. Khi chuyển lớp, hệ thống tự
              động lưu vết chuyển lớp và giữ nguyên mọi dữ liệu đánh giá cũ của học sinh.
            </div>

            <div>
              <label className={LABEL_CLASS}>Chuyển đến lớp *</label>
              <select
                required
                value={transferTargetClassId}
                onChange={(e) => setTransferTargetClassId(e.target.value)}
                className={INPUT_CLASS}
              >
                {activeAssignableClasses
                  .filter((c) => c.id !== transferStudent.classId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Khối {c.gradeLevel} · {yearMap.get(c.academicYearId)?.code ?? ''})
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLASS}>Ngày chuyển lớp *</label>
                <input
                  type="date"
                  required
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Trạng thái sau chuyển</label>
                <select
                  value={transferNextStatus}
                  onChange={(e) => setTransferNextStatus(e.target.value as StudentStatus)}
                  className={INPUT_CLASS}
                >
                  <option value={StudentStatus.STUDYING}>Đang học (tại lớp mới)</option>
                  <option value={StudentStatus.TRANSFERRED_CLASS}>Chuyển lớp</option>
                </select>
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Lý do / Ghi chú chuyển lớp</label>
              <textarea
                rows={2}
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="VD: Chuyển lớp theo nguyện vọng gia đình / lên lớp năm học mới..."
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTransferStudent(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
              >
                Xác nhận chuyển lớp
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal Hồ sơ học sinh & Lịch sử chuyển lớp / đánh giá */}
      <Modal
        isOpen={profileOpen}
        title={
          profileDetails
            ? `Hồ sơ học sinh: ${profileDetails.student.fullName}`
            : 'Hồ sơ chi tiết học sinh'
        }
        description={
          profileDetails
            ? `Mã HS: ${profileDetails.student.studentCode} · Lớp ${classMap.get(profileDetails.student.classId)?.name ?? '—'}`
            : undefined
        }
        maxWidthClass="max-w-3xl"
        onClose={() => setProfileOpen(false)}
      >
        {profileLoading || !profileDetails ? (
          <div className="py-8 text-center text-sm text-slate-500">Đang tải hồ sơ học sinh...</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setProfileTab('info')}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium ${
                  profileTab === 'info'
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Thông tin hồ sơ
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('transfers')}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums ${
                  profileTab === 'transfers'
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Lịch sử chuyển lớp ({profileDetails.transferHistory.length})
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('assessments')}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums ${
                  profileTab === 'assessments'
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Lịch sử đánh giá (
                {profileDetails.dailyAssessments.length +
                  profileDetails.lessonAssessments.length +
                  profileDetails.assessmentResults.length}
                )
              </button>
            </div>

            {profileTab === 'info' && (
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Mã học sinh</div>
                  <div className="mt-0.5 font-mono font-medium">{profileDetails.student.studentCode}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Trạng thái</div>
                  <div className="mt-0.5 font-medium">
                    {STUDENT_STATUS_LABELS[profileDetails.student.status]}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Ngày sinh · Giới tính</div>
                  <div className="mt-0.5 tabular-nums">
                    {profileDetails.student.dateOfBirth} ·{' '}
                    {STUDENT_GENDER_LABELS[profileDetails.student.gender]}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Lớp · Năm học</div>
                  <div className="mt-0.5">
                    {classMap.get(profileDetails.student.classId)?.name ?? '—'} ·{' '}
                    {yearMap.get(profileDetails.student.academicYearId)?.name ?? '—'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Phụ huynh / Liên hệ</div>
                  <div className="mt-0.5">
                    {[profileDetails.student.guardianName, profileDetails.student.guardianPhone]
                      .filter(Boolean)
                      .join(' · ') || 'Chưa cập nhật'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Địa chỉ</div>
                  <div className="mt-0.5">{profileDetails.student.address || 'Chưa cập nhật'}</div>
                </div>
                {profileDetails.student.notes && (
                  <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="text-xs text-slate-500">Ghi chú</div>
                    <div className="mt-0.5">{profileDetails.student.notes}</div>
                  </div>
                )}
              </div>
            )}

            {profileTab === 'transfers' && (
              <div>
                {profileDetails.transferHistory.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
                    Học sinh chưa có lịch sử chuyển lớp.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-2">Ngày chuyển</th>
                          <th className="px-3 py-2">Từ lớp</th>
                          <th className="px-3 py-2">Sang lớp</th>
                          <th className="px-3 py-2">Lý do</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {profileDetails.transferHistory.map((h) => (
                          <tr key={h.id}>
                            <td className="px-3 py-2 font-mono tabular-nums">{h.transferDate}</td>
                            <td className="px-3 py-2">
                              {h.fromClassId ? (classMap.get(h.fromClassId)?.name ?? h.fromClassId) : '—'}
                            </td>
                            <td className="px-3 py-2 font-medium text-teal-700 dark:text-teal-400">
                              {classMap.get(h.toClassId)?.name ?? h.toClassId}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                              {h.reason || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {profileTab === 'assessments' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
                  <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500">Hằng ngày</div>
                    <div className="mt-0.5 text-base font-bold tabular-nums">
                      {profileDetails.dailyAssessments.length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500">Theo tiết học</div>
                    <div className="mt-0.5 text-base font-bold tabular-nums">
                      {profileDetails.lessonAssessments.length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500">Định kỳ</div>
                    <div className="mt-0.5 text-base font-bold tabular-nums">
                      {profileDetails.assessmentResults.length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500">Nhận xét / Minh chứng</div>
                    <div className="mt-0.5 text-base font-bold tabular-nums">
                      {profileDetails.comments.length} / {profileDetails.evidence.length}
                    </div>
                  </div>
                </div>

                {profileDetails.dailyAssessments.length === 0 &&
                profileDetails.lessonAssessments.length === 0 &&
                profileDetails.assessmentResults.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
                    Chưa có bản ghi đánh giá nào cho học sinh này. Khi các phân hệ đánh giá phát sinh dữ liệu, toàn bộ lịch sử (kể cả từ lớp cũ trước khi chuyển lớp) sẽ hiển thị tại đây.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {profileDetails.assessmentResults.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                      >
                        <div className="flex flex-wrap justify-between gap-2 font-medium text-slate-900 dark:text-slate-100">
                          <span>
                            Đánh giá định kỳ ·{' '}
                            {r.subjectId ? (subjectMap.get(r.subjectId)?.name ?? 'Môn học') : 'Tổng hợp'}
                          </span>
                          <span className="text-teal-700 dark:text-teal-400">
                            {RATING_LEVEL_LABELS[r.ratingLevel]}
                            {r.numericScore !== undefined ? ` · ${r.numericScore} điểm` : ''}
                          </span>
                        </div>
                        <div className="mt-1 text-slate-500 dark:text-slate-400">
                          Lớp: {classMap.get(r.classId)?.name ?? '—'} · Cập nhật:{' '}
                          {r.updatedAt.slice(0, 10)}
                        </div>
                        {r.summaryComment && (
                          <p className="mt-1.5 text-slate-700 dark:text-slate-300">{r.summaryComment}</p>
                        )}
                      </div>
                    ))}
                    {profileDetails.lessonAssessments.slice(0, 20).map((l) => (
                      <div
                        key={l.id}
                        className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                      >
                        <div className="flex justify-between gap-2 font-medium">
                          <span>
                            Tiết học ({l.lessonDate}) ·{' '}
                            {subjectMap.get(l.subjectId)?.name ?? 'Môn học'}
                          </span>
                          <span>{RATING_LEVEL_LABELS[l.ratingLevel]}</span>
                        </div>
                        {l.comment && <p className="mt-1 text-slate-600 dark:text-slate-400">{l.comment}</p>}
                      </div>
                    ))}
                    {profileDetails.dailyAssessments.slice(0, 20).map((d) => (
                      <div
                        key={d.id}
                        className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                      >
                        <div className="flex justify-between gap-2 font-medium">
                          <span>Đánh giá hằng ngày ({d.assessmentDate})</span>
                          <span>
                            {d.evaluationStatus
                              ? DAILY_EVALUATION_STATUS_LABELS[d.evaluationStatus]
                              : d.ratingLevel
                                ? RATING_LEVEL_LABELS[d.ratingLevel]
                                : '—'}
                          </span>
                        </div>
                        {d.criterionLabelsSnapshot && d.criterionLabelsSnapshot.length > 0 && (
                          <p className="mt-1 text-slate-600 dark:text-slate-400">
                            Tiêu chí: {d.criterionLabelsSnapshot.join(', ')}
                          </p>
                        )}
                        {d.comment && <p className="mt-1 text-slate-600 dark:text-slate-400">{d.comment}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!pendingImportantSave}
        title="Xác nhận thay đổi trạng thái học sinh"
        message={`Bạn đang chuyển trạng thái học sinh "${editing?.fullName}" sang "${pendingImportantSave ? STUDENT_STATUS_LABELS[pendingImportantSave.status] : ''}". Xác nhận lưu thay đổi này?`}
        confirmLabel="Xác nhận lưu"
        onConfirm={() => {
          if (pendingImportantSave) void commitStudentSave(pendingImportantSave);
        }}
        onCancel={() => setPendingImportantSave(null)}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Xác nhận xóa học sinh"
        message={`Xóa vĩnh viễn hồ sơ học sinh "${deleteTarget?.fullName}" (${deleteTarget?.studentCode})? Chỉ cho phép xóa khi học sinh chưa có bản ghi đánh giá.`}
        confirmLabel="Xóa"
        isDanger
        onConfirm={async () => {
          if (!deleteTarget) return;
          const res = await classStudentService.removeStudent(deleteTarget.id);
          if (res.ok) notify('success', 'Đã xóa hồ sơ học sinh');
          else notify('error', 'Không thể xóa học sinh', res.error);
          setDeleteTarget(null);
          await loadData();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
