import { db } from '../db/database';
import {
  AssessmentPeriodType,
  AssessmentRatingLevel,
  type AssessmentEvidence,
  type AssessmentRule,
  type AssessmentRuleCommentTemplate,
  type AssessmentRuleEvidenceType,
  type AssessmentRuleGroup,
  type AssessmentRuleLevelCriterion,
  type DailyAssessment,
  type LessonAssessment,
  type ServiceResult,
} from '../types/models';
import {
  QUALITY_COMPETENCY_RATING_OPTIONS,
  RATING_LEVEL_LABELS,
  RULE_EVIDENCE_TYPE_LABELS,
  SUBJECT_RATING_OPTIONS,
} from '../utils/labels';
import { createBaseFields, executeService, recordAuditLog } from './baseRepository';

export function getDefaultLevelCriteriaForGroup(
  ruleGroup: AssessmentRuleGroup
): AssessmentRuleLevelCriterion[] {
  if (ruleGroup === 'QUALITY_COMPETENCY') {
    return [
      {
        ratingLevel: AssessmentRatingLevel.T,
        conditionSummary:
          'Đáp ứng tốt yêu cầu cần đạt về phẩm chất/năng lực; có nhiều biểu hiện tích cực ổn định trong học tập và sinh hoạt hằng ngày.',
        requiresRegularProgress: true,
        requiredEvidenceTypes: ['DAILY_HABIT', 'PORTFOLIO'],
      },
      {
        ratingLevel: AssessmentRatingLevel.D,
        conditionSummary:
          'Đáp ứng yêu cầu cơ bản theo lứa tuổi; thực hiện được các nhiệm vụ được giao và có sự hợp tác cùng thầy cô, bạn bè.',
        requiresRegularProgress: true,
        requiredEvidenceTypes: ['DAILY_HABIT'],
      },
      {
        ratingLevel: AssessmentRatingLevel.CCG,
        conditionSummary:
          'Còn nhiều nội dung chưa ổn định cần được nhắc nhở, rèn luyện thêm; không đánh giá mức này chỉ từ một sự kiện đơn lẻ.',
        requiresRegularProgress: true,
        requiredEvidenceTypes: ['DAILY_HABIT', 'PORTFOLIO'],
      },
    ];
  }

  return [
    {
      ratingLevel: AssessmentRatingLevel.HTT,
      conditionSummary:
        'Thực hiện tốt các yêu cầu cần đạt của môn học, tích cực vận dụng vào thực hành và có sản phẩm/bằng chứng quá trình rõ nét.',
      minScore: 9,
      requiresRegularProgress: true,
      requiredEvidenceTypes: ['LESSON_OBSERVATION', 'LEARNING_PRODUCT', 'PERIODIC_TEST'],
    },
    {
      ratingLevel: AssessmentRatingLevel.HT,
      conditionSummary:
        'Thực hiện được các yêu cầu cần đạt của môn học ở mức cơ bản; tham gia nhiệm vụ học tập đầy đủ, cần rèn thêm độ chính xác nếu có.',
      minScore: 5,
      maxScore: 8.5,
      requiresRegularProgress: true,
      requiredEvidenceTypes: ['LESSON_OBSERVATION', 'PERIODIC_TEST'],
    },
    {
      ratingLevel: AssessmentRatingLevel.CHT,
      conditionSummary:
        'Chưa đạt một số yêu cầu cần đạt cơ bản sau quá trình theo dõi nhiều tiết học; cần kế hoạch hướng dẫn bổ sung cụ thể.',
      maxScore: 4.5,
      requiresRegularProgress: true,
      requiredEvidenceTypes: ['LESSON_OBSERVATION', 'PERIODIC_TEST'],
    },
  ];
}

export function getValidRatingsForRuleGroup(
  ruleGroup: AssessmentRuleGroup
): Array<{ value: AssessmentRatingLevel; label: string }> {
  if (ruleGroup === 'QUALITY_COMPETENCY') {
    return QUALITY_COMPETENCY_RATING_OPTIONS;
  }
  return SUBJECT_RATING_OPTIONS;
}

