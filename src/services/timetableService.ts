import { db } from '../db/database';
import {
  DayOfWeek,
  TeacherAssignmentStatus,
  type SchoolClass,
  type ServiceResult,
  type Subject,
  type TeacherAssignment,
  type Timetable,
  type TimetableLesson,
  type PeriodTimeSlot,
} from '../types/models';
import { createBaseFields, executeService, recordAuditLog } from './baseRepository';

export type TimetableInput = Omit<Timetable, 'id' | 'createdAt' | 'updatedAt'>;
export type TimetableLessonInput = Omit<TimetableLesson, 'id' | 'createdAt' | 'updatedAt'>;

export interface LessonConflictItem {
  type: 'TEACHER' | 'ROOM' | 'SLOT';
  conflictingLesson: TimetableLesson;
  conflictingTimetable?: Timetable;
  message: string;
}

export interface LessonConflictReport {
  hasConflicts: boolean;
  slotConflict?: LessonConflictItem;
  teacherConflicts: LessonConflictItem[];
  roomConflicts: LessonConflictItem[];
}

export const DEFAULT_PERIOD_TIMES: PeriodTimeSlot[] = [
  { periodNumber: 1, startTime: '07:30', endTime: '08:05', session: 'MORNING' },
  { periodNumber: 2, startTime: '08:15', endTime: '08:50', session: 'MORNING' },
  { periodNumber: 3, startTime: '09:05', endTime: '09:40', session: 'MORNING' },
  { periodNumber: 4, startTime: '09:50', endTime: '10:25', session: 'MORNING' },
  { periodNumber: 5, startTime: '14:00', endTime: '14:35', session: 'AFTERNOON' },
  { periodNumber: 6, startTime: '14:45', endTime: '15:20', session: 'AFTERNOON' },
  { periodNumber: 7, startTime: '15:35', endTime: '16:10', session: 'AFTERNOON' },
  { periodNumber: 8, startTime: '16:15', endTime: '16:50', session: 'AFTERNOON' },
];

