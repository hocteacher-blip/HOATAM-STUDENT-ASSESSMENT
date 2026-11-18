import {
  AssessmentRatingLevel,
  DailyEvaluationStatus,
  type AssessmentEvidence,
  type AssessmentPeriod,
  type AssessmentResult,
  type AssessmentRule,
  type Criterion,
  type DailyAssessment,
  type DailyBehaviorCriterion,
  type LessonAssessment,
  type SchoolClass,
  type Student,
  type Subject,
} from '../types/models';
import {
  LESSON_PARTICIPATION_LABELS,
  PERIOD_TYPE_LABELS,
  RATING_LEVEL_LABELS,
  RULE_GROUP_LABELS,
} from '../utils/labels';
import { findMatchingRules } from './assessmentRuleService';

export type AiAnalysisScope = 'SUBJECT' | 'QUALITY_COMPETENCY' | 'PERIODIC_PREP';

export type StudentEvidenceScenario =
  | 'MANY_POSITIVE'
  | 'NEEDS_SUPPORT'
  | 'PROGRESSING'
  | 'INSUFFICIENT_DATA'
  | 'CONFLICTING_DATA';

export const AI_SCENARIO_LABELS: Record<StudentEvidenceScenario, string> = {
  MANY_POSITIVE: 'Nhiều bằng chứng tích cực',
  NEEDS_SUPPORT: 'Nhiều bằng chứng cần hỗ trợ',
  PROGRESSING: 'Có tiến bộ rõ rệt theo thời gian',
  INSUFFICIENT_DATA: 'Ít dữ liệu đánh giá (Chưa đủ cơ sở kết luận)',
  CONFLICTING_DATA: 'Có dấu hiệu dữ liệu chưa thống nhất / mâu thuẫn',
};

export const AI_ADVISORY_DISCLAIMER =
  'ĐÂY LÀ GỢI Ý THAM KHẢO, KHÔNG PHẢI KẾT LUẬN CHÍNH THỨC. Hệ thống không tự xác nhận hoặc thay đổi kết quả đã lưu; giáo viên phải xem, chỉnh sửa và trực tiếp xác nhận.';

export interface LocalEvidenceAnalysis {
  scope: AiAnalysisScope;
  scenario: StudentEvidenceScenario;
  evidenceCount: number;
  hasSingleIsolatedIncident: boolean;
  strengths: string[];
  supportNeeds: string[];
  dataIssues: string[];
  nextSupportSuggestions: string[];
  suggestedDraftComments: string[];
  confirmedOfficialResults: AssessmentResult[];
  matchedRules: AssessmentRule[];
  disclaimer: string;
}

export interface AnonymizedAiPayload {
  anonymizedAlias: string;
  redactedFields: string[];
  scopeLabel: string;
  gradeLevel?: number;
  subjectName?: string;
  periodLabel?: string;
  contextText: string;
  localAnalysis: LocalEvidenceAnalysis;
}

/**
 * Scrubs student identifying strings (full name, first/last tokens, DOB, studentCode, guardian info)
 * from free-text comments before sending anonymized evidence to an AI model.
 */
export function scrubStudentPii(text: string, student: Partial<Student>): string {
  if (!text) return '';
  let clean = text;
  const tokensToRedact: string[] = [
    student.fullName ?? '',
    student.studentCode ?? '',
    student.dateOfBirth ?? '',
    student.guardianName ?? '',
    student.guardianPhone ?? '',
    student.address ?? '',
  ]
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  // Also redact multi-character given-name fragments (e.g. last word of fullName) carefully
  const nameParts = (student.fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter((p) => p.length >= 2);
  if (nameParts.length >= 2) {
    tokensToRedact.push(nameParts[nameParts.length - 1]);
  }

  for (const token of tokensToRedact) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(escaped, 'gi'), '[Học sinh]');
  }
  clean = clean.replace(/(?:\+?84|0)(?:\d[\s.-]?){8,10}\d/g, '[SĐT]');
  clean = clean.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[Email]');
  return clean.trim();
}