export function isRatingAllowedForScope(
  rating: AssessmentRatingLevel,
  scope: 'SUBJECT' | 'QUALITY' | 'COMPETENCY' | 'OVERALL'
): boolean {
  const allowed =
    scope === 'QUALITY' || scope === 'COMPETENCY'
      ? QUALITY_COMPETENCY_RATING_OPTIONS
      : SUBJECT_RATING_OPTIONS;
  return allowed.some((opt) => opt.value === rating);
}

export function findMatchingRules(params: {
  rules: AssessmentRule[];
  academicYearId?: string;
  gradeLevel?: number;
  subjectId?: string;
  periodType?: AssessmentPeriodType;
  ruleGroup?: AssessmentRuleGroup;
}): AssessmentRule[] {
  const { rules, academicYearId, gradeLevel, subjectId, periodType, ruleGroup } = params;

  const matched = rules.filter((rule) => {
    if (!rule.isActive) return false;
    if (ruleGroup && (rule.ruleGroup ?? 'SUBJECT') !== ruleGroup) return false;
    if (academicYearId && rule.academicYearId && rule.academicYearId !== academicYearId) {
      return false;
    }
    if (gradeLevel && rule.gradeLevels && rule.gradeLevels.length > 0 && !rule.gradeLevels.includes(gradeLevel)) {
      return false;
    }
    if (subjectId && rule.subjectId && rule.subjectId !== subjectId) {
      return false;
    }
    if (!subjectId && rule.subjectId && ruleGroup === 'QUALITY_COMPETENCY') {
      return false;
    }
    if (periodType && rule.periodType && rule.periodType !== periodType) {
      return false;
    }
    return true;
  });

  // Prioritize more specific rules (matching subjectId > periodType > gradeLevels > academicYearId)
  return matched.sort((a, b) => {
    const scoreSpecificity = (r: AssessmentRule): number =>
      (r.subjectId ? 8 : 0) +
      (r.periodType ? 4 : 0) +
      (r.gradeLevels && r.gradeLevels.length > 0 ? 2 : 0) +
      (r.academicYearId ? 1 : 0);
    return scoreSpecificity(b) - scoreSpecificity(a) || a.name.localeCompare(b.name, 'vi');
  });
}

export interface RuleEvidenceChecklistItem {
  evidenceType: AssessmentRuleEvidenceType;
  label: string;
  availableCount: number;
  satisfied: boolean;
}

export interface RuleEvaluationAdvisory {
  matchedRule: AssessmentRule | null;
  availableEvidenceTypes: AssessmentRuleEvidenceType[];
  checklist: RuleEvidenceChecklistItem[];
  scoreGuidanceNote?: string;
  qualitativeReminder: string;
  suggestedTemplates: AssessmentRuleCommentTemplate[];
  advisoryDisclaimer: string;
}

