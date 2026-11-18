import Dexie, { type Table } from 'dexie';
import type {
  AcademicYear,
  AppSettings,
  AssessmentEvidence,
  AssessmentPeriod,
  AssessmentResult,
  AssessmentRule,
  AuditLog,
  CommentRecord,
  Criterion,
  DailyAssessment,
  DailyBehaviorCriterion,
  LessonAssessment,
  SchoolClass,
  Student,
  StudentClassHistory,
  Subject,
  Teacher,
  TeacherAssignment,
  TeacherAssignmentHistory,
  TeacherRole,
  TeacherRoleGrant,
  Timetable,
  TimetableLesson,
} from '../types/models';

export const DB_NAME = 'HoatamStudentAssessmentDB';
export const DB_SCHEMA_VERSION = 7;

export class HoatamDatabase extends Dexie {
  academicYears!: Table<AcademicYear, string>;
  teachers!: Table<Teacher, string>;
  teacherRoles!: Table<TeacherRole, string>;
  teacherRoleGrants!: Table<TeacherRoleGrant, string>;
  teacherAssignments!: Table<TeacherAssignment, string>;
  teacherAssignmentHistory!: Table<TeacherAssignmentHistory, string>;
  classes!: Table<SchoolClass, string>;
  students!: Table<Student, string>;
  studentClassHistory!: Table<StudentClassHistory, string>;
  subjects!: Table<Subject, string>;
  criteria!: Table<Criterion, string>;
  dailyCriteria!: Table<DailyBehaviorCriterion, string>;
  timetables!: Table<Timetable, string>;
  timetableLessons!: Table<TimetableLesson, string>;
  assessmentPeriods!: Table<AssessmentPeriod, string>;
  dailyAssessments!: Table<DailyAssessment, string>;
  lessonAssessments!: Table<LessonAssessment, string>;
  assessmentEvidence!: Table<AssessmentEvidence, string>;
  assessmentResults!: Table<AssessmentResult, string>;
  assessmentRules!: Table<AssessmentRule, string>;
  comments!: Table<CommentRecord, string>;
  auditLogs!: Table<AuditLog, string>;
  appSettings!: Table<AppSettings, string>;

