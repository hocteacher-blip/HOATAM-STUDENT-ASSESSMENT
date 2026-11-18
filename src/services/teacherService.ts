import { db } from '../db/database';
import {
  TeacherAssignmentStatus,
  type AssessmentPeriod,
  type AssessmentResult,
  type CommentRecord,
  type DailyAssessment,
  type LessonAssessment,
  type SchoolClass,
  type ServiceResult,
  type Student,
  type Subject,
  type Teacher,
  type TeacherAssignment,
  type TeacherAssignmentHistory,
  type TeacherRole,
  type TeacherRoleGrant,
  type Timetable,
  type TimetableLesson,
} from '../types/models';
import { createBaseFields, executeService, recordAuditLog } from './baseRepository';

export type TeacherInput = Omit<Teacher, 'id' | 'createdAt' | 'updatedAt'>;
export type TeacherRoleInput = Omit<TeacherRole, 'id' | 'createdAt' | 'updatedAt'>;
export type TeacherAssignmentInput = Omit<
  TeacherAssignment,
  'id' | 'createdAt' | 'updatedAt' | 'role' | 'status'
> & {
  role?: string;
  status?: TeacherAssignmentStatus;
};

export const SYSTEM_ROLE_DEFINITIONS: Array<{
  code: string;
  name: string;
  description: string;
  permissionsSummary: string;
}> = [
  {
    code: 'GVCN',
    name: 'Giáo viên chủ nhiệm',
    description: 'Phụ trách quản lý lớp học, nề nếp, đánh giá thường xuyên và tổng hợp định kỳ lớp chủ nhiệm.',
    permissionsSummary: 'Quản lý lớp chủ nhiệm, đánh giá hằng ngày, tổng hợp phẩm chất/năng lực và kết quả cuối kỳ.',
  },
  {
    code: 'GVBM',
    name: 'Giáo viên bộ môn',
    description: 'Giảng dạy và đánh giá theo môn học/hoạt động giáo dục ở một hoặc nhiều lớp.',
    permissionsSummary: 'Đánh giá theo tiết học và đánh giá định kỳ các môn học, lớp học được phân công.',
  },
  {
    code: 'ADMIN',
    name: 'Quản trị viên',
    description: 'Quản trị hệ thống, phân công nhiệm vụ, điều chỉnh nhân sự và cấu hình toàn trường.',
    permissionsSummary: 'Toàn quyền quản lý danh mục, phân công và điều chỉnh nhiệm vụ giáo viên.',
  },
  {
    code: 'CHUYEN_MON',
    name: 'Người quản lý chuyên môn',
    description: 'Tổ trưởng / Ban giám hiệu theo dõi chuyên môn, tiêu chí, thời khóa biểu và phân công giảng dạy.',
    permissionsSummary: 'Xem báo cáo toàn trường, điều chỉnh phân công chuyên môn và kiểm duyệt nhận xét.',
  },
];

export interface UnfinishedTeacherTask {
  id: string;
  category: 'PERIODIC' | 'DAILY' | 'TIMETABLE';
  title: string;
  description: string;
  classId?: string;
  subjectId?: string;
  periodId?: string;
  targetPath: string;
}

export interface TeacherWorkSummary {
  teacher: Teacher;
  grantedRoles: TeacherRole[];
  assignments: TeacherAssignment[];
  activeAssignments: TeacherAssignment[];
  homeroomClasses: SchoolClass[];
  teachingSubjects: Subject[];
  assignedClasses: SchoolClass[];
  timetables: Timetable[];
  timetableLessons: TimetableLesson[];
  assignmentHistory: TeacherAssignmentHistory[];
  assessments: {
    daily: DailyAssessment[];
    lesson: LessonAssessment[];
    results: AssessmentResult[];
    comments: CommentRecord[];
  };
  unfinishedTasks: UnfinishedTeacherTask[];
}

export interface OperatorPermissions {
  isAdmin: boolean;
  isSpecialistManager: boolean;
  canManageAssignments: boolean;
  isScopedTeacher: boolean;
  activeTeacherId?: string;
  allowedHomeroomClassIds: Set<string>;
  allowedSubjectIdsByClass: Map<string, Set<string>>;
  allAllowedClassIds: Set<string>;
}

