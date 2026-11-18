import {
  AcademicYearStatus,
  AssessmentPeriodType,
  AssessmentRatingLevel,
  CriteriaCategory,
  DailyEvaluationStatus,
  DayOfWeek,
  StudentGender,
  StudentStatus,
  SubjectAssessmentMode,
  TeacherAssignmentStatus,
  TeacherStatus,
  type AssessmentRuleEvidenceType,
  type AssessmentRuleGroup,
  type DailyCriterionGroup,
  type LessonParticipationLevel,
  type LessonWorkflowStatus,
} from '../types/models';

export const ACADEMIC_YEAR_STATUS_LABELS: Record<AcademicYearStatus, string> = {
  [AcademicYearStatus.PLANNING]: 'Đang lập kế hoạch',
  [AcademicYearStatus.ACTIVE]: 'Đang sử dụng',
  [AcademicYearStatus.ARCHIVED]: 'Đã kết thúc',
};

export const TEACHER_STATUS_LABELS: Record<TeacherStatus, string> = {
  [TeacherStatus.ACTIVE]: 'Đang công tác',
  [TeacherStatus.ON_LEAVE]: 'Đang nghỉ phép',
  [TeacherStatus.INACTIVE]: 'Ngừng công tác',
};

export const TEACHER_ASSIGNMENT_STATUS_LABELS: Record<TeacherAssignmentStatus, string> = {
  [TeacherAssignmentStatus.ACTIVE]: 'Đang đảm nhiệm',
  [TeacherAssignmentStatus.COMPLETED]: 'Đã kết thúc',
  [TeacherAssignmentStatus.TRANSFERRED]: 'Đã chuyển giao',
  [TeacherAssignmentStatus.PAUSED]: 'Tạm dừng',
};

export const ASSIGNMENT_ACTION_LABELS: Record<
  'ASSIGNED' | 'ADJUSTED' | 'ENDED' | 'TRANSFERRED',
  string
> = {
  ASSIGNED: 'Phân công mới',
  ADJUSTED: 'Điều chỉnh phân công',
  ENDED: 'Kết thúc nhiệm vụ',
  TRANSFERRED: 'Chuyển giao nhiệm vụ',
};

export const STUDENT_GENDER_LABELS: Record<StudentGender, string> = {
  [StudentGender.MALE]: 'Nam',
  [StudentGender.FEMALE]: 'Nữ',
  [StudentGender.OTHER]: 'Không phân loại',
};

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  [StudentStatus.STUDYING]: 'Đang học',
  [StudentStatus.TRANSFERRED_CLASS]: 'Chuyển lớp',
  [StudentStatus.TRANSFERRED]: 'Chuyển trường',
  [StudentStatus.DROPPED_OUT]: 'Nghỉ học',
  [StudentStatus.PAUSED]: 'Tạm nghỉ',
};

export const SUBJECT_MODE_LABELS: Record<SubjectAssessmentMode, string> = {
  [SubjectAssessmentMode.COMMENT_ONLY]: 'Đánh giá bằng nhận xét',
  [SubjectAssessmentMode.COMMENT_AND_SCORE]: 'Nhận xét kết hợp điểm số',
};

export const CRITERIA_CATEGORY_LABELS: Record<CriteriaCategory, string> = {
  [CriteriaCategory.SUBJECT_COMPETENCY]: 'Năng lực môn học',
  [CriteriaCategory.GENERAL_COMPETENCY]: 'Năng lực chung',
  [CriteriaCategory.QUALITY]: 'Phẩm chất chủ yếu',
  [CriteriaCategory.DAILY_HABIT]: 'Nề nếp hằng ngày',
};

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  [DayOfWeek.MON]: 'Thứ Hai',
  [DayOfWeek.TUE]: 'Thứ Ba',
  [DayOfWeek.WED]: 'Thứ Tư',
  [DayOfWeek.THU]: 'Thứ Năm',
  [DayOfWeek.FRI]: 'Thứ Sáu',
  [DayOfWeek.SAT]: 'Thứ Bảy',
};

export const PERIOD_TYPE_LABELS: Record<AssessmentPeriodType, string> = {
  [AssessmentPeriodType.MID_TERM_1]: 'Giữa học kỳ I',
  [AssessmentPeriodType.END_TERM_1]: 'Cuối học kỳ I',
  [AssessmentPeriodType.MID_TERM_2]: 'Giữa học kỳ II',
  [AssessmentPeriodType.END_TERM_2]: 'Cuối học kỳ II',
  [AssessmentPeriodType.END_YEAR]: 'Cuối năm học',
};