  constructor() {
    super(DB_NAME);

    this.version(1).stores({
      academicYears: 'id, code, status, isCurrent, startDate, updatedAt',
      teachers: 'id, code, fullName, status, updatedAt',
      teacherRoles: 'id, code, name, updatedAt',
      teacherAssignments: 'id, academicYearId, teacherId, roleId, classId, subjectId, [academicYearId+teacherId], [academicYearId+classId]',
      classes: 'id, academicYearId, code, name, gradeLevel, homeroomTeacherId, [academicYearId+gradeLevel]',
      students: 'id, studentCode, fullName, classId, academicYearId, status, [academicYearId+classId]',
      subjects: 'id, code, name, assessmentMode, displayOrder',
      criteria: 'id, code, name, category, subjectId, gradeLevel',
      timetables: 'id, academicYearId, classId, isActive, effectiveFrom, [academicYearId+classId]',
      timetableLessons: 'id, timetableId, classId, academicYearId, dayOfWeek, periodNumber, subjectId, teacherId, [timetableId+dayOfWeek+periodNumber]',
      assessmentPeriods: 'id, academicYearId, code, periodType, isLocked, [academicYearId+periodType]',
      dailyAssessments: 'id, academicYearId, classId, studentId, assessmentDate, subjectId, ratingLevel, [classId+assessmentDate], [studentId+assessmentDate]',
      lessonAssessments: 'id, academicYearId, classId, timetableLessonId, subjectId, studentId, lessonDate, [classId+lessonDate]',
      assessmentEvidence: 'id, academicYearId, studentId, subjectId, criterionId, dailyAssessmentId, lessonAssessmentId, assessmentResultId, capturedAt',
      assessmentResults: 'id, academicYearId, periodId, classId, studentId, subjectId, resultScope, ratingLevel, [periodId+classId+studentId]',
      assessmentRules: 'id, code, academicYearId, isActive',
      comments: 'id, academicYearId, studentId, classId, periodId, subjectId, category, isApproved',
      auditLogs: 'id, action, entityTable, entityId, createdAt',
      appSettings: 'id, key',
    });

    this.version(2)
      .stores({
        classes: 'id, academicYearId, code, name, gradeLevel, homeroomTeacherId, isArchived, [academicYearId+gradeLevel]',
        subjects: 'id, code, name, assessmentMode, isActive, displayOrder',
        studentClassHistory: 'id, studentId, fromClassId, toClassId, transferDate',
      })
      .upgrade(async (tx) => {
        await tx.table('classes').toCollection().modify((cls: SchoolClass) => {
          if (cls.isArchived === undefined) {
            cls.isArchived = false;
          }
        });
        await tx.table('subjects').toCollection().modify((subj: Subject) => {
          if (subj.isActive === undefined) {
            subj.isActive = true;
          }
        });
      });

    this.version(3)
      .stores({
        teacherAssignments:
          'id, academicYearId, teacherId, role, roleId, classId, subjectId, timetableId, status, [academicYearId+teacherId], [academicYearId+classId]',
        teacherRoleGrants: 'id, teacherId, roleId, roleCode, [teacherId+roleId]',
        teacherAssignmentHistory:
          'id, assignmentId, academicYearId, previousTeacherId, newTeacherId, effectiveDate',
      })
      .upgrade(async (tx) => {
        const roles = (await tx.table('teacherRoles').toArray()) as TeacherRole[];
        const roleById = new Map(roles.map((r) => [r.id, r]));
        await tx
          .table('teacherAssignments')
          .toCollection()
          .modify((assignment: TeacherAssignment) => {
            if (!assignment.role) {
              assignment.role =
                roleById.get(assignment.roleId)?.code ??
                (assignment.isHomeroom ? 'GVCN' : 'GVBM');
            }
            if (!assignment.status) {
              assignment.status = 'ACTIVE' as TeacherAssignment['status'];
            }
          });
      });

    this.version(4)
      .stores({
        timetables:
          'id, academicYearId, teacherId, classId, weekNumber, isActive, effectiveFrom, [academicYearId+teacherId], [academicYearId+classId]',
        timetableLessons:
          'id, timetableId, classId, academicYearId, dayOfWeek, periodNumber, lessonDate, subjectId, teacherId, roomName, [timetableId+dayOfWeek+periodNumber]',
        lessonAssessments:
          'id, academicYearId, classId, timetableLessonId, subjectId, teacherId, studentId, lessonDate, [classId+lessonDate], [timetableLessonId+studentId]',
      })
      .upgrade(async (tx) => {
        await tx
          .table('timetables')
          .toCollection()
          .modify((tt: Timetable) => {
            if (!tt.schoolDays || tt.schoolDays.length === 0) {
              tt.schoolDays = [2, 3, 4, 5, 6];
            }
            if (!tt.periodsPerDay) {
              tt.periodsPerDay = 7;
            }
          });
      });

    this.version(5)
      .stores({
        dailyCriteria: 'id, code, group, isHidden, displayOrder, updatedAt',
        dailyAssessments:
          'id, academicYearId, classId, studentId, teacherId, homeroomAssignmentId, assessmentDate, evaluationStatus, subjectId, ratingLevel, [classId+assessmentDate], [studentId+assessmentDate], [classId+studentId+assessmentDate]',
      })
      .upgrade(async (tx) => {
        await tx
          .table('dailyAssessments')
          .toCollection()
          .modify((row: DailyAssessment) => {
            if (!row.evaluationStatus) {
              row.evaluationStatus = 'ASSESSED' as DailyAssessment['evaluationStatus'];
            }
            if (!Array.isArray(row.criterionIds)) {
              row.criterionIds = row.criterionId ? [row.criterionId] : [];
            }
            if (!row.savedAt) {
              row.savedAt = row.updatedAt || row.createdAt || new Date().toISOString();
            }
            if (!Array.isArray(row.editHistory)) {
              row.editHistory = [];
            }
          });
      });

    this.version(6)
      .stores({
        criteria: 'id, code, name, category, subjectId, gradeLevel, isHidden',
        lessonAssessments:
          'id, academicYearId, classId, timetableLessonId, subjectId, teacherId, studentId, lessonDate, participationLevel, savedAt, [classId+lessonDate], [timetableLessonId+studentId], [subjectId+studentId]',
      })
      .upgrade(async (tx) => {
        await tx
          .table('lessonAssessments')
          .toCollection()
          .modify((row: LessonAssessment) => {
            if (!Array.isArray(row.criterionIds)) {
              row.criterionIds = row.criterionId ? [row.criterionId] : [];
            }
            if (!row.savedAt) {
              row.savedAt = row.updatedAt || row.createdAt || new Date().toISOString();
            }
            if (!Array.isArray(row.editHistory)) {
              row.editHistory = [];
            }
          });
      });

    this.version(7)
      .stores({
        assessmentRules: 'id, code, academicYearId, ruleGroup, subjectId, periodType, isActive',
      })
      .upgrade(async (tx) => {
        await tx
          .table('assessmentRules')
          .toCollection()
          .modify((rule: AssessmentRule) => {
            if (!rule.ruleGroup) {
              rule.ruleGroup = 'SUBJECT';
            }
            if (!Array.isArray(rule.levelCriteria)) {
              rule.levelCriteria = [];
            }
            if (!Array.isArray(rule.commentTemplates)) {
              rule.commentTemplates = [];
            }
          });
        await tx
          .table('appSettings')
          .toCollection()
          .modify((s: AppSettings) => {
            if (s.aiEnabled === undefined) {
              s.aiEnabled = true;
            }
            s.schemaVersion = 7;
          });
      });
  }
}

export const db = new HoatamDatabase();

export async function ensureAppSettingsInitialized(): Promise<AppSettings> {
  const existing = await db.appSettings.where('key').equals('default').first();
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const initialSettings: AppSettings = {
    id: 'settings-default',
    key: 'default',
    schoolName: 'Trường Tiểu học Hoa Tâm',
    departmentName: 'Phòng Giáo dục và Đào tạo',
    principalName: '',
    activeOperatorMode: 'ADMIN',
    aiEnabled: true,
    themeMode: 'light',
    circularStandard: 'Thông tư 27/2020/TT-BGDĐT',
    schemaVersion: DB_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
  };

  await db.appSettings.put(initialSettings);
  return initialSettings;
}

export function formatDbError(error: unknown, fallback = 'Đã xảy ra lỗi khi thao tác dữ liệu cục bộ.'): string {
  if (error instanceof Dexie.DexieError) {
    if (error.name === 'QuotaExceededError') {
      return 'Dung lượng lưu trữ trình duyệt đã đầy. Hãy sao lưu dữ liệu và dọn bớt tệp đính kèm lớn.';
    }
    if (error.name === 'ConstraintError') {
      return 'Dữ liệu bị trùng mã hoặc vi phạm ràng buộc duy nhất.';
    }
    return `${fallback} (${error.message})`;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}