export function computeOperatorPermissions(params: {
  mode: 'ADMIN' | 'TEACHER';
  teacherId?: string;
  roleGrants: TeacherRoleGrant[];
  assignments: TeacherAssignment[];
  classes: SchoolClass[];
}): OperatorPermissions {
  const { mode, teacherId, roleGrants, assignments, classes } = params;

  if (mode === 'ADMIN' || !teacherId) {
    return {
      isAdmin: true,
      isSpecialistManager: true,
      canManageAssignments: true,
      isScopedTeacher: false,
      activeTeacherId: teacherId,
      allowedHomeroomClassIds: new Set(classes.map((c) => c.id)),
      allowedSubjectIdsByClass: new Map(),
      allAllowedClassIds: new Set(classes.map((c) => c.id)),
    };
  }

  const teacherGrantCodes = new Set(
    roleGrants
      .filter((g) => g.teacherId === teacherId && g.roleCode)
      .map((g) => g.roleCode.toUpperCase())
  );
  const activeTeacherAssignments = assignments.filter(
    (a) => a.teacherId === teacherId && a.status === TeacherAssignmentStatus.ACTIVE
  );
  for (const a of activeTeacherAssignments) {
    if (a.role) teacherGrantCodes.add(a.role.toUpperCase());
  }

  const isAdmin = teacherGrantCodes.has('ADMIN');
  const isSpecialistManager = isAdmin || teacherGrantCodes.has('CHUYEN_MON');
  const canManageAssignments = isAdmin || isSpecialistManager;

  const allowedHomeroomClassIds = new Set<string>();
  const allowedSubjectIdsByClass = new Map<string, Set<string>>();
  const allAllowedClassIds = new Set<string>();

  for (const cls of classes) {
    if (cls.homeroomTeacherId === teacherId) {
      allowedHomeroomClassIds.add(cls.id);
      allAllowedClassIds.add(cls.id);
    }
  }

  for (const a of activeTeacherAssignments) {
    if (a.classId) {
      allAllowedClassIds.add(a.classId);
      if (a.isHomeroom || a.role?.toUpperCase() === 'GVCN') {
        allowedHomeroomClassIds.add(a.classId);
      }
      if (a.subjectId) {
        const set = allowedSubjectIdsByClass.get(a.classId) ?? new Set<string>();
        set.add(a.subjectId);
        allowedSubjectIdsByClass.set(a.classId, set);
      }
    }
  }

  return {
    isAdmin,
    isSpecialistManager,
    canManageAssignments,
    isScopedTeacher: !isAdmin && !isSpecialistManager,
    activeTeacherId: teacherId,
    allowedHomeroomClassIds,
    allowedSubjectIdsByClass,
    allAllowedClassIds,
  };
}

export async function ensureDefaultRolesInitialized(): Promise<TeacherRole[]> {
  const existing = await db.teacherRoles.toArray();
  const byCode = new Map(existing.map((r) => [r.code.toUpperCase(), r]));
  const toCreate: TeacherRole[] = [];

  for (const def of SYSTEM_ROLE_DEFINITIONS) {
    if (!byCode.has(def.code)) {
      toCreate.push({
        ...createBaseFields(),
        code: def.code,
        name: def.name,
        description: def.description,
        permissionsSummary: def.permissionsSummary,
        isSystemRole: true,
      });
    }
  }

  if (toCreate.length > 0) {
    await db.teacherRoles.bulkAdd(toCreate);
    return [...existing, ...toCreate];
  }
  return existing;
}

