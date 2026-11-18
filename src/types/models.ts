export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export enum AcademicYearStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export interface AcademicYear extends BaseEntity {
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  semester1EndDate: string;
  semester2StartDate: string;
  status: AcademicYearStatus;
  isCurrent: boolean;
  notes?: string;
}

export enum TeacherStatus {
  ACTIVE = 'ACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  INACTIVE = 'INACTIVE',
}

export interface Teacher extends BaseEntity {
  code: string;
  fullName: string;
  username?: string;
  email?: string;
  phone?: string;
  specialization?: string;
  qualification?: string;
  status: TeacherStatus;
  notes?: string;
}

export interface TeacherRole extends BaseEntity {
  code: string;
  name: string;
  description?: string;
  permissionsSummary?: string;
  isSystemRole?: boolean;
}

export interface TeacherRoleGrant extends BaseEntity {
  teacherId: string;
  roleId: string;
  roleCode: string;
  notes?: string;
}

export enum TeacherAssignmentStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  TRANSFERRED = 'TRANSFERRED',
  PAUSED = 'PAUSED',
}

export interface TeacherAssignment extends BaseEntity {
  academicYearId: string;
  teacherId: string;
  role: string;
  roleId: string;
  classId?: string;
  subjectId?: string;
  timetableId?: string;
  isHomeroom: boolean;
  weeklyPeriods?: number;
  startDate?: string;
  endDate?: string;
  status: TeacherAssignmentStatus;
  notes?: string;
}

export interface TeacherAssignmentHistory extends BaseEntity {
  assignmentId: string;
  academicYearId: string;
  actionType: 'ASSIGNED' | 'ADJUSTED' | 'ENDED' | 'TRANSFERRED';
  previousTeacherId?: string;
  newTeacherId?: string;
  role: string;
  classId?: string;
  subjectId?: string;
  effectiveDate: string;
  reason?: string;
  performedBy?: string;
}

export interface SchoolClass extends BaseEntity {
  academicYearId: string;
  code: string;
  name: string;
  gradeLevel: 1 | 2 | 3 | 4 | 5;
  homeroomTeacherId?: string;
  roomName?: string;
  capacity?: number;
  isArchived?: boolean;
  notes?: string;
}

export enum StudentGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export enum StudentStatus {
  STUDYING = 'STUDYING',
  TRANSFERRED_CLASS = 'TRANSFERRED_CLASS',
  TRANSFERRED = 'TRANSFERRED',
  DROPPED_OUT = 'DROPPED_OUT',
  PAUSED = 'PAUSED',
}

export interface StudentClassHistory extends BaseEntity {
  studentId: string;
  fromClassId?: string;
  toClassId: string;
  fromAcademicYearId?: string;
  toAcademicYearId: string;
  transferDate: string;
  reason?: string;
}

export interface Student extends BaseEntity {
  studentCode: string;
  fullName: string;
  dateOfBirth: string;
  gender: StudentGender;
  classId: string;
  academicYearId: string;
  guardianName?: string;
  guardianPhone?: string;
  address?: string;
  status: StudentStatus;
  notes?: string;
}

export enum SubjectAssessmentMode {
  COMMENT_ONLY = 'COMMENT_ONLY',
  COMMENT_AND_SCORE = 'COMMENT_AND_SCORE',
}

export interface Subject extends BaseEntity {
  code: string;
  name: string;
  shortName?: string;
  gradeLevels: number[];
  assessmentMode: SubjectAssessmentMode;
  isCompulsory: boolean;
  isActive: boolean;
  displayOrder: number;
  description?: string;
}

export enum CriteriaCategory {
  SUBJECT_COMPETENCY = 'SUBJECT_COMPETENCY',
  GENERAL_COMPETENCY = 'GENERAL_COMPETENCY',
  QUALITY = 'QUALITY',
  DAILY_HABIT = 'DAILY_HABIT',
}

export interface Criterion extends BaseEntity {
  code: string;
  name: string;
  category: CriteriaCategory;
  subjectId?: string;
  gradeLevel?: number;
  maxLevelLabel?: string;
  description?: string;
  indicators?: string;
  isHidden?: boolean;
}

export interface PeriodTimeSlot {
  periodNumber: number;
  startTime: string;
  endTime: string;
  session: 'MORNING' | 'AFTERNOON';
}

export interface Timetable extends BaseEntity {
  academicYearId: string;
  teacherId?: string;
  classId?: string;
  name: string;
  weekNumber?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  schoolDays?: DayOfWeek[];
  periodsPerDay?: number;
  periodTimes?: PeriodTimeSlot[];
  isActive: boolean;
  notes?: string;
}

export enum DayOfWeek {
  MON = 2,
  TUE = 3,
  WED = 4,
  THU = 5,
  FRI = 6,
  SAT = 7,
}