export function analyzeStudentEvidenceLocally(params: {
  student: Student;
  schoolClass?: SchoolClass;
  scope: AiAnalysisScope;
  subject?: Subject;
  period?: AssessmentPeriod;
  lessonAssessments: LessonAssessment[];
  dailyAssessments: DailyAssessment[];
  evidenceList: AssessmentEvidence[];
  officialResults: AssessmentResult[];
  criteria: Criterion[];
  dailyCriteria: DailyBehaviorCriterion[];
  rules: AssessmentRule[];
}): LocalEvidenceAnalysis {
  const {
    student,
    schoolClass,
    scope,
    subject,
    period,
    lessonAssessments,
    dailyAssessments,
    evidenceList,
    officialResults,
    criteria,
    dailyCriteria,
    rules,
  } = params;

  const criteriaMap = new Map(criteria.map((c) => [c.id, c]));
  const dailyCriteriaMap = new Map(dailyCriteria.map((c) => [c.id, c]));

  // 1. STRICT DOMAIN ISOLATION
  // Subject scope uses ONLY LessonAssessments & Evidence for that exact subjectId.
  // Unrelated GVCN dailyAssessments are NEVER mixed into SUBJECT analysis!
  const studentLessons = lessonAssessments
    .filter((l) => l.studentId === student.id && (scope !== 'SUBJECT' || !subject || l.subjectId === subject.id))
    .sort((a, b) => a.lessonDate.localeCompare(b.lessonDate));

  const studentEvidence = evidenceList.filter((e) => {
    if (e.studentId !== student.id) return false;
    if (scope === 'SUBJECT' && subject) {
      return e.subjectId === subject.id;
    }
    if (scope === 'QUALITY_COMPETENCY') {
      return !e.subjectId;
    }
    return true;
  });

  // Daily behavior is INCLUDED ONLY in QUALITY_COMPETENCY or as a separate non-subject channel in PERIODIC_PREP.
  const studentDaily =
    scope === 'SUBJECT'
      ? []
      : dailyAssessments
          .filter(
            (d) =>
              d.studentId === student.id &&
              d.evaluationStatus !== DailyEvaluationStatus.NOT_ASSESSED &&
              d.evaluationStatus !== DailyEvaluationStatus.NO_OPPORTUNITY
          )
          .sort((a, b) => a.assessmentDate.localeCompare(b.assessmentDate));

  const confirmedOfficialResults = officialResults.filter((r) => {
    if (r.studentId !== student.id) return false;
    if (period && r.periodId !== period.id) return false;
    if (scope === 'SUBJECT' && subject) {
      return r.resultScope === 'SUBJECT' && r.subjectId === subject.id;
    }
    if (scope === 'QUALITY_COMPETENCY') {
      return r.resultScope === 'QUALITY' || r.resultScope === 'COMPETENCY';
    }
    return true;
  });

  const matchedRules = findMatchingRules({
    rules,
    academicYearId: student.academicYearId,
    gradeLevel: schoolClass?.gradeLevel,
    subjectId: scope === 'SUBJECT' ? subject?.id : undefined,
    periodType: period?.periodType,
    ruleGroup:
      scope === 'SUBJECT'
        ? 'SUBJECT'
        : scope === 'QUALITY_COMPETENCY'
          ? 'QUALITY_COMPETENCY'
          : undefined,
  });

  const strengthsSet = new Map<string, number>();
  const supportNeedsList: string[] = [];
  const dataIssues: string[] = [];

  let positiveEvents = 0;
  let supportEvents = 0;

  // Analyze Lesson Evidence (for SUBJECT & PERIODIC_PREP)
  for (const l of studentLessons) {
    const isPositive =
      l.ratingLevel === AssessmentRatingLevel.HTT ||
      l.ratingLevel === AssessmentRatingLevel.HT ||
      l.participationLevel === 'ACTIVE';
    const isChtOrLow =
      l.ratingLevel === AssessmentRatingLevel.CHT || l.participationLevel === 'LOW';

    if (l.ratingLevel === AssessmentRatingLevel.HTT || l.participationLevel === 'ACTIVE') {
      positiveEvents += 1;
    }
    if (isChtOrLow || Boolean(l.difficulties?.trim())) {
      supportEvents += 1;
    }

    const cIds =
      l.criterionIds && l.criterionIds.length > 0
        ? l.criterionIds
        : l.criterionId
          ? [l.criterionId]
          : [];
    for (const cid of cIds) {
      const label = criteriaMap.get(cid)?.name;
      if (label) strengthsSet.set(label, (strengthsSet.get(label) ?? 0) + 1);
    }
    if (cIds.length === 0 && l.criterionLabelsSnapshot) {
      for (const lbl of l.criterionLabelsSnapshot) {
        strengthsSet.set(lbl, (strengthsSet.get(lbl) ?? 0) + 1);
      }
    }
    if (l.knowledgeAndSkills?.trim() && isPositive) {
      const cleanSkill = scrubStudentPii(l.knowledgeAndSkills, student);
      if (cleanSkill) strengthsSet.set(cleanSkill, (strengthsSet.get(cleanSkill) ?? 0) + 1);
    }
    if (l.learningProduct?.trim()) {
      const cleanProd = scrubStudentPii(l.learningProduct, student);
      if (cleanProd) strengthsSet.set(`Sản phẩm: ${cleanProd}`, (strengthsSet.get(`Sản phẩm: ${cleanProd}`) ?? 0) + 1);
    }
    if (l.difficulties?.trim()) {
      supportNeedsList.push(`${l.lessonDate} (${l.lessonTopic}): ${scrubStudentPii(l.difficulties, student)}`);
    } else if (isChtOrLow) {
      supportNeedsList.push(
        `${l.lessonDate} (${l.lessonTopic}): Mức ${RATING_LEVEL_LABELS[l.ratingLevel]}${
          l.participationLevel ? ` · ${LESSON_PARTICIPATION_LABELS[l.participationLevel]}` : ''
        }`
      );
    }
  }

  // Analyze Daily Homeroom Evidence ONLY for QUALITY_COMPETENCY or separate channel in PERIODIC_PREP
  for (const d of studentDaily) {
    let hasDailyPositive = false;
    let hasDailySupport = false;
    for (const cid of d.criterionIds ?? []) {
      const crit = dailyCriteriaMap.get(cid);
      if (crit?.group === 'POSITIVE') {
        hasDailyPositive = true;
        strengthsSet.set(crit.name, (strengthsSet.get(crit.name) ?? 0) + 1);
      } else if (crit?.group === 'NEEDS_SUPPORT') {
        hasDailySupport = true;
        supportNeedsList.push(`${d.assessmentDate} (Nề nếp GVCN): ${crit.name}`);
      }
    }
    if (d.ratingLevel === AssessmentRatingLevel.T || d.ratingLevel === AssessmentRatingLevel.HTT) {
      hasDailyPositive = true;
    }
    if (d.ratingLevel === AssessmentRatingLevel.CCG || d.ratingLevel === AssessmentRatingLevel.CHT) {
      hasDailySupport = true;
      supportNeedsList.push(`${d.assessmentDate} (Rèn luyện GVCN): ${RATING_LEVEL_LABELS[d.ratingLevel]}`);
    }
    if (hasDailyPositive) positiveEvents += 1;
    if (hasDailySupport) supportEvents += 1;
  }

  const totalEvidenceCount = studentLessons.length + studentDaily.length + studentEvidence.length;

  // 2. DETECT PROGRESSION (earlier support/CHT -> later HT/HTT/active)
  let isProgressing = false;
  if (studentLessons.length >= 2) {
    const mid = Math.floor(studentLessons.length / 2);
    const early = studentLessons.slice(0, mid);
    const recent = studentLessons.slice(mid);
    const earlyIssues = early.filter(
      (l) =>
        l.ratingLevel === AssessmentRatingLevel.CHT ||
        l.participationLevel === 'LOW' ||
        Boolean(l.difficulties?.trim())
    ).length;
    const recentStrong = recent.filter(
      (l) =>
        (l.ratingLevel === AssessmentRatingLevel.HTT || l.ratingLevel === AssessmentRatingLevel.HT) &&
        l.participationLevel !== 'LOW' &&
        !l.difficulties?.trim()
    ).length;
    if (earlyIssues > 0 && recentStrong === recent.length) {
      isProgressing = true;
    }
  } else if (studentDaily.length >= 2 && scope === 'QUALITY_COMPETENCY') {
    const mid = Math.floor(studentDaily.length / 2);
    const early = studentDaily.slice(0, mid);
    const recent = studentDaily.slice(mid);
    const earlyHasSupport = early.some((d) =>
      (d.criterionIds ?? []).some((id) => dailyCriteriaMap.get(id)?.group === 'NEEDS_SUPPORT')
    );
    const recentOnlyPositive = recent.every(
      (d) => !(d.criterionIds ?? []).some((id) => dailyCriteriaMap.get(id)?.group === 'NEEDS_SUPPORT')
    );
    if (earlyHasSupport && recentOnlyPositive) {
      isProgressing = true;
    }
  }

  // 3. DETECT DATA GAPS & CONFLICTS
  if (totalEvidenceCount < 2) {
    dataIssues.push(
      `Dữ liệu bằng chứng trong phạm vi hiện tại còn ít (${totalEvidenceCount} ghi nhận). Hệ thống không suy diễn kết luận khi thiếu bằng chứng.`
    );
  }

  // Conflict check 1: Single lesson or same-period records contain both HTT and CHT without progressive shift, OR HTT with unresolved difficulty note
  const hasHttLesson = studentLessons.some((l) => l.ratingLevel === AssessmentRatingLevel.HTT);
  const hasChtLesson = studentLessons.some((l) => l.ratingLevel === AssessmentRatingLevel.CHT);
  if (hasHttLesson && hasChtLesson && !isProgressing) {
    dataIssues.push(
      'Có mâu thuẫn trong đánh giá quá trình theo tiết: cùng giai đoạn ghi nhận cả mức Hoàn thành tốt (T) và Chưa hoàn thành (C) nhưng chưa rõ xu hướng chuyển biến.'
    );
  }

  for (const l of studentLessons) {
    if (l.ratingLevel === AssessmentRatingLevel.HTT && l.difficulties?.trim()) {
      dataIssues.push(
        `Tiết ngày ${l.lessonDate} (${l.lessonTopic}) xếp mức Hoàn thành tốt (T) nhưng vẫn ghi nhận khó khăn "${scrubStudentPii(l.difficulties, student)}".`
      );
    }
    if (l.score !== undefined && l.score >= 8 && l.ratingLevel === AssessmentRatingLevel.CHT) {
      dataIssues.push(
        `Tiết ngày ${l.lessonDate} ghi nhận điểm luyện tập cao (${l.score}) nhưng xếp mức Chưa hoàn thành (C).`
      );
    }
  }

  // Conflict check 2: Official result vs formative observations or numericScore vs ratingLevel
  for (const res of confirmedOfficialResults) {
    if (res.numericScore !== undefined && res.numericScore >= 8 && res.ratingLevel === AssessmentRatingLevel.CHT) {
      dataIssues.push(
        `Kết quả định kỳ đã lưu có điểm ${res.numericScore} nhưng mức xếp loại là Chưa hoàn thành (C). Giáo viên cần rà soát lại.`
      );
    }
    if (
      res.resultScope === 'SUBJECT' &&
      res.ratingLevel === AssessmentRatingLevel.HTT &&
      studentLessons.length >= 2 &&
      studentLessons.filter((l) => l.ratingLevel === AssessmentRatingLevel.CHT).length >= 2
    ) {
      dataIssues.push(
        'Kết quả định kỳ môn đang ghi nhận Hoàn thành tốt (T) trong khi có nhiều tiết học ghi nhận Chưa hoàn thành (C).'
      );
    }
    if (
      res.resultScope === 'SUBJECT' &&
      res.ratingLevel === AssessmentRatingLevel.CHT &&
      positiveEvents >= 3 &&
      supportEvents === 0
    ) {
      dataIssues.push(
        'Kết quả định kỳ môn đang ở mức Chưa hoàn thành (C) dù các bằng chứng tiết học đều tích cực.'
      );
    }
  }

  // Conflict check 3: Daily habit record with BOTH positive and needs_support or contradiction across consecutive days
  if (scope !== 'SUBJECT' && studentDaily.length > 0) {
    for (const d of studentDaily) {
      const groups = new Set((d.criterionIds ?? []).map((id) => dailyCriteriaMap.get(id)?.group).filter(Boolean));
      if (groups.has('POSITIVE') && groups.has('NEEDS_SUPPORT') && !d.comment.trim()) {
        dataIssues.push(
          `Ngày ${d.assessmentDate} có cả tiêu chí tích cực và tiêu chí cần hỗ trợ nhưng chưa có nhận xét giải thích rõ ngữ cảnh.`
        );
      }
    }
  }

  // Single isolated negative incident protection
  const hasSingleIsolatedIncident = supportEvents === 1 && positiveEvents >= 2;
  if (hasSingleIsolatedIncident) {
    dataIssues.push(
      'Chỉ ghi nhận 1 sự kiện cần hỗ trợ đơn lẻ giữa nhiều biểu hiện tích cực; không đánh giá học sinh yếu kém chỉ từ một sự kiện.'
    );
  }

  // 4. CLASSIFY SCENARIO
  let scenario: StudentEvidenceScenario;
  const hasGenuineConflict = dataIssues.some(
    (msg) =>
      msg.includes('mâu thuẫn') ||
      msg.includes('nhưng mức') ||
      msg.includes('nhưng vẫn ghi nhận') ||
      msg.includes('đều tích cực')
  );

  if (totalEvidenceCount < 2) {
    scenario = 'INSUFFICIENT_DATA';
  } else if (hasGenuineConflict) {
    scenario = 'CONFLICTING_DATA';
  } else if (isProgressing) {
    scenario = 'PROGRESSING';
  } else if (supportEvents >= 2 && supportEvents >= positiveEvents) {
    scenario = 'NEEDS_SUPPORT';
  } else {
    scenario = 'MANY_POSITIVE';
  }

  const strengths = Array.from(strengthsSet.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => `${label} (${count} lần ghi nhận)`);

  // 5. SUGGEST NEXT SUPPORT STEPS & AGE-APPROPRIATE DRAFT COMMENTS
  const nextSupportSuggestions: string[] = [];
  const suggestedDraftComments: string[] = [];

  if (scenario === 'INSUFFICIENT_DATA') {
    nextSupportSuggestions.push(
      'Bổ sung thêm ít nhất 2–3 lần quan sát hoặc sản phẩm thực hành trước khi tổng hợp nhận xét định kỳ.'
    );
    suggestedDraftComments.push(
      'Chưa đủ bằng chứng để đề xuất nhận xét tổng hợp. Giáo viên cần bổ sung ghi nhận quá trình học tập của học sinh.'
    );
  } else if (scenario === 'CONFLICTING_DATA') {
    nextSupportSuggestions.push(
      'Đối chiếu lại điểm kiểm tra, sản phẩm học tập và nhận xét theo từng tiết để làm rõ nguyên nhân chênh lệch.'
    );
    nextSupportSuggestions.push(
      'Trao đổi trực tiếp với học sinh trong tiết luyện tập tiếp theo trước khi chốt mức đánh giá định kỳ.'
    );
    suggestedDraftComments.push(
      'Học sinh có năng lực thực hiện nhiệm vụ ở một số nội dung nhưng kết quả thể hiện chưa đồng đều; cần rà soát và khích lệ để giữ vững phong độ.'
    );
  } else if (scenario === 'PROGRESSING') {
    nextSupportSuggestions.push(
      'Tiếp tục ghi nhận và động viên kịp thời những tiến bộ ở các tiết học gần đây để duy trì động lực học tập.'
    );
    suggestedDraftComments.push(
      'Có tiến bộ rõ rệt qua từng tuần học, bước đầu khắc phục được lúng túng ban đầu và tích cực hơn khi thực hành nhiệm vụ.'
    );
    suggestedDraftComments.push(
      'Đáng khen ngợi tinh thần cố gắng; em đã hoàn thành bài tốt hơn trước, tiếp tục phát huy sự tự tin trong các tiết tới.'
    );
  } else if (scenario === 'NEEDS_SUPPORT') {
    nextSupportSuggestions.push(
      'Chia nhỏ nhiệm vụ học tập trong giờ thực hành và hướng dẫn trực tiếp từng bước đối với nội dung học sinh còn vướng.'
    );
    nextSupportSuggestions.push(
      'Phối hợp nhẹ nhàng với gia đình để tạo thói quen ôn tập ngắn hằng ngày tại nhà.'
    );
    suggestedDraftComments.push(
      'Em có cố gắng tham gia các hoạt động chung nhưng một số kỹ năng cơ bản cần được hướng dẫn thêm từng bước để tự tin hơn.'
    );
    suggestedDraftComments.push(
      'Cần được cô/thầy kèm cặp thêm ở phần thực hành và rèn thói quen hoàn thành từng phần nhiệm vụ nhỏ trong giờ học.'
    );
  } else {
    nextSupportSuggestions.push(
      'Khuyến khích học sinh phát huy thế mạnh, thử sức với nhiệm vụ mở rộng hoặc hỗ trợ bạn cùng nhóm.'
    );
    suggestedDraftComments.push(
      'Tích cực tham gia các hoạt động học tập, tiếp thu bài chắc chắn và thể hiện tốt các yêu cầu cần đạt phù hợp lứa tuổi.'
    );
    suggestedDraftComments.push(
      'Chăm chỉ, chủ động hoàn thành nhiệm vụ học tập và có sản phẩm thực hành rõ ràng, sáng tạo.'
    );
  }

  return {
    scope,
    scenario,
    evidenceCount: totalEvidenceCount,
    hasSingleIsolatedIncident,
    strengths,
    supportNeeds: supportNeedsList.slice(0, 6),
    dataIssues,
    nextSupportSuggestions,
    suggestedDraftComments,
    confirmedOfficialResults,
    matchedRules,
    disclaimer: AI_ADVISORY_DISCLAIMER,
  };
}

