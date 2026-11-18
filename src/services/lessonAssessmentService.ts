import { db } from '../db/database';
import {
  AssessmentRatingLevel,
  CriteriaCategory,
  type Criterion,
  type LessonAssessment,
  type LessonAssessmentEditEntry,
  type LessonParticipationLevel,
  type LessonWorkflowStatus,
  type ServiceResult,
  type TimetableLesson,
} from '../types/models';
import { LESSON_PARTICIPATION_LABELS, RATING_LEVEL_LABELS } from '../utils/labels';
import { createBaseFields, executeService, recordAuditLog } from './baseRepository';
import type { OperatorPermissions } from './teacherService';

export const ART_SAMPLE_CRITERIA_NAMES: Array<{ name: string; description: string }> = [
  {
    name: 'Biết sử dụng đường nét',
    description: 'Vận dụng đường nét cơ bản, rõ ràng và phù hợp với nội dung bài vẽ.',
  },
  {
    name: 'Biết sử dụng màu sắc',
    description: 'Phối hợp màu sắc hài hòa, có đậm nhạt và thể hiện cảm xúc thẩm mĩ.',
  },
  {
    name: 'Có ý tưởng sáng tạo',
    description: 'Biết thể hiện góc nhìn riêng, chi tiết sinh động trong sản phẩm học tập.',
  },
  {
    name: 'Biết sắp xếp bố cục',
    description: 'Sắp xếp hình ảnh chính phụ cân đối trong khung hình.',
  },
  {
    name: 'Hoàn thành sản phẩm',
    description: 'Hoàn thành sản phẩm thực hành đúng yêu cầu và tiến độ của tiết học.',
  },
  {
    name: 'Biết chia sẻ ý tưởng',
    description: 'Trình bày rõ ràng ý tưởng và cảm nhận về sản phẩm của mình.',
  },
  {
    name: 'Biết nhận xét sản phẩm của mình và bạn',
    description: 'Lắng nghe, góp ý lịch sự và nêu được điểm hay của sản phẩm bạn.',
  },
];

export function getScopedTimetableLessons(params: {
  lessons: TimetableLesson[];
  teacherId?: string;
  permissions: OperatorPermissions;
}): TimetableLesson[] {
  const { lessons, teacherId, permissions } = params;
  if (!permissions.isScopedTeacher) {
    return lessons;
  }
  return lessons.filter((l) => {
    if (teacherId && l.teacherId === teacherId) return true;
    if (permissions.allowedHomeroomClassIds.has(l.classId)) return true;
    const allowedSubjs = permissions.allowedSubjectIdsByClass.get(l.classId);
    return Boolean(allowedSubjs?.has(l.subjectId));
  });
}

export function computeTimetableLessonStatus(params: {
  lesson: TimetableLesson;
  assessmentsForLesson: LessonAssessment[];
  today?: string;
}): LessonWorkflowStatus {
  const { lesson, assessmentsForLesson, today } = params;
  const currentDay = today ?? new Date().toISOString().slice(0, 10);

  if (lesson.assessmentWorkflowStatus === 'COMPLETED') {
    return 'COMPLETED';
  }
  if (lesson.assessmentWorkflowStatus === 'SAVED') {
    return 'SAVED';
  }
  if (assessmentsForLesson.length > 0 || lesson.assessmentWorkflowStatus === 'IN_PROGRESS') {
    return 'IN_PROGRESS';
  }
  if (lesson.lessonDate && lesson.lessonDate > currentDay) {
    return 'UPCOMING';
  }
  return 'NOT_ASSESSED';
}

export function getSubjectCriteriaForLesson(params: {
  criteria: Criterion[];
  subjectId?: string;
  gradeLevel?: number;
  includeHidden?: boolean;
}): Criterion[] {
  const { criteria, subjectId, gradeLevel, includeHidden = false } = params;
  const visible = includeHidden ? criteria : criteria.filter((c) => !c.isHidden);
  if (!subjectId) {
    return visible.filter((c) => !gradeLevel || !c.gradeLevel || c.gradeLevel === gradeLevel);
  }
  const subjectSpecific = visible.filter(
    (c) => c.subjectId === subjectId && (!gradeLevel || !c.gradeLevel || c.gradeLevel === gradeLevel)
  );
  if (subjectSpecific.length > 0) {
    return subjectSpecific;
  }
  // Fallback to general subject competency criteria only when subject has none configured
  return visible.filter(
    (c) => !c.subjectId && (!gradeLevel || !c.gradeLevel || c.gradeLevel === gradeLevel)
  );
}