export type LessonWorkflowStatus =
  | 'UPCOMING'
  | 'NOT_ASSESSED'
  | 'IN_PROGRESS'
  | 'SAVED'
  | 'COMPLETED';

export type LessonParticipationLevel = 'ACTIVE' | 'MODERATE' | 'LOW';

export interface TimetableLesson extends BaseEntity {
  timetableId: string;
  classId: string;
  academicYearId: string;
  dayOfWeek: DayOfWeek;
  periodNumber: number;
  lessonDate?: string; // YYYY-MM-DD
  session: 'MORNING' | 'AFTERNOON';
  subjectId: string;
  teacherId?: string;
  lessonTitle?: string;
  roomName?: string;
  assessmentWorkflowStatus?: 'NOT_ASSESSED' | 'IN_PROGRESS' | 'SAVED' | 'COMPLETED';
  lastAssessedAt?: string;
}

export enum AssessmentPeriodType {
  MID_TERM_1 = 'MID_TERM_1',
  END_TERM_1 = 'END_TERM_1',
  MID_TERM_2 = 'MID_TERM_2',
  END_TERM_2 = 'END_TERM_2',
  END_YEAR = 'END_YEAR',
}

export interface AssessmentPeriod extends BaseEntity {
  academicYearId: string;
  code: string;
  name: string;
  periodType: AssessmentPeriodType;
  startDate: string;
  endDate: string;
  isLocked: boolean;
}

export enum AssessmentRatingLevel {
  HTT = 'HTT', // Hoàn thành tốt
  HT = 'HT',   // Hoàn thành
  CHT = 'CHT', // Chưa hoàn thành
  T = 'T',     // Tốt (Phẩm chất/Năng lực)
  D = 'D',     // Đạt
  CCG = 'CCG', // Cần cố gắng
}

export enum DailyEvaluationStatus {
  NOT_ASSESSED = 'NOT_ASSESSED',
  ASSESSED = 'ASSESSED',
  NO_OPPORTUNITY = 'NO_OPPORTUNITY',
  NO_NOTABLE_BEHAVIOR = 'NO_NOTABLE_BEHAVIOR',
}

export type DailyCriterionGroup = 'POSITIVE' | 'NEEDS_SUPPORT';

export interface DailyBehaviorCriterion extends BaseEntity {
  code: string;
  name: string;
  group: DailyCriterionGroup;
  description?: string;
  isHidden: boolean;
  isSystemDefault?: boolean;
  displayOrder: number;
  teacherId?: string;
}

export interface DailyAssessmentEditEntry {
  editedAt: string;
  editorTeacherId?: string;
  editorName?: string;
  evaluationStatus: DailyEvaluationStatus;
  criterionIds: string[];
  comment: string;
  summary: string;
}

export interface DailyAssessment extends BaseEntity {
  academicYearId: string;
  classId: string;
  studentId: string;
  teacherId?: string;
  homeroomAssignmentId?: string;
  subjectId?: string;
  assessmentDate: string; // YYYY-MM-DD
  evaluationStatus: DailyEvaluationStatus;
  criterionIds: string[];
  criterionLabelsSnapshot?: string[];
  criterionId?: string;
  ratingLevel?: AssessmentRatingLevel;
  attendanceStatus?: 'PRESENT' | 'EXCUSED' | 'UNEXCUSED';
  comment: string;
  savedAt: string;
  editHistory: DailyAssessmentEditEntry[];
}

export interface LessonAssessmentEditEntry {
  editedAt: string;
  editorTeacherId?: string;
  editorName?: string;
  ratingLevel: AssessmentRatingLevel;
  participationLevel?: LessonParticipationLevel;
  criterionIds?: string[];
  knowledgeAndSkills?: string;
  learningProduct?: string;
  difficulties?: string;
  comment: string;
  summary: string;
}

export interface LessonAssessment extends BaseEntity {
  academicYearId: string;
  classId: string;
  timetableLessonId?: string;
  subjectId: string;
  teacherId?: string;
  studentId: string;
  lessonDate: string;
  lessonTopic: string;
  criterionId?: string;
  criterionIds?: string[];
  criterionLabelsSnapshot?: string[];
  ratingLevel: AssessmentRatingLevel;
  participationLevel?: LessonParticipationLevel;
  knowledgeAndSkills?: string;
  learningProduct?: string;
  difficulties?: string;
  score?: number;
  comment: string;
  savedAt?: string;
  editHistory?: LessonAssessmentEditEntry[];
}

export enum EvidenceType {
  NOTE = 'NOTE',
  IMAGE_REF = 'IMAGE_REF',
  WORKSHEET = 'WORKSHEET',
  AUDIO_REF = 'AUDIO_REF',
  PROJECT = 'PROJECT',
}