export const RATING_LEVEL_LABELS: Record<AssessmentRatingLevel, string> = {
  [AssessmentRatingLevel.HTT]: 'T: Hoàn thành tốt (HTT)',
  [AssessmentRatingLevel.HT]: 'H: Hoàn thành (HT)',
  [AssessmentRatingLevel.CHT]: 'C: Chưa hoàn thành (CHT)',
  [AssessmentRatingLevel.T]: 'T: Tốt',
  [AssessmentRatingLevel.D]: 'Đ: Đạt',
  [AssessmentRatingLevel.CCG]: 'C: Cần cố gắng (CCG)',
};

export const SUBJECT_RATING_OPTIONS: Array<{ value: AssessmentRatingLevel; label: string }> = [
  { value: AssessmentRatingLevel.HTT, label: 'T: Hoàn thành tốt' },
  { value: AssessmentRatingLevel.HT, label: 'H: Hoàn thành' },
  { value: AssessmentRatingLevel.CHT, label: 'C: Chưa hoàn thành' },
];

export const QUALITY_COMPETENCY_RATING_OPTIONS: Array<{ value: AssessmentRatingLevel; label: string }> = [
  { value: AssessmentRatingLevel.T, label: 'T: Tốt' },
  { value: AssessmentRatingLevel.D, label: 'Đ: Đạt' },
  { value: AssessmentRatingLevel.CCG, label: 'C: Cần cố gắng' },
];

export function getRatingOptionsForScope(
  scope: 'SUBJECT' | 'QUALITY' | 'COMPETENCY' | 'OVERALL'
): Array<{ value: AssessmentRatingLevel; label: string }> {
  if (scope === 'QUALITY' || scope === 'COMPETENCY') {
    return QUALITY_COMPETENCY_RATING_OPTIONS;
  }
  return SUBJECT_RATING_OPTIONS;
}

export const RULE_GROUP_LABELS: Record<AssessmentRuleGroup, string> = {
  SUBJECT: 'Môn học & Hoạt động giáo dục (T / H / C)',
  QUALITY_COMPETENCY: 'Phẩm chất & Năng lực (T / Đ / C)',
  OVERALL: 'Tổng hợp kết quả định kỳ / cuối năm',
};

export const RULE_EVIDENCE_TYPE_LABELS: Record<AssessmentRuleEvidenceType, string> = {
  LESSON_OBSERVATION: 'Đánh giá thường xuyên theo tiết học',
  LEARNING_PRODUCT: 'Sản phẩm học tập / Bài thực hành',
  PERIODIC_TEST: 'Bài kiểm tra định kỳ (nếu có điểm)',
  DAILY_HABIT: 'Quan sát nề nếp, phẩm chất, năng lực hằng ngày',
  PORTFOLIO: 'Hồ sơ minh chứng học tập / Phiếu nhận xét',
};

export const DAILY_EVALUATION_STATUS_LABELS: Record<DailyEvaluationStatus, string> = {
  [DailyEvaluationStatus.NOT_ASSESSED]: 'Chưa đánh giá',
  [DailyEvaluationStatus.ASSESSED]: 'Đã đánh giá',
  [DailyEvaluationStatus.NO_OPPORTUNITY]: 'Chưa có cơ hội quan sát',
  [DailyEvaluationStatus.NO_NOTABLE_BEHAVIOR]: 'Không có biểu hiện nổi bật',
};

export const DAILY_CRITERION_GROUP_LABELS: Record<DailyCriterionGroup, string> = {
  POSITIVE: 'Nhóm tích cực',
  NEEDS_SUPPORT: 'Nhóm cần hỗ trợ',
};

export const LESSON_WORKFLOW_STATUS_LABELS: Record<LessonWorkflowStatus, string> = {
  UPCOMING: 'Chưa đến giờ',
  NOT_ASSESSED: 'Chưa đánh giá',
  IN_PROGRESS: 'Đang đánh giá',
  SAVED: 'Đã lưu',
  COMPLETED: 'Đã hoàn thành',
};

export const LESSON_PARTICIPATION_LABELS: Record<LessonParticipationLevel, string> = {
  ACTIVE: 'Tích cực tham gia',
  MODERATE: 'Tham gia bình thường',
  LOW: 'Ít tham gia / Cần khích lệ',
};

export function formatDateTimeVi(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

export const LABEL_CLASS = 'block text-xs font-medium text-slate-700 mb-1.5 dark:text-slate-300';