export const teacherService = {
  async listTeachers(): Promise<ServiceResult<Teacher[]>> {
    return executeService(async () => {
      const items = await db.teachers.toArray();
      return items.sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
    }, 'Không thể tải danh sách giáo viên.');
  },

  async createTeacher(input: TeacherInput, initialRoleIds?: string[]): Promise<ServiceResult<Teacher>> {
    return executeService(async () => {
      const code = input.code.trim();
      const fullName = input.fullName.trim();
      if (!code || !fullName) {
        throw new Error('Mã giáo viên và họ tên không được để trống.');
      }

      const duplicate = await db.teachers.where('code').equalsIgnoreCase(code).first();
      if (duplicate) {
        throw new Error(`Mã giáo viên "${code}" đã tồn tại.`);
      }

      const record: Teacher = {
        ...createBaseFields(),
        ...input,
        code,
        fullName,
        username: input.username?.trim() || undefined,
        email: input.email?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
        specialization: input.specialization?.trim() || undefined,
        qualification: input.qualification?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
      };

      await db.transaction('rw', db.teachers, db.teacherRoles, db.teacherRoleGrants, async () => {
        await db.teachers.add(record);
        if (initialRoleIds && initialRoleIds.length > 0) {
          const allRoles = await db.teacherRoles.toArray();
          const roleMap = new Map(allRoles.map((r) => [r.id, r]));
          const grants: TeacherRoleGrant[] = [];
          for (const rid of new Set(initialRoleIds)) {
            const roleObj = roleMap.get(rid);
            if (roleObj) {
              grants.push({
                ...createBaseFields(),
                teacherId: record.id,
                roleId: roleObj.id,
                roleCode: roleObj.code,
              });
            }
          }
          if (grants.length > 0) {
            await db.teacherRoleGrants.bulkAdd(grants);
          }
        }
      });

      await recordAuditLog('CREATE', 'teachers', `Thêm giáo viên ${record.fullName} (${record.code})`, record.id);
      return record;
    }, 'Không thể thêm giáo viên.');
  },

  async updateTeacher(
    id: string,
    patch: Partial<TeacherInput>,
    nextRoleIds?: string[]
  ): Promise<ServiceResult<Teacher>> {
    return executeService(async () => {
      const existing = await db.teachers.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy hồ sơ giáo viên.');
      }

      const nextCode = patch.code !== undefined ? patch.code.trim() : existing.code;
      const nextName = patch.fullName !== undefined ? patch.fullName.trim() : existing.fullName;
      if (!nextCode || !nextName) {
        throw new Error('Mã giáo viên và họ tên không được để trống.');
      }

      if (nextCode.toLowerCase() !== existing.code.toLowerCase()) {
        const duplicate = await db.teachers.where('code').equalsIgnoreCase(nextCode).first();
        if (duplicate && duplicate.id !== id) {
          throw new Error(`Mã giáo viên "${nextCode}" đã được sử dụng.`);
        }
      }

      const updated: Teacher = {
        ...existing,
        ...patch,
        code: nextCode,
        fullName: nextName,
        username: patch.username !== undefined ? patch.username.trim() || undefined : existing.username,
        email: patch.email !== undefined ? patch.email.trim() || undefined : existing.email,
        phone: patch.phone !== undefined ? patch.phone.trim() || undefined : existing.phone,
        specialization:
          patch.specialization !== undefined
            ? patch.specialization.trim() || undefined
            : existing.specialization,
        updatedAt: new Date().toISOString(),
      };

      await db.transaction('rw', db.teachers, db.teacherRoles, db.teacherRoleGrants, async () => {
        await db.teachers.put(updated);
        if (nextRoleIds !== undefined) {
          await db.teacherRoleGrants.where('teacherId').equals(id).delete();
          if (nextRoleIds.length > 0) {
            const allRoles = await db.teacherRoles.toArray();
            const roleMap = new Map(allRoles.map((r) => [r.id, r]));
            const grants: TeacherRoleGrant[] = [];
            for (const rid of new Set(nextRoleIds)) {
              const roleObj = roleMap.get(rid);
              if (roleObj) {
                grants.push({
                  ...createBaseFields(),
                  teacherId: id,
                  roleId: roleObj.id,
                  roleCode: roleObj.code,
                });
              }
            }
            if (grants.length > 0) {
              await db.teacherRoleGrants.bulkAdd(grants);
            }
          }
        }
      });

      await recordAuditLog('UPDATE', 'teachers', `Cập nhật giáo viên ${updated.fullName}`, id);
      return updated;
    }, 'Không thể cập nhật thông tin giáo viên.');
  },

  async removeTeacher(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      const existing = await db.teachers.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy giáo viên cần xóa.');
      }

      const [assignmentCount, homeroomCount, dailyCount, lessonCount, resultCount] = await Promise.all([
        db.teacherAssignments.where('teacherId').equals(id).count(),
        db.classes.where('homeroomTeacherId').equals(id).count(),
        db.dailyAssessments.filter((d) => d.teacherId === id).count(),
        db.lessonAssessments.filter((l) => l.teacherId === id).count(),
        db.assessmentResults.filter((r) => r.teacherId === id).count(),
      ]);

      const assessmentsTotal = dailyCount + lessonCount + resultCount;
      if (assignmentCount > 0 || homeroomCount > 0 || assessmentsTotal > 0) {
        throw new Error(
          `Không thể xóa giáo viên "${existing.fullName}" vì đang liên kết với ${homeroomCount} lớp chủ nhiệm, ${assignmentCount} phân công và ${assessmentsTotal} bản ghi đánh giá. Hãy chuyển trạng thái sang "Ngừng công tác" nếu cần bảo toàn dữ liệu.`
        );
      }

      await db.transaction('rw', db.teachers, db.teacherRoleGrants, async () => {
        await db.teacherRoleGrants.where('teacherId').equals(id).delete();
        await db.teachers.delete(id);
      });
      await recordAuditLog('DELETE', 'teachers', `Xóa giáo viên ${existing.fullName}`, id);
    }, 'Không thể xóa giáo viên.');
  },

  async listRoles(): Promise<ServiceResult<TeacherRole[]>> {
    return executeService(async () => {
      const items = await ensureDefaultRolesInitialized();
      return items.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }, 'Không thể tải danh sách vai trò giáo viên.');
  },

  async listRoleGrants(teacherId?: string): Promise<ServiceResult<TeacherRoleGrant[]>> {
    return executeService(async () => {
      if (teacherId) {
        return db.teacherRoleGrants.where('teacherId').equals(teacherId).toArray();
      }
      return db.teacherRoleGrants.toArray();
    }, 'Không thể tải phân quyền vai trò của giáo viên.');
  },

  async setTeacherRoles(teacherId: string, roleIds: string[]): Promise<ServiceResult<TeacherRoleGrant[]>> {
    return executeService(async () => {
      const teacher = await db.teachers.get(teacherId);
      if (!teacher) {
        throw new Error('Không tìm thấy giáo viên.');
      }
      const roles = await ensureDefaultRolesInitialized();
      const roleMap = new Map(roles.map((r) => [r.id, r]));
      const grants: TeacherRoleGrant[] = [];
      for (const rid of new Set(roleIds)) {
        const r = roleMap.get(rid);
        if (r) {
          grants.push({
            ...createBaseFields(),
            teacherId,
            roleId: r.id,
            roleCode: r.code,
          });
        }
      }

      await db.transaction('rw', db.teacherRoleGrants, async () => {
        await db.teacherRoleGrants.where('teacherId').equals(teacherId).delete();
        if (grants.length > 0) {
          await db.teacherRoleGrants.bulkAdd(grants);
        }
      });

      await recordAuditLog(
        'UPDATE',
        'teacherRoleGrants',
        `Cập nhật vai trò cho ${teacher.fullName}: ${grants.map((g) => g.roleCode).join(', ') || 'Không có'}`,
        teacherId
      );
      return grants;
    }, 'Không thể cập nhật vai trò giáo viên.');
  },

  async createRole(input: TeacherRoleInput): Promise<ServiceResult<TeacherRole>> {
    return executeService(async () => {
      const code = input.code.trim().toUpperCase();
      const name = input.name.trim();
      if (!code || !name) {
        throw new Error('Mã vai trò và tên vai trò không được để trống.');
      }
      const duplicate = await db.teacherRoles.where('code').equalsIgnoreCase(code).first();
      if (duplicate) {
        throw new Error(`Mã vai trò "${code}" đã tồn tại.`);
      }
      const record: TeacherRole = {
        ...createBaseFields(),
        ...input,
        code,
        name,
      };
      await db.teacherRoles.add(record);
      await recordAuditLog('CREATE', 'teacherRoles', `Thêm vai trò ${record.name}`, record.id);
      return record;
    }, 'Không thể thêm vai trò giáo viên.');
  },

  async updateRole(id: string, patch: Partial<TeacherRoleInput>): Promise<ServiceResult<TeacherRole>> {
    return executeService(async () => {
      const existing = await db.teacherRoles.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy vai trò cần cập nhật.');
      }
      const updated: TeacherRole = {
        ...existing,
        ...patch,
        code: patch.code !== undefined ? patch.code.trim().toUpperCase() : existing.code,
        name: patch.name !== undefined ? patch.name.trim() : existing.name,
        updatedAt: new Date().toISOString(),
      };
      await db.teacherRoles.put(updated);
      await recordAuditLog('UPDATE', 'teacherRoles', `Cập nhật vai trò ${updated.name}`, id);
      return updated;
    }, 'Không thể cập nhật vai trò.');
  },

  async removeRole(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      const existing = await db.teacherRoles.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy vai trò cần xóa.');
      }
      const [inAssignments, inGrants] = await Promise.all([
        db.teacherAssignments.where('roleId').equals(id).count(),
        db.teacherRoleGrants.where('roleId').equals(id).count(),
      ]);
      if (inAssignments > 0 || inGrants > 0) {
        throw new Error(
          `Vai trò "${existing.name}" đang được gán cho ${inGrants} giáo viên và ${inAssignments} phân công nhiệm vụ.`
        );
      }
      await db.teacherRoles.delete(id);
      await recordAuditLog('DELETE', 'teacherRoles', `Xóa vai trò ${existing.name}`, id);
    }, 'Không thể xóa vai trò.');
  },

  async listAssignments(filters?: {
    academicYearId?: string;
    teacherId?: string;
  } | string): Promise<ServiceResult<TeacherAssignment[]>> {
    return executeService(async () => {
      const academicYearId = typeof filters === 'string' ? filters : filters?.academicYearId;
      const teacherId = typeof filters === 'object' ? filters?.teacherId : undefined;

      let items: TeacherAssignment[];
      if (academicYearId && teacherId) {
        items = await db.teacherAssignments
          .where('[academicYearId+teacherId]')
          .equals([academicYearId, teacherId])
          .toArray();
      } else if (academicYearId) {
        items = await db.teacherAssignments.where('academicYearId').equals(academicYearId).toArray();
      } else if (teacherId) {
        items = await db.teacherAssignments.where('teacherId').equals(teacherId).toArray();
      } else {
        items = await db.teacherAssignments.toArray();
      }
      return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }, 'Không thể tải danh sách phân công nhiệm vụ.');
  },

  async createAssignment(
    input: TeacherAssignmentInput,
    actorName?: string
  ): Promise<ServiceResult<TeacherAssignment>> {
    return executeService(async () => {
      if (!input.academicYearId || !input.teacherId || !input.roleId) {
        throw new Error('Vui lòng chọn đầy đủ năm học, giáo viên và vai trò.');
      }

      const [roleObj, teacherObj] = await Promise.all([
        db.teacherRoles.get(input.roleId),
        db.teachers.get(input.teacherId),
      ]);
      if (!roleObj || !teacherObj) {
        throw new Error('Không tìm thấy giáo viên hoặc vai trò hợp lệ.');
      }

      const resolvedRole = (input.role ?? roleObj.code).toUpperCase();
      const isHomeroom = input.isHomeroom || resolvedRole === 'GVCN';
      const status = input.status ?? TeacherAssignmentStatus.ACTIVE;
      const startDate = input.startDate || new Date().toISOString().slice(0, 10);

      const record: TeacherAssignment = {
        ...createBaseFields(),
        ...input,
        role: resolvedRole,
        roleId: roleObj.id,
        classId: input.classId || undefined,
        subjectId: input.subjectId || undefined,
        timetableId: input.timetableId || undefined,
        isHomeroom,
        startDate,
        endDate: input.endDate || undefined,
        status,
        notes: input.notes?.trim() || undefined,
      };

      const historyEntry: TeacherAssignmentHistory = {
        ...createBaseFields(),
        assignmentId: record.id,
        academicYearId: record.academicYearId,
        actionType: 'ASSIGNED',
        newTeacherId: record.teacherId,
        role: record.role,
        classId: record.classId,
        subjectId: record.subjectId,
        effectiveDate: startDate,
        reason: record.notes || 'Phân công nhiệm vụ mới',
        performedBy: actorName,
      };

      await db.transaction(
        'rw',
        db.teacherAssignments,
        db.teacherAssignmentHistory,
        db.teacherRoleGrants,
        db.classes,
        async () => {
          await db.teacherAssignments.add(record);
          await db.teacherAssignmentHistory.add(historyEntry);

          // Ensure independent role grant also reflects this role without overwriting other roles
          const existingGrant = await db.teacherRoleGrants
            .where('[teacherId+roleId]')
            .equals([record.teacherId, roleObj.id])
            .first();
          if (!existingGrant) {
            await db.teacherRoleGrants.add({
              ...createBaseFields(),
              teacherId: record.teacherId,
              roleId: roleObj.id,
              roleCode: roleObj.code,
            });
          }

          // Sync class homeroom reference if this is an active GVCN assignment
          if (isHomeroom && record.classId && status === TeacherAssignmentStatus.ACTIVE) {
            await db.classes.update(record.classId, {
              homeroomTeacherId: record.teacherId,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      );

      await recordAuditLog(
        'CREATE',
        'teacherAssignments',
        `Phân công ${teacherObj.fullName} vai trò ${roleObj.name}`,
        record.id,
        actorName ? { actorName } : undefined
      );
      return record;
    }, 'Không thể tạo phân công nhiệm vụ.');
  },

  async updateAssignment(
    id: string,
    patch: Partial<TeacherAssignmentInput>,
    reason?: string,
    actorName?: string
  ): Promise<ServiceResult<TeacherAssignment>> {
    return executeService(async () => {
      const existing = await db.teacherAssignments.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy phân công nhiệm vụ.');
      }

      const nextRoleId = patch.roleId ?? existing.roleId;
      const roleObj = await db.teacherRoles.get(nextRoleId);
      const nextRoleCode = (patch.role ?? roleObj?.code ?? existing.role).toUpperCase();
      const nextIsHomeroom =
        patch.isHomeroom !== undefined ? patch.isHomeroom : nextRoleCode === 'GVCN';

      const updated: TeacherAssignment = {
        ...existing,
        ...patch,
        roleId: nextRoleId,
        role: nextRoleCode,
        isHomeroom: nextIsHomeroom,
        classId: patch.classId !== undefined ? patch.classId || undefined : existing.classId,
        subjectId: patch.subjectId !== undefined ? patch.subjectId || undefined : existing.subjectId,
        timetableId:
          patch.timetableId !== undefined ? patch.timetableId || undefined : existing.timetableId,
        notes: patch.notes !== undefined ? patch.notes.trim() || undefined : existing.notes,
        updatedAt: new Date().toISOString(),
      };

      const historyEntry: TeacherAssignmentHistory = {
        ...createBaseFields(),
        assignmentId: id,
        academicYearId: updated.academicYearId,
        actionType: 'ADJUSTED',
        previousTeacherId: existing.teacherId,
        newTeacherId: updated.teacherId,
        role: updated.role,
        classId: updated.classId,
        subjectId: updated.subjectId,
        effectiveDate: new Date().toISOString().slice(0, 10),
        reason: reason?.trim() || 'Điều chỉnh thông tin phân công',
        performedBy: actorName,
      };

      await db.transaction(
        'rw',
        db.teacherAssignments,
        db.teacherAssignmentHistory,
        db.classes,
        async () => {
          await db.teacherAssignments.put(updated);
          await db.teacherAssignmentHistory.add(historyEntry);
          if (
            updated.isHomeroom &&
            updated.classId &&
            updated.status === TeacherAssignmentStatus.ACTIVE
          ) {
            await db.classes.update(updated.classId, {
              homeroomTeacherId: updated.teacherId,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      );

      await recordAuditLog(
        'UPDATE',
        'teacherAssignments',
        `Điều chỉnh phân công nhiệm vụ (${updated.role})`,
        id,
        actorName ? { actorName } : undefined
      );
      return updated;
    }, 'Không thể cập nhật phân công nhiệm vụ.');
  },

  async endAssignment(
    id: string,
    endDate?: string,
    reason?: string,
    actorName?: string
  ): Promise<ServiceResult<TeacherAssignment>> {
    return executeService(async () => {
      const existing = await db.teacherAssignments.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy phân công nhiệm vụ.');
      }

      const effectiveEnd = endDate || new Date().toISOString().slice(0, 10);
      const updated: TeacherAssignment = {
        ...existing,
        status: TeacherAssignmentStatus.COMPLETED,
        endDate: effectiveEnd,
        notes: reason ? [existing.notes, reason].filter(Boolean).join(' · ') : existing.notes,
        updatedAt: new Date().toISOString(),
      };

      const historyEntry: TeacherAssignmentHistory = {
        ...createBaseFields(),
        assignmentId: id,
        academicYearId: existing.academicYearId,
        actionType: 'ENDED',
        previousTeacherId: existing.teacherId,
        role: existing.role,
        classId: existing.classId,
        subjectId: existing.subjectId,
        effectiveDate: effectiveEnd,
        reason: reason?.trim() || 'Kết thúc nhiệm vụ phân công (giữ nguyên toàn bộ đánh giá cũ)',
        performedBy: actorName,
      };

      await db.transaction('rw', db.teacherAssignments, db.teacherAssignmentHistory, async () => {
        await db.teacherAssignments.put(updated);
        await db.teacherAssignmentHistory.add(historyEntry);
      });

      await recordAuditLog(
        'UPDATE',
        'teacherAssignments',
        `Kết thúc nhiệm vụ ${existing.role} (giữ nguyên dữ liệu đánh giá cũ)`,
        id,
        actorName ? { actorName } : undefined
      );
      return updated;
    }, 'Không thể kết thúc nhiệm vụ.');
  },

  async transferAssignment(params: {
    assignmentId: string;
    newTeacherId: string;
    effectiveDate?: string;
    reason?: string;
    actorName?: string;
  }): Promise<ServiceResult<{ previous: TeacherAssignment; replacement: TeacherAssignment }>> {
    return executeService(async () => {
      const existing = await db.teacherAssignments.get(params.assignmentId);
      if (!existing) {
        throw new Error('Không tìm thấy phân công nhiệm vụ cần chuyển giao.');
      }
      if (existing.teacherId === params.newTeacherId) {
        throw new Error('Giáo viên tiếp nhận phải khác giáo viên hiện tại.');
      }

      const [prevTeacher, nextTeacher, roleObj] = await Promise.all([
        db.teachers.get(existing.teacherId),
        db.teachers.get(params.newTeacherId),
        db.teacherRoles.get(existing.roleId),
      ]);
      if (!nextTeacher) {
        throw new Error('Không tìm thấy hồ sơ giáo viên tiếp nhận.');
      }

      const effectiveDate = params.effectiveDate || new Date().toISOString().slice(0, 10);
      const now = new Date().toISOString();

      const previousUpdated: TeacherAssignment = {
        ...existing,
        status: TeacherAssignmentStatus.TRANSFERRED,
        endDate: effectiveDate,
        updatedAt: now,
      };

      const replacement: TeacherAssignment = {
        ...createBaseFields(),
        academicYearId: existing.academicYearId,
        teacherId: params.newTeacherId,
        role: existing.role,
        roleId: existing.roleId,
        classId: existing.classId,
        subjectId: existing.subjectId,
        timetableId: existing.timetableId,
        isHomeroom: existing.isHomeroom,
        weeklyPeriods: existing.weeklyPeriods,
        startDate: effectiveDate,
        status: TeacherAssignmentStatus.ACTIVE,
        notes: params.reason
          ? `Nhận chuyển giao từ ${prevTeacher?.fullName ?? 'giáo viên trước'}: ${params.reason}`
          : `Nhận chuyển giao từ ${prevTeacher?.fullName ?? 'giáo viên trước'}`,
      };

      const historyEntry: TeacherAssignmentHistory = {
        ...createBaseFields(),
        assignmentId: existing.id,
        academicYearId: existing.academicYearId,
        actionType: 'TRANSFERRED',
        previousTeacherId: existing.teacherId,
        newTeacherId: params.newTeacherId,
        role: existing.role,
        classId: existing.classId,
        subjectId: existing.subjectId,
        effectiveDate,
        reason:
          params.reason?.trim() ||
          `Chuyển giao từ ${prevTeacher?.fullName ?? 'GV cũ'} sang ${nextTeacher.fullName} (giữ nguyên đánh giá cũ)`,
        performedBy: params.actorName,
      };

      await db.transaction(
        'rw',
        db.teacherAssignments,
        db.teacherAssignmentHistory,
        db.teacherRoleGrants,
        db.classes,
        async () => {
          await db.teacherAssignments.put(previousUpdated);
          await db.teacherAssignments.add(replacement);
          await db.teacherAssignmentHistory.add(historyEntry);

          if (roleObj) {
            const existingGrant = await db.teacherRoleGrants
              .where('[teacherId+roleId]')
              .equals([params.newTeacherId, roleObj.id])
              .first();
            if (!existingGrant) {
              await db.teacherRoleGrants.add({
                ...createBaseFields(),
                teacherId: params.newTeacherId,
                roleId: roleObj.id,
                roleCode: roleObj.code,
              });
            }
          }

          if (existing.isHomeroom && existing.classId) {
            await db.classes.update(existing.classId, {
              homeroomTeacherId: params.newTeacherId,
              updatedAt: now,
            });
          }
        }
      );

      await recordAuditLog(
        'UPDATE',
        'teacherAssignments',
        `Chuyển giao nhiệm vụ ${existing.role} từ ${prevTeacher?.fullName ?? 'GV cũ'} sang ${nextTeacher.fullName} (bảo toàn lịch sử đánh giá cũ)`,
        existing.id,
        params.actorName ? { actorName: params.actorName } : undefined
      );

      return { previous: previousUpdated, replacement };
    }, 'Không thể chuyển giao nhiệm vụ.');
  },

  async listAssignmentHistory(filters?: {
    academicYearId?: string;
    teacherId?: string;
  }): Promise<ServiceResult<TeacherAssignmentHistory[]>> {
    return executeService(async () => {
      let items = await db.teacherAssignmentHistory.toArray();
      if (filters?.academicYearId) {
        items = items.filter((h) => h.academicYearId === filters.academicYearId);
      }
      if (filters?.teacherId) {
        items = items.filter(
          (h) => h.previousTeacherId === filters.teacherId || h.newTeacherId === filters.teacherId
        );
      }
      return items.sort(
        (a, b) =>
          b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt)
      );
    }, 'Không thể tải lịch sử thay đổi phân công.');
  },

  async removeAssignment(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      await db.teacherAssignments.delete(id);
      await recordAuditLog('DELETE', 'teacherAssignments', 'Xóa phân công nhiệm vụ', id);
    }, 'Không thể xóa phân công nhiệm vụ.');
  },

  async getTeacherWorkSummary(
    teacherId: string,
    academicYearId?: string
  ): Promise<ServiceResult<TeacherWorkSummary>> {
    return executeService(async () => {
      const teacher = await db.teachers.get(teacherId);
      if (!teacher) {
        throw new Error('Không tìm thấy hồ sơ giáo viên.');
      }

      const [
        roles,
        roleGrants,
        allAssignments,
        allClasses,
        allSubjects,
        allTimetables,
        allLessons,
        allHistory,
        allStudents,
        allPeriods,
        allDaily,
        allLessonAssessments,
        allResults,
        allComments,
      ] = await Promise.all([
        ensureDefaultRolesInitialized(),
        db.teacherRoleGrants.where('teacherId').equals(teacherId).toArray(),
        db.teacherAssignments.where('teacherId').equals(teacherId).toArray(),
        db.classes.toArray(),
        db.subjects.toArray(),
        db.timetables.toArray(),
        db.timetableLessons.toArray(),
        db.teacherAssignmentHistory.toArray(),
        db.students.toArray(),
        db.assessmentPeriods.toArray(),
        db.dailyAssessments.toArray(),
        db.lessonAssessments.toArray(),
        db.assessmentResults.toArray(),
        db.comments.toArray(),
      ]);

      const roleMap = new Map(roles.map((r) => [r.id, r]));
      const roleByCode = new Map(roles.map((r) => [r.code.toUpperCase(), r]));
      const classMap = new Map(allClasses.map((c) => [c.id, c]));
      const subjectMap = new Map(allSubjects.map((s) => [s.id, s]));

      const scopedAssignments = academicYearId
        ? allAssignments.filter((a) => a.academicYearId === academicYearId)
        : allAssignments;

      const activeAssignments = scopedAssignments.filter(
        (a) => a.status === TeacherAssignmentStatus.ACTIVE
      );

      // Granted roles = independent role grants + roles from active assignments
      const grantedRoleIds = new Set<string>(roleGrants.map((g) => g.roleId));
      for (const a of activeAssignments) {
        if (a.roleId && roleMap.has(a.roleId)) grantedRoleIds.add(a.roleId);
        else if (a.role && roleByCode.has(a.role.toUpperCase())) {
          grantedRoleIds.add(roleByCode.get(a.role.toUpperCase())!.id);
        }
      }
      const grantedRoles = Array.from(grantedRoleIds)
        .map((rid) => roleMap.get(rid))
        .filter((r): r is TeacherRole => Boolean(r));

      // Homeroom classes
      const homeroomClassIds = new Set<string>();
      for (const a of activeAssignments) {
        if ((a.isHomeroom || a.role?.toUpperCase() === 'GVCN') && a.classId) {
          homeroomClassIds.add(a.classId);
        }
      }
      for (const cls of allClasses) {
        if (
          cls.homeroomTeacherId === teacherId &&
          (!academicYearId || cls.academicYearId === academicYearId)
        ) {
          homeroomClassIds.add(cls.id);
        }
      }
      const homeroomClasses = Array.from(homeroomClassIds)
        .map((cid) => classMap.get(cid))
        .filter((c): c is SchoolClass => Boolean(c))
        .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi'));

      // Assigned classes & subjects
      const assignedClassIds = new Set<string>(homeroomClassIds);
      const teachingSubjectIds = new Set<string>();
      const linkedTimetableIds = new Set<string>();

      for (const a of activeAssignments) {
        if (a.classId) assignedClassIds.add(a.classId);
        if (a.subjectId) teachingSubjectIds.add(a.subjectId);
        if (a.timetableId) linkedTimetableIds.add(a.timetableId);
      }

      const assignedClasses = Array.from(assignedClassIds)
        .map((cid) => classMap.get(cid))
        .filter((c): c is SchoolClass => Boolean(c))
        .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi'));

      const teachingSubjects = Array.from(teachingSubjectIds)
        .map((sid) => subjectMap.get(sid))
        .filter((s): s is Subject => Boolean(s))
        .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'vi'));

      // Timetable lessons related to this teacher
      const activeClassSubjectPairs = new Set(
        activeAssignments
          .filter((a) => a.classId && a.subjectId)
          .map((a) => `${a.classId}|${a.subjectId}`)
      );

      for (const tt of allTimetables) {
        if (
          (tt.teacherId === teacherId || (tt.classId && assignedClassIds.has(tt.classId))) &&
          (!academicYearId || tt.academicYearId === academicYearId)
        ) {
          linkedTimetableIds.add(tt.id);
        }
      }

      const relatedLessons = allLessons
        .filter((lesson) => {
          if (academicYearId && lesson.academicYearId !== academicYearId) return false;
          if (lesson.teacherId === teacherId) return true;
          if (linkedTimetableIds.has(lesson.timetableId)) {
            return (
              !lesson.teacherId ||
              activeClassSubjectPairs.has(`${lesson.classId}|${lesson.subjectId}`)
            );
          }
          if (activeClassSubjectPairs.has(`${lesson.classId}|${lesson.subjectId}`) && !lesson.teacherId) {
            return true;
          }
          return false;
        })
        .sort(
          (a, b) =>
            (a.lessonDate ?? '').localeCompare(b.lessonDate ?? '') ||
            a.dayOfWeek - b.dayOfWeek ||
            a.periodNumber - b.periodNumber
        );

      for (const lesson of relatedLessons) {
        linkedTimetableIds.add(lesson.timetableId);
      }

      const timetables = allTimetables.filter(
        (tt) =>
          linkedTimetableIds.has(tt.id) &&
          (!academicYearId || tt.academicYearId === academicYearId)
      );

      const assignmentHistory = allHistory
        .filter(
          (h) =>
            (h.previousTeacherId === teacherId || h.newTeacherId === teacherId) &&
            (!academicYearId || h.academicYearId === academicYearId)
        )
        .sort(
          (a, b) =>
            b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt)
        );

      // Historical assessments recorded by this teacher (always preserved regardless of later transfers!)
      const daily = allDaily
        .filter(
          (d) =>
            d.teacherId === teacherId && (!academicYearId || d.academicYearId === academicYearId)
        )
        .sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate));
      const lesson = allLessonAssessments
        .filter(
          (l) =>
            l.teacherId === teacherId && (!academicYearId || l.academicYearId === academicYearId)
        )
        .sort((a, b) => b.lessonDate.localeCompare(a.lessonDate));
      const results = allResults
        .filter(
          (r) =>
            r.teacherId === teacherId && (!academicYearId || r.academicYearId === academicYearId)
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const comments = allComments
        .filter(
          (c) =>
            c.authorTeacherId === teacherId &&
            (!academicYearId || c.academicYearId === academicYearId)
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      // Unfinished tasks computed strictly from real IndexedDB data
      const unfinishedTasks: UnfinishedTeacherTask[] = [];
      const today = new Date().toISOString().slice(0, 10);

      const studentsByClass = new Map<string, Student[]>();
      for (const stu of allStudents) {
        if (academicYearId && stu.academicYearId !== academicYearId) continue;
        const arr = studentsByClass.get(stu.classId) ?? [];
        arr.push(stu);
        studentsByClass.set(stu.classId, arr);
      }

      // 1. Homeroom daily check-in today
      for (const cls of homeroomClasses) {
        const classStudents = studentsByClass.get(cls.id) ?? [];
        if (classStudents.length > 0) {
          const assessedToday = new Set(
            allDaily
              .filter((d) => d.classId === cls.id && d.assessmentDate === today)
              .map((d) => d.studentId)
          );
          const remaining = classStudents.length - assessedToday.size;
          if (remaining > 0) {
            unfinishedTasks.push({
              id: `daily-${cls.id}`,
              category: 'DAILY',
              title: `Đánh giá hằng ngày lớp ${cls.name} (${today})`,
              description: `Còn ${remaining}/${classStudents.length} học sinh chưa ghi nhận đánh giá ngày hôm nay.`,
              classId: cls.id,
              targetPath: '/danh-gia-hang-ngay',
            });
          }
        }
      }

      // 2. Unlocked periodic assessment periods missing results
      const openPeriods: AssessmentPeriod[] = allPeriods.filter(
        (p) => !p.isLocked && (!academicYearId || p.academicYearId === academicYearId)
      );
      for (const period of openPeriods) {
        for (const a of activeAssignments) {
          if (!a.classId) continue;
          const cls = classMap.get(a.classId);
          const classStudents = studentsByClass.get(a.classId) ?? [];
          if (!cls || classStudents.length === 0) continue;

          if (a.subjectId) {
            const subj = subjectMap.get(a.subjectId);
            const assessedStuIds = new Set(
              allResults
                .filter(
                  (r) =>
                    r.periodId === period.id &&
                    r.classId === cls.id &&
                    r.subjectId === a.subjectId
                )
                .map((r) => r.studentId)
            );
            const missing = classStudents.length - assessedStuIds.size;
            if (missing > 0) {
              unfinishedTasks.push({
                id: `periodic-${period.id}-${cls.id}-${a.subjectId}`,
                category: 'PERIODIC',
                title: `Đánh giá định kỳ ${period.name} — ${subj?.name ?? 'Môn học'} (${cls.name})`,
                description: `Còn ${missing}/${classStudents.length} học sinh chưa có kết quả môn ${subj?.name ?? ''} trong kỳ ${period.name}.`,
                classId: cls.id,
                subjectId: a.subjectId,
                periodId: period.id,
                targetPath: '/danh-gia-dinh-ky',
              });
            }
          } else if (a.isHomeroom || a.role?.toUpperCase() === 'GVCN') {
            const assessedOverall = new Set(
              allResults
                .filter(
                  (r) =>
                    r.periodId === period.id &&
                    r.classId === cls.id &&
                    r.resultScope !== 'SUBJECT'
                )
                .map((r) => r.studentId)
            );
            const missing = classStudents.length - assessedOverall.size;
            if (missing > 0) {
              unfinishedTasks.push({
                id: `periodic-hr-${period.id}-${cls.id}`,
                category: 'PERIODIC',
                title: `Tổng hợp phẩm chất/năng lực ${period.name} (${cls.name})`,
                description: `Còn ${missing}/${classStudents.length} học sinh lớp chủ nhiệm chưa có tổng hợp kỳ ${period.name}.`,
                classId: cls.id,
                periodId: period.id,
                targetPath: '/danh-gia-dinh-ky',
              });
            }
          }
        }
      }

      return {
        teacher,
        grantedRoles,
        assignments: scopedAssignments,
        activeAssignments,
        homeroomClasses,
        teachingSubjects,
        assignedClasses,
        timetables,
        timetableLessons: relatedLessons,
        assignmentHistory,
        assessments: {
          daily,
          lesson,
          results,
          comments,
        },
        unfinishedTasks,
      };
    }, 'Không thể tổng hợp công việc của giáo viên.');
  },
};