export function evaluateEvidenceAgainstRules(params: {
  rules: AssessmentRule[];
  scope: 'SUBJECT' | 'QUALITY' | 'COMPETENCY' | 'OVERALL';
  academicYearId?: string;
  gradeLevel?: number;
  subjectId?: string;
  periodType?: AssessmentPeriodType;
  lessonAssessments: LessonAssessment[];
  dailyAssessments: DailyAssessment[];
  evidenceList: AssessmentEvidence[];
  periodicScore?: number;
}): RuleEvaluationAdvisory {
  const {
    rules,
    scope,
    academicYearId,
    gradeLevel,
    subjectId,
    periodType,
    lessonAssessments,
    dailyAssessments,
    evidenceList,
    periodicScore,
  } = params;

  const targetGroup: AssessmentRuleGroup =
    scope === 'QUALITY' || scope === 'COMPETENCY'
      ? 'QUALITY_COMPETENCY'
      : scope === 'OVERALL'
        ? 'OVERALL'
        : 'SUBJECT';

  let candidates = findMatchingRules({
    rules,
    academicYearId,
    gradeLevel,
    subjectId: scope === 'SUBJECT' ? subjectId : undefined,
    periodType,
    ruleGroup: targetGroup,
  });

  if (candidates.length === 0 && scope === 'OVERALL') {
    candidates = findMatchingRules({
      rules,
      academicYearId,
      gradeLevel,
      periodType,
      ruleGroup: 'SUBJECT',
    });
  }

  const matchedRule = candidates[0] ?? null;

  // Strictly isolate evidence by domain:
  // SUBJECT rules inspect ONLY subject lesson observations, subject products, subject portfolio & periodic test score.
  // GVCN dailyAssessments are NEVER used to evaluate a SUBJECT rule!
  const scopedLessonRecords =
    scope === 'SUBJECT' && subjectId
      ? lessonAssessments.filter((l) => l.subjectId === subjectId)
      : scope === 'OVERALL'
        ? lessonAssessments
        : [];

  const scopedEvidence =
    scope === 'SUBJECT' && subjectId
      ? evidenceList.filter((e) => e.subjectId === subjectId)
      : scope === 'QUALITY' || scope === 'COMPETENCY'
        ? evidenceList.filter((e) => !e.subjectId)
        : evidenceList;

  const scopedDailyRecords =
    scope === 'QUALITY' || scope === 'COMPETENCY' || scope === 'OVERALL'
      ? dailyAssessments
      : [];

  const productCount =
    scopedLessonRecords.filter((l) => Boolean(l.learningProduct?.trim())).length +
    scopedEvidence.filter((e) => e.evidenceType === 'PROJECT' || e.evidenceType === 'WORKSHEET').length;

  const evidenceCounts: Record<AssessmentRuleEvidenceType, number> = {
    LESSON_OBSERVATION: scopedLessonRecords.length,
    LEARNING_PRODUCT: productCount,
    PERIODIC_TEST: periodicScore !== undefined && !Number.isNaN(periodicScore) ? 1 : 0,
    DAILY_HABIT: scopedDailyRecords.length,
    PORTFOLIO: scopedEvidence.length,
  };

  const availableEvidenceTypes = (Object.keys(evidenceCounts) as AssessmentRuleEvidenceType[]).filter(
    (k) => evidenceCounts[k] > 0
  );

  const requiredTypes: AssessmentRuleEvidenceType[] =
    matchedRule?.requiredEvidenceTypes && matchedRule.requiredEvidenceTypes.length > 0
      ? matchedRule.requiredEvidenceTypes
      : scope === 'SUBJECT'
        ? ['LESSON_OBSERVATION', 'LEARNING_PRODUCT']
        : ['DAILY_HABIT'];

  const checklist: RuleEvidenceChecklistItem[] = requiredTypes.map((evType) => ({
    evidenceType: evType,
    label: RULE_EVIDENCE_TYPE_LABELS[evType],
    availableCount: evidenceCounts[evType],
    satisfied: evidenceCounts[evType] > 0,
  }));

  let scoreGuidanceNote: string | undefined;
  if (matchedRule && periodicScore !== undefined && !Number.isNaN(periodicScore)) {
    const minHTT = matchedRule.minScoreForHTT;
    const minHT = matchedRule.minScoreForHT;
    if (minHTT !== undefined && periodicScore >= minHTT) {
      scoreGuidanceNote = `Điểm kiểm tra định kỳ (${periodicScore}) đạt ngưỡng tham khảo mức ${RATING_LEVEL_LABELS[AssessmentRatingLevel.HTT]} (>= ${minHTT}), cần đối chiếu thêm nhận xét quá trình trước khi giáo viên xác nhận.`;
    } else if (minHT !== undefined && periodicScore >= minHT) {
      scoreGuidanceNote = `Điểm kiểm tra định kỳ (${periodicScore}) đạt ngưỡng tham khảo mức ${RATING_LEVEL_LABELS[AssessmentRatingLevel.HT]} (>= ${minHT}), giáo viên xem xét thêm sự tiến bộ thường xuyên.`;
    } else if (minHT !== undefined) {
      scoreGuidanceNote = `Điểm kiểm tra định kỳ (${periodicScore}) thấp hơn ngưỡng tham khảo (${minHT}); cần xem xét kỹ bằng chứng thực hành và lịch sử tiết học trước khi kết luận.`;
    }
  }

  return {
    matchedRule,
    availableEvidenceTypes,
    checklist,
    scoreGuidanceNote,
    qualitativeReminder:
      matchedRule?.evidenceRequirements ||
      'Đánh giá dựa trên mức độ đáp ứng yêu cầu cần đạt và bằng chứng quá trình, không quy kết chỉ từ số lần đếm tích cực/tiêu cực.',
    suggestedTemplates: matchedRule?.commentTemplates ?? [],
    advisoryDisclaimer:
      'Bộ quy tắc chỉ cung cấp căn cứ tham khảo và gợi ý bằng chứng; giáo viên là người xem xét, chỉnh sửa và xác nhận kết quả chính thức.',
  };
}