export function buildLessonEditSummary(params: {
  ratingLevel: AssessmentRatingLevel;
  participationLevel?: LessonParticipationLevel;
  criterionIds?: string[];
  knowledgeAndSkills?: string;
  learningProduct?: string;
  difficulties?: string;
  comment: string;
  criteriaById: Map<string, Criterion>;
}): string {
  const parts: string[] = [RATING_LEVEL_LABELS[params.ratingLevel]];
  if (params.participationLevel) {
    parts.push(`Tham gia: ${LESSON_PARTICIPATION_LABELS[params.participationLevel]}`);
  }
  const critNames = (params.criterionIds ?? [])
    .map((id) => params.criteriaById.get(id)?.name)
    .filter((n): n is string => Boolean(n));
  if (critNames.length > 0) {
    parts.push(`Tiêu chí: ${critNames.join(', ')}`);
  }
  if (params.knowledgeAndSkills?.trim()) {
    parts.push(`KT/KN: ${params.knowledgeAndSkills.trim()}`);
  }
  if (params.learningProduct?.trim()) {
    parts.push(`Sản phẩm: ${params.learningProduct.trim()}`);
  }
  if (params.difficulties?.trim()) {
    parts.push(`Cần hỗ trợ: ${params.difficulties.trim()}`);
  }
  if (params.comment.trim()) {
    parts.push(`Nhận xét: "${params.comment.trim()}"`);
  }
  return parts.join(' · ');
}

export interface StudentSubjectProgressReport {
  studentId: string;
  subjectId: string;
  totalEvaluations: number;
  strengths: Array<{ label: string; count: number }>;
  supportNeeds: Array<{ lessonDate: string; lessonTopic: string; difficulty: string }>;
  progressionSteps: Array<{
    assessmentId: string;
    lessonDate: string;
    lessonTopic: string;
    ratingLevel: AssessmentRatingLevel;
    participationLevel?: LessonParticipationLevel;
    score?: number;
    learningProduct?: string;
    comment: string;
  }>;
  timeline: LessonAssessment[];
}

export function buildStudentSubjectProgressReport(params: {
  assessments: LessonAssessment[];
  criteria: Criterion[];
  studentId: string;
  subjectId: string;
}): StudentSubjectProgressReport {
  const { assessments, criteria, studentId, subjectId } = params;
  const criteriaById = new Map(criteria.map((c) => [c.id, c]));

  // Strictly only LessonAssessments matching studentId & subjectId; never mix GVCN daily notes.
  const matched = assessments.filter(
    (a) => a.studentId === studentId && a.subjectId === subjectId
  );

  const chronologicalAsc = [...matched].sort(
    (a, b) =>
      a.lessonDate.localeCompare(b.lessonDate) ||
      (a.savedAt ?? a.updatedAt).localeCompare(b.savedAt ?? b.updatedAt)
  );
  const chronologicalDesc = [...chronologicalAsc].reverse();

  const strengthCounts = new Map<string, number>();
  const supportNeeds: Array<{ lessonDate: string; lessonTopic: string; difficulty: string }> = [];

  for (const item of chronologicalAsc) {
    const cIds =
      item.criterionIds && item.criterionIds.length > 0
        ? item.criterionIds
        : item.criterionId
          ? [item.criterionId]
          : [];
    if (cIds.length > 0) {
      for (const cid of cIds) {
        const label = criteriaById.get(cid)?.name;
        if (label) {
          strengthCounts.set(label, (strengthCounts.get(label) ?? 0) + 1);
        }
      }
    } else if (item.criterionLabelsSnapshot) {
      for (const label of item.criterionLabelsSnapshot) {
        strengthCounts.set(label, (strengthCounts.get(label) ?? 0) + 1);
      }
    }

    if (item.knowledgeAndSkills?.trim()) {
      const text = item.knowledgeAndSkills.trim();
      strengthCounts.set(text, (strengthCounts.get(text) ?? 0) + 1);
    }

    if (item.difficulties?.trim()) {
      supportNeeds.push({
        lessonDate: item.lessonDate,
        lessonTopic: item.lessonTopic,
        difficulty: item.difficulties.trim(),
      });
    }
  }

  const strengths = Array.from(strengthCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));

  const progressionSteps = chronologicalAsc.map((item) => ({
    assessmentId: item.id,
    lessonDate: item.lessonDate,
    lessonTopic: item.lessonTopic,
    ratingLevel: item.ratingLevel,
    participationLevel: item.participationLevel,
    score: item.score,
    learningProduct: item.learningProduct,
    comment: item.comment,
  }));

  return {
    studentId,
    subjectId,
    totalEvaluations: matched.length,
    strengths,
    supportNeeds: supportNeeds.reverse(),
    progressionSteps,
    timeline: chronologicalDesc,
  };
}