export interface AssessmentEvidence extends BaseEntity {
  academicYearId: string;
  studentId: string;
  subjectId?: string;
  criterionId?: string;
  dailyAssessmentId?: string;
  lessonAssessmentId?: string;
  assessmentResultId?: string;
  evidenceType: EvidenceType;
  title: string;
  description?: string;
  fileName?: string;
  fileDataUrl?: string;
  capturedAt: string;
}

export interface AssessmentResult extends BaseEntity {
  academicYearId: string;
  periodId: string;
  classId: string;
  studentId: string;
  subjectId?: string;
  criterionId?: string;
  resultScope: 'SUBJECT' | 'QUALITY' | 'COMPETENCY' | 'OVERALL';
  ratingLevel: AssessmentRatingLevel;
  numericScore?: number;
  teacherId?: string;
  summaryComment?: string;
}

export type AssessmentRuleGroup = 'SUBJECT' | 'QUALITY_COMPETENCY' | 'OVERALL';

export type AssessmentRuleEvidenceType =
  | 'LESSON_OBSERVATION'
  | 'LEARNING_PRODUCT'
  | 'PERIODIC_TEST'
  | 'DAILY_HABIT'
  | 'PORTFOLIO';

export interface AssessmentRuleLevelCriterion {
  ratingLevel: AssessmentRatingLevel;
  conditionSummary: string;
  minScore?: number;
  maxScore?: number;
  requiresRegularProgress?: boolean;
  requiredEvidenceTypes: AssessmentRuleEvidenceType[];
}

export interface AssessmentRuleCommentTemplate {
  id: string;
  ratingLevel: AssessmentRatingLevel;
  title: string;
  templateText: string;
}

export interface AssessmentRule extends BaseEntity {
  code: string;
  name: string;
  academicYearId?: string;
  ruleGroup?: AssessmentRuleGroup;
  gradeLevels?: number[];
  subjectId?: string;
  periodType?: AssessmentPeriodType;
  circularReference: string; // Ví dụ: Thông tư 27/2020/TT-BGDĐT hoặc văn bản hiện hành
  versionLabel?: string;
  effectiveFrom?: string;
  minScoreForHTT?: number;
  minScoreForHT?: number;
  evidenceRequirements?: string;
  requiredEvidenceTypes?: AssessmentRuleEvidenceType[];
  levelCriteria?: AssessmentRuleLevelCriterion[];
  commentTemplates?: AssessmentRuleCommentTemplate[];
  description: string;
  isActive: boolean;
}

export interface CommentRecord extends BaseEntity {
  academicYearId: string;
  studentId: string;
  classId: string;
  periodId?: string;
  subjectId?: string;
  criterionId?: string;
  authorTeacherId?: string;
  category: 'DAILY' | 'LESSON' | 'PERIODIC' | 'AI_DRAFT';
  content: string;
  isApproved: boolean;
}

export interface AuditLog extends BaseEntity {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'EXPORT' | 'BACKUP' | 'RESTORE' | 'SCHEMA_UPGRADE';
  entityTable: string;
  entityId?: string;
  summary: string;
  actorName?: string;
  metadata?: string;
}

export interface AppSettings extends BaseEntity {
  key: 'default';
  schoolName: string;
  departmentName: string;
  principalName: string;
  activeAcademicYearId?: string;
  activeClassId?: string;
  activeOperatorMode?: 'ADMIN' | 'TEACHER';
  activeOperatorTeacherId?: string;
  aiEnabled?: boolean;
  themeMode: 'light' | 'dark' | 'system';
  circularStandard: string;
  schemaVersion: number;
  lastBackupAt?: string;
}

export interface BackupPackage {
  appName: 'HOATAM_STUDENT_ASSESSMENT';
  formatVersion: number;
  dbSchemaVersion: number;
  exportedAt: string;
  schoolName?: string;
  exportedBy?: string;
  checksum?: string;
  tableCounts: Record<string, number>;
  tables: {
    academicYears: AcademicYear[];
    teachers: Teacher[];
    teacherRoles: TeacherRole[];
    teacherRoleGrants?: TeacherRoleGrant[];
    teacherAssignments: TeacherAssignment[];
    teacherAssignmentHistory?: TeacherAssignmentHistory[];
    classes: SchoolClass[];
    students: Student[];
    studentClassHistory?: StudentClassHistory[];
    subjects: Subject[];
    criteria: Criterion[];
    dailyCriteria?: DailyBehaviorCriterion[];
    timetables: Timetable[];
    timetableLessons: TimetableLesson[];
    assessmentPeriods: AssessmentPeriod[];
    dailyAssessments: DailyAssessment[];
    lessonAssessments: LessonAssessment[];
    assessmentEvidence: AssessmentEvidence[];
    assessmentResults: AssessmentResult[];
    assessmentRules: AssessmentRule[];
    comments: CommentRecord[];
    auditLogs: AuditLog[];
    appSettings: AppSettings[];
  };
}

export type ServiceResult<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string };