export function buildReferenceRuleTemplates(academicYearId?: string): Array<Omit<AssessmentRule, 'id' | 'createdAt' | 'updatedAt'>> {
  return [
    {
      code: 'QT-MON-NHANXET',
      name: 'Quy tắc đánh giá Môn học & HĐGD (Mức T / H / C)',
      academicYearId,
      ruleGroup: 'SUBJECT',
      gradeLevels: [1, 2, 3, 4, 5],
      circularReference: 'Thông tư 27/2020/TT-BGDĐT (có thể cập nhật theo văn bản mới)',
      versionLabel: 'Mẫu chuẩn v1.0',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      minScoreForHTT: 9,
      minScoreForHT: 5,
      evidenceRequirements:
        'Kết hợp quan sát thường xuyên theo tiết học, sản phẩm thực hành và kết quả kiểm tra định kỳ (nếu môn có chấm điểm). Không chỉ đếm số lượt khen/nhắc để xếp mức.',
      requiredEvidenceTypes: ['LESSON_OBSERVATION', 'LEARNING_PRODUCT', 'PERIODIC_TEST'],
      levelCriteria: getDefaultLevelCriteriaForGroup('SUBJECT'),
      commentTemplates: [
        {
          id: 'tpl-subj-htt',
          ratingLevel: AssessmentRatingLevel.HTT,
          title: 'Hoàn thành tốt - Nổi bật',
          templateText:
            'Hoàn thành tốt các yêu cầu cần đạt của môn học; tích cực tham gia hoạt động và vận dụng kiến thức linh hoạt vào bài thực hành.',
        },
        {
          id: 'tpl-subj-ht',
          ratingLevel: AssessmentRatingLevel.HT,
          title: 'Hoàn thành - Ổn định',
          templateText:
            'Hoàn thành các nội dung học tập theo yêu cầu; có ý thức lắng nghe và thực hành bài tập, cần rèn thêm sự tự tin khi trình bày.',
        },
        {
          id: 'tpl-subj-cht',
          ratingLevel: AssessmentRatingLevel.CHT,
          title: 'Chưa hoàn thành - Cần hỗ trợ thêm',
          templateText:
            'Bước đầu có cố gắng trong giờ học nhưng một số kỹ năng cơ bản chưa vững; giáo viên và gia đình tiếp tục đồng hành, hướng dẫn thêm.',
        },
      ],
      description:
        'Áp dụng đánh giá định kỳ các môn học và hoạt động giáo dục theo 3 mức: T (Hoàn thành tốt), H (Hoàn thành), C (Chưa hoàn thành). Có thể tùy chỉnh theo môn, khối và văn bản mới.',
      isActive: true,
    },
    {
      code: 'QT-PCNL-CHUNG',
      name: 'Quy tắc đánh giá Phẩm chất & Năng lực (Mức T / Đ / C)',
      academicYearId,
      ruleGroup: 'QUALITY_COMPETENCY',
      gradeLevels: [1, 2, 3, 4, 5],
      circularReference: 'Thông tư 27/2020/TT-BGDĐT (có thể cập nhật theo văn bản mới)',
      versionLabel: 'Mẫu chuẩn v1.0',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      evidenceRequirements:
        'Tổng hợp biểu hiện phẩm chất chủ yếu và năng lực chung qua quá trình học tập, rèn luyện và sinh hoạt lớp; tránh đánh giá từ một tình huống nhất thời.',
      requiredEvidenceTypes: ['DAILY_HABIT', 'PORTFOLIO'],
      levelCriteria: getDefaultLevelCriteriaForGroup('QUALITY_COMPETENCY'),
      commentTemplates: [
        {
          id: 'tpl-pc-t',
          ratingLevel: AssessmentRatingLevel.T,
          title: 'Phẩm chất/Năng lực - Tốt',
          templateText:
            'Chăm chỉ, trung thực, chủ động hợp tác cùng bạn bè và có tinh thần trách nhiệm cao trong các hoạt động của lớp.',
        },
        {
          id: 'tpl-pc-d',
          ratingLevel: AssessmentRatingLevel.D,
          title: 'Phẩm chất/Năng lực - Đạt',
          templateText:
            'Thực hiện nghiêm túc nội quy lớp học, lễ phép với thầy cô và biết phối hợp trong hoạt động nhóm.',
        },
        {
          id: 'tpl-pc-ccg',
          ratingLevel: AssessmentRatingLevel.CCG,
          title: 'Phẩm chất/Năng lực - Cần cố gắng',
          templateText:
            'Có tiến bộ ở một số hoạt động gần đây nhưng cần rèn thêm thói quen tập trung và chủ động trao đổi khi gặp khó khăn.',
        },
      ],
      description:
        'Áp dụng cho đánh giá phẩm chất chủ yếu và năng lực chung theo 3 mức riêng biệt: T (Tốt), Đ (Đạt), C (Cần cố gắng).',
      isActive: true,
    },
    {
      code: 'QT-TONGHOP-DINHKY',
      name: 'Quy tắc rà soát Tổng hợp kết quả giáo dục cuối kỳ',
      academicYearId,
      ruleGroup: 'OVERALL',
      gradeLevels: [1, 2, 3, 4, 5],
      periodType: AssessmentPeriodType.END_YEAR,
      circularReference: 'Thông tư 27/2020/TT-BGDĐT (tùy chỉnh theo hướng dẫn năm học)',
      versionLabel: 'Mẫu chuẩn v1.0',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      evidenceRequirements:
        'Đối chiếu đồng thời kết quả các môn học/HĐGD (T/H/C) và kết quả phẩm chất, năng lực (T/Đ/C) cuối năm học do GVCN và GVBM cùng rà soát.',
      requiredEvidenceTypes: ['LESSON_OBSERVATION', 'PERIODIC_TEST', 'DAILY_HABIT'],
      levelCriteria: getDefaultLevelCriteriaForGroup('OVERALL'),
      commentTemplates: [
        {
          id: 'tpl-ov-htt',
          ratingLevel: AssessmentRatingLevel.HTT,
          title: 'Tổng hợp cuối kỳ - Hoàn thành xuất sắc/tốt',
          templateText:
            'Hoàn thành tốt các nội dung học tập và rèn luyện trong kỳ; phát huy tốt tính tự giác và tinh thần hợp tác.',
        },
      ],
      description:
        'Hướng dẫn đối chiếu hồ sơ đánh giá cuối kỳ, bảo đảm các mức môn học và phẩm chất/năng lực được quản lý đúng quy định hiện hành.',
      isActive: true,
    },
  ];
}

export const assessmentRuleService = {
  async installReferenceRules(academicYearId?: string): Promise<ServiceResult<AssessmentRule[]>> {
    return executeService(async () => {
      const existing = await db.assessmentRules.toArray();
      const existingCodes = new Set(existing.map((r) => r.code.toLowerCase().trim()));
      const templates = buildReferenceRuleTemplates(academicYearId);
      const created: AssessmentRule[] = [];

      for (const tpl of templates) {
        if (existingCodes.has(tpl.code.toLowerCase().trim())) continue;
        const record: AssessmentRule = {
          ...createBaseFields(),
          ...tpl,
        };
        await db.assessmentRules.add(record);
        created.push(record);
      }

      if (created.length > 0) {
        await recordAuditLog(
          'CREATE',
          'assessmentRules',
          `Nạp ${created.length} bộ quy tắc đánh giá tham khảo (có thể chỉnh sửa theo văn bản hiện hành)`
        );
      }
      return created;
    }, 'Không thể nạp bộ quy tắc đánh giá tham khảo.');
  },
};
