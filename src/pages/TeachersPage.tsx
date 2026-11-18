import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit2,
  Eye,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { Pagination } from '../components/common/Pagination';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { curriculumService } from '../services/curriculumService';
import {
  teacherService,
  type TeacherInput,
  type TeacherRoleInput,
  type TeacherWorkSummary,
} from '../services/teacherService';
import {
  TeacherAssignmentStatus,
  TeacherStatus,
  type Teacher,
  type TeacherAssignment,
  type TeacherRole,
  type TeacherRoleGrant,
} from '../types/models';
import {
  ASSIGNMENT_ACTION_LABELS,
  DAY_OF_WEEK_LABELS,
  INPUT_CLASS,
  LABEL_CLASS,
  TEACHER_ASSIGNMENT_STATUS_LABELS,
  TEACHER_STATUS_LABELS,
} from '../utils/labels';

const emptyTeacher = (): TeacherInput => ({
  code: '',
  fullName: '',
  username: '',
  email: '',
  phone: '',
  specialization: '',
  qualification: '',
  status: TeacherStatus.ACTIVE,
  notes: '',
});

const emptyRole = (): TeacherRoleInput => ({
  code: '',
  name: '',
  description: '',
});

export const TeachersPage: React.FC = () => {
  const { notify } = useNotification();
  const {
    academicYears,
    classes,
    permissions,
    activeTeacher,
    setLocalOperator,
    refreshWorkspace,
  } = useWorkspace();

  const [tab, setTab] = useState<'teachers' | 'roles'>('teachers');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [roles, setRoles] = useState<TeacherRole[]>([]);
  const [roleGrants, setRoleGrants] = useState<TeacherRoleGrant[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [teacherModal, setTeacherModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [teacherForm, setTeacherForm] = useState<TeacherInput>(emptyTeacher());
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [deleteTeacher, setDeleteTeacher] = useState<Teacher | null>(null);

  const [roleModal, setRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<TeacherRole | null>(null);
  const [roleForm, setRoleForm] = useState<TeacherRoleInput>(emptyRole());
  const [deleteRole, setDeleteRole] = useState<TeacherRole | null>(null);

  // Teacher 360 profile modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSummary, setProfileSummary] = useState<TeacherWorkSummary | null>(null);

  const loadAll = async () => {
    const [tRes, rRes, gRes, aRes, sRes] = await Promise.all([
      teacherService.listTeachers(),
      teacherService.listRoles(),
      teacherService.listRoleGrants(),
      teacherService.listAssignments(),
      curriculumService.listSubjects(),
    ]);
    if (tRes.ok) setTeachers(tRes.data);
    if (rRes.ok) setRoles(rRes.data);
    if (gRes.ok) setRoleGrants(gRes.data);
    if (aRes.ok) setAssignments(aRes.data);
    if (sRes.ok) setSubjects(sRes.data.map((s) => ({ id: s.id, name: s.name })));
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const yearMap = useMemo(() => new Map(academicYears.map((y) => [y.id, y])), [academicYears]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);

  const rolesByTeacher = useMemo(() => {
    const map = new Map<string, TeacherRole[]>();
    for (const t of teachers) {
      const ids = new Set<string>();
      for (const g of roleGrants) {
        if (g.teacherId === t.id) ids.add(g.roleId);
      }
      for (const a of assignments) {
        if (a.teacherId === t.id && a.status === TeacherAssignmentStatus.ACTIVE && a.roleId) {
          ids.add(a.roleId);
        }
      }
      map.set(
        t.id,
        Array.from(ids)
          .map((id) => roleMap.get(id))
          .filter((r): r is TeacherRole => Boolean(r))
      );
    }
    return map;
  }, [teachers, roleGrants, assignments, roleMap]);

  const activeAssignmentsByTeacher = useMemo(() => {
    const map = new Map<string, typeof assignments>();
    for (const a of assignments) {
      if (a.status !== TeacherAssignmentStatus.ACTIVE) continue;
      const arr = map.get(a.teacherId) ?? [];
      arr.push(a);
      map.set(a.teacherId, arr);
    }
    return map;
  }, [assignments]);

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      const tRoles = rolesByTeacher.get(t.id) ?? [];
      if (roleFilter && !tRoles.some((r) => r.id === roleFilter)) return false;
      if (!q) return true;
      return (
        t.fullName.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        (t.username ?? '').toLowerCase().includes(q) ||
        (t.email ?? '').toLowerCase().includes(q) ||
        (t.specialization ?? '').toLowerCase().includes(q)
      );
    });
  }, [teachers, statusFilter, roleFilter, search, rolesByTeacher]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, roleFilter, search]);

  const pagedTeachers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTeachers.slice(start, start + pageSize);
  }, [filteredTeachers, page, pageSize]);

  const toggleSelectedRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = editingTeacher
      ? await teacherService.updateTeacher(editingTeacher.id, teacherForm, selectedRoleIds)
      : await teacherService.createTeacher(teacherForm, selectedRoleIds);

    if (res.ok) {
      notify('success', editingTeacher ? 'Đã cập nhật hồ sơ giáo viên' : 'Đã thêm giáo viên mới');
      setTeacherModal(false);
      await loadAll();
      await refreshWorkspace();
    } else {
      notify('error', 'Không thể lưu giáo viên', res.error);
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = editingRole
      ? await teacherService.updateRole(editingRole.id, roleForm)
      : await teacherService.createRole(roleForm);

    if (res.ok) {
      notify('success', editingRole ? 'Đã cập nhật vai trò' : 'Đã thêm vai trò mới');
      setRoleModal(false);
      await loadAll();
      await refreshWorkspace();
    } else {
      notify('error', 'Không thể lưu vai trò', res.error);
    }
  };

  const openTeacherProfile = async (t: Teacher) => {
    setProfileOpen(true);
    setProfileLoading(true);
    const res = await teacherService.getTeacherWorkSummary(t.id);
    if (res.ok) {
      setProfileSummary(res.data);
    } else {
      notify('error', 'Không thể tải hồ sơ giáo viên', res.error);
      setProfileOpen(false);
    }
    setProfileLoading(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Giáo viên & Vai trò"
        description="Một giáo viên có thể đảm nhiệm đồng thời nhiều vai trò (GVCN, GVBM, Quản trị viên, Quản lý chuyên môn) và nhiều nhiệm vụ giảng dạy."
        actions={
          permissions.canManageAssignments ? (
            tab === 'teachers' ? (
              <button
                type="button"
                onClick={() => {
                  setEditingTeacher(null);
                  setTeacherForm(emptyTeacher());
                  setSelectedRoleIds([]);
                  setTeacherModal(true);
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Thêm giáo viên
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingRole(null);
                  setRoleForm(emptyRole());
                  setRoleModal(true);
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Thêm vai trò
              </button>
            )
          ) : undefined
        }
      />

      {!permissions.canManageAssignments && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Bạn đang ở hồ sơ cục bộ của giáo viên <strong>{activeTeacher?.fullName}</strong> (chỉ xem danh bạ). Chỉ{' '}
          <strong>Quản trị viên</strong> hoặc <strong>Người quản lý chuyên môn</strong> mới có quyền thêm/sửa hồ sơ và vai trò giáo viên.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setTab('teachers')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              tab === 'teachers'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Danh sách giáo viên ({teachers.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('roles')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              tab === 'roles'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Danh mục vai trò ({roles.length})
          </button>
        </div>

        {tab === 'teachers' && teachers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã, họ tên, email..."
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
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
              aria-label="Lọc theo trạng thái"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(TEACHER_STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {tab === 'teachers' ? (
        teachers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Chưa có hồ sơ giáo viên"
            description="Thêm giáo viên để gắn nhiều vai trò (GVCN, GVBM, Quản trị viên, Quản lý chuyên môn) và phân công lớp/môn học."
            actionLabel={permissions.canManageAssignments ? 'Thêm giáo viên đầu tiên' : undefined}
            onAction={
              permissions.canManageAssignments
                ? () => {
                    setEditingTeacher(null);
                    setTeacherForm(emptyTeacher());
                    setSelectedRoleIds([]);
                    setTeacherModal(true);
                  }
                : undefined
            }
          />
        ) : filteredTeachers.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            Không tìm thấy giáo viên nào khớp tiêu chí lọc.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Mã GV</th>
                    <th className="px-4 py-3">Họ và tên · Liên hệ</th>
                    <th className="px-4 py-3">Vai trò đảm nhiệm</th>
                    <th className="px-4 py-3">Nhiệm vụ đang phụ trách</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pagedTeachers.map((t) => {
                    const tRoles = rolesByTeacher.get(t.id) ?? [];
                    const activeAssigns = activeAssignmentsByTeacher.get(t.id) ?? [];
                    const hrClasses = activeAssigns
                      .filter((a) => (a.isHomeroom || a.role === 'GVCN') && a.classId)
                      .map((a) => classMap.get(a.classId!)?.name)
                      .filter(Boolean);
                    const subjectNames = Array.from(
                      new Set(
                        activeAssigns
                          .filter((a) => a.subjectId)
                          .map((a) => subjectMap.get(a.subjectId!)?.name)
                          .filter(Boolean)
                      )
                    );
                    const isCurrentLocal = activeTeacher?.id === t.id;

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">{t.code}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => void openTeacherProfile(t)}
                            className="text-left font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100 dark:hover:text-teal-400"
                          >
                            {t.fullName}
                            {isCurrentLocal && (
                              <span className="ml-2 text-xs font-semibold text-teal-700 dark:text-teal-400">
                                · Hồ sơ đang chọn
                              </span>
                            )}
                          </button>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {[t.username, t.email, t.phone].filter(Boolean).join(' · ') || 'Chưa bổ sung liên hệ'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                          {tRoles.length > 0
                            ? tRoles.map((r) => r.name).join(' · ')
                            : 'Chưa gán vai trò'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                          <div>
                            {hrClasses.length > 0 ? `GVCN: ${hrClasses.join(', ')}` : 'Không chủ nhiệm'}
                          </div>
                          <div className="mt-0.5">
                            {subjectNames.length > 0
                              ? `Dạy môn: ${subjectNames.join(', ')} (${activeAssigns.filter((a) => a.subjectId).length} phân công)`
                              : `${activeAssigns.length} nhiệm vụ đang hoạt động`}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span
                            className={
                              t.status === TeacherStatus.ACTIVE
                                ? 'text-teal-700 dark:text-teal-400 font-medium'
                                : 'text-slate-500'
                            }
                          >
                            {TEACHER_STATUS_LABELS[t.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void openTeacherProfile(t)}
                              title="Xem hồ sơ đầy đủ (vai trò, lớp, môn, TKB, lịch sử)"
                              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await setLocalOperator('TEACHER', t.id);
                                notify(
                                  'info',
                                  `Đã chuyển sang hồ sơ cục bộ: ${t.fullName}`,
                                  'Thao tác phân công và đánh giá hiện tuân theo vai trò/nhiệm vụ của giáo viên này.'
                                );
                              }}
                              title="Chuyển sang thử nghiệm với hồ sơ giáo viên này"
                              className="rounded-lg p-2 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/60"
                            >
                              <UserCheck className="h-4 w-4" />
                            </button>
                            {permissions.canManageAssignments && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTeacher(t);
                                    setTeacherForm({
                                      code: t.code,
                                      fullName: t.fullName,
                                      username: t.username ?? '',
                                      email: t.email ?? '',
                                      phone: t.phone ?? '',
                                      specialization: t.specialization ?? '',
                                      qualification: t.qualification ?? '',
                                      status: t.status,
                                      notes: t.notes ?? '',
                                    });
                                    setSelectedRoleIds(
                                      roleGrants
                                        .filter((g) => g.teacherId === t.id)
                                        .map((g) => g.roleId)
                                    );
                                    setTeacherModal(true);
                                  }}
                                  aria-label={`Sửa ${t.fullName}`}
                                  className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTeacher(t)}
                                  aria-label={`Xóa ${t.fullName}`}
                                  className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              totalItems={filteredTeachers.length}
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
      ) : roles.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="Chưa có danh mục vai trò"
          description="Tạo các vai trò như Giáo viên chủ nhiệm, Giáo viên bộ môn, Quản trị viên, Người quản lý chuyên môn."
          actionLabel="Thêm vai trò mới"
          onAction={() => {
            setEditingRole(null);
            setRoleForm(emptyRole());
            setRoleModal(true);
          }}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Mã vai trò</th>
                <th className="px-4 py-3">Tên vai trò</th>
                <th className="px-4 py-3">Mô tả & Phạm vi quyền</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {roles.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {r.name}
                    {r.isSystemRole && (
                      <span className="ml-2 text-xs font-normal text-slate-500">· Chuẩn hệ thống</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    <div>{r.description || '—'}</div>
                    {r.permissionsSummary && (
                      <div className="mt-0.5 text-slate-500">{r.permissionsSummary}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {permissions.canManageAssignments && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRole(r);
                            setRoleForm({
                              code: r.code,
                              name: r.name,
                              description: r.description ?? '',
                              permissionsSummary: r.permissionsSummary ?? '',
                            });
                            setRoleModal(true);
                          }}
                          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteRole(r)}
                          className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal thêm/sửa giáo viên (chỉ bắt buộc Mã GV và Họ tên, cho phép chọn nhiều vai trò) */}
      <Modal
        isOpen={teacherModal}
        title={editingTeacher ? 'Cập nhật hồ sơ giáo viên' : 'Thêm giáo viên mới'}
        description="Chỉ bắt buộc Mã giáo viên và Họ tên; các thông tin liên hệ khác có thể bổ sung sau."
        maxWidthClass="max-w-xl"
        onClose={() => setTeacherModal(false)}
      >
        <form onSubmit={(e) => void handleSaveTeacher(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Mã giáo viên *</label>
              <input
                required
                value={teacherForm.code}
                onChange={(e) => setTeacherForm({ ...teacherForm, code: e.target.value })}
                placeholder="VD: GV001"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Họ và tên *</label>
              <input
                required
                value={teacherForm.fullName}
                onChange={(e) => setTeacherForm({ ...teacherForm, fullName: e.target.value })}
                placeholder="VD: Nguyễn Thị Minh"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS}>Tên đăng nhập (tùy chọn)</label>
              <input
                value={teacherForm.username ?? ''}
                onChange={(e) => setTeacherForm({ ...teacherForm, username: e.target.value })}
                placeholder="VD: minh.nt"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Email (tùy chọn)</label>
              <input
                type="email"
                value={teacherForm.email ?? ''}
                onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Số điện thoại (tùy chọn)</label>
              <input
                value={teacherForm.phone ?? ''}
                onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Chuyên môn (tùy chọn)</label>
              <input
                value={teacherForm.specialization ?? ''}
                onChange={(e) => setTeacherForm({ ...teacherForm, specialization: e.target.value })}
                placeholder="VD: Tiểu học / Mĩ thuật / Tiếng Anh"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Trạng thái hoạt động</label>
              <select
                value={teacherForm.status}
                onChange={(e) =>
                  setTeacherForm({ ...teacherForm, status: e.target.value as TeacherStatus })
                }
                className={INPUT_CLASS}
              >
                {Object.entries(TEACHER_STATUS_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>
              Vai trò được cấp (được lưu độc lập, có thể chọn nhiều vai trò đồng thời)
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {roles.map((r) => (
                <label
                  key={r.id}
                  className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={selectedRoleIds.includes(r.id)}
                    onChange={() => toggleSelectedRole(r.id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700"
                  />
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{r.name}</div>
                    <div className="text-[11px] text-slate-500">{r.code}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Ghi chú</label>
            <textarea
              rows={2}
              value={teacherForm.notes ?? ''}
              onChange={(e) => setTeacherForm({ ...teacherForm, notes: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setTeacherModal(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              Lưu hồ sơ
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Hồ sơ 360 độ của Giáo viên */}
      <Modal
        isOpen={profileOpen}
        title={
          profileSummary
            ? `Hồ sơ giáo viên: ${profileSummary.teacher.fullName}`
            : 'Hồ sơ giáo viên'
        }
        description={
          profileSummary
            ? `Mã GV: ${profileSummary.teacher.code} · ${TEACHER_STATUS_LABELS[profileSummary.teacher.status]}`
            : undefined
        }
        maxWidthClass="max-w-3xl"
        onClose={() => setProfileOpen(false)}
      >
        {profileLoading || !profileSummary ? (
          <div className="py-8 text-center text-sm text-slate-500">Đang tổng hợp dữ liệu giáo viên...</div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-xs font-medium text-slate-500">1. Các vai trò đang đảm nhiệm</div>
                <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                  {profileSummary.grantedRoles.length > 0
                    ? profileSummary.grantedRoles.map((r) => `${r.name} (${r.code})`).join(' · ')
                    : 'Chưa gán vai trò'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-xs font-medium text-slate-500">2. Các lớp chủ nhiệm</div>
                <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                  {profileSummary.homeroomClasses.length > 0
                    ? profileSummary.homeroomClasses.map((c) => c.name).join(', ')
                    : 'Không phụ trách chủ nhiệm'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-xs font-medium text-slate-500">3. Các môn học đang dạy</div>
                <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                  {profileSummary.teachingSubjects.length > 0
                    ? profileSummary.teachingSubjects.map((s) => s.name).join(', ')
                    : 'Không có môn bộ môn riêng'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-xs font-medium text-slate-500">4. Danh sách lớp được phân công</div>
                <div className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                  {profileSummary.assignedClasses.length > 0
                    ? profileSummary.assignedClasses.map((c) => c.name).join(', ')
                    : 'Chưa có lớp được phân công'}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                5. Các thời khóa biểu & tiết dạy liên quan ({profileSummary.timetables.length} TKB ·{' '}
                {profileSummary.timetableLessons.length} tiết)
              </div>
              {profileSummary.timetables.length === 0 && profileSummary.timetableLessons.length === 0 ? (
                <div className="mt-2 text-xs text-slate-500">
                  Chưa có thời khóa biểu hoặc tiết dạy nào gắn với giáo viên này.
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-xs">
                  {profileSummary.timetables.map((tt) => (
                    <div key={tt.id} className="text-slate-700 dark:text-slate-300">
                      · <strong>{tt.name}</strong> (
                      {tt.classId ? `Lớp ${classMap.get(tt.classId)?.name ?? '—'} · ` : ''}
                      Hiệu lực {tt.effectiveFrom})
                    </div>
                  ))}
                  {profileSummary.timetableLessons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profileSummary.timetableLessons.slice(0, 15).map((l) => (
                        <span
                          key={l.id}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] dark:border-slate-700"
                        >
                          {DAY_OF_WEEK_LABELS[l.dayOfWeek]} Tiết {l.periodNumber}:{' '}
                          {subjectMap.get(l.subjectId)?.name ?? 'Môn'} ({classMap.get(l.classId)?.name ?? ''})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                6. Lịch sử nhiệm vụ & thay đổi phân công ({profileSummary.assignments.length} nhiệm vụ ·{' '}
                {profileSummary.assignmentHistory.length} biến động)
              </div>
              {profileSummary.assignments.length === 0 && profileSummary.assignmentHistory.length === 0 ? (
                <div className="mt-2 text-xs text-slate-500">Chưa có lịch sử phân công nhiệm vụ.</div>
              ) : (
                <div className="mt-2 space-y-2 max-h-52 overflow-y-auto text-xs">
                  {profileSummary.assignments.map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 p-2 dark:border-slate-800"
                    >
                      <div>
                        <strong>{roleMap.get(a.roleId)?.name ?? a.role}</strong>
                        {a.classId ? ` · Lớp ${classMap.get(a.classId)?.name ?? '—'}` : ''}
                        {a.subjectId ? ` · Môn ${subjectMap.get(a.subjectId)?.name ?? '—'}` : ''}
                        <span className="ml-2 text-slate-500">
                          ({yearMap.get(a.academicYearId)?.name ?? ''})
                        </span>
                      </div>
                      <span className="font-medium text-teal-700 dark:text-teal-400">
                        {TEACHER_ASSIGNMENT_STATUS_LABELS[a.status]}
                      </span>
                    </div>
                  ))}
                  {profileSummary.assignmentHistory.map((h) => (
                    <div key={h.id} className="text-[11px] text-slate-500 dark:text-slate-400">
                      · [{h.effectiveDate}] {ASSIGNMENT_ACTION_LABELS[h.actionType]} ({h.role})
                      {h.previousTeacherId ? ` từ ${teacherMap.get(h.previousTeacherId)?.fullName ?? ''}` : ''}
                      {h.newTeacherId ? ` → ${teacherMap.get(h.newTeacherId)?.fullName ?? ''}` : ''}
                      {h.reason ? ` — ${h.reason}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Role Modal */}
      <Modal
        isOpen={roleModal}
        title={editingRole ? 'Cập nhật vai trò' : 'Thêm vai trò giáo viên'}
        onClose={() => setRoleModal(false)}
      >
        <form onSubmit={(e) => void handleSaveRole(e)} className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Mã vai trò *</label>
            <input
              required
              value={roleForm.code}
              onChange={(e) => setRoleForm({ ...roleForm, code: e.target.value })}
              placeholder="VD: TO_TRUONG"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Tên vai trò *</label>
            <input
              required
              value={roleForm.name}
              onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
              placeholder="VD: Tổ trưởng chuyên môn"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Mô tả nhiệm vụ</label>
            <textarea
              rows={2}
              value={roleForm.description ?? ''}
              onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setRoleModal(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              Lưu vai trò
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTeacher}
        title="Xóa hồ sơ giáo viên"
        message={`Xác nhận xóa giáo viên "${deleteTeacher?.fullName}"? Chỉ cho phép xóa khi chưa có phân công hoặc bản ghi đánh giá liên kết.`}
        confirmLabel="Xóa"
        isDanger
        onConfirm={async () => {
          if (!deleteTeacher) return;
          const res = await teacherService.removeTeacher(deleteTeacher.id);
          if (res.ok) {
            notify('success', 'Đã xóa giáo viên');
            await refreshWorkspace();
          } else {
            notify('error', 'Không thể xóa', res.error);
          }
          setDeleteTeacher(null);
          await loadAll();
        }}
        onCancel={() => setDeleteTeacher(null)}
      />

      <ConfirmModal
        isOpen={!!deleteRole}
        title="Xóa vai trò"
        message={`Xác nhận xóa vai trò "${deleteRole?.name}"?`}
        confirmLabel="Xóa"
        isDanger
        onConfirm={async () => {
          if (!deleteRole) return;
          const res = await teacherService.removeRole(deleteRole.id);
          if (res.ok) {
            notify('success', 'Đã xóa vai trò');
            await refreshWorkspace();
          } else {
            notify('error', 'Không thể xóa', res.error);
          }
          setDeleteRole(null);
          await loadAll();
        }}
        onCancel={() => setDeleteRole(null)}
      />
    </div>
  );
};
