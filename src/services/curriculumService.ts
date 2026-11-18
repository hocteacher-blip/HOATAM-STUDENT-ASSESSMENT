import { db } from '../db/database';
import type {
  AssessmentRule,
  Criterion,
  ServiceResult,
  Subject,
} from '../types/models';
import { createBaseFields, executeService, recordAuditLog } from './baseRepository';

export type SubjectInput = Omit<Subject, 'id' | 'createdAt' | 'updatedAt'>;
export type CriterionInput = Omit<Criterion, 'id' | 'createdAt' | 'updatedAt'>;
export type AssessmentRuleInput = Omit<AssessmentRule, 'id' | 'createdAt' | 'updatedAt'>;

export const curriculumService = {
  async listSubjects(): Promise<ServiceResult<Subject[]>> {
    return executeService(async () => {
      const items = await db.subjects.toArray();
      return items.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'vi'));
    }, 'Không thể tải danh sách môn học.');
  },

  async createSubject(input: SubjectInput): Promise<ServiceResult<Subject>> {
    return executeService(async () => {
      const code = input.code.trim();
      const name = input.name.trim();
      if (!code || !name) {
        throw new Error('Mã môn học và tên môn học không được để trống.');
      }

      const duplicate = await db.subjects.where('code').equalsIgnoreCase(code).first();
      if (duplicate) {
        throw new Error(`Mã môn học "${code}" đã tồn tại.`);
      }

      const record: Subject = {
        ...createBaseFields(),
        ...input,
        code,
        name,
        isActive: input.isActive ?? true,
      };
      await db.subjects.add(record);
      await recordAuditLog('CREATE', 'subjects', `Thêm môn học ${record.name}`, record.id);
      return record;
    }, 'Không thể thêm môn học.');
  },

  async updateSubject(id: string, patch: Partial<SubjectInput>): Promise<ServiceResult<Subject>> {
    return executeService(async () => {
      const existing = await db.subjects.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy môn học cần cập nhật.');
      }

      const nextCode = patch.code !== undefined ? patch.code.trim() : existing.code;
      const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
      if (!nextCode || !nextName) {
        throw new Error('Mã môn học và tên môn học không được để trống.');
      }

      if (nextCode.toLowerCase() !== existing.code.toLowerCase()) {
        const duplicate = await db.subjects.where('code').equalsIgnoreCase(nextCode).first();
        if (duplicate && duplicate.id !== id) {
          throw new Error(`Mã môn học "${nextCode}" đã được sử dụng.`);
        }
      }

      const updated: Subject = {
        ...existing,
        ...patch,
        code: nextCode,
        name: nextName,
        updatedAt: new Date().toISOString(),
      };
      await db.subjects.put(updated);
      await recordAuditLog('UPDATE', 'subjects', `Cập nhật môn học ${updated.name}`, id);
      return updated;
    }, 'Không thể cập nhật môn học.');
  },

  async toggleSubjectActive(id: string, isActive: boolean): Promise<ServiceResult<Subject>> {
    return executeService(async () => {
      const existing = await db.subjects.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy môn học.');
      }
      const updated: Subject = {
        ...existing,
        isActive,
        updatedAt: new Date().toISOString(),
      };
      await db.subjects.put(updated);
      await recordAuditLog(
        'UPDATE',
        'subjects',
        `${isActive ? 'Khôi phục' : 'Ẩn'} môn học ${updated.name}`,
        id
      );
      return updated;
    }, 'Không thể cập nhật trạng thái môn học.');
  },

  async removeSubject(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      const existing = await db.subjects.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy môn học cần xóa.');
      }
      const [criteriaCount, lessonCount] = await Promise.all([
        db.criteria.where('subjectId').equals(id).count(),
        db.timetableLessons.where('subjectId').equals(id).count(),
      ]);
      if (criteriaCount > 0 || lessonCount > 0) {
        throw new Error(
          `Không thể xóa môn "${existing.name}" vì đang liên kết với ${criteriaCount} tiêu chí và ${lessonCount} tiết thời khóa biểu.`
        );
      }
      await db.subjects.delete(id);
      await recordAuditLog('DELETE', 'subjects', `Xóa môn học ${existing.name}`, id);
    }, 'Không thể xóa môn học.');
  },

  async listCriteria(subjectId?: string): Promise<ServiceResult<Criterion[]>> {
    return executeService(async () => {
      const items = subjectId
        ? await db.criteria.where('subjectId').equals(subjectId).toArray()
        : await db.criteria.toArray();
      return items.sort((a, b) => a.code.localeCompare(b.code, 'vi'));
    }, 'Không thể tải danh sách tiêu chí đánh giá.');
  },

  async createCriterion(input: CriterionInput): Promise<ServiceResult<Criterion>> {
    return executeService(async () => {
      const code = input.code.trim();
      const name = input.name.trim();
      if (!code || !name) {
        throw new Error('Mã tiêu chí và tên tiêu chí không được để trống.');
      }

      const duplicate = await db.criteria.where('code').equalsIgnoreCase(code).first();
      if (duplicate) {
        throw new Error(`Mã tiêu chí "${code}" đã tồn tại.`);
      }

      const record: Criterion = {
        ...createBaseFields(),
        ...input,
        code,
        name,
      };
      await db.criteria.add(record);
      await recordAuditLog('CREATE', 'criteria', `Thêm tiêu chí ${record.name}`, record.id);
      return record;
    }, 'Không thể thêm tiêu chí đánh giá.');
  },

  async updateCriterion(id: string, patch: Partial<CriterionInput>): Promise<ServiceResult<Criterion>> {
    return executeService(async () => {
      const existing = await db.criteria.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy tiêu chí cần cập nhật.');
      }
      const updated: Criterion = {
        ...existing,
        ...patch,
        code: patch.code !== undefined ? patch.code.trim() : existing.code,
        name: patch.name !== undefined ? patch.name.trim() : existing.name,
        updatedAt: new Date().toISOString(),
      };
      await db.criteria.put(updated);
      await recordAuditLog('UPDATE', 'criteria', `Cập nhật tiêu chí ${updated.name}`, id);
      return updated;
    }, 'Không thể cập nhật tiêu chí.');
  },

  async removeCriterion(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      const existing = await db.criteria.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy tiêu chí cần xóa.');
      }
      await db.criteria.delete(id);
      await recordAuditLog('DELETE', 'criteria', `Xóa tiêu chí ${existing.name}`, id);
    }, 'Không thể xóa tiêu chí.');
  },

  async listRules(): Promise<ServiceResult<AssessmentRule[]>> {
    return executeService(async () => {
      return db.assessmentRules.toArray();
    }, 'Không thể tải danh sách quy tắc đánh giá.');
  },

  async createRule(input: AssessmentRuleInput): Promise<ServiceResult<AssessmentRule>> {
    return executeService(async () => {
      const code = input.code.trim();
      const name = input.name.trim();
      if (!code || !name) {
        throw new Error('Mã quy tắc và tên quy tắc không được để trống.');
      }
      const record: AssessmentRule = {
        ...createBaseFields(),
        ...input,
        code,
        name,
      };
      await db.assessmentRules.add(record);
      await recordAuditLog('CREATE', 'assessmentRules', `Thêm quy tắc ${record.name}`, record.id);
      return record;
    }, 'Không thể thêm quy tắc đánh giá.');
  },

  async updateRule(id: string, patch: Partial<AssessmentRuleInput>): Promise<ServiceResult<AssessmentRule>> {
    return executeService(async () => {
      const existing = await db.assessmentRules.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy quy tắc cần cập nhật.');
      }
      const updated: AssessmentRule = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      await db.assessmentRules.put(updated);
      await recordAuditLog('UPDATE', 'assessmentRules', `Cập nhật quy tắc ${updated.name}`, id);
      return updated;
    }, 'Không thể cập nhật quy tắc.');
  },

  async removeRule(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      await db.assessmentRules.delete(id);
      await recordAuditLog('DELETE', 'assessmentRules', 'Xóa quy tắc đánh giá', id);
    }, 'Không thể xóa quy tắc.');
  },
};
