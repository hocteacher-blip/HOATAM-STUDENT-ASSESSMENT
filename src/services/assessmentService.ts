import { db } from '../db/database';
import type {
  AssessmentEvidence,
  AssessmentPeriod,
  AssessmentResult,
  CommentRecord,
  DailyAssessment,
  LessonAssessment,
  ServiceResult,
} from '../types/models';
import { createBaseFields, executeService, recordAuditLog } from './baseRepository';

export type AssessmentPeriodInput = Omit<AssessmentPeriod, 'id' | 'createdAt' | 'updatedAt'>;
export type DailyAssessmentInput = Omit<DailyAssessment, 'id' | 'createdAt' | 'updatedAt'>;
export type LessonAssessmentInput = Omit<LessonAssessment, 'id' | 'createdAt' | 'updatedAt'>;
export type AssessmentEvidenceInput = Omit<AssessmentEvidence, 'id' | 'createdAt' | 'updatedAt'>;
export type AssessmentResultInput = Omit<AssessmentResult, 'id' | 'createdAt' | 'updatedAt'>;
export type CommentInput = Omit<CommentRecord, 'id' | 'createdAt' | 'updatedAt'>;

export const assessmentService = {
  async listPeriods(academicYearId?: string): Promise<ServiceResult<AssessmentPeriod[]>> {
    return executeService(async () => {
      const items = academicYearId
        ? await db.assessmentPeriods.where('academicYearId').equals(academicYearId).toArray()
        : await db.assessmentPeriods.toArray();
      return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
    }, 'Không thể tải danh sách kỳ đánh giá.');
  },

  async createPeriod(input: AssessmentPeriodInput): Promise<ServiceResult<AssessmentPeriod>> {
    return executeService(async () => {
      if (!input.academicYearId || !input.code.trim() || !input.name.trim()) {
        throw new Error('Vui lòng chọn năm học và nhập mã, tên kỳ đánh giá.');
      }
      const record: AssessmentPeriod = {
        ...createBaseFields(),
        ...input,
        code: input.code.trim(),
        name: input.name.trim(),
      };
      await db.assessmentPeriods.add(record);
      await recordAuditLog('CREATE', 'assessmentPeriods', `Tạo kỳ đánh giá ${record.name}`, record.id);
      return record;
    }, 'Không thể tạo kỳ đánh giá.');
  },

  async togglePeriodLock(id: string, isLocked: boolean): Promise<ServiceResult<AssessmentPeriod>> {
    return executeService(async () => {
      const existing = await db.assessmentPeriods.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy kỳ đánh giá.');
      }
      const updated: AssessmentPeriod = {
        ...existing,
        isLocked,
        updatedAt: new Date().toISOString(),
      };
      await db.assessmentPeriods.put(updated);
      await recordAuditLog(
        'UPDATE',
        'assessmentPeriods',
        `${isLocked ? 'Khóa' : 'Mở khóa'} kỳ đánh giá ${updated.name}`,
        id
      );
      return updated;
    }, 'Không thể cập nhật trạng thái kỳ đánh giá.');
  },

  async removePeriod(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      const resultCount = await db.assessmentResults.where('periodId').equals(id).count();
      if (resultCount > 0) {
        throw new Error(`Kỳ đánh giá đang có ${resultCount} kết quả đánh giá. Không thể xóa.`);
      }
      await db.assessmentPeriods.delete(id);
      await recordAuditLog('DELETE', 'assessmentPeriods', 'Xóa kỳ đánh giá', id);
    }, 'Không thể xóa kỳ đánh giá.');
  },

  async listDailyAssessments(filters?: {
    classId?: string;
    assessmentDate?: string;
    studentId?: string;
  }): Promise<ServiceResult<DailyAssessment[]>> {
    return executeService(async () => {
      let items: DailyAssessment[];
      if (filters?.classId && filters?.assessmentDate) {
        items = await db.dailyAssessments
          .where('[classId+assessmentDate]')
          .equals([filters.classId, filters.assessmentDate])
          .toArray();
      } else if (filters?.studentId) {
        items = await db.dailyAssessments.where('studentId').equals(filters.studentId).toArray();
      } else if (filters?.classId) {
        items = await db.dailyAssessments.where('classId').equals(filters.classId).toArray();
      } else {
        items = await db.dailyAssessments.toArray();
      }
      return items.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate));
    }, 'Không thể tải dữ liệu đánh giá hằng ngày.');
  },

  async saveDailyAssessment(
    input: Omit<DailyAssessmentInput, 'evaluationStatus' | 'criterionIds' | 'savedAt' | 'editHistory'> & {
      id?: string;
      evaluationStatus?: DailyAssessment['evaluationStatus'];
      criterionIds?: string[];
      savedAt?: string;
      editHistory?: DailyAssessment['editHistory'];
    }
  ): Promise<ServiceResult<DailyAssessment>> {
    return executeService(async () => {
      if (!input.studentId || !input.classId || !input.assessmentDate) {
        throw new Error('Vui lòng chọn học sinh, lớp học và ngày đánh giá.');
      }

      const now = new Date().toISOString();
      const targetExisting = input.id
        ? await db.dailyAssessments.get(input.id)
        : await db.dailyAssessments
            .where('[classId+studentId+assessmentDate]')
            .equals([input.classId, input.studentId, input.assessmentDate])
            .first();

      const nextCriterionIds = input.criterionIds ?? (input.criterionId ? [input.criterionId] : []);
      const nextStatus =
        input.evaluationStatus ??
        targetExisting?.evaluationStatus ??
        ('ASSESSED' as DailyAssessment['evaluationStatus']);

      if (targetExisting) {
        const updated: DailyAssessment = {
          ...targetExisting,
          ...input,
          id: targetExisting.id,
          evaluationStatus: nextStatus,
          criterionIds: nextCriterionIds,
          savedAt: now,
          editHistory: input.editHistory ?? targetExisting.editHistory ?? [],
          updatedAt: now,
        };
        await db.dailyAssessments.put(updated);
        await recordAuditLog('UPDATE', 'dailyAssessments', `Cập nhật đánh giá ngày ${updated.assessmentDate}`, updated.id);
        return updated;
      }

      const record: DailyAssessment = {
        ...createBaseFields(),
        ...input,
        evaluationStatus: nextStatus,
        criterionIds: nextCriterionIds,
        savedAt: input.savedAt ?? now,
        editHistory: input.editHistory ?? [],
      };
      await db.dailyAssessments.add(record);
      await recordAuditLog('CREATE', 'dailyAssessments', `Lưu đánh giá ngày ${record.assessmentDate}`, record.id);
      return record;
    }, 'Không thể lưu đánh giá hằng ngày.');
  },

  async removeDailyAssessment(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      await db.dailyAssessments.delete(id);
      await recordAuditLog('DELETE', 'dailyAssessments', 'Xóa bản ghi đánh giá hằng ngày', id);
    }, 'Không thể xóa đánh giá hằng ngày.');
  },

  async listLessonAssessments(filters?: {
    academicYearId?: string;
    classId?: string;
    subjectId?: string;
    lessonDate?: string;
    timetableLessonId?: string;
  }): Promise<ServiceResult<LessonAssessment[]>> {
    return executeService(async () => {
      let items: LessonAssessment[];
      if (filters?.timetableLessonId) {
        items = await db.lessonAssessments
          .where('timetableLessonId')
          .equals(filters.timetableLessonId)
          .toArray();
      } else if (filters?.classId) {
        items = await db.lessonAssessments.where('classId').equals(filters.classId).toArray();
      } else if (filters?.academicYearId) {
        items = await db.lessonAssessments.where('academicYearId').equals(filters.academicYearId).toArray();
      } else {
        items = await db.lessonAssessments.toArray();
      }

      if (filters?.academicYearId && (filters?.timetableLessonId || filters?.classId)) {
        items = items.filter((item) => item.academicYearId === filters.academicYearId);
      }
      if (filters?.classId && filters?.timetableLessonId) {
        items = items.filter((item) => item.classId === filters.classId);
      }
      if (filters?.subjectId) {
        items = items.filter((item) => item.subjectId === filters.subjectId);
      }
      if (filters?.lessonDate) {
        items = items.filter((item) => item.lessonDate === filters.lessonDate);
      }
      return items.sort((a, b) => b.lessonDate.localeCompare(a.lessonDate));
    }, 'Không thể tải dữ liệu đánh giá theo tiết học.');
  },

  async saveLessonAssessment(input: LessonAssessmentInput & { id?: string }): Promise<ServiceResult<LessonAssessment>> {
    return executeService(async () => {
      if (!input.studentId || !input.subjectId || !input.lessonTopic.trim()) {
        throw new Error('Vui lòng chọn học sinh, môn học và nhập tên bài học / tiết học.');
      }

      // Deduplicate automatically when linked to a specific timetableLessonId
      let targetId = input.id;
      if (!targetId && input.timetableLessonId) {
        const existingForSlot = await db.lessonAssessments
          .where('[timetableLessonId+studentId]')
          .equals([input.timetableLessonId, input.studentId])
          .first();
        if (existingForSlot) {
          targetId = existingForSlot.id;
        }
      }

      if (targetId) {
        const existing = await db.lessonAssessments.get(targetId);
        if (!existing) {
          throw new Error('Không tìm thấy bản ghi đánh giá tiết học.');
        }
        const updated: LessonAssessment = {
          ...existing,
          ...input,
          id: existing.id,
          teacherId: input.teacherId ?? existing.teacherId,
          lessonTopic: input.lessonTopic.trim(),
          updatedAt: new Date().toISOString(),
        };
        await db.lessonAssessments.put(updated);
        await recordAuditLog('UPDATE', 'lessonAssessments', `Cập nhật đánh giá tiết "${updated.lessonTopic}"`, updated.id);
        return updated;
      }

      const record: LessonAssessment = {
        ...createBaseFields(),
        ...input,
        lessonTopic: input.lessonTopic.trim(),
      };
      await db.lessonAssessments.add(record);
      await recordAuditLog('CREATE', 'lessonAssessments', `Đánh giá tiết "${record.lessonTopic}"`, record.id);
      return record;
    }, 'Không thể lưu đánh giá tiết học.');
  },

  async saveBatchLessonAssessments(
    inputs: Array<LessonAssessmentInput & { id?: string }>
  ): Promise<ServiceResult<LessonAssessment[]>> {
    return executeService(async () => {
      if (inputs.length === 0) return [];
      const now = new Date().toISOString();
      const saved: LessonAssessment[] = [];

      await db.transaction('rw', db.lessonAssessments, async () => {
        for (const input of inputs) {
          if (!input.studentId || !input.subjectId || !input.lessonTopic.trim()) continue;
          let existing: LessonAssessment | undefined;
          if (input.id) {
            existing = await db.lessonAssessments.get(input.id);
          } else if (input.timetableLessonId) {
            existing = await db.lessonAssessments
              .where('[timetableLessonId+studentId]')
              .equals([input.timetableLessonId, input.studentId])
              .first();
          }

          if (existing) {
            const updated: LessonAssessment = {
              ...existing,
              ...input,
              id: existing.id,
              teacherId: input.teacherId ?? existing.teacherId,
              lessonTopic: input.lessonTopic.trim(),
              updatedAt: now,
            };
            await db.lessonAssessments.put(updated);
            saved.push(updated);
          } else {
            const created: LessonAssessment = {
              ...createBaseFields(),
              ...input,
              lessonTopic: input.lessonTopic.trim(),
            };
            await db.lessonAssessments.add(created);
            saved.push(created);
          }
        }
      });

      await recordAuditLog(
        'UPDATE',
        'lessonAssessments',
        `Lưu đánh giá theo tiết cho ${saved.length} học sinh`
      );
      return saved;
    }, 'Không thể lưu hàng loạt đánh giá tiết học.');
  },

  async removeLessonAssessment(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      await db.lessonAssessments.delete(id);
      await recordAuditLog('DELETE', 'lessonAssessments', 'Xóa đánh giá tiết học', id);
    }, 'Không thể xóa đánh giá tiết học.');
  },

  async listResults(filters?: {
    periodId?: string;
    classId?: string;
    academicYearId?: string;
  }): Promise<ServiceResult<AssessmentResult[]>> {
    return executeService(async () => {
      let items: AssessmentResult[];
      if (filters?.periodId) {
        items = await db.assessmentResults.where('periodId').equals(filters.periodId).toArray();
      } else if (filters?.classId) {
        items = await db.assessmentResults.where('classId').equals(filters.classId).toArray();
      } else if (filters?.academicYearId) {
        items = await db.assessmentResults.where('academicYearId').equals(filters.academicYearId).toArray();
      } else {
        items = await db.assessmentResults.toArray();
      }
      if (filters?.classId && filters?.periodId) {
        items = items.filter((r) => r.classId === filters.classId);
      }
      if (filters?.academicYearId && (filters?.periodId || filters?.classId)) {
        items = items.filter((r) => r.academicYearId === filters.academicYearId);
      }
      return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }, 'Không thể tải kết quả đánh giá định kỳ.');
  },

  async saveResult(input: AssessmentResultInput & { id?: string }): Promise<ServiceResult<AssessmentResult>> {
    return executeService(async () => {
      if (!input.periodId || !input.classId || !input.studentId) {
        throw new Error('Vui lòng chọn kỳ đánh giá, lớp học và học sinh.');
      }

      const period = await db.assessmentPeriods.get(input.periodId);
      if (period?.isLocked) {
        throw new Error(`Kỳ đánh giá "${period.name}" đã bị khóa, không thể chỉnh sửa.`);
      }

      if (input.id) {
        const existing = await db.assessmentResults.get(input.id);
        if (!existing) {
          throw new Error('Không tìm thấy kết quả đánh giá.');
        }
        const updated: AssessmentResult = {
          ...existing,
          ...input,
          id: existing.id,
          updatedAt: new Date().toISOString(),
        };
        await db.assessmentResults.put(updated);
        await recordAuditLog('UPDATE', 'assessmentResults', 'Cập nhật kết quả đánh giá định kỳ', updated.id);
        return updated;
      }

      const record: AssessmentResult = {
        ...createBaseFields(),
        ...input,
      };
      await db.assessmentResults.add(record);
      await recordAuditLog('CREATE', 'assessmentResults', 'Lưu kết quả đánh giá định kỳ', record.id);
      return record;
    }, 'Không thể lưu kết quả đánh giá định kỳ.');
  },

  async removeResult(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      const existing = await db.assessmentResults.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy kết quả đánh giá cần xóa.');
      }
      const period = await db.assessmentPeriods.get(existing.periodId);
      if (period?.isLocked) {
        throw new Error(`Kỳ đánh giá "${period.name}" đã bị khóa, không thể xóa kết quả.`);
      }
      await db.assessmentResults.delete(id);
      await recordAuditLog('DELETE', 'assessmentResults', 'Xóa kết quả đánh giá định kỳ', id);
    }, 'Không thể xóa kết quả đánh giá định kỳ.');
  },

  async listEvidence(
    filterOrStudentId?: string | { studentId?: string; academicYearId?: string }
  ): Promise<ServiceResult<AssessmentEvidence[]>> {
    return executeService(async () => {
      const filters =
        typeof filterOrStudentId === 'string'
          ? { studentId: filterOrStudentId }
          : filterOrStudentId;
      let items: AssessmentEvidence[];
      if (filters?.studentId) {
        items = await db.assessmentEvidence.where('studentId').equals(filters.studentId).toArray();
      } else if (filters?.academicYearId) {
        items = await db.assessmentEvidence.where('academicYearId').equals(filters.academicYearId).toArray();
      } else {
        items = await db.assessmentEvidence.toArray();
      }
      if (filters?.studentId && filters?.academicYearId) {
        items = items.filter((e) => e.academicYearId === filters.academicYearId);
      }
      return items.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    }, 'Không thể tải minh chứng đánh giá.');
  },

  async addEvidence(input: AssessmentEvidenceInput): Promise<ServiceResult<AssessmentEvidence>> {
    return executeService(async () => {
      if (!input.studentId || !input.title.trim()) {
        throw new Error('Vui lòng chọn học sinh và nhập tiêu đề minh chứng.');
      }
      const record: AssessmentEvidence = {
        ...createBaseFields(),
        ...input,
        title: input.title.trim(),
      };
      await db.assessmentEvidence.add(record);
      await recordAuditLog('CREATE', 'assessmentEvidence', `Thêm minh chứng "${record.title}"`, record.id);
      return record;
    }, 'Không thể lưu minh chứng đánh giá.');
  },

  async removeEvidence(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      await db.assessmentEvidence.delete(id);
      await recordAuditLog('DELETE', 'assessmentEvidence', 'Xóa minh chứng đánh giá', id);
    }, 'Không thể xóa minh chứng.');
  },

  async listComments(studentId?: string): Promise<ServiceResult<CommentRecord[]>> {
    return executeService(async () => {
      const items = studentId
        ? await db.comments.where('studentId').equals(studentId).toArray()
        : await db.comments.toArray();
      return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }, 'Không thể tải danh sách nhận xét.');
  },

  async addComment(input: CommentInput): Promise<ServiceResult<CommentRecord>> {
    return executeService(async () => {
      if (!input.studentId || !input.content.trim()) {
        throw new Error('Vui lòng chọn học sinh và nhập nội dung nhận xét.');
      }
      const record: CommentRecord = {
        ...createBaseFields(),
        ...input,
        content: input.content.trim(),
      };
      await db.comments.add(record);
      await recordAuditLog('CREATE', 'comments', 'Lưu nhận xét học sinh', record.id);
      return record;
    }, 'Không thể lưu nhận xét.');
  },
};