export interface SaveLessonObservationInput {
  id?: string;
  academicYearId: string;
  classId: string;
  timetableLessonId?: string;
  subjectId: string;
  teacherId?: string;
  editorName?: string;
  studentId: string;
  lessonDate: string;
  lessonTopic: string;
  criterionIds: string[];
  ratingLevel: AssessmentRatingLevel;
  participationLevel: LessonParticipationLevel;
  knowledgeAndSkills?: string;
  learningProduct?: string;
  difficulties?: string;
  score?: number;
  comment: string;
}

export const lessonAssessmentService = {
  async listSubjectCriteria(subjectId: string, includeHidden = true): Promise<ServiceResult<Criterion[]>> {
    return executeService(async () => {
      const items = await db.criteria.where('subjectId').equals(subjectId).toArray();
      const filtered = includeHidden ? items : items.filter((c) => !c.isHidden);
      return filtered.sort((a, b) => a.code.localeCompare(b.code, 'vi'));
    }, 'Không thể tải bộ tiêu chí của môn học.');
  },

  async createSubjectCriterion(input: {
    subjectId: string;
    name: string;
    gradeLevel?: number;
    description?: string;
  }): Promise<ServiceResult<Criterion>> {
    return executeService(async () => {
      const name = input.name.trim();
      if (!name || !input.subjectId) {
        throw new Error('Vui lòng chọn môn học và nhập tên tiêu chí.');
      }
      const existingForSubject = await db.criteria.where('subjectId').equals(input.subjectId).toArray();
      const seq = existingForSubject.length + 1;
      const code = `MON-${input.subjectId.slice(-4).toUpperCase()}-${String(seq).padStart(2, '0')}-${Date.now().toString().slice(-3)}`;

      const record: Criterion = {
        ...createBaseFields(),
        code,
        name,
        category: CriteriaCategory.SUBJECT_COMPETENCY,
        subjectId: input.subjectId,
        gradeLevel: input.gradeLevel,
        description: input.description?.trim() || undefined,
        isHidden: false,
      };
      await db.criteria.add(record);
      await recordAuditLog('CREATE', 'criteria', `Thêm tiêu chí môn học "${record.name}"`, record.id);
      return record;
    }, 'Không thể thêm tiêu chí môn học.');
  },

  async updateSubjectCriterion(
    id: string,
    patch: { name?: string; description?: string; gradeLevel?: number; isHidden?: boolean }
  ): Promise<ServiceResult<Criterion>> {
    return executeService(async () => {
      const existing = await db.criteria.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy tiêu chí môn học.');
      }
      const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
      if (!nextName) {
        throw new Error('Tên tiêu chí không được để trống.');
      }
      const updated: Criterion = {
        ...existing,
        ...patch,
        name: nextName,
        description: patch.description !== undefined ? patch.description.trim() || undefined : existing.description,
        updatedAt: new Date().toISOString(),
      };
      await db.criteria.put(updated);
      await recordAuditLog('UPDATE', 'criteria', `Cập nhật tiêu chí môn học "${updated.name}"`, id);
      return updated;
    }, 'Không thể cập nhật tiêu chí môn học.');
  },

  async applyArtSampleCriteria(subjectId: string): Promise<ServiceResult<Criterion[]>> {
    return executeService(async () => {
      const existing = await db.criteria.where('subjectId').equals(subjectId).toArray();
      const existingNames = new Set(existing.map((c) => c.name.toLowerCase().trim()));
      const created: Criterion[] = [];
      let order = existing.length;

      for (const sample of ART_SAMPLE_CRITERIA_NAMES) {
        if (existingNames.has(sample.name.toLowerCase().trim())) continue;
        order += 1;
        const record: Criterion = {
          ...createBaseFields(),
          code: `MT-${String(order).padStart(2, '0')}-${Date.now().toString().slice(-3)}`,
          name: sample.name,
          category: CriteriaCategory.SUBJECT_COMPETENCY,
          subjectId,
          description: sample.description,
          isHidden: false,
        };
        await db.criteria.add(record);
        created.push(record);
      }

      if (created.length > 0) {
        await recordAuditLog(
          'CREATE',
          'criteria',
          `Nạp ${created.length} tiêu chí gợi ý cho môn Mĩ thuật`
        );
      }
      return created;
    }, 'Không thể nạp bộ tiêu chí gợi ý môn Mĩ thuật.');
  },

  async saveSingleObservation(
    input: SaveLessonObservationInput,
    workflowStatus: 'IN_PROGRESS' | 'SAVED' | 'COMPLETED' = 'SAVED'
  ): Promise<ServiceResult<LessonAssessment>> {
    return executeService(async () => {
      if (!input.studentId || !input.subjectId || !input.lessonTopic.trim()) {
        throw new Error('Vui lòng chọn học sinh, môn học và nhập tên bài học.');
      }

      const [existing, allCriteria] = await Promise.all([
        input.id
          ? db.lessonAssessments.get(input.id)
          : input.timetableLessonId
            ? db.lessonAssessments
                .where('[timetableLessonId+studentId]')
                .equals([input.timetableLessonId, input.studentId])
                .first()
            : Promise.resolve(undefined),
        db.criteria.toArray(),
      ]);

      const criteriaById = new Map(allCriteria.map((c) => [c.id, c]));
      const uniqueCriterionIds = Array.from(new Set(input.criterionIds));
      const snapshotLabels = uniqueCriterionIds
        .map((id) => criteriaById.get(id)?.name)
        .filter((n): n is string => Boolean(n));

      const now = new Date().toISOString();
      const trimmedComment = input.comment.trim();
      const editEntry: LessonAssessmentEditEntry = {
        editedAt: now,
        editorTeacherId: input.teacherId,
        editorName: input.editorName,
        ratingLevel: input.ratingLevel,
        participationLevel: input.participationLevel,
        criterionIds: uniqueCriterionIds,
        knowledgeAndSkills: input.knowledgeAndSkills?.trim() || undefined,
        learningProduct: input.learningProduct?.trim() || undefined,
        difficulties: input.difficulties?.trim() || undefined,
        comment: trimmedComment,
        summary: buildLessonEditSummary({
          ratingLevel: input.ratingLevel,
          participationLevel: input.participationLevel,
          criterionIds: uniqueCriterionIds,
          knowledgeAndSkills: input.knowledgeAndSkills,
          learningProduct: input.learningProduct,
          difficulties: input.difficulties,
          comment: trimmedComment,
          criteriaById,
        }),
      };

      let savedRecord: LessonAssessment;
      await db.transaction('rw', [db.lessonAssessments, db.timetableLessons], async () => {
        if (existing) {
          savedRecord = {
            ...existing,
            ...input,
            id: existing.id,
            teacherId: input.teacherId ?? existing.teacherId,
            lessonTopic: input.lessonTopic.trim(),
            criterionId: uniqueCriterionIds[0],
            criterionIds: uniqueCriterionIds,
            criterionLabelsSnapshot: snapshotLabels,
            knowledgeAndSkills: input.knowledgeAndSkills?.trim() || undefined,
            learningProduct: input.learningProduct?.trim() || undefined,
            difficulties: input.difficulties?.trim() || undefined,
            comment: trimmedComment,
            savedAt: now,
            updatedAt: now,
            editHistory: [editEntry, ...(existing.editHistory ?? [])],
          };
          await db.lessonAssessments.put(savedRecord);
        } else {
          savedRecord = {
            ...createBaseFields(),
            ...input,
            lessonTopic: input.lessonTopic.trim(),
            criterionId: uniqueCriterionIds[0],
            criterionIds: uniqueCriterionIds,
            criterionLabelsSnapshot: snapshotLabels,
            knowledgeAndSkills: input.knowledgeAndSkills?.trim() || undefined,
            learningProduct: input.learningProduct?.trim() || undefined,
            difficulties: input.difficulties?.trim() || undefined,
            comment: trimmedComment,
            savedAt: now,
            editHistory: [editEntry],
          };
          await db.lessonAssessments.add(savedRecord);
        }

        if (input.timetableLessonId) {
          const ttLesson = await db.timetableLessons.get(input.timetableLessonId);
          if (ttLesson) {
            const nextStatus =
              ttLesson.assessmentWorkflowStatus === 'COMPLETED' && workflowStatus !== 'COMPLETED'
                ? 'COMPLETED'
                : workflowStatus;
            await db.timetableLessons.update(ttLesson.id, {
              assessmentWorkflowStatus: nextStatus,
              lastAssessedAt: now,
              updatedAt: now,
            });
          }
        }
      });

      await recordAuditLog(
        existing ? 'UPDATE' : 'CREATE',
        'lessonAssessments',
        `${existing ? 'Cập nhật' : 'Lưu'} đánh giá tiết "${savedRecord!.lessonTopic}"`,
        savedRecord!.id,
        input.editorName ? { actorName: input.editorName } : undefined
      );
      return savedRecord!;
    }, 'Không thể lưu đánh giá tiết học.');
  },

  async saveBatchObservations(params: {
    inputs: SaveLessonObservationInput[];
    timetableLessonId?: string;
    workflowStatus: 'IN_PROGRESS' | 'SAVED' | 'COMPLETED';
    editorName?: string;
  }): Promise<ServiceResult<LessonAssessment[]>> {
    return executeService(async () => {
      const { inputs, timetableLessonId, workflowStatus, editorName } = params;
      if (inputs.length === 0) return [];

      const now = new Date().toISOString();
      const allCriteria = await db.criteria.toArray();
      const criteriaById = new Map(allCriteria.map((c) => [c.id, c]));
      const saved: LessonAssessment[] = [];

      await db.transaction('rw', [db.lessonAssessments, db.timetableLessons], async () => {
        for (const input of inputs) {
          if (!input.studentId || !input.subjectId || !input.lessonTopic.trim()) continue;

          const existing = input.id
            ? await db.lessonAssessments.get(input.id)
            : input.timetableLessonId
              ? await db.lessonAssessments
                  .where('[timetableLessonId+studentId]')
                  .equals([input.timetableLessonId, input.studentId])
                  .first()
              : undefined;

          const uniqueCriterionIds = Array.from(new Set(input.criterionIds));
          const snapshotLabels = uniqueCriterionIds
            .map((id) => criteriaById.get(id)?.name)
            .filter((n): n is string => Boolean(n));

          const trimmedComment = input.comment.trim();
          const trimmedKnowledge = input.knowledgeAndSkills?.trim() || undefined;
          const trimmedProduct = input.learningProduct?.trim() || undefined;
          const trimmedDiff = input.difficulties?.trim() || undefined;

          const isSameAsExisting =
            Boolean(existing) &&
            existing!.ratingLevel === input.ratingLevel &&
            (existing!.participationLevel ?? 'MODERATE') === input.participationLevel &&
            existing!.lessonTopic === input.lessonTopic.trim() &&
            existing!.lessonDate === input.lessonDate &&
            existing!.score === input.score &&
            existing!.comment === trimmedComment &&
            (existing!.knowledgeAndSkills ?? undefined) === trimmedKnowledge &&
            (existing!.learningProduct ?? undefined) === trimmedProduct &&
            (existing!.difficulties ?? undefined) === trimmedDiff &&
            (existing!.criterionIds ?? []).length === uniqueCriterionIds.length &&
            (existing!.criterionIds ?? []).every((id) => uniqueCriterionIds.includes(id));

          if (existing && isSameAsExisting) {
            saved.push(existing);
            continue;
          }

          const editEntry: LessonAssessmentEditEntry = {
            editedAt: now,
            editorTeacherId: input.teacherId,
            editorName: editorName ?? input.editorName,
            ratingLevel: input.ratingLevel,
            participationLevel: input.participationLevel,
            criterionIds: uniqueCriterionIds,
            knowledgeAndSkills: trimmedKnowledge,
            learningProduct: trimmedProduct,
            difficulties: trimmedDiff,
            comment: trimmedComment,
            summary: buildLessonEditSummary({
              ratingLevel: input.ratingLevel,
              participationLevel: input.participationLevel,
              criterionIds: uniqueCriterionIds,
              knowledgeAndSkills: trimmedKnowledge,
              learningProduct: trimmedProduct,
              difficulties: trimmedDiff,
              comment: trimmedComment,
              criteriaById,
            }),
          };

          if (existing) {
            const updated: LessonAssessment = {
              ...existing,
              ...input,
              id: existing.id,
              teacherId: input.teacherId ?? existing.teacherId,
              lessonTopic: input.lessonTopic.trim(),
              criterionId: uniqueCriterionIds[0],
              criterionIds: uniqueCriterionIds,
              criterionLabelsSnapshot: snapshotLabels,
              knowledgeAndSkills: trimmedKnowledge,
              learningProduct: trimmedProduct,
              difficulties: trimmedDiff,
              comment: trimmedComment,
              savedAt: now,
              updatedAt: now,
              editHistory: [editEntry, ...(existing.editHistory ?? [])],
            };
            await db.lessonAssessments.put(updated);
            saved.push(updated);
          } else {
            const created: LessonAssessment = {
              ...createBaseFields(),
              ...input,
              lessonTopic: input.lessonTopic.trim(),
              criterionId: uniqueCriterionIds[0],
              criterionIds: uniqueCriterionIds,
              criterionLabelsSnapshot: snapshotLabels,
              knowledgeAndSkills: trimmedKnowledge,
              learningProduct: trimmedProduct,
              difficulties: trimmedDiff,
              comment: trimmedComment,
              savedAt: now,
              editHistory: [editEntry],
            };
            await db.lessonAssessments.add(created);
            saved.push(created);
          }
        }

        if (timetableLessonId) {
          await db.timetableLessons.update(timetableLessonId, {
            assessmentWorkflowStatus: workflowStatus,
            lastAssessedAt: now,
            updatedAt: now,
          });
        }
      });

      await recordAuditLog(
        'UPDATE',
        'lessonAssessments',
        `Lưu đánh giá tiết học (${saved.length} học sinh · trạng thái ${workflowStatus})`,
        timetableLessonId,
        editorName ? { actorName: editorName } : undefined
      );
      return saved;
    }, 'Không thể lưu hàng loạt đánh giá theo tiết học.');
  },

  async setTimetableLessonStatus(
    timetableLessonId: string,
    workflowStatus: 'NOT_ASSESSED' | 'IN_PROGRESS' | 'SAVED' | 'COMPLETED',
    editorName?: string
  ): Promise<ServiceResult<void>> {
    return executeService(async () => {
      const now = new Date().toISOString();
      await db.timetableLessons.update(timetableLessonId, {
        assessmentWorkflowStatus: workflowStatus,
        lastAssessedAt: now,
        updatedAt: now,
      });
      await recordAuditLog(
        'UPDATE',
        'timetableLessons',
        `Cập nhật trạng thái tiết học sang ${workflowStatus}`,
        timetableLessonId,
        editorName ? { actorName: editorName } : undefined
      );
    }, 'Không thể cập nhật trạng thái tiết học.');
  },
};