/**
 * Builds a strictly anonymized text payload for the server-side Gemini proxy.
 * NEVER includes student fullName, dateOfBirth, studentCode, guardianName, guardianPhone, or address.
 */
export function buildAnonymizedAiPayload(params: {
  student: Student;
  schoolClass?: SchoolClass;
  scope: AiAnalysisScope;
  subject?: Subject;
  period?: AssessmentPeriod;
  lessonAssessments: LessonAssessment[];
  dailyAssessments: DailyAssessment[];
  evidenceList: AssessmentEvidence[];
  officialResults: AssessmentResult[];
  criteria: Criterion[];
  dailyCriteria: DailyBehaviorCriterion[];
  rules: AssessmentRule[];
}): AnonymizedAiPayload {
  const localAnalysis = analyzeStudentEvidenceLocally(params);
  const { student, schoolClass, scope, subject, period, lessonAssessments, dailyAssessments } = params;

  const scopeLabel =
    scope === 'SUBJECT'
      ? `Đánh giá môn học: ${subject?.name ?? 'Chưa chọn môn'}`
      : scope === 'QUALITY_COMPETENCY'
        ? 'Phẩm chất & Năng lực chung (Chủ nhiệm)'
        : 'Chuẩn bị nhận xét tổng hợp định kỳ';

  const anonymizedAlias = 'Học sinh #HS-ẨN-DANH';
  const redactedFields = ['Họ và tên', 'Ngày sinh', 'Mã học sinh', 'Thông tin phụ huynh & Địa chỉ'];

  const lines: string[] = [
    `Đối tượng: ${anonymizedAlias}`,
    `Khối lớp: ${schoolClass ? `Khối ${schoolClass.gradeLevel}` : 'Tiểu học'}`,
    `Phạm vi phân tích: ${scopeLabel}`,
  ];
  if (period) {
    lines.push(`Đợt đánh giá: ${period.name} (${PERIOD_TYPE_LABELS[period.periodType]})`);
  }
  lines.push(`Tổng số bằng chứng trong phạm vi: ${localAnalysis.evidenceCount}`);
  lines.push(`Phân loại tình huống dữ liệu: ${AI_SCENARIO_LABELS[localAnalysis.scenario]}`);

  if (localAnalysis.matchedRules.length > 0) {
    lines.push('\nBộ quy tắc cấu hình đang áp dụng (chỉ tham khảo):');
    for (const rule of localAnalysis.matchedRules.slice(0, 2)) {
      lines.push(
        `- ${rule.name} [${RULE_GROUP_LABELS[rule.ruleGroup ?? 'SUBJECT']}] · Văn bản: ${rule.circularReference}. Yêu cầu bằng chứng: ${rule.evidenceRequirements || rule.description}`
      );
    }
  }

  // Scoped Lesson observations (scrubbed of PII)
  const scopedLessons = lessonAssessments
    .filter((l) => l.studentId === student.id && (scope !== 'SUBJECT' || !subject || l.subjectId === subject.id))
    .sort((a, b) => a.lessonDate.localeCompare(b.lessonDate))
    .slice(-10);

  if (scopedLessons.length > 0) {
    lines.push('\nLịch sử đánh giá theo tiết học (đã ẩn danh):');
    for (const l of scopedLessons) {
      const parts = [
        `${l.lessonDate}`,
        `Bài: ${l.lessonTopic}`,
        `Mức: ${RATING_LEVEL_LABELS[l.ratingLevel]}`,
        l.participationLevel ? `Tham gia: ${LESSON_PARTICIPATION_LABELS[l.participationLevel]}` : '',
        l.criterionLabelsSnapshot?.length ? `Tiêu chí: ${l.criterionLabelsSnapshot.join(', ')}` : '',
        l.learningProduct ? `SP: ${scrubStudentPii(l.learningProduct, student)}` : '',
        l.difficulties ? `Khó khăn: ${scrubStudentPii(l.difficulties, student)}` : '',
        l.comment ? `Ghi chú: ${scrubStudentPii(l.comment, student)}` : '',
      ].filter(Boolean);
      lines.push(`- ${parts.join(' | ')}`);
    }
  }

  // Strictly exclude GVCN daily behavior notes when scope === 'SUBJECT'
  if (scope !== 'SUBJECT') {
    const scopedDaily = dailyAssessments
      .filter(
        (d) =>
          d.studentId === student.id &&
          d.evaluationStatus !== DailyEvaluationStatus.NOT_ASSESSED &&
          d.evaluationStatus !== DailyEvaluationStatus.NO_OPPORTUNITY
      )
      .sort((a, b) => a.assessmentDate.localeCompare(b.assessmentDate))
      .slice(-10);

    if (scopedDaily.length > 0) {
      lines.push('\nGhi nhận rèn luyện & nề nếp hằng ngày (kênh chủ nhiệm riêng, không gộp vào kết quả môn học):');
      for (const d of scopedDaily) {
        const crLabels = d.criterionLabelsSnapshot?.join(', ') || '';
        const cleanComment = d.comment ? scrubStudentPii(d.comment, student) : '';
        lines.push(`- ${d.assessmentDate}: ${[crLabels, cleanComment].filter(Boolean).join(' · ') || 'Đã quan sát'}`);
      }
    }
  }

  if (localAnalysis.dataIssues.length > 0) {
    lines.push('\nCảnh báo dữ liệu thiếu / mâu thuẫn phát hiện cục bộ:');
    for (const issue of localAnalysis.dataIssues) {
      lines.push(`- ${issue}`);
    }
  }

  return {
    anonymizedAlias,
    redactedFields,
    scopeLabel,
    gradeLevel: schoolClass?.gradeLevel,
    subjectName: subject?.name,
    periodLabel: period?.name,
    contextText: lines.join('\n'),
    localAnalysis,
  };
}
