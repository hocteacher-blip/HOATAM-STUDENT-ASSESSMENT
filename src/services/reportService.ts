import { db } from '../db/database';
import {
  AssessmentPeriodType,
  AssessmentRatingLevel,
  DailyEvaluationStatus,
  TeacherAssignmentStatus,
  type AcademicYear,
  type AssessmentPeriod,
  type AssessmentResult,
  type AuditLog,
  type CommentRecord,
  type Criterion,
  type DailyAssessment,
  type DailyBehaviorCriterion,
  type LessonAssessment,
  type LessonWorkflowStatus,
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
import {
  DAILY_EVALUATION_STATUS_LABELS,
  DAY_OF_WEEK_LABELS,
  LESSON_PARTICIPATION_LABELS,
  LESSON_WORKFLOW_STATUS_LABELS,
  PERIOD_TYPE_LABELS,
  RATING_LEVEL_LABELS,
} from '../utils/labels';
import { executeService } from './baseRepository';
import { getDateRangeForPeriod } from './dailyAssessmentService';
import { computeTimetableLessonStatus } from './lessonAssessmentService';
import { ensureDefaultRolesInitialized, type OperatorPermissions } from './teacherService';

export type ReportTimeframeMode =
  | 'DAY'
  | 'WEEK'
  | 'MONTH'
  | 'MID_TERM_1'
  | 'END_TERM_1'
  | 'MID_TERM_2'
  | 'END_TERM_2'
  | 'FULL_YEAR'
  | 'CONFIGURED_PERIOD';

export const REPORT_TIMEFRAME_LABELS: Record<ReportTimeframeMode, string> = {
  DAY: 'Theo ngày',
  WEEK: 'Theo tuần',
  MONTH: 'Theo tháng',
  MID_TERM_1: 'Giữa kỳ I',
  END_TERM_1: 'Cuối kỳ I',
  MID_TERM_2: 'Giữa kỳ II',
  END_TERM_2: 'Cuối kỳ II',
  FULL_YEAR: 'Cả năm',
  CONFIGURED_PERIOD: 'Đợt cấu hình riêng',
};

export interface ReportFilter {
  academicYearId?: string;
  gradeLevel?: number;
  classId?: string;
  subjectId?: string;
  teacherId?: string;
  studentId?: string;
  timeframeMode: ReportTimeframeMode;
  referenceDate: string; // YYYY-MM-DD
  referenceMonth?: string; // YYYY-MM
  periodId?: string;
  permissions?: OperatorPermissions;
}

export interface ReportDataset {
  academicYears: AcademicYear[];
  classes: SchoolClass[];
  students: Student[];
  teachers: Teacher[];
  teacherRoles: TeacherRole[];
  teacherRoleGrants: TeacherRoleGrant[];
  teacherAssignments: TeacherAssignment[];
  teacherAssignmentHistory: TeacherAssignmentHistory[];
  subjects: Subject[];
  criteria: Criterion[];
  dailyCriteria: DailyBehaviorCriterion[];
  timetables: Timetable[];
  timetableLessons: TimetableLesson[];
  assessmentPeriods: AssessmentPeriod[];
  dailyAssessments: DailyAssessment[];
  lessonAssessments: LessonAssessment[];
  assessmentResults: AssessmentResult[];
  comments: CommentRecord[];
  auditLogs: AuditLog[];
}

export interface ResolvedTimeRange {
  mode: ReportTimeframeMode;
  fromDate?: string;
  toDate?: string;
  matchingPeriodIds: Set<string>;
  matchingPeriods: AssessmentPeriod[];
  isConfiguredPeriod: boolean;
  label: string;
}

export type ReportSourceType =
  | 'DAILY'
  | 'LESSON'
  | 'OFFICIAL_RESULT'
  | 'TIMETABLE_LESSON'
  | 'COMMENT'
  | 'ASSIGNMENT_HISTORY';

export interface ReportSourceRecord {
  id: string;
  sourceType: ReportSourceType;
  categoryLabel: 'Đánh giá thường xuyên' | 'Kết quả định kỳ chính thức' | 'Lịch dạy' | 'Nhận xét' | 'Phân công';
  date: string;
  studentId?: string;
  studentName?: string;
  classId?: string;
  className?: string;
  subjectId?: string;
  subjectName?: string;
  teacherId?: string;
  teacherName?: string;
  periodName?: string;
  title: string;
  statusOrRating: string;
  detail: string;
  comment?: string;
}

export interface SupportNeedSummary {
  topic: string;
  source: 'DAILY_CRITERION' | 'LESSON_DIFFICULTY' | 'OFFICIAL_NEEDS_SUPPORT';
  count: number;
  studentIds: string[];
}

export interface StudentProgressionPoint {
  date: string;
  label: string;
  dailyPositiveCount: number;
  dailySupportCount: number;
  lessonLevelValue?: number; // 3 = HTT, 2 = HT, 1 = CHT (chỉ từ đánh giá thường xuyên theo tiết)
  lessonScore?: number;
  officialLevelValue?: number; // 3 = HTT/T, 2 = HT/D, 1 = CHT/CCG (chỉ từ kết quả định kỳ chính thức)
  officialScore?: number;
  sourceNote: string;
}

export interface StudentReportModel {
  hasData: boolean;
  student?: Student;
  schoolClass?: SchoolClass;
  academicYear?: AcademicYear;
  timeRange: ResolvedTimeRange;
  metrics: {
    dailyTotalRecords: number;
    dailyAssessedCount: number;
    dailyUnassessedOrNoOppCount: number;
    dailyPositiveCount: number;
    dailySupportCount: number;
    lessonCount: number;
    lessonHttCount: number;
    lessonHtCount: number;
    lessonChtCount: number;
    officialSubjectCount: number;
    officialQualityCompetencyCount: number;
    commentsCount: number;
  };
  dailyHistory: Array<{
    record: DailyAssessment;
    teacherName: string;
    statusLabel: string;
    positiveLabels: string[];
    supportLabels: string[];
  }>;
  lessonHistory: Array<{
    record: LessonAssessment;
    subjectName: string;
    teacherName: string;
    criterionLabels: string[];
  }>;
  officialSubjectResults: Array<{
    record: AssessmentResult;
    periodName: string;
    subjectName: string;
    teacherName: string;
    ratingLabel: string;
  }>;
  officialQualityCompetencyResults: Array<{
    record: AssessmentResult;
    periodName: string;
    criterionName: string;
    teacherName: string;
    ratingLabel: string;
  }>;
  teacherComments: Array<{
    id: string;
    date: string;
    sourceLabel: 'Hằng ngày (GVCN)' | 'Theo tiết (GVBM)' | 'Định kỳ chính thức' | 'Sổ nhận xét';
    subjectName?: string;
    authorName: string;
    content: string;
  }>;
  progressionChartData: StudentProgressionPoint[];
  supportNeeds: SupportNeedSummary[];
  sourceRecords: ReportSourceRecord[];
}

export interface ClassSubjectSummaryRow {
  subjectId: string;
  subjectName: string;
  totalStudents: number;
  // Đánh giá thường xuyên theo tiết
  lessonRecordsCount: number;
  regularAssessedStudents: number;
  regularUnassessedStudents: number;
  lessonHtt: number;
  lessonHt: number;
  lessonCht: number;
  // Kết quả định kỳ chính thức
  officialAssessedStudents: number;
  officialUnassessedStudents: number;
  officialHtt: number;
  officialHt: number;
  officialCht: number;
}

export interface ClassStudentRow {
  student: Student;
  dailyAssessedCount: number;
  dailyUnassessedCount: number;
  lessonAssessedCount: number;
  regularStatus: 'ASSESSED' | 'UNASSESSED';
  officialResultsCount: number;
  officialStatus: 'ASSESSED' | 'UNASSESSED';
  latestOfficialRatings: string[];
  supportCount: number;
  supportTopics: string[];
}

export interface ClassReportModel {
  hasData: boolean;
  targetClasses: SchoolClass[];
  timeRange: ResolvedTimeRange;
  metrics: {
    totalStudents: number;
    regularAssessedStudents: number;
    regularUnassessedStudents: number;
    regularCompletionRate: number | null;
    officialAssessedStudents: number;
    officialUnassessedStudents: number;
    officialCompletionRate: number | null;
    totalDailyObservations: number;
    totalLessonObservations: number;
    totalOfficialResults: number;
    supportCasesCount: number;
  };
  studentRoster: ClassStudentRow[];
  subjectSummary: ClassSubjectSummaryRow[];
  evaluationStatusChart: Array<{
    category: string;
    daDanhGia: number;
    chuaDanhGia: number;
  }>;
  subjectChartData: Array<{
    subjectName: string;
    htt: number;
    ht: number;
    cht: number;
    chuaDanhGia: number;
  }>;
  supportNeeds: SupportNeedSummary[];
  sourceRecords: ReportSourceRecord[];
}

export interface TeacherLessonRow {
  lesson: TimetableLesson;
  className: string;
  subjectName: string;
  status: LessonWorkflowStatus;
  assessedStudentsCount: number;
  classStudentCount: number;
}

export interface TeacherReportModel {
  hasData: boolean;
  teacher?: Teacher;
  roles: TeacherRole[];
  assignments: Array<{
    assignment: TeacherAssignment;
    className: string;
    subjectName: string;
    academicYearName: string;
  }>;
  homeroomClasses: SchoolClass[];
  taughtPairs: Array<{
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
  }>;
  timeRange: ResolvedTimeRange;
  metrics: {
    totalScheduledLessons: number;
    assessedLessons: number;
    inProgressLessons: number;
    unassessedLessons: number;
    lessonCompletionRate: number | null;
    dailySavedCount: number;
    lessonSavedCount: number;
    officialSavedCount: number;
  };
  lessonsList: TeacherLessonRow[];
  completionChartData: Array<{
    name: string;
    value: number;
    key: 'ASSESSED' | 'IN_PROGRESS' | 'UNASSESSED';
  }>;
  workHistory: Array<{
    id: string;
    timestamp: string;
    category: string;
    summary: string;
  }>;
  sourceRecords: ReportSourceRecord[];
}

export interface SubjectReportModel {
  hasData: boolean;
  subject?: Subject;
  timeRange: ResolvedTimeRange;
  metrics: {
    targetStudentsCount: number;
    // Thường xuyên (theo tiết)
    regularRecordsCount: number;
    regularAssessedStudents: number;
    regularUnassessedStudents: number;
    regularHtt: number;
    regularHt: number;
    regularCht: number;
    regularAvgScore: number | null;
    // Định kỳ chính thức
    officialRecordsCount: number;
    officialAssessedStudents: number;
    officialUnassessedStudents: number;
    officialHtt: number;
    officialHt: number;
    officialCht: number;
    officialAvgScore: number | null;
  };
  byClassBreakdown: Array<{
    classId: string;
    className: string;
    gradeLevel: number;
    teacherNames: string[];
    totalStudents: number;
    regularAssessedStudents: number;
    regularUnassessedStudents: number;
    regularHtt: number;
    regularHt: number;
    regularCht: number;
    officialAssessedStudents: number;
    officialUnassessedStudents: number;
    officialHtt: number;
    officialHt: number;
    officialCht: number;
  }>;
  regularVsOfficialChart: Array<{
    className: string;
    regularAssessed: number;
    officialAssessed: number;
    officialUnassessed: number;
  }>;
  subjectDistributionChart: Array<{
    name: string;
    count: number;
  }>;
  supportNeeds: SupportNeedSummary[];
  sourceRecords: ReportSourceRecord[];
}

export interface TimeframeTrendPoint {
  bucketKey: string;
  bucketLabel: string;
  dailyAssessed: number;
  lessonAssessed: number;
  officialAssessed: number;
  positiveMarks: number;
  supportMarks: number;
}

export interface TimeframeReportModel {
  hasData: boolean;
  timeRange: ResolvedTimeRange;
  metrics: {
    totalStudentsInScope: number;
    regularAssessedStudents: number;
    regularUnassessedStudents: number;
    officialAssessedStudents: number;
    officialUnassessedStudents: number;
    completionRate: number | null;
    dailyAssessedRecords: number;
    lessonAssessedRecords: number;
    officialRecords: number;
    scheduledLessonsTotal: number;
    scheduledLessonsAssessed: number;
    scheduledLessonsUnassessed: number;
  };
  progressionTrendChart: TimeframeTrendPoint[];
  classStatusChart: Array<{
    className: string;
    regularAssessed: number;
    regularUnassessed: number;
    officialAssessed: number;
    officialUnassessed: number;
  }>;
  subjectResultsChart: Array<{
    subjectName: string;
    htt: number;
    ht: number;
    cht: number;
    chuaDanhGia: number;
  }>;
  completionChart: Array<{
    name: string;
    assessed: number;
    unassessed: number;
  }>;
  supportNeeds: SupportNeedSummary[];
  sourceRecords: ReportSourceRecord[];
}

function getAllDaysInYearFallback(year?: AcademicYear): { fromDate?: string; toDate?: string } {
  if (!year) return {};
  return { fromDate: year.startDate, toDate: year.endDate };
}

function computeConfiguredPeriodFallbackDates(
  periodType: AssessmentPeriodType,
  year?: AcademicYear
): { fromDate?: string; toDate?: string } {
  if (!year) return {};
  const start = year.startDate;
  const sem1End = year.semester1EndDate || year.endDate;
  const sem2Start = year.semester2StartDate || year.semester1EndDate || year.startDate;
  const end = year.endDate;

  const midpoint = (a: string, b: string): string => {
    const da = new Date(`${a}T12:00:00Z`).getTime();
    const dbTime = new Date(`${b}T12:00:00Z`).getTime();
    if (Number.isNaN(da) || Number.isNaN(dbTime)) return b;
    return new Date(Math.round((da + dbTime) / 2)).toISOString().slice(0, 10);
  };

  if (periodType === AssessmentPeriodType.MID_TERM_1) {
    return { fromDate: start, toDate: midpoint(start, sem1End) };
  }
  if (periodType === AssessmentPeriodType.END_TERM_1) {
    return { fromDate: start, toDate: sem1End };
  }
  if (periodType === AssessmentPeriodType.MID_TERM_2) {
    return { fromDate: sem2Start, toDate: midpoint(sem2Start, end) };
  }
  if (periodType === AssessmentPeriodType.END_TERM_2) {
    return { fromDate: sem2Start, toDate: end };
  }
  return { fromDate: start, toDate: end };
}

export function resolveReportTimeRange(params: {
  filter: ReportFilter;
  academicYears: AcademicYear[];
  assessmentPeriods: AssessmentPeriod[];
}): ResolvedTimeRange {
  const { filter, academicYears, assessmentPeriods } = params;
  const year = filter.academicYearId
    ? academicYears.find((y) => y.id === filter.academicYearId)
    : undefined;
  const scopedPeriods = filter.academicYearId
    ? assessmentPeriods.filter((p) => p.academicYearId === filter.academicYearId)
    : assessmentPeriods;

  if (filter.timeframeMode === 'DAY') {
    const range = getDateRangeForPeriod({ mode: 'DAY', anchorDate: filter.referenceDate });
    const matchingPeriods = scopedPeriods.filter(
      (p) => p.startDate <= range.toDate && p.endDate >= range.fromDate
    );
    return {
      mode: 'DAY',
      fromDate: range.fromDate,
      toDate: range.toDate,
      matchingPeriodIds: new Set(matchingPeriods.map((p) => p.id)),
      matchingPeriods,
      isConfiguredPeriod: false,
      label: `Ngày ${range.fromDate}`,
    };
  }

  if (filter.timeframeMode === 'WEEK') {
    const range = getDateRangeForPeriod({ mode: 'WEEK', anchorDate: filter.referenceDate });
    const matchingPeriods = scopedPeriods.filter(
      (p) => p.startDate <= range.toDate && p.endDate >= range.fromDate
    );
    return {
      mode: 'WEEK',
      fromDate: range.fromDate,
      toDate: range.toDate,
      matchingPeriodIds: new Set(matchingPeriods.map((p) => p.id)),
      matchingPeriods,
      isConfiguredPeriod: false,
      label: range.label,
    };
  }

  if (filter.timeframeMode === 'MONTH') {
    const ym = filter.referenceMonth || filter.referenceDate.slice(0, 7);
    const range = getDateRangeForPeriod({
      mode: 'MONTH',
      anchorDate: filter.referenceDate,
      anchorMonth: ym,
    });
    const matchingPeriods = scopedPeriods.filter(
      (p) => p.startDate <= range.toDate && p.endDate >= range.fromDate
    );
    return {
      mode: 'MONTH',
      fromDate: range.fromDate,
      toDate: range.toDate,
      matchingPeriodIds: new Set(matchingPeriods.map((p) => p.id)),
      matchingPeriods,
      isConfiguredPeriod: false,
      label: range.label,
    };
  }

  if (filter.timeframeMode === 'CONFIGURED_PERIOD' && filter.periodId) {
    const period = assessmentPeriods.find((p) => p.id === filter.periodId);
    if (period) {
      return {
        mode: 'CONFIGURED_PERIOD',
        fromDate: period.startDate,
        toDate: period.endDate,
        matchingPeriodIds: new Set([period.id]),
        matchingPeriods: [period],
        isConfiguredPeriod: true,
        label: `${period.name} (${PERIOD_TYPE_LABELS[period.periodType]})`,
      };
    }
  }

  if (filter.timeframeMode === 'FULL_YEAR') {
    const bounds = getAllDaysInYearFallback(year);
    return {
      mode: 'FULL_YEAR',
      fromDate: bounds.fromDate,
      toDate: bounds.toDate,
      matchingPeriodIds: new Set(scopedPeriods.map((p) => p.id)),
      matchingPeriods: scopedPeriods,
      isConfiguredPeriod: scopedPeriods.length > 0,
      label: year ? `Cả năm học ${year.name}` : 'Tất cả năm học',
    };
  }

  // Named periodic milestones: MID_TERM_1, END_TERM_1, MID_TERM_2, END_TERM_2
  const typeMap: Record<string, AssessmentPeriodType> = {
    MID_TERM_1: AssessmentPeriodType.MID_TERM_1,
    END_TERM_1: AssessmentPeriodType.END_TERM_1,
    MID_TERM_2: AssessmentPeriodType.MID_TERM_2,
    END_TERM_2: AssessmentPeriodType.END_TERM_2,
  };
  const targetType = typeMap[filter.timeframeMode] ?? AssessmentPeriodType.END_YEAR;
  const matched = scopedPeriods.filter((p) => {
    if (p.periodType === targetType) return true;
    // Also support END_YEAR periods configured for semester II end if no explicit END_TERM_2 exists
    if (
      targetType === AssessmentPeriodType.END_TERM_2 &&
      p.periodType === AssessmentPeriodType.END_YEAR &&
      !scopedPeriods.some((x) => x.periodType === AssessmentPeriodType.END_TERM_2)
    ) {
      return true;
    }
    return false;
  });

  if (matched.length > 0) {
    const minStart = matched.reduce((min, p) => (p.startDate < min ? p.startDate : min), matched[0].startDate);
    const maxEnd = matched.reduce((max, p) => (p.endDate > max ? p.endDate : max), matched[0].endDate);
    return {
      mode: filter.timeframeMode,
      fromDate: minStart,
      toDate: maxEnd,
      matchingPeriodIds: new Set(matched.map((p) => p.id)),
      matchingPeriods: matched,
      isConfiguredPeriod: true,
      label:
        matched.length === 1
          ? `${matched[0].name} (${minStart} → ${maxEnd})`
          : `${PERIOD_TYPE_LABELS[targetType]} (${matched.length} đợt cấu hình)`,
    };
  }

  const fallback = computeConfiguredPeriodFallbackDates(targetType, year);
  return {
    mode: filter.timeframeMode,
    fromDate: fallback.fromDate,
    toDate: fallback.toDate,
    matchingPeriodIds: new Set(),
    matchingPeriods: [],
    isConfiguredPeriod: false,
    label: `${PERIOD_TYPE_LABELS[targetType]} (chưa cấu hình kỳ định kỳ)`,
  };
}

function isWithinDates(dateStr: string | undefined, fromDate?: string, toDate?: string): boolean {
  if (!dateStr) return !fromDate && !toDate;
  if (fromDate && dateStr < fromDate) return false;
  if (toDate && dateStr > toDate) return false;
  return true;
}

function isDailyRecordAssessed(rec: DailyAssessment): boolean {
  const status = rec.evaluationStatus ?? DailyEvaluationStatus.ASSESSED;
  return (
    status === DailyEvaluationStatus.ASSESSED ||
    status === DailyEvaluationStatus.NO_NOTABLE_BEHAVIOR
  );
}

function isDailyRecordUnassessed(rec: DailyAssessment): boolean {
  const status = rec.evaluationStatus ?? DailyEvaluationStatus.ASSESSED;
  return (
    status === DailyEvaluationStatus.NOT_ASSESSED ||
    status === DailyEvaluationStatus.NO_OPPORTUNITY
  );
}

function filterClassesByScope(
  classes: SchoolClass[],
  filter: ReportFilter
): SchoolClass[] {
  return classes
    .filter((c) => {
      if (filter.academicYearId && c.academicYearId !== filter.academicYearId) return false;
      if (filter.gradeLevel && c.gradeLevel !== filter.gradeLevel) return false;
      if (filter.classId && c.id !== filter.classId) return false;
      if (filter.permissions?.isScopedTeacher) {
        return filter.permissions.allAllowedClassIds.has(c.id);
      }
      return true;
    })
    .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi'));
}

function ratingToNumericScale(rating: AssessmentRatingLevel): number {
  if (rating === AssessmentRatingLevel.HTT || rating === AssessmentRatingLevel.T) return 3;
  if (rating === AssessmentRatingLevel.HT || rating === AssessmentRatingLevel.D) return 2;
  return 1;
}

function getDailyCriteriaIds(rec: DailyAssessment): string[] {
  if (Array.isArray(rec.criterionIds) && rec.criterionIds.length > 0) return rec.criterionIds;
  if (rec.criterionId) return [rec.criterionId];
  return [];
}

function aggregateSupportNeeds(params: {
  dailyRecords: DailyAssessment[];
  lessonRecords: LessonAssessment[];
  officialResults: AssessmentResult[];
  dailyCriteriaById: Map<string, DailyBehaviorCriterion>;
  subjectsById: Map<string, Subject>;
}): SupportNeedSummary[] {
  const { dailyRecords, lessonRecords, officialResults, dailyCriteriaById, subjectsById } = params;
  const map = new Map<
    string,
    { topic: string; source: SupportNeedSummary['source']; count: number; studentIds: Set<string> }
  >();

  const bump = (topic: string, source: SupportNeedSummary['source'], studentId: string) => {
    const clean = topic.trim();
    if (!clean) return;
    const key = `${source}|${clean.toLowerCase()}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { topic: clean, source, count: 0, studentIds: new Set() };
      map.set(key, entry);
    }
    entry.count += 1;
    entry.studentIds.add(studentId);
  };

  for (const d of dailyRecords) {
    if (isDailyRecordUnassessed(d)) continue;
    for (const cid of getDailyCriteriaIds(d)) {
      const crit = dailyCriteriaById.get(cid);
      if (crit?.group === 'NEEDS_SUPPORT') {
        bump(crit.name, 'DAILY_CRITERION', d.studentId);
      }
    }
  }

  for (const l of lessonRecords) {
    if (l.difficulties?.trim()) {
      const subj = subjectsById.get(l.subjectId)?.name;
      const label = subj ? `${subj}: ${l.difficulties.trim()}` : l.difficulties.trim();
      bump(label, 'LESSON_DIFFICULTY', l.studentId);
    }
    if (l.ratingLevel === AssessmentRatingLevel.CHT && !l.difficulties?.trim()) {
      const subj = subjectsById.get(l.subjectId)?.name ?? 'Môn học';
      bump(`${subj}: Chưa hoàn thành nội dung tiết (${l.lessonTopic})`, 'LESSON_DIFFICULTY', l.studentId);
    }
  }

  for (const r of officialResults) {
    if (
      r.ratingLevel === AssessmentRatingLevel.CHT ||
      r.ratingLevel === AssessmentRatingLevel.CCG
    ) {
      const subjName = r.subjectId ? subjectsById.get(r.subjectId)?.name : undefined;
      const prefix = subjName ? `Định kỳ ${subjName}` : 'Phẩm chất / Năng lực';
      bump(`${prefix}: ${RATING_LEVEL_LABELS[r.ratingLevel]}`, 'OFFICIAL_NEEDS_SUPPORT', r.studentId);
    }
  }

  return Array.from(map.values())
    .map((e) => ({
      topic: e.topic,
      source: e.source,
      count: e.count,
      studentIds: Array.from(e.studentIds),
    }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic, 'vi'));
}

function buildSourceRecordsFromEntities(params: {
  dailyRecords: DailyAssessment[];
  lessonRecords: LessonAssessment[];
  officialResults: AssessmentResult[];
  timetableLessons?: TimetableLesson[];
  comments?: CommentRecord[];
  dataset: ReportDataset;
}): ReportSourceRecord[] {
  const {
    dailyRecords,
    lessonRecords,
    officialResults,
    timetableLessons = [],
    comments = [],
    dataset,
  } = params;

  const stuMap = new Map(dataset.students.map((s) => [s.id, s]));
  const clsMap = new Map(dataset.classes.map((c) => [c.id, c]));
  const subjMap = new Map(dataset.subjects.map((s) => [s.id, s]));
  const teacherMap = new Map(dataset.teachers.map((t) => [t.id, t]));
  const periodMap = new Map(dataset.assessmentPeriods.map((p) => [p.id, p]));
  const dailyCritMap = new Map(dataset.dailyCriteria.map((c) => [c.id, c]));
  const critMap = new Map(dataset.criteria.map((c) => [c.id, c]));
  const lessonAssessmentByTtId = new Map<string, LessonAssessment[]>();
  for (const la of dataset.lessonAssessments) {
    if (!la.timetableLessonId) continue;
    const arr = lessonAssessmentByTtId.get(la.timetableLessonId) ?? [];
    arr.push(la);
    lessonAssessmentByTtId.set(la.timetableLessonId, arr);
  }

  const out: ReportSourceRecord[] = [];

  for (const d of dailyRecords) {
    const stu = stuMap.get(d.studentId);
    const cls = clsMap.get(d.classId);
    const teacher = d.teacherId ? teacherMap.get(d.teacherId) : undefined;
    const critNames = getDailyCriteriaIds(d)
      .map((cid) => dailyCritMap.get(cid)?.name)
      .filter((n): n is string => Boolean(n));
    const labels = critNames.length > 0 ? critNames : d.criterionLabelsSnapshot ?? [];
    out.push({
      id: `daily-${d.id}`,
      sourceType: 'DAILY',
      categoryLabel: 'Đánh giá thường xuyên',
      date: d.assessmentDate,
      studentId: d.studentId,
      studentName: stu?.fullName,
      classId: d.classId,
      className: cls?.name,
      teacherId: d.teacherId,
      teacherName: teacher?.fullName,
      title: `Đánh giá hằng ngày${stu ? ` — ${stu.fullName}` : ''}`,
      statusOrRating: DAILY_EVALUATION_STATUS_LABELS[d.evaluationStatus ?? DailyEvaluationStatus.ASSESSED],
      detail: labels.length > 0 ? `Tiêu chí: ${labels.join(', ')}` : 'Không gắn tiêu chí cụ thể',
      comment: d.comment || undefined,
    });
  }

  for (const l of lessonRecords) {
    const stu = stuMap.get(l.studentId);
    const cls = clsMap.get(l.classId);
    const subj = subjMap.get(l.subjectId);
    const teacher = l.teacherId ? teacherMap.get(l.teacherId) : undefined;
    const detailParts: string[] = [];
    if (l.participationLevel) {
      detailParts.push(LESSON_PARTICIPATION_LABELS[l.participationLevel]);
    }
    if (l.score !== undefined) {
      detailParts.push(`Điểm: ${l.score}`);
    }
    if (l.knowledgeAndSkills) detailParts.push(`KT/KN: ${l.knowledgeAndSkills}`);
    if (l.learningProduct) detailParts.push(`Sản phẩm: ${l.learningProduct}`);
    if (l.difficulties) detailParts.push(`Cần hỗ trợ: ${l.difficulties}`);

    out.push({
      id: `lesson-${l.id}`,
      sourceType: 'LESSON',
      categoryLabel: 'Đánh giá thường xuyên',
      date: l.lessonDate,
      studentId: l.studentId,
      studentName: stu?.fullName,
      classId: l.classId,
      className: cls?.name,
      subjectId: l.subjectId,
      subjectName: subj?.name,
      teacherId: l.teacherId,
      teacherName: teacher?.fullName,
      title: `Tiết học ${subj?.name ?? ''}: ${l.lessonTopic}${stu ? ` — ${stu.fullName}` : ''}`,
      statusOrRating: RATING_LEVEL_LABELS[l.ratingLevel],
      detail: detailParts.join(' · ') || 'Đánh giá theo tiết học',
      comment: l.comment || undefined,
    });
  }

  for (const r of officialResults) {
    const stu = stuMap.get(r.studentId);
    const cls = clsMap.get(r.classId);
    const subj = r.subjectId ? subjMap.get(r.subjectId) : undefined;
    const crit = r.criterionId ? critMap.get(r.criterionId) : undefined;
    const period = periodMap.get(r.periodId);
    const teacher = r.teacherId ? teacherMap.get(r.teacherId) : undefined;

    out.push({
      id: `official-${r.id}`,
      sourceType: 'OFFICIAL_RESULT',
      categoryLabel: 'Kết quả định kỳ chính thức',
      date: period?.endDate || r.updatedAt.slice(0, 10),
      studentId: r.studentId,
      studentName: stu?.fullName,
      classId: r.classId,
      className: cls?.name,
      subjectId: r.subjectId,
      subjectName: subj?.name ?? crit?.name ?? 'Tổng hợp',
      teacherId: r.teacherId,
      teacherName: teacher?.fullName,
      periodName: period?.name,
      title: `${period?.name ?? 'Định kỳ'} — ${subj?.name ?? crit?.name ?? 'Kết quả chung'}${stu ? ` — ${stu.fullName}` : ''}`,
      statusOrRating: RATING_LEVEL_LABELS[r.ratingLevel],
      detail:
        r.numericScore !== undefined
          ? `Điểm KTĐK: ${r.numericScore} · Phạm vi: ${r.resultScope}`
          : `Phạm vi: ${r.resultScope}`,
      comment: r.summaryComment || undefined,
    });
  }

  for (const tl of timetableLessons) {
    const cls = clsMap.get(tl.classId);
    const subj = subjMap.get(tl.subjectId);
    const teacher = tl.teacherId ? teacherMap.get(tl.teacherId) : undefined;
    const status = computeTimetableLessonStatus({
      lesson: tl,
      assessmentsForLesson: lessonAssessmentByTtId.get(tl.id) ?? [],
    });
    out.push({
      id: `tt-${tl.id}`,
      sourceType: 'TIMETABLE_LESSON',
      categoryLabel: 'Lịch dạy',
      date: tl.lessonDate || tl.updatedAt.slice(0, 10),
      classId: tl.classId,
      className: cls?.name,
      subjectId: tl.subjectId,
      subjectName: subj?.name,
      teacherId: tl.teacherId,
      teacherName: teacher?.fullName,
      title: `${DAY_OF_WEEK_LABELS[tl.dayOfWeek]} Tiết ${tl.periodNumber} — ${subj?.name ?? ''} (${cls?.name ?? ''})`,
      statusOrRating: LESSON_WORKFLOW_STATUS_LABELS[status],
      detail: tl.lessonTitle || 'Tiết học theo thời khóa biểu',
    });
  }

  for (const c of comments) {
    const stu = stuMap.get(c.studentId);
    const cls = clsMap.get(c.classId);
    const subj = c.subjectId ? subjMap.get(c.subjectId) : undefined;
    const teacher = c.authorTeacherId ? teacherMap.get(c.authorTeacherId) : undefined;
    out.push({
      id: `cmt-${c.id}`,
      sourceType: 'COMMENT',
      categoryLabel: 'Nhận xét',
      date: c.updatedAt.slice(0, 10),
      studentId: c.studentId,
      studentName: stu?.fullName,
      classId: c.classId,
      className: cls?.name,
      subjectId: c.subjectId,
      subjectName: subj?.name,
      teacherId: c.authorTeacherId,
      teacherName: teacher?.fullName,
      title: `Nhận xét (${c.category})${stu ? ` — ${stu.fullName}` : ''}`,
      statusOrRating: c.isApproved ? 'Đã duyệt' : 'Nháp / Chờ duyệt',
      detail: c.content,
      comment: c.content,
    });
  }

  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function matchesOfficialPeriod(
  result: AssessmentResult,
  timeRange: ResolvedTimeRange,
  periodsById: Map<string, AssessmentPeriod>
): boolean {
  if (timeRange.mode === 'FULL_YEAR') {
    if (timeRange.matchingPeriodIds.size > 0) {
      return timeRange.matchingPeriodIds.has(result.periodId);
    }
    return true;
  }
  if (timeRange.matchingPeriodIds.size > 0) {
    return timeRange.matchingPeriodIds.has(result.periodId);
  }
  if (
    timeRange.mode === 'MID_TERM_1' ||
    timeRange.mode === 'END_TERM_1' ||
    timeRange.mode === 'MID_TERM_2' ||
    timeRange.mode === 'END_TERM_2' ||
    timeRange.mode === 'CONFIGURED_PERIOD'
  ) {
    // No configured AssessmentPeriod matched this milestone -> zero official results
    return false;
  }
  // DAY / WEEK / MONTH with no overlapping AssessmentPeriod: check period dates if available
  const p = periodsById.get(result.periodId);
  if (!p) return false;
  return isWithinDates(p.endDate, timeRange.fromDate, timeRange.toDate);
}

export function buildStudentReport(
  dataset: ReportDataset,
  filter: ReportFilter
): StudentReportModel {
  const timeRange = resolveReportTimeRange({
    filter,
    academicYears: dataset.academicYears,
    assessmentPeriods: dataset.assessmentPeriods,
  });

  const stu = filter.studentId
    ? dataset.students.find((s) => s.id === filter.studentId)
    : undefined;

  if (!stu) {
    return {
      hasData: false,
      timeRange,
      metrics: {
        dailyTotalRecords: 0,
        dailyAssessedCount: 0,
        dailyUnassessedOrNoOppCount: 0,
        dailyPositiveCount: 0,
        dailySupportCount: 0,
        lessonCount: 0,
        lessonHttCount: 0,
        lessonHtCount: 0,
        lessonChtCount: 0,
        officialSubjectCount: 0,
        officialQualityCompetencyCount: 0,
        commentsCount: 0,
      },
      dailyHistory: [],
      lessonHistory: [],
      officialSubjectResults: [],
      officialQualityCompetencyResults: [],
      teacherComments: [],
      progressionChartData: [],
      supportNeeds: [],
      sourceRecords: [],
    };
  }

  const schoolClass = dataset.classes.find((c) => c.id === stu.classId);
  const academicYear = dataset.academicYears.find(
    (y) => y.id === (filter.academicYearId ?? stu.academicYearId)
  );
  const teacherMap = new Map(dataset.teachers.map((t) => [t.id, t]));
  const subjMap = new Map(dataset.subjects.map((s) => [s.id, s]));
  const critMap = new Map(dataset.criteria.map((c) => [c.id, c]));
  const dailyCritMap = new Map(dataset.dailyCriteria.map((c) => [c.id, c]));
  const periodMap = new Map(dataset.assessmentPeriods.map((p) => [p.id, p]));

  const dailyRecords = dataset.dailyAssessments
    .filter((d) => {
      if (d.studentId !== stu.id) return false;
      if (filter.academicYearId && d.academicYearId !== filter.academicYearId) return false;
      if (filter.teacherId && d.teacherId !== filter.teacherId) return false;
      return isWithinDates(d.assessmentDate, timeRange.fromDate, timeRange.toDate);
    })
    .sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate));

  const lessonRecords = dataset.lessonAssessments
    .filter((l) => {
      if (l.studentId !== stu.id) return false;
      if (filter.academicYearId && l.academicYearId !== filter.academicYearId) return false;
      if (filter.subjectId && l.subjectId !== filter.subjectId) return false;
      if (filter.teacherId && l.teacherId !== filter.teacherId) return false;
      return isWithinDates(l.lessonDate, timeRange.fromDate, timeRange.toDate);
    })
    .sort((a, b) => b.lessonDate.localeCompare(a.lessonDate));

  const officialResults = dataset.assessmentResults.filter((r) => {
    if (r.studentId !== stu.id) return false;
    if (filter.academicYearId && r.academicYearId !== filter.academicYearId) return false;
    if (filter.subjectId && r.subjectId !== filter.subjectId) return false;
    if (filter.teacherId && r.teacherId !== filter.teacherId) return false;
    return matchesOfficialPeriod(r, timeRange, periodMap);
  });

  const commentRecords = dataset.comments.filter((c) => {
    if (c.studentId !== stu.id) return false;
    if (filter.academicYearId && c.academicYearId !== filter.academicYearId) return false;
    if (filter.subjectId && c.subjectId !== filter.subjectId) return false;
    if (filter.teacherId && c.authorTeacherId !== filter.teacherId) return false;
    return isWithinDates(c.updatedAt.slice(0, 10), timeRange.fromDate, timeRange.toDate);
  });

  let dailyAssessedCount = 0;
  let dailyUnassessedOrNoOppCount = 0;
  let dailyPositiveCount = 0;
  let dailySupportCount = 0;

  const dailyHistory = dailyRecords.map((record) => {
    if (isDailyRecordAssessed(record)) dailyAssessedCount += 1;
    else dailyUnassessedOrNoOppCount += 1;

    const positiveLabels: string[] = [];
    const supportLabels: string[] = [];
    if (!isDailyRecordUnassessed(record)) {
      for (const cid of getDailyCriteriaIds(record)) {
        const crit = dailyCritMap.get(cid);
        if (!crit) continue;
        if (crit.group === 'POSITIVE') {
          dailyPositiveCount += 1;
          positiveLabels.push(crit.name);
        } else {
          dailySupportCount += 1;
          supportLabels.push(crit.name);
        }
      }
    }
    return {
      record,
      teacherName: record.teacherId ? (teacherMap.get(record.teacherId)?.fullName ?? 'Giáo viên') : 'GVCN',
      statusLabel: DAILY_EVALUATION_STATUS_LABELS[record.evaluationStatus ?? DailyEvaluationStatus.ASSESSED],
      positiveLabels,
      supportLabels,
    };
  });

  let lessonHttCount = 0;
  let lessonHtCount = 0;
  let lessonChtCount = 0;
  const lessonHistory = lessonRecords.map((record) => {
    if (record.ratingLevel === AssessmentRatingLevel.HTT) lessonHttCount += 1;
    else if (record.ratingLevel === AssessmentRatingLevel.HT) lessonHtCount += 1;
    else if (record.ratingLevel === AssessmentRatingLevel.CHT) lessonChtCount += 1;

    const critIds = record.criterionIds ?? (record.criterionId ? [record.criterionId] : []);
    const criterionLabels =
      critIds.length > 0
        ? critIds.map((cid) => critMap.get(cid)?.name).filter((n): n is string => Boolean(n))
        : record.criterionLabelsSnapshot ?? [];

    return {
      record,
      subjectName: subjMap.get(record.subjectId)?.name ?? 'Môn học',
      teacherName: record.teacherId ? (teacherMap.get(record.teacherId)?.fullName ?? 'Giáo viên') : 'GVBM',
      criterionLabels,
    };
  });

  const officialSubjectResults = officialResults
    .filter((r) => r.resultScope === 'SUBJECT' || r.resultScope === 'OVERALL')
    .map((record) => ({
      record,
      periodName: periodMap.get(record.periodId)?.name ?? 'Kỳ đánh giá',
      subjectName: record.subjectId ? (subjMap.get(record.subjectId)?.name ?? 'Môn học') : 'Tổng hợp chung',
      teacherName: record.teacherId ? (teacherMap.get(record.teacherId)?.fullName ?? 'Giáo viên') : 'Giáo viên',
      ratingLabel: RATING_LEVEL_LABELS[record.ratingLevel],
    }));

  const officialQualityCompetencyResults = officialResults
    .filter((r) => r.resultScope === 'QUALITY' || r.resultScope === 'COMPETENCY')
    .map((record) => ({
      record,
      periodName: periodMap.get(record.periodId)?.name ?? 'Kỳ đánh giá',
      criterionName: record.criterionId
        ? (critMap.get(record.criterionId)?.name ?? 'Tiêu chí')
        : record.resultScope === 'QUALITY'
          ? 'Phẩm chất chủ yếu'
          : 'Năng lực cốt lõi',
      teacherName: record.teacherId ? (teacherMap.get(record.teacherId)?.fullName ?? 'GVCN') : 'GVCN',
      ratingLabel: RATING_LEVEL_LABELS[record.ratingLevel],
    }));

  // Teacher comments unified list (preserving exact source label)
  const teacherComments: StudentReportModel['teacherComments'] = [];
  for (const d of dailyRecords) {
    if (d.comment?.trim()) {
      teacherComments.push({
        id: `d-${d.id}`,
        date: d.assessmentDate,
        sourceLabel: 'Hằng ngày (GVCN)',
        authorName: d.teacherId ? (teacherMap.get(d.teacherId)?.fullName ?? 'GVCN') : 'GVCN',
        content: d.comment.trim(),
      });
    }
  }
  for (const l of lessonRecords) {
    if (l.comment?.trim()) {
      teacherComments.push({
        id: `l-${l.id}`,
        date: l.lessonDate,
        sourceLabel: 'Theo tiết (GVBM)',
        subjectName: subjMap.get(l.subjectId)?.name,
        authorName: l.teacherId ? (teacherMap.get(l.teacherId)?.fullName ?? 'GVBM') : 'GVBM',
        content: l.comment.trim(),
      });
    }
  }
  for (const r of officialResults) {
    if (r.summaryComment?.trim()) {
      const period = periodMap.get(r.periodId);
      teacherComments.push({
        id: `r-${r.id}`,
        date: period?.endDate || r.updatedAt.slice(0, 10),
        sourceLabel: 'Định kỳ chính thức',
        subjectName: r.subjectId ? subjMap.get(r.subjectId)?.name : undefined,
        authorName: r.teacherId ? (teacherMap.get(r.teacherId)?.fullName ?? 'Giáo viên') : 'Giáo viên',
        content: r.summaryComment.trim(),
      });
    }
  }
  for (const c of commentRecords) {
    teacherComments.push({
      id: `c-${c.id}`,
      date: c.updatedAt.slice(0, 10),
      sourceLabel: 'Sổ nhận xét',
      subjectName: c.subjectId ? subjMap.get(c.subjectId)?.name : undefined,
      authorName: c.authorTeacherId ? (teacherMap.get(c.authorTeacherId)?.fullName ?? 'Giáo viên') : 'Giáo viên',
      content: c.content,
    });
  }
  teacherComments.sort((a, b) => b.date.localeCompare(a.date));

  // Progression chart strictly from real chronological events (no interpolation/fabrication)
  const dateMap = new Map<
    string,
    {
      dailyPositiveCount: number;
      dailySupportCount: number;
      lessonLevels: number[];
      lessonScores: number[];
      officialLevels: number[];
      officialScores: number[];
      notes: string[];
    }
  >();

  const ensureDate = (date: string) => {
    let e = dateMap.get(date);
    if (!e) {
      e = {
        dailyPositiveCount: 0,
        dailySupportCount: 0,
        lessonLevels: [],
        lessonScores: [],
        officialLevels: [],
        officialScores: [],
        notes: [],
      };
      dateMap.set(date, e);
    }
    return e;
  };

  for (const d of dailyRecords) {
    if (isDailyRecordUnassessed(d)) continue;
    const entry = ensureDate(d.assessmentDate);
    for (const cid of getDailyCriteriaIds(d)) {
      const crit = dailyCritMap.get(cid);
      if (!crit) continue;
      if (crit.group === 'POSITIVE') entry.dailyPositiveCount += 1;
      else entry.dailySupportCount += 1;
    }
    entry.notes.push(`Hằng ngày: ${DAILY_EVALUATION_STATUS_LABELS[d.evaluationStatus]}`);
  }

  for (const l of lessonRecords) {
    const entry = ensureDate(l.lessonDate);
    entry.lessonLevels.push(ratingToNumericScale(l.ratingLevel));
    if (l.score !== undefined) entry.lessonScores.push(l.score);
    entry.notes.push(`Tiết ${subjMap.get(l.subjectId)?.name ?? ''}: ${l.ratingLevel}`);
  }

  for (const r of officialResults) {
    const p = periodMap.get(r.periodId);
    const dt = p?.endDate || r.updatedAt.slice(0, 10);
    const entry = ensureDate(dt);
    entry.officialLevels.push(ratingToNumericScale(r.ratingLevel));
    if (r.numericScore !== undefined) entry.officialScores.push(r.numericScore);
    entry.notes.push(`Định kỳ ${p?.name ?? ''}: ${r.ratingLevel}`);
  }

  const avg = (arr: number[]): number | undefined =>
    arr.length > 0 ? Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 100) / 100 : undefined;

  const progressionChartData: StudentProgressionPoint[] = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, val]) => ({
      date,
      label: date.slice(5),
      dailyPositiveCount: val.dailyPositiveCount,
      dailySupportCount: val.dailySupportCount,
      lessonLevelValue: avg(val.lessonLevels),
      lessonScore: avg(val.lessonScores),
      officialLevelValue: avg(val.officialLevels),
      officialScore: avg(val.officialScores),
      sourceNote: val.notes.join(' | '),
    }));

  const supportNeeds = aggregateSupportNeeds({
    dailyRecords,
    lessonRecords,
    officialResults,
    dailyCriteriaById: dailyCritMap,
    subjectsById: subjMap,
  });

  const sourceRecords = buildSourceRecordsFromEntities({
    dailyRecords,
    lessonRecords,
    officialResults,
    comments: commentRecords,
    dataset,
  });

  const hasData =
    dailyRecords.length > 0 ||
    lessonRecords.length > 0 ||
    officialResults.length > 0 ||
    teacherComments.length > 0;

  return {
    hasData,
    student: stu,
    schoolClass,
    academicYear,
    timeRange,
    metrics: {
      dailyTotalRecords: dailyRecords.length,
      dailyAssessedCount,
      dailyUnassessedOrNoOppCount,
      dailyPositiveCount,
      dailySupportCount,
      lessonCount: lessonRecords.length,
      lessonHttCount,
      lessonHtCount,
      lessonChtCount,
      officialSubjectCount: officialSubjectResults.length,
      officialQualityCompetencyCount: officialQualityCompetencyResults.length,
      commentsCount: teacherComments.length,
    },
    dailyHistory,
    lessonHistory,
    officialSubjectResults,
    officialQualityCompetencyResults,
    teacherComments,
    progressionChartData,
    supportNeeds,
    sourceRecords,
  };
}

export function buildClassReport(
  dataset: ReportDataset,
  filter: ReportFilter
): ClassReportModel {
  const timeRange = resolveReportTimeRange({
    filter,
    academicYears: dataset.academicYears,
    assessmentPeriods: dataset.assessmentPeriods,
  });

  const targetClasses = filterClassesByScope(dataset.classes, filter);
  const targetClassIds = new Set(targetClasses.map((c) => c.id));
  const periodMap = new Map(dataset.assessmentPeriods.map((p) => [p.id, p]));
  const subjMap = new Map(dataset.subjects.map((s) => [s.id, s]));
  const dailyCritMap = new Map(dataset.dailyCriteria.map((c) => [c.id, c]));

  const studentsInClasses = dataset.students
    .filter((s) => targetClassIds.has(s.classId))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
  const targetStudentIds = new Set(studentsInClasses.map((s) => s.id));

  const dailyRecords = dataset.dailyAssessments.filter((d) => {
    if (!targetClassIds.has(d.classId) || !targetStudentIds.has(d.studentId)) return false;
    if (filter.teacherId && d.teacherId !== filter.teacherId) return false;
    return isWithinDates(d.assessmentDate, timeRange.fromDate, timeRange.toDate);
  });

  const lessonRecords = dataset.lessonAssessments.filter((l) => {
    if (!targetClassIds.has(l.classId) || !targetStudentIds.has(l.studentId)) return false;
    if (filter.subjectId && l.subjectId !== filter.subjectId) return false;
    if (filter.teacherId && l.teacherId !== filter.teacherId) return false;
    return isWithinDates(l.lessonDate, timeRange.fromDate, timeRange.toDate);
  });

  const officialResults = dataset.assessmentResults.filter((r) => {
    if (!targetClassIds.has(r.classId) || !targetStudentIds.has(r.studentId)) return false;
    if (filter.subjectId && r.subjectId !== filter.subjectId) return false;
    if (filter.teacherId && r.teacherId !== filter.teacherId) return false;
    return matchesOfficialPeriod(r, timeRange, periodMap);
  });

  const regularAssessedStudentIds = new Set<string>();
  const officialAssessedStudentIds = new Set<string>();

  const dailyByStudent = new Map<string, DailyAssessment[]>();
  for (const d of dailyRecords) {
    const arr = dailyByStudent.get(d.studentId) ?? [];
    arr.push(d);
    dailyByStudent.set(d.studentId, arr);
    if (isDailyRecordAssessed(d)) {
      regularAssessedStudentIds.add(d.studentId);
    }
  }

  const lessonByStudent = new Map<string, LessonAssessment[]>();
  for (const l of lessonRecords) {
    const arr = lessonByStudent.get(l.studentId) ?? [];
    arr.push(l);
    lessonByStudent.set(l.studentId, arr);
    regularAssessedStudentIds.add(l.studentId);
  }

  const officialByStudent = new Map<string, AssessmentResult[]>();
  for (const r of officialResults) {
    const arr = officialByStudent.get(r.studentId) ?? [];
    arr.push(r);
    officialByStudent.set(r.studentId, arr);
    officialAssessedStudentIds.add(r.studentId);
  }

  let supportCasesCount = 0;
  const studentRoster: ClassStudentRow[] = studentsInClasses.map((stu) => {
    const dList = dailyByStudent.get(stu.id) ?? [];
    const lList = lessonByStudent.get(stu.id) ?? [];
    const rList = officialByStudent.get(stu.id) ?? [];

    const dailyAssessedCount = dList.filter(isDailyRecordAssessed).length;
    const dailyUnassessedCount = dList.filter(isDailyRecordUnassessed).length;
    const lessonAssessedCount = lList.length;
    const isRegularAssessed = dailyAssessedCount > 0 || lessonAssessedCount > 0;
    const isOfficialAssessed = rList.length > 0;

    const supportTopicsSet = new Set<string>();
    for (const d of dList) {
      if (isDailyRecordUnassessed(d)) continue;
      for (const cid of getDailyCriteriaIds(d)) {
        const crit = dailyCritMap.get(cid);
        if (crit?.group === 'NEEDS_SUPPORT') supportTopicsSet.add(crit.name);
      }
    }
    for (const l of lList) {
      if (l.difficulties?.trim()) supportTopicsSet.add(l.difficulties.trim());
    }
    for (const r of rList) {
      if (
        r.ratingLevel === AssessmentRatingLevel.CHT ||
        r.ratingLevel === AssessmentRatingLevel.CCG
      ) {
        const subjName = r.subjectId ? subjMap.get(r.subjectId)?.name : 'Kết quả chung';
        supportTopicsSet.add(`${subjName ?? 'Định kỳ'}: ${RATING_LEVEL_LABELS[r.ratingLevel]}`);
      }
    }

    if (supportTopicsSet.size > 0) supportCasesCount += 1;

    const latestOfficialRatings = rList.slice(0, 4).map((r) => {
      const sName = r.subjectId ? (subjMap.get(r.subjectId)?.shortName ?? subjMap.get(r.subjectId)?.name ?? '') : 'Chung';
      return `${sName}: ${r.ratingLevel}`;
    });

    return {
      student: stu,
      dailyAssessedCount,
      dailyUnassessedCount,
      lessonAssessedCount,
      regularStatus: isRegularAssessed ? 'ASSESSED' : 'UNASSESSED',
      officialResultsCount: rList.length,
      officialStatus: isOfficialAssessed ? 'ASSESSED' : 'UNASSESSED',
      latestOfficialRatings,
      supportCount: supportTopicsSet.size,
      supportTopics: Array.from(supportTopicsSet),
    };
  });

  // Subject summary: keep regular lesson counts and official periodic results strictly separate
  const relevantSubjectIds = new Set<string>();
  for (const l of lessonRecords) relevantSubjectIds.add(l.subjectId);
  for (const r of officialResults) {
    if (r.subjectId) relevantSubjectIds.add(r.subjectId);
  }
  if (filter.subjectId && subjMap.has(filter.subjectId)) {
    relevantSubjectIds.add(filter.subjectId);
  }

  const subjectSummary: ClassSubjectSummaryRow[] = Array.from(relevantSubjectIds)
    .map((sid) => {
      const subj = subjMap.get(sid);
      const sLessons = lessonRecords.filter((l) => l.subjectId === sid);
      const sOfficials = officialResults.filter((r) => r.subjectId === sid);

      const regStuIds = new Set(sLessons.map((l) => l.studentId));
      const offStuIds = new Set(sOfficials.map((r) => r.studentId));

      return {
        subjectId: sid,
        subjectName: subj?.name ?? 'Môn học',
        totalStudents: studentsInClasses.length,
        lessonRecordsCount: sLessons.length,
        regularAssessedStudents: regStuIds.size,
        regularUnassessedStudents: Math.max(0, studentsInClasses.length - regStuIds.size),
        lessonHtt: sLessons.filter((l) => l.ratingLevel === AssessmentRatingLevel.HTT).length,
        lessonHt: sLessons.filter((l) => l.ratingLevel === AssessmentRatingLevel.HT).length,
        lessonCht: sLessons.filter((l) => l.ratingLevel === AssessmentRatingLevel.CHT).length,
        officialAssessedStudents: offStuIds.size,
        officialUnassessedStudents: Math.max(0, studentsInClasses.length - offStuIds.size),
        officialHtt: sOfficials.filter((r) => r.ratingLevel === AssessmentRatingLevel.HTT).length,
        officialHt: sOfficials.filter((r) => r.ratingLevel === AssessmentRatingLevel.HT).length,
        officialCht: sOfficials.filter((r) => r.ratingLevel === AssessmentRatingLevel.CHT).length,
      };
    })
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'vi'));

  const totalStudents = studentsInClasses.length;
  const regularAssessedStudents = regularAssessedStudentIds.size;
  const regularUnassessedStudents = Math.max(0, totalStudents - regularAssessedStudents);
  const officialAssessedStudents = officialAssessedStudentIds.size;
  const officialUnassessedStudents = Math.max(0, totalStudents - officialAssessedStudents);

  const hasData =
    totalStudents > 0 &&
    (dailyRecords.length > 0 || lessonRecords.length > 0 || officialResults.length > 0);

  const evaluationStatusChart =
    totalStudents > 0
      ? [
          {
            category: 'Đánh giá thường xuyên',
            daDanhGia: regularAssessedStudents,
            chuaDanhGia: regularUnassessedStudents,
          },
          {
            category: 'Đánh giá định kỳ chính thức',
            daDanhGia: officialAssessedStudents,
            chuaDanhGia: officialUnassessedStudents,
          },
        ]
      : [];

  const subjectChartData = subjectSummary.map((row) => ({
    subjectName: row.subjectName,
    htt: row.officialHtt,
    ht: row.officialHt,
    cht: row.officialCht,
    chuaDanhGia: row.officialUnassessedStudents,
  }));

  const supportNeeds = aggregateSupportNeeds({
    dailyRecords,
    lessonRecords,
    officialResults,
    dailyCriteriaById: dailyCritMap,
    subjectsById: subjMap,
  });

  const sourceRecords = buildSourceRecordsFromEntities({
    dailyRecords,
    lessonRecords,
    officialResults,
    dataset,
  });

  return {
    hasData,
    targetClasses,
    timeRange,
    metrics: {
      totalStudents,
      regularAssessedStudents,
      regularUnassessedStudents,
      regularCompletionRate:
        totalStudents > 0 ? Math.round((regularAssessedStudents / totalStudents) * 100) : null,
      officialAssessedStudents,
      officialUnassessedStudents,
      officialCompletionRate:
        totalStudents > 0 ? Math.round((officialAssessedStudents / totalStudents) * 100) : null,
      totalDailyObservations: dailyRecords.filter(isDailyRecordAssessed).length,
      totalLessonObservations: lessonRecords.length,
      totalOfficialResults: officialResults.length,
      supportCasesCount,
    },
    studentRoster,
    subjectSummary,
    evaluationStatusChart,
    subjectChartData,
    supportNeeds,
    sourceRecords,
  };
}

export function buildTeacherReport(
  dataset: ReportDataset,
  filter: ReportFilter
): TeacherReportModel {
  const timeRange = resolveReportTimeRange({
    filter,
    academicYears: dataset.academicYears,
    assessmentPeriods: dataset.assessmentPeriods,
  });

  const targetTeacherId =
    filter.teacherId ||
    (filter.permissions?.isScopedTeacher ? filter.permissions.activeTeacherId : undefined);
  const teacher = targetTeacherId
    ? dataset.teachers.find((t) => t.id === targetTeacherId)
    : undefined;

  if (!teacher) {
    return {
      hasData: false,
      roles: [],
      assignments: [],
      homeroomClasses: [],
      taughtPairs: [],
      timeRange,
      metrics: {
        totalScheduledLessons: 0,
        assessedLessons: 0,
        inProgressLessons: 0,
        unassessedLessons: 0,
        lessonCompletionRate: null,
        dailySavedCount: 0,
        lessonSavedCount: 0,
        officialSavedCount: 0,
      },
      lessonsList: [],
      completionChartData: [],
      workHistory: [],
      sourceRecords: [],
    };
  }

  const yearMap = new Map(dataset.academicYears.map((y) => [y.id, y]));
  const clsMap = new Map(dataset.classes.map((c) => [c.id, c]));
  const subjMap = new Map(dataset.subjects.map((s) => [s.id, s]));
  const roleMap = new Map(dataset.teacherRoles.map((r) => [r.id, r]));
  const periodMap = new Map(dataset.assessmentPeriods.map((p) => [p.id, p]));

  const teacherAssignments = dataset.teacherAssignments.filter(
    (a) =>
      a.teacherId === teacher.id &&
      (!filter.academicYearId || a.academicYearId === filter.academicYearId)
  );
  const activeAssignments = teacherAssignments.filter(
    (a) => a.status === TeacherAssignmentStatus.ACTIVE
  );

  // Roles independent of assignments + active assignment roles
  const roleIds = new Set(
    dataset.teacherRoleGrants.filter((g) => g.teacherId === teacher.id).map((g) => g.roleId)
  );
  for (const a of activeAssignments) {
    if (a.roleId) roleIds.add(a.roleId);
  }
  const roles = Array.from(roleIds)
    .map((rid) => roleMap.get(rid))
    .filter((r): r is TeacherRole => Boolean(r));

  const homeroomClassIds = new Set<string>();
  for (const a of activeAssignments) {
    if ((a.isHomeroom || a.role?.toUpperCase() === 'GVCN') && a.classId) {
      homeroomClassIds.add(a.classId);
    }
  }
  for (const cls of dataset.classes) {
    if (
      cls.homeroomTeacherId === teacher.id &&
      (!filter.academicYearId || cls.academicYearId === filter.academicYearId)
    ) {
      homeroomClassIds.add(cls.id);
    }
  }
  const homeroomClasses = Array.from(homeroomClassIds)
    .map((cid) => clsMap.get(cid))
    .filter((c): c is SchoolClass => Boolean(c))
    .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi'));

  const taughtPairMap = new Map<string, { classId: string; className: string; subjectId: string; subjectName: string }>();
  for (const a of activeAssignments) {
    if (a.classId && a.subjectId) {
      const key = `${a.classId}|${a.subjectId}`;
      taughtPairMap.set(key, {
        classId: a.classId,
        className: clsMap.get(a.classId)?.name ?? 'Lớp',
        subjectId: a.subjectId,
        subjectName: subjMap.get(a.subjectId)?.name ?? 'Môn học',
      });
    }
  }

  // Timetable lessons scoped to this teacher
  const linkedTtIds = new Set(
    dataset.timetables
      .filter(
        (tt) =>
          tt.teacherId === teacher.id &&
          (!filter.academicYearId || tt.academicYearId === filter.academicYearId)
      )
      .map((tt) => tt.id)
  );
  const teacherLessons = dataset.timetableLessons.filter((lesson) => {
    if (filter.academicYearId && lesson.academicYearId !== filter.academicYearId) return false;
    if (filter.classId && lesson.classId !== filter.classId) return false;
    if (filter.subjectId && lesson.subjectId !== filter.subjectId) return false;
    const belongsToTeacher =
      lesson.teacherId === teacher.id ||
      (linkedTtIds.has(lesson.timetableId) &&
        (!lesson.teacherId || taughtPairMap.has(`${lesson.classId}|${lesson.subjectId}`)));
    if (!belongsToTeacher) return false;
    return isWithinDates(lesson.lessonDate, timeRange.fromDate, timeRange.toDate);
  });

  const lessonAssessmentByTtId = new Map<string, LessonAssessment[]>();
  for (const la of dataset.lessonAssessments) {
    if (!la.timetableLessonId) continue;
    const arr = lessonAssessmentByTtId.get(la.timetableLessonId) ?? [];
    arr.push(la);
    lessonAssessmentByTtId.set(la.timetableLessonId, arr);
  }

  const studentCountByClass = new Map<string, number>();
  for (const stu of dataset.students) {
    studentCountByClass.set(stu.classId, (studentCountByClass.get(stu.classId) ?? 0) + 1);
  }

  let assessedLessons = 0;
  let inProgressLessons = 0;
  let unassessedLessons = 0;

  const lessonsList: TeacherLessonRow[] = teacherLessons
    .map((lesson) => {
      const assessmentsForLesson = lessonAssessmentByTtId.get(lesson.id) ?? [];
      const status = computeTimetableLessonStatus({ lesson, assessmentsForLesson });
      if (status === 'SAVED' || status === 'COMPLETED') assessedLessons += 1;
      else if (status === 'IN_PROGRESS') inProgressLessons += 1;
      else unassessedLessons += 1;

      return {
        lesson,
        className: clsMap.get(lesson.classId)?.name ?? 'Lớp',
        subjectName: subjMap.get(lesson.subjectId)?.name ?? 'Môn học',
        status,
        assessedStudentsCount: new Set(assessmentsForLesson.map((a) => a.studentId)).size,
        classStudentCount: studentCountByClass.get(lesson.classId) ?? 0,
      };
    })
    .sort((a, b) => (b.lesson.lessonDate ?? '').localeCompare(a.lesson.lessonDate ?? ''));

  const dailyRecords = dataset.dailyAssessments.filter((d) => {
    if (d.teacherId !== teacher.id) return false;
    if (filter.academicYearId && d.academicYearId !== filter.academicYearId) return false;
    if (filter.classId && d.classId !== filter.classId) return false;
    return isWithinDates(d.assessmentDate, timeRange.fromDate, timeRange.toDate);
  });

  const lessonRecords = dataset.lessonAssessments.filter((l) => {
    if (l.teacherId !== teacher.id) return false;
    if (filter.academicYearId && l.academicYearId !== filter.academicYearId) return false;
    if (filter.classId && l.classId !== filter.classId) return false;
    if (filter.subjectId && l.subjectId !== filter.subjectId) return false;
    return isWithinDates(l.lessonDate, timeRange.fromDate, timeRange.toDate);
  });

  const officialResults = dataset.assessmentResults.filter((r) => {
    if (r.teacherId !== teacher.id) return false;
    if (filter.academicYearId && r.academicYearId !== filter.academicYearId) return false;
    if (filter.classId && r.classId !== filter.classId) return false;
    if (filter.subjectId && r.subjectId !== filter.subjectId) return false;
    return matchesOfficialPeriod(r, timeRange, periodMap);
  });

  const dailySavedCount = dailyRecords.filter(isDailyRecordAssessed).length;
  const totalScheduledLessons = lessonsList.length;

  const rawCompletionChart: TeacherReportModel['completionChartData'] = [
    { name: 'Đã đánh giá', value: assessedLessons, key: 'ASSESSED' },
    { name: 'Đang đánh giá', value: inProgressLessons, key: 'IN_PROGRESS' },
    { name: 'Chưa đánh giá', value: unassessedLessons, key: 'UNASSESSED' },
  ];
  const completionChartData: TeacherReportModel['completionChartData'] =
    totalScheduledLessons > 0 ? rawCompletionChart.filter((item) => item.value > 0) : [];

  // Work history combining assignment history + real saved records
  const workHistory: TeacherReportModel['workHistory'] = [];
  for (const h of dataset.teacherAssignmentHistory) {
    if (h.previousTeacherId !== teacher.id && h.newTeacherId !== teacher.id) continue;
    if (filter.academicYearId && h.academicYearId !== filter.academicYearId) continue;
    workHistory.push({
      id: `ah-${h.id}`,
      timestamp: h.effectiveDate,
      category: 'Phân công nhiệm vụ',
      summary: `${h.actionType}: ${h.role}${h.classId ? ` · Lớp ${clsMap.get(h.classId)?.name ?? ''}` : ''}${h.reason ? ` (${h.reason})` : ''}`,
    });
  }
  for (const d of dailyRecords.slice(0, 20)) {
    workHistory.push({
      id: `wh-d-${d.id}`,
      timestamp: d.assessmentDate,
      category: 'Đánh giá hằng ngày',
      summary: `${clsMap.get(d.classId)?.name ?? ''} · ${DAILY_EVALUATION_STATUS_LABELS[d.evaluationStatus]}`,
    });
  }
  for (const l of lessonRecords.slice(0, 20)) {
    workHistory.push({
      id: `wh-l-${l.id}`,
      timestamp: l.lessonDate,
      category: 'Đánh giá theo tiết',
      summary: `${subjMap.get(l.subjectId)?.name ?? ''} (${clsMap.get(l.classId)?.name ?? ''}) · ${l.lessonTopic}`,
    });
  }
  for (const r of officialResults.slice(0, 20)) {
    workHistory.push({
      id: `wh-r-${r.id}`,
      timestamp: periodMap.get(r.periodId)?.endDate || r.updatedAt.slice(0, 10),
      category: 'Đánh giá định kỳ',
      summary: `${periodMap.get(r.periodId)?.name ?? ''} · ${r.subjectId ? subjMap.get(r.subjectId)?.name : r.resultScope} (${r.ratingLevel})`,
    });
  }
  workHistory.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const sourceRecords = buildSourceRecordsFromEntities({
    dailyRecords,
    lessonRecords,
    officialResults,
    timetableLessons: teacherLessons,
    dataset,
  });

  const hasData =
    teacherAssignments.length > 0 ||
    totalScheduledLessons > 0 ||
    dailyRecords.length > 0 ||
    lessonRecords.length > 0 ||
    officialResults.length > 0;

  return {
    hasData,
    teacher,
    roles,
    assignments: teacherAssignments.map((a) => ({
      assignment: a,
      className: a.classId ? (clsMap.get(a.classId)?.name ?? 'Toàn trường') : 'Toàn trường',
      subjectName: a.subjectId ? (subjMap.get(a.subjectId)?.name ?? 'Tất cả môn') : a.isHomeroom ? 'Chủ nhiệm' : 'Chung',
      academicYearName: yearMap.get(a.academicYearId)?.name ?? '',
    })),
    homeroomClasses,
    taughtPairs: Array.from(taughtPairMap.values()),
    timeRange,
    metrics: {
      totalScheduledLessons,
      assessedLessons,
      inProgressLessons,
      unassessedLessons,
      lessonCompletionRate:
        totalScheduledLessons > 0 ? Math.round((assessedLessons / totalScheduledLessons) * 100) : null,
      dailySavedCount,
      lessonSavedCount: lessonRecords.length,
      officialSavedCount: officialResults.length,
    },
    lessonsList,
    completionChartData,
    workHistory,
    sourceRecords,
  };
}

export function buildSubjectReport(
  dataset: ReportDataset,
  filter: ReportFilter
): SubjectReportModel {
  const timeRange = resolveReportTimeRange({
    filter,
    academicYears: dataset.academicYears,
    assessmentPeriods: dataset.assessmentPeriods,
  });

  const subject = filter.subjectId
    ? dataset.subjects.find((s) => s.id === filter.subjectId)
    : undefined;

  const targetClasses = filterClassesByScope(dataset.classes, filter);
  const targetClassIds = new Set(targetClasses.map((c) => c.id));
  const periodMap = new Map(dataset.assessmentPeriods.map((p) => [p.id, p]));
  const teacherMap = new Map(dataset.teachers.map((t) => [t.id, t]));
  const subjMap = new Map(dataset.subjects.map((s) => [s.id, s]));
  const dailyCritMap = new Map(dataset.dailyCriteria.map((c) => [c.id, c]));

  const studentsInScope = dataset.students.filter((s) => targetClassIds.has(s.classId));
  const targetStudentIds = new Set(studentsInScope.map((s) => s.id));

  const lessonRecords = dataset.lessonAssessments.filter((l) => {
    if (!targetClassIds.has(l.classId) || !targetStudentIds.has(l.studentId)) return false;
    if (filter.subjectId && l.subjectId !== filter.subjectId) return false;
    if (filter.teacherId && l.teacherId !== filter.teacherId) return false;
    if (filter.permissions?.isScopedTeacher) {
      const allowedSubjs = filter.permissions.allowedSubjectIdsByClass.get(l.classId);
      const isHr = filter.permissions.allowedHomeroomClassIds.has(l.classId);
      if (!isHr && !allowedSubjs?.has(l.subjectId)) return false;
    }
    return isWithinDates(l.lessonDate, timeRange.fromDate, timeRange.toDate);
  });

  const officialResults = dataset.assessmentResults.filter((r) => {
    if (!targetClassIds.has(r.classId) || !targetStudentIds.has(r.studentId)) return false;
    if (r.resultScope !== 'SUBJECT') return false;
    if (filter.subjectId && r.subjectId !== filter.subjectId) return false;
    if (filter.teacherId && r.teacherId !== filter.teacherId) return false;
    if (filter.permissions?.isScopedTeacher && r.subjectId) {
      const allowedSubjs = filter.permissions.allowedSubjectIdsByClass.get(r.classId);
      const isHr = filter.permissions.allowedHomeroomClassIds.has(r.classId);
      if (!isHr && !allowedSubjs?.has(r.subjectId)) return false;
    }
    return matchesOfficialPeriod(r, timeRange, periodMap);
  });

  const regStudents = new Set(lessonRecords.map((l) => l.studentId));
  const offStudents = new Set(officialResults.map((r) => r.studentId));

  const regScores = lessonRecords.map((l) => l.score).filter((n): n is number => typeof n === 'number');
  const offScores = officialResults.map((r) => r.numericScore).filter((n): n is number => typeof n === 'number');

  const avg = (arr: number[]): number | null =>
    arr.length > 0 ? Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 100) / 100 : null;

  const byClassBreakdown = targetClasses.map((cls) => {
    const classStus = studentsInScope.filter((s) => s.classId === cls.id);
    const cLessons = lessonRecords.filter((l) => l.classId === cls.id);
    const cOfficials = officialResults.filter((r) => r.classId === cls.id);
    const cRegStuIds = new Set(cLessons.map((l) => l.studentId));
    const cOffStuIds = new Set(cOfficials.map((r) => r.studentId));

    const teacherNamesSet = new Set<string>();
    for (const a of dataset.teacherAssignments) {
      if (
        a.classId === cls.id &&
        a.status === TeacherAssignmentStatus.ACTIVE &&
        (!filter.subjectId || a.subjectId === filter.subjectId)
      ) {
        const name = teacherMap.get(a.teacherId)?.fullName;
        if (name) teacherNamesSet.add(name);
      }
    }
    for (const l of cLessons) {
      if (l.teacherId) {
        const name = teacherMap.get(l.teacherId)?.fullName;
        if (name) teacherNamesSet.add(name);
      }
    }

    return {
      classId: cls.id,
      className: cls.name,
      gradeLevel: cls.gradeLevel,
      teacherNames: Array.from(teacherNamesSet),
      totalStudents: classStus.length,
      regularAssessedStudents: cRegStuIds.size,
      regularUnassessedStudents: Math.max(0, classStus.length - cRegStuIds.size),
      regularHtt: cLessons.filter((l) => l.ratingLevel === AssessmentRatingLevel.HTT).length,
      regularHt: cLessons.filter((l) => l.ratingLevel === AssessmentRatingLevel.HT).length,
      regularCht: cLessons.filter((l) => l.ratingLevel === AssessmentRatingLevel.CHT).length,
      officialAssessedStudents: cOffStuIds.size,
      officialUnassessedStudents: Math.max(0, classStus.length - cOffStuIds.size),
      officialHtt: cOfficials.filter((r) => r.ratingLevel === AssessmentRatingLevel.HTT).length,
      officialHt: cOfficials.filter((r) => r.ratingLevel === AssessmentRatingLevel.HT).length,
      officialCht: cOfficials.filter((r) => r.ratingLevel === AssessmentRatingLevel.CHT).length,
    };
  });

  const officialHtt = officialResults.filter((r) => r.ratingLevel === AssessmentRatingLevel.HTT).length;
  const officialHt = officialResults.filter((r) => r.ratingLevel === AssessmentRatingLevel.HT).length;
  const officialCht = officialResults.filter((r) => r.ratingLevel === AssessmentRatingLevel.CHT).length;
  const officialUnassessedStudents = Math.max(0, studentsInScope.length - offStudents.size);

  const hasData = lessonRecords.length > 0 || officialResults.length > 0;

  const regularVsOfficialChart = hasData
    ? byClassBreakdown
        .filter((row) => row.totalStudents > 0)
        .map((row) => ({
          className: row.className,
          regularAssessed: row.regularAssessedStudents,
          officialAssessed: row.officialAssessedStudents,
          officialUnassessed: row.officialUnassessedStudents,
        }))
    : [];

  const subjectDistributionChart = hasData
    ? [
        { name: 'T: Hoàn thành tốt (Định kỳ)', count: officialHtt },
        { name: 'H: Hoàn thành (Định kỳ)', count: officialHt },
        { name: 'C: Chưa hoàn thành (Định kỳ)', count: officialCht },
        { name: 'Chưa đánh giá định kỳ', count: officialUnassessedStudents },
      ].filter((d) => d.count > 0)
    : [];

  const supportNeeds = aggregateSupportNeeds({
    dailyRecords: [],
    lessonRecords,
    officialResults,
    dailyCriteriaById: dailyCritMap,
    subjectsById: subjMap,
  });

  const sourceRecords = buildSourceRecordsFromEntities({
    dailyRecords: [],
    lessonRecords,
    officialResults,
    dataset,
  });

  return {
    hasData,
    subject,
    timeRange,
    metrics: {
      targetStudentsCount: studentsInScope.length,
      regularRecordsCount: lessonRecords.length,
      regularAssessedStudents: regStudents.size,
      regularUnassessedStudents: Math.max(0, studentsInScope.length - regStudents.size),
      regularHtt: lessonRecords.filter((l) => l.ratingLevel === AssessmentRatingLevel.HTT).length,
      regularHt: lessonRecords.filter((l) => l.ratingLevel === AssessmentRatingLevel.HT).length,
      regularCht: lessonRecords.filter((l) => l.ratingLevel === AssessmentRatingLevel.CHT).length,
      regularAvgScore: avg(regScores),
      officialRecordsCount: officialResults.length,
      officialAssessedStudents: offStudents.size,
      officialUnassessedStudents,
      officialHtt,
      officialHt,
      officialCht,
      officialAvgScore: avg(offScores),
    },
    byClassBreakdown,
    regularVsOfficialChart,
    subjectDistributionChart,
    supportNeeds,
    sourceRecords,
  };
}

export function buildTimeframeReport(
  dataset: ReportDataset,
  filter: ReportFilter
): TimeframeReportModel {
  const timeRange = resolveReportTimeRange({
    filter,
    academicYears: dataset.academicYears,
    assessmentPeriods: dataset.assessmentPeriods,
  });

  const targetClasses = filterClassesByScope(dataset.classes, filter);
  const targetClassIds = new Set(targetClasses.map((c) => c.id));
  const periodMap = new Map(dataset.assessmentPeriods.map((p) => [p.id, p]));
  const subjMap = new Map(dataset.subjects.map((s) => [s.id, s]));
  const dailyCritMap = new Map(dataset.dailyCriteria.map((c) => [c.id, c]));

  const studentsInScope = dataset.students.filter((s) => targetClassIds.has(s.classId));
  const targetStudentIds = new Set(studentsInScope.map((s) => s.id));

  const dailyRecords = dataset.dailyAssessments.filter((d) => {
    if (!targetClassIds.has(d.classId) || !targetStudentIds.has(d.studentId)) return false;
    if (filter.teacherId && d.teacherId !== filter.teacherId) return false;
    return isWithinDates(d.assessmentDate, timeRange.fromDate, timeRange.toDate);
  });

  const lessonRecords = dataset.lessonAssessments.filter((l) => {
    if (!targetClassIds.has(l.classId) || !targetStudentIds.has(l.studentId)) return false;
    if (filter.subjectId && l.subjectId !== filter.subjectId) return false;
    if (filter.teacherId && l.teacherId !== filter.teacherId) return false;
    return isWithinDates(l.lessonDate, timeRange.fromDate, timeRange.toDate);
  });

  const officialResults = dataset.assessmentResults.filter((r) => {
    if (!targetClassIds.has(r.classId) || !targetStudentIds.has(r.studentId)) return false;
    if (filter.subjectId && r.subjectId !== filter.subjectId) return false;
    if (filter.teacherId && r.teacherId !== filter.teacherId) return false;
    return matchesOfficialPeriod(r, timeRange, periodMap);
  });

  const scheduledLessons = dataset.timetableLessons.filter((tl) => {
    if (!targetClassIds.has(tl.classId)) return false;
    if (filter.subjectId && tl.subjectId !== filter.subjectId) return false;
    if (filter.teacherId && tl.teacherId !== filter.teacherId) return false;
    return isWithinDates(tl.lessonDate, timeRange.fromDate, timeRange.toDate);
  });

  const lessonAssessmentByTtId = new Map<string, LessonAssessment[]>();
  for (const la of dataset.lessonAssessments) {
    if (!la.timetableLessonId) continue;
    const arr = lessonAssessmentByTtId.get(la.timetableLessonId) ?? [];
    arr.push(la);
    lessonAssessmentByTtId.set(la.timetableLessonId, arr);
  }

  let scheduledLessonsAssessed = 0;
  let scheduledLessonsUnassessed = 0;
  for (const tl of scheduledLessons) {
    const st = computeTimetableLessonStatus({
      lesson: tl,
      assessmentsForLesson: lessonAssessmentByTtId.get(tl.id) ?? [],
    });
    if (st === 'SAVED' || st === 'COMPLETED') scheduledLessonsAssessed += 1;
    else scheduledLessonsUnassessed += 1;
  }

  const regStuIds = new Set<string>();
  for (const d of dailyRecords) {
    if (isDailyRecordAssessed(d)) regStuIds.add(d.studentId);
  }
  for (const l of lessonRecords) regStuIds.add(l.studentId);
  const offStuIds = new Set(officialResults.map((r) => r.studentId));

  // Bucket trend chart (month buckets for FULL_YEAR, date buckets otherwise)
  const useMonthBucket = filter.timeframeMode === 'FULL_YEAR';
  const buckets = new Map<string, TimeframeTrendPoint>();
  const ensureBucket = (dateStr: string): TimeframeTrendPoint => {
    const key = useMonthBucket ? dateStr.slice(0, 7) : dateStr;
    const label = useMonthBucket ? `Tháng ${key.slice(5)}/${key.slice(0, 4)}` : dateStr.slice(5);
    let b = buckets.get(key);
    if (!b) {
      b = {
        bucketKey: key,
        bucketLabel: label,
        dailyAssessed: 0,
        lessonAssessed: 0,
        officialAssessed: 0,
        positiveMarks: 0,
        supportMarks: 0,
      };
      buckets.set(key, b);
    }
    return b;
  };

  for (const d of dailyRecords) {
    if (!isDailyRecordAssessed(d)) continue;
    const b = ensureBucket(d.assessmentDate);
    b.dailyAssessed += 1;
    for (const cid of getDailyCriteriaIds(d)) {
      const crit = dailyCritMap.get(cid);
      if (crit?.group === 'POSITIVE') b.positiveMarks += 1;
      else if (crit?.group === 'NEEDS_SUPPORT') b.supportMarks += 1;
    }
  }
  for (const l of lessonRecords) {
    const b = ensureBucket(l.lessonDate);
    b.lessonAssessed += 1;
    if (l.ratingLevel === AssessmentRatingLevel.HTT) b.positiveMarks += 1;
    if (l.difficulties?.trim() || l.ratingLevel === AssessmentRatingLevel.CHT) b.supportMarks += 1;
  }
  for (const r of officialResults) {
    const dt = periodMap.get(r.periodId)?.endDate || r.updatedAt.slice(0, 10);
    const b = ensureBucket(dt);
    b.officialAssessed += 1;
  }

  const progressionTrendChart = Array.from(buckets.values()).sort((a, b) =>
    a.bucketKey.localeCompare(b.bucketKey)
  );

  const classStatusChart = targetClasses
    .map((cls) => {
      const cStus = studentsInScope.filter((s) => s.classId === cls.id);
      if (cStus.length === 0) return null;
      const cRegIds = new Set<string>();
      for (const d of dailyRecords) {
        if (d.classId === cls.id && isDailyRecordAssessed(d)) cRegIds.add(d.studentId);
      }
      for (const l of lessonRecords) {
        if (l.classId === cls.id) cRegIds.add(l.studentId);
      }
      const cOffIds = new Set(officialResults.filter((r) => r.classId === cls.id).map((r) => r.studentId));
      return {
        className: cls.name,
        regularAssessed: cRegIds.size,
        regularUnassessed: Math.max(0, cStus.length - cRegIds.size),
        officialAssessed: cOffIds.size,
        officialUnassessed: Math.max(0, cStus.length - cOffIds.size),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const subjectIds = new Set<string>();
  for (const r of officialResults) {
    if (r.subjectId && r.resultScope === 'SUBJECT') subjectIds.add(r.subjectId);
  }
  const subjectResultsChart = Array.from(subjectIds)
    .map((sid) => {
      const sOff = officialResults.filter((r) => r.subjectId === sid && r.resultScope === 'SUBJECT');
      const offStu = new Set(sOff.map((r) => r.studentId));
      return {
        subjectName: subjMap.get(sid)?.name ?? 'Môn học',
        htt: sOff.filter((r) => r.ratingLevel === AssessmentRatingLevel.HTT).length,
        ht: sOff.filter((r) => r.ratingLevel === AssessmentRatingLevel.HT).length,
        cht: sOff.filter((r) => r.ratingLevel === AssessmentRatingLevel.CHT).length,
        chuaDanhGia: Math.max(0, studentsInScope.length - offStu.size),
      };
    })
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'vi'));

  const totalStudentsInScope = studentsInScope.length;
  const dailyAssessedRecords = dailyRecords.filter(isDailyRecordAssessed).length;
  const hasData =
    dailyAssessedRecords > 0 ||
    lessonRecords.length > 0 ||
    officialResults.length > 0 ||
    scheduledLessons.length > 0;

  const completionChart =
    totalStudentsInScope > 0 && hasData
      ? [
          {
            name: 'Học sinh đánh giá thường xuyên',
            assessed: regStuIds.size,
            unassessed: Math.max(0, totalStudentsInScope - regStuIds.size),
          },
          {
            name: 'Học sinh có kết quả định kỳ',
            assessed: offStuIds.size,
            unassessed: Math.max(0, totalStudentsInScope - offStuIds.size),
          },
          ...(scheduledLessons.length > 0
            ? [
                {
                  name: 'Tiết học đã đánh giá',
                  assessed: scheduledLessonsAssessed,
                  unassessed: scheduledLessonsUnassessed,
                },
              ]
            : []),
        ]
      : [];

  const supportNeeds = aggregateSupportNeeds({
    dailyRecords,
    lessonRecords,
    officialResults,
    dailyCriteriaById: dailyCritMap,
    subjectsById: subjMap,
  });

  const sourceRecords = buildSourceRecordsFromEntities({
    dailyRecords,
    lessonRecords,
    officialResults,
    timetableLessons: scheduledLessons,
    dataset,
  });

  return {
    hasData,
    timeRange,
    metrics: {
      totalStudentsInScope,
      regularAssessedStudents: regStuIds.size,
      regularUnassessedStudents: Math.max(0, totalStudentsInScope - regStuIds.size),
      officialAssessedStudents: offStuIds.size,
      officialUnassessedStudents: Math.max(0, totalStudentsInScope - offStuIds.size),
      completionRate:
        totalStudentsInScope > 0 ? Math.round((regStuIds.size / totalStudentsInScope) * 100) : null,
      dailyAssessedRecords,
      lessonAssessedRecords: lessonRecords.length,
      officialRecords: officialResults.length,
      scheduledLessonsTotal: scheduledLessons.length,
      scheduledLessonsAssessed,
      scheduledLessonsUnassessed,
    },
    progressionTrendChart,
    classStatusChart,
    subjectResultsChart,
    completionChart,
    supportNeeds,
    sourceRecords,
  };
}

export async function loadReportDataset(): Promise<ServiceResult<ReportDataset>> {
  return executeService(async () => {
    const [
      academicYears,
      classes,
      students,
      teachers,
      teacherRoles,
      teacherRoleGrants,
      teacherAssignments,
      teacherAssignmentHistory,
      subjects,
      criteria,
      dailyCriteria,
      timetables,
      timetableLessons,
      assessmentPeriods,
      dailyAssessments,
      lessonAssessments,
      assessmentResults,
      comments,
      auditLogs,
    ] = await Promise.all([
      db.academicYears.toArray(),
      db.classes.toArray(),
      db.students.toArray(),
      db.teachers.toArray(),
      ensureDefaultRolesInitialized(),
      db.teacherRoleGrants.toArray(),
      db.teacherAssignments.toArray(),
      db.teacherAssignmentHistory.toArray(),
      db.subjects.toArray(),
      db.criteria.toArray(),
      db.dailyCriteria.toArray(),
      db.timetables.toArray(),
      db.timetableLessons.toArray(),
      db.assessmentPeriods.toArray(),
      db.dailyAssessments.toArray(),
      db.lessonAssessments.toArray(),
      db.assessmentResults.toArray(),
      db.comments.toArray(),
      db.auditLogs.toArray(),
    ]);

    return {
      academicYears: academicYears.sort((a, b) => b.startDate.localeCompare(a.startDate)),
      classes: classes.sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi')),
      students: students.sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')),
      teachers: teachers.sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')),
      teacherRoles,
      teacherRoleGrants,
      teacherAssignments,
      teacherAssignmentHistory,
      subjects: subjects.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'vi')),
      criteria,
      dailyCriteria: dailyCriteria.sort((a, b) => a.displayOrder - b.displayOrder),
      timetables,
      timetableLessons,
      assessmentPeriods: assessmentPeriods.sort((a, b) => a.startDate.localeCompare(b.startDate)),
      dailyAssessments,
      lessonAssessments,
      assessmentResults,
      comments,
      auditLogs,
    };
  }, 'Không thể tải dữ liệu báo cáo tổng hợp.');
}