export function addDaysIso(isoDate: string, days: number): string {
  if (!isoDate) return '';
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function computeLessonDateForWeekday(effectiveFrom: string, dayOfWeek: DayOfWeek): string {
  if (!effectiveFrom) return '';
  const anchor = new Date(`${effectiveFrom}T12:00:00Z`);
  if (Number.isNaN(anchor.getTime())) return '';
  const jsDay = anchor.getUTCDay(); // 0=Sun, 1=Mon..6=Sat
  const offsetToMonday = jsDay === 0 ? 1 : 1 - jsDay;
  const monday = new Date(anchor.getTime());
  monday.setUTCDate(anchor.getUTCDate() + offsetToMonday);
  monday.setUTCDate(monday.getUTCDate() + (dayOfWeek - DayOfWeek.MON));
  return monday.toISOString().slice(0, 10);
}

export function doScheduleWindowsOverlap(params: {
  timetableA?: Timetable;
  timetableB?: Timetable;
  lessonDateA?: string;
  lessonDateB?: string;
}): boolean {
  const { timetableA, timetableB, lessonDateA, lessonDateB } = params;

  if (lessonDateA && lessonDateB) {
    return lessonDateA === lessonDateB;
  }

  if (
    timetableA?.weekNumber !== undefined &&
    timetableB?.weekNumber !== undefined
  ) {
    return timetableA.weekNumber === timetableB.weekNumber;
  }

  if (!timetableA?.effectiveFrom || !timetableB?.effectiveFrom) {
    return true;
  }

  const startA = timetableA.effectiveFrom;
  const endA = timetableA.effectiveTo || addDaysIso(startA, 5);
  const startB = timetableB.effectiveFrom;
  const endB = timetableB.effectiveTo || addDaysIso(startB, 5);

  return startA <= endB && startB <= endA;
}

export function detectLessonConflicts(params: {
  candidate: {
    id?: string;
    timetableId: string;
    academicYearId: string;
    classId: string;
    dayOfWeek: DayOfWeek;
    periodNumber: number;
    lessonDate?: string;
    teacherId?: string;
    roomName?: string;
  };
  allLessons: TimetableLesson[];
  timetablesById: Map<string, Timetable>;
  classesById?: Map<string, SchoolClass>;
}): LessonConflictReport {
  const { candidate, allLessons, timetablesById, classesById } = params;
  const candidateTimetable = timetablesById.get(candidate.timetableId);
  const normalizedRoom = (candidate.roomName ?? '').trim().toLowerCase();

  let slotConflict: LessonConflictItem | undefined;
  const teacherConflicts: LessonConflictItem[] = [];
  const roomConflicts: LessonConflictItem[] = [];

  for (const lesson of allLessons) {
    if (candidate.id && lesson.id === candidate.id) continue;
    if (lesson.academicYearId !== candidate.academicYearId) continue;
    if (lesson.dayOfWeek !== candidate.dayOfWeek || lesson.periodNumber !== candidate.periodNumber) {
      continue;
    }

    const otherTimetable = timetablesById.get(lesson.timetableId);
    if (otherTimetable && !otherTimetable.isActive) continue;

    if (lesson.timetableId === candidate.timetableId) {
      const clsName = classesById?.get(lesson.classId)?.name ?? 'lớp đã xếp';
      slotConflict = {
        type: 'SLOT',
        conflictingLesson: lesson,
        conflictingTimetable: otherTimetable,
        message: `Thứ ${candidate.dayOfWeek}, tiết ${candidate.periodNumber} trong thời khóa biểu này đã có tiết dạy (${clsName}).`,
      };
      continue;
    }

    const overlaps = doScheduleWindowsOverlap({
      timetableA: candidateTimetable,
      timetableB: otherTimetable,
      lessonDateA: candidate.lessonDate,
      lessonDateB: lesson.lessonDate,
    });
    if (!overlaps) continue;

    const otherClassName = classesById?.get(lesson.classId)?.name ?? lesson.classId;
    const otherTtLabel = otherTimetable?.name ? ` (${otherTimetable.name})` : '';

    if (candidate.teacherId && lesson.teacherId && lesson.teacherId === candidate.teacherId) {
      teacherConflicts.push({
        type: 'TEACHER',
        conflictingLesson: lesson,
        conflictingTimetable: otherTimetable,
        message: `Trùng tiết giáo viên: Thứ ${candidate.dayOfWeek}, tiết ${candidate.periodNumber}${candidate.lessonDate ? ` (${candidate.lessonDate})` : ''} đã xếp cho lớp ${otherClassName}${otherTtLabel}.`,
      });
    }

    if (
      normalizedRoom &&
      lesson.roomName &&
      lesson.roomName.trim().toLowerCase() === normalizedRoom &&
      lesson.classId !== candidate.classId
    ) {
      roomConflicts.push({
        type: 'ROOM',
        conflictingLesson: lesson,
        conflictingTimetable: otherTimetable,
        message: `Trùng phòng "${candidate.roomName}": Thứ ${candidate.dayOfWeek}, tiết ${candidate.periodNumber} đang được sử dụng bởi lớp ${otherClassName}${otherTtLabel}.`,
      });
    }
  }

  return {
    hasConflicts: Boolean(slotConflict) || teacherConflicts.length > 0 || roomConflicts.length > 0,
    slotConflict,
    teacherConflicts,
    roomConflicts,
  };
}

export function getTeacherLessonScopeOptions(params: {
  teacherId?: string;
  academicYearId?: string;
  assignments: TeacherAssignment[];
  classes: SchoolClass[];
  subjects: Subject[];
  allowUnassignedAdmin?: boolean;
}): {
  allowedClasses: SchoolClass[];
  homeroomClassIds: Set<string>;
  getAllowedSubjectsForClass: (classId: string) => Subject[];
  hasAssignments: boolean;
} {
  const { teacherId, academicYearId, assignments, classes, subjects, allowUnassignedAdmin } = params;
  const activeClasses = classes.filter(
    (c) => !c.isArchived && (!academicYearId || c.academicYearId === academicYearId)
  );
  const activeSubjects = subjects.filter((s) => s.isActive);

  if (!teacherId) {
    if (allowUnassignedAdmin) {
      return {
        allowedClasses: activeClasses,
        homeroomClassIds: new Set(),
        getAllowedSubjectsForClass: (classId: string) => {
          const cls = activeClasses.find((c) => c.id === classId);
          if (!cls) return activeSubjects;
          const matched = activeSubjects.filter(
            (s) => !s.gradeLevels || s.gradeLevels.length === 0 || s.gradeLevels.includes(cls.gradeLevel)
          );
          return matched.length > 0 ? matched : activeSubjects;
        },
        hasAssignments: true,
      };
    }
    return {
      allowedClasses: [],
      homeroomClassIds: new Set(),
      getAllowedSubjectsForClass: () => [],
      hasAssignments: false,
    };
  }

  const activeTeacherAssignments = assignments.filter(
    (a) =>
      a.teacherId === teacherId &&
      a.status === TeacherAssignmentStatus.ACTIVE &&
      (!academicYearId || a.academicYearId === academicYearId)
  );

  const homeroomClassIds = new Set<string>();
  const subjectIdsByClass = new Map<string, Set<string>>();
  const allowedClassIds = new Set<string>();
  const assignedAllClassSubjects = new Set<string>();

  for (const cls of activeClasses) {
    if (cls.homeroomTeacherId === teacherId) {
      homeroomClassIds.add(cls.id);
      allowedClassIds.add(cls.id);
    }
  }

  for (const a of activeTeacherAssignments) {
    if (a.classId) {
      allowedClassIds.add(a.classId);
      if (a.isHomeroom || a.role?.toUpperCase() === 'GVCN') {
        homeroomClassIds.add(a.classId);
      }
      if (a.subjectId) {
        const set = subjectIdsByClass.get(a.classId) ?? new Set<string>();
        set.add(a.subjectId);
        subjectIdsByClass.set(a.classId, set);
      }
    } else if (a.subjectId) {
      assignedAllClassSubjects.add(a.subjectId);
    }
  }

  // If teacher has subject assignment with no specific class, allow active classes
  const allowedClasses =
    assignedAllClassSubjects.size > 0
      ? activeClasses
      : activeClasses.filter((c) => allowedClassIds.has(c.id));

  const getAllowedSubjectsForClass = (classId: string): Subject[] => {
    if (!classId) return [];
    const cls = activeClasses.find((c) => c.id === classId);
    const gradeSubjects = cls
      ? activeSubjects.filter(
          (s) => !s.gradeLevels || s.gradeLevels.length === 0 || s.gradeLevels.includes(cls.gradeLevel)
        )
      : activeSubjects;

    if (homeroomClassIds.has(classId)) {
      return gradeSubjects.length > 0 ? gradeSubjects : activeSubjects;
    }

    const specificSet = subjectIdsByClass.get(classId);
    const merged = new Set<string>([
      ...(specificSet ? Array.from(specificSet) : []),
      ...Array.from(assignedAllClassSubjects),
    ]);
    if (merged.size === 0) return [];
    return activeSubjects.filter((s) => merged.has(s.id));
  };

  return {
    allowedClasses,
    homeroomClassIds,
    getAllowedSubjectsForClass,
    hasAssignments: allowedClasses.length > 0,
  };
}

export const timetableService = {
  async listTimetables(
    filters?:
      | string
      | { academicYearId?: string; teacherId?: string; classId?: string }
  ): Promise<ServiceResult<Timetable[]>> {
    return executeService(async () => {
      const classId = typeof filters === 'string' ? filters : filters?.classId;
      const academicYearId = typeof filters === 'object' ? filters?.academicYearId : undefined;
      const teacherId = typeof filters === 'object' ? filters?.teacherId : undefined;

      let items = await db.timetables.toArray();
      if (academicYearId) items = items.filter((t) => t.academicYearId === academicYearId);
      if (teacherId) items = items.filter((t) => t.teacherId === teacherId);
      if (classId) items = items.filter((t) => t.classId === classId);

      return items.sort(
        (a, b) =>
          (b.weekNumber ?? 0) - (a.weekNumber ?? 0) ||
          b.effectiveFrom.localeCompare(a.effectiveFrom) ||
          b.createdAt.localeCompare(a.createdAt)
      );
    }, 'Không thể tải danh sách thời khóa biểu.');
  },

  async createTimetable(input: TimetableInput): Promise<ServiceResult<Timetable>> {
    return executeService(async () => {
      if (!input.academicYearId || !input.name.trim()) {
        throw new Error('Vui lòng chọn năm học và nhập tên thời khóa biểu.');
      }
      const schoolDays =
        input.schoolDays && input.schoolDays.length > 0
          ? [...input.schoolDays].sort((a, b) => a - b)
          : [DayOfWeek.MON, DayOfWeek.TUE, DayOfWeek.WED, DayOfWeek.THU, DayOfWeek.FRI];
      const periodsPerDay = Math.min(10, Math.max(4, input.periodsPerDay ?? 7));

      const record: Timetable = {
        ...createBaseFields(),
        ...input,
        teacherId: input.teacherId || undefined,
        classId: input.classId || undefined,
        name: input.name.trim(),
        schoolDays,
        periodsPerDay,
        effectiveTo:
          input.effectiveTo ||
          (input.effectiveFrom
            ? addDaysIso(input.effectiveFrom, schoolDays.includes(DayOfWeek.SAT) ? 5 : 4)
            : undefined),
      };
      await db.timetables.add(record);
      await recordAuditLog('CREATE', 'timetables', `Tạo thời khóa biểu ${record.name}`, record.id);
      return record;
    }, 'Không thể tạo thời khóa biểu.');
  },

  async updateTimetable(id: string, patch: Partial<TimetableInput>): Promise<ServiceResult<Timetable>> {
    return executeService(async () => {
      const existing = await db.timetables.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy thời khóa biểu.');
      }
      const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
      if (!nextName) {
        throw new Error('Tên thời khóa biểu không được để trống.');
      }
      const updated: Timetable = {
        ...existing,
        ...patch,
        name: nextName,
        teacherId: patch.teacherId !== undefined ? patch.teacherId || undefined : existing.teacherId,
        classId: patch.classId !== undefined ? patch.classId || undefined : existing.classId,
        updatedAt: new Date().toISOString(),
      };
      await db.timetables.put(updated);
      await recordAuditLog('UPDATE', 'timetables', `Cập nhật thời khóa biểu ${updated.name}`, id);
      return updated;
    }, 'Không thể cập nhật thời khóa biểu.');
  },

  async assignTeacherToTimetable(
    timetableId: string,
    teacherId?: string,
    applyToLessons = true
  ): Promise<ServiceResult<Timetable>> {
    return executeService(async () => {
      const existing = await db.timetables.get(timetableId);
      if (!existing) {
        throw new Error('Không tìm thấy thời khóa biểu.');
      }
      const now = new Date().toISOString();
      const updated: Timetable = {
        ...existing,
        teacherId: teacherId || undefined,
        updatedAt: now,
      };
      await db.transaction('rw', db.timetables, db.timetableLessons, async () => {
        await db.timetables.put(updated);
        if (applyToLessons) {
          const ttLessons = await db.timetableLessons.where('timetableId').equals(timetableId).toArray();
          for (const lesson of ttLessons) {
            await db.timetableLessons.update(lesson.id, {
              teacherId: teacherId || undefined,
              updatedAt: now,
            });
          }
        }
      });
      await recordAuditLog(
        'UPDATE',
        'timetables',
        teacherId ? `Gán giáo viên cho thời khóa biểu ${updated.name}` : `Gỡ giáo viên khỏi thời khóa biểu ${updated.name}`,
        timetableId
      );
      return updated;
    }, 'Không thể gán giáo viên cho thời khóa biểu.');
  },

  async copyTimetable(params: {
    sourceTimetableId: string;
    newName: string;
    targetWeekNumber?: number;
    targetEffectiveFrom: string;
    targetEffectiveTo?: string;
    targetTeacherId?: string;
    recalculateDates?: boolean;
  }): Promise<ServiceResult<{ timetable: Timetable; lessons: TimetableLesson[]; conflicts: string[] }>> {
    return executeService(async () => {
      const source = await db.timetables.get(params.sourceTimetableId);
      if (!source) {
        throw new Error('Không tìm thấy thời khóa biểu nguồn để sao chép.');
      }
      if (!params.newName.trim() || !params.targetEffectiveFrom) {
        throw new Error('Vui lòng nhập tên thời khóa biểu mới và ngày bắt đầu.');
      }

      const [sourceLessons, allLessons, allTimetables, allClasses] = await Promise.all([
        db.timetableLessons.where('timetableId').equals(source.id).toArray(),
        db.timetableLessons.toArray(),
        db.timetables.toArray(),
        db.classes.toArray(),
      ]);

      const schoolDays: DayOfWeek[] = source.schoolDays ?? [
        DayOfWeek.MON,
        DayOfWeek.TUE,
        DayOfWeek.WED,
        DayOfWeek.THU,
        DayOfWeek.FRI,
      ];
      const effectiveTo =
        params.targetEffectiveTo ||
        addDaysIso(params.targetEffectiveFrom, schoolDays.includes(DayOfWeek.SAT) ? 5 : 4);
      const targetTeacherId =
        params.targetTeacherId !== undefined ? params.targetTeacherId || undefined : source.teacherId;

      const newTimetable: Timetable = {
        ...createBaseFields(),
        academicYearId: source.academicYearId,
        teacherId: targetTeacherId,
        classId: source.classId,
        name: params.newName.trim(),
        weekNumber: params.targetWeekNumber,
        effectiveFrom: params.targetEffectiveFrom,
        effectiveTo,
        schoolDays: [...schoolDays],
        periodsPerDay: source.periodsPerDay ?? 7,
        periodTimes: source.periodTimes ? [...source.periodTimes] : undefined,
        isActive: true,
        notes: source.notes,
      };

      const timetablesById = new Map(allTimetables.map((t) => [t.id, t]));
      timetablesById.set(newTimetable.id, newTimetable);
      const classesById = new Map(allClasses.map((c) => [c.id, c]));

      const conflicts: string[] = [];
      const copiedLessons: TimetableLesson[] = sourceLessons.map((lesson) => {
        const lessonDate =
          params.recalculateDates !== false
            ? computeLessonDateForWeekday(params.targetEffectiveFrom, lesson.dayOfWeek)
            : lesson.lessonDate;

        const nextTeacherId =
          params.targetTeacherId !== undefined
            ? params.targetTeacherId || undefined
            : lesson.teacherId ?? source.teacherId;

        const conflictReport = detectLessonConflicts({
          candidate: {
            timetableId: newTimetable.id,
            academicYearId: newTimetable.academicYearId,
            classId: lesson.classId,
            dayOfWeek: lesson.dayOfWeek,
            periodNumber: lesson.periodNumber,
            lessonDate,
            teacherId: nextTeacherId,
            roomName: lesson.roomName,
          },
          allLessons,
          timetablesById,
          classesById,
        });

        for (const c of [...conflictReport.teacherConflicts, ...conflictReport.roomConflicts]) {
          conflicts.push(c.message);
        }

        return {
          ...createBaseFields(),
          timetableId: newTimetable.id,
          classId: lesson.classId,
          academicYearId: newTimetable.academicYearId,
          dayOfWeek: lesson.dayOfWeek,
          periodNumber: lesson.periodNumber,
          lessonDate,
          session: lesson.session,
          subjectId: lesson.subjectId,
          teacherId: nextTeacherId,
          lessonTitle: lesson.lessonTitle,
          roomName: lesson.roomName,
        };
      });

      await db.transaction('rw', db.timetables, db.timetableLessons, async () => {
        await db.timetables.add(newTimetable);
        if (copiedLessons.length > 0) {
          await db.timetableLessons.bulkAdd(copiedLessons);
        }
      });

      await recordAuditLog(
        'CREATE',
        'timetables',
        `Sao chép TKB "${source.name}" sang "${newTimetable.name}" (${copiedLessons.length} tiết)`,
        newTimetable.id
      );

      return { timetable: newTimetable, lessons: copiedLessons, conflicts };
    }, 'Không thể sao chép thời khóa biểu.');
  },

  async removeTimetable(id: string, forceDeleteLessons = false): Promise<ServiceResult<void>> {
    return executeService(async () => {
      const lessonCount = await db.timetableLessons.where('timetableId').equals(id).count();
      if (lessonCount > 0 && !forceDeleteLessons) {
        throw new Error(`Thời khóa biểu đang có ${lessonCount} tiết học. Vui lòng xóa các tiết học trước.`);
      }
      await db.transaction('rw', db.timetables, db.timetableLessons, async () => {
        if (forceDeleteLessons) {
          await db.timetableLessons.where('timetableId').equals(id).delete();
        }
        await db.timetables.delete(id);
      });
      await recordAuditLog('DELETE', 'timetables', 'Xóa thời khóa biểu', id);
    }, 'Không thể xóa thời khóa biểu.');
  },

  async listLessons(
    filters?:
      | string
      | {
          timetableId?: string;
          academicYearId?: string;
          teacherId?: string;
          classId?: string;
          subjectId?: string;
        }
  ): Promise<ServiceResult<TimetableLesson[]>> {
    return executeService(async () => {
      const timetableId = typeof filters === 'string' ? filters : filters?.timetableId;
      const academicYearId = typeof filters === 'object' ? filters?.academicYearId : undefined;
      const teacherId = typeof filters === 'object' ? filters?.teacherId : undefined;
      const classId = typeof filters === 'object' ? filters?.classId : undefined;
      const subjectId = typeof filters === 'object' ? filters?.subjectId : undefined;

      let items = timetableId
        ? await db.timetableLessons.where('timetableId').equals(timetableId).toArray()
        : await db.timetableLessons.toArray();

      if (academicYearId) items = items.filter((l) => l.academicYearId === academicYearId);
      if (teacherId) items = items.filter((l) => l.teacherId === teacherId);
      if (classId) items = items.filter((l) => l.classId === classId);
      if (subjectId) items = items.filter((l) => l.subjectId === subjectId);

      return items.sort(
        (a, b) =>
          (a.lessonDate ?? '').localeCompare(b.lessonDate ?? '') ||
          a.dayOfWeek - b.dayOfWeek ||
          a.periodNumber - b.periodNumber
      );
    }, 'Không thể tải danh sách tiết học.');
  },

  async checkLessonConflicts(candidate: {
    id?: string;
    timetableId: string;
    academicYearId: string;
    classId: string;
    dayOfWeek: DayOfWeek;
    periodNumber: number;
    lessonDate?: string;
    teacherId?: string;
    roomName?: string;
  }): Promise<ServiceResult<LessonConflictReport>> {
    return executeService(async () => {
      const [allLessons, allTimetables, allClasses] = await Promise.all([
        db.timetableLessons.where('academicYearId').equals(candidate.academicYearId).toArray(),
        db.timetables.where('academicYearId').equals(candidate.academicYearId).toArray(),
        db.classes.where('academicYearId').equals(candidate.academicYearId).toArray(),
      ]);

      return detectLessonConflicts({
        candidate,
        allLessons,
        timetablesById: new Map(allTimetables.map((t) => [t.id, t])),
        classesById: new Map(allClasses.map((c) => [c.id, c])),
      });
    }, 'Không thể kiểm tra trùng tiết.');
  },

  async upsertLesson(
    input: TimetableLessonInput & { id?: string; ignoreSoftConflicts?: boolean }
  ): Promise<ServiceResult<TimetableLesson>> {
    return executeService(async () => {
      if (!input.timetableId || !input.classId || !input.subjectId) {
        throw new Error('Vui lòng chọn thời khóa biểu, lớp học và môn học.');
      }

      const [allLessons, allTimetables, allClasses] = await Promise.all([
        db.timetableLessons.where('academicYearId').equals(input.academicYearId).toArray(),
        db.timetables.where('academicYearId').equals(input.academicYearId).toArray(),
        db.classes.where('academicYearId').equals(input.academicYearId).toArray(),
      ]);

      const timetablesById = new Map(allTimetables.map((t) => [t.id, t]));
      const parentTimetable = timetablesById.get(input.timetableId);
      const resolvedDate =
        input.lessonDate ||
        (parentTimetable?.effectiveFrom
          ? computeLessonDateForWeekday(parentTimetable.effectiveFrom, input.dayOfWeek)
          : undefined);

      const conflicts = detectLessonConflicts({
        candidate: {
          id: input.id,
          timetableId: input.timetableId,
          academicYearId: input.academicYearId,
          classId: input.classId,
          dayOfWeek: input.dayOfWeek,
          periodNumber: input.periodNumber,
          lessonDate: resolvedDate,
          teacherId: input.teacherId,
          roomName: input.roomName,
        },
        allLessons,
        timetablesById,
        classesById: new Map(allClasses.map((c) => [c.id, c])),
      });

      if (conflicts.slotConflict) {
        throw new Error(conflicts.slotConflict.message);
      }

      if (
        !input.ignoreSoftConflicts &&
        (conflicts.teacherConflicts.length > 0 || conflicts.roomConflicts.length > 0)
      ) {
        const firstMsg =
          conflicts.teacherConflicts[0]?.message ?? conflicts.roomConflicts[0]?.message;
        throw new Error(firstMsg);
      }

      const cleanPayload: TimetableLessonInput = {
        timetableId: input.timetableId,
        classId: input.classId,
        academicYearId: input.academicYearId,
        dayOfWeek: input.dayOfWeek,
        periodNumber: input.periodNumber,
        lessonDate: resolvedDate,
        session: input.session,
        subjectId: input.subjectId,
        teacherId: input.teacherId || undefined,
        lessonTitle: input.lessonTitle?.trim() || undefined,
        roomName: input.roomName?.trim() || undefined,
      };

      if (input.id) {
        const existing = await db.timetableLessons.get(input.id);
        if (!existing) {
          throw new Error('Không tìm thấy tiết học cần cập nhật.');
        }
        const updated: TimetableLesson = {
          ...existing,
          ...cleanPayload,
          id: existing.id,
          updatedAt: new Date().toISOString(),
        };
        await db.timetableLessons.put(updated);
        await recordAuditLog(
          'UPDATE',
          'timetableLessons',
          `Cập nhật tiết ${updated.periodNumber} (Thứ ${updated.dayOfWeek})`,
          updated.id
        );
        return updated;
      }

      const record: TimetableLesson = {
        ...createBaseFields(),
        ...cleanPayload,
      };
      await db.timetableLessons.add(record);
      await recordAuditLog(
        'CREATE',
        'timetableLessons',
        `Xếp tiết ${record.periodNumber} (Thứ ${record.dayOfWeek})`,
        record.id
      );
      return record;
    }, 'Không thể lưu tiết học.');
  },

  async removeLesson(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      await db.timetableLessons.delete(id);
      await recordAuditLog('DELETE', 'timetableLessons', 'Xóa tiết học khỏi thời khóa biểu', id);
    }, 'Không thể xóa tiết học.');
  },
};
