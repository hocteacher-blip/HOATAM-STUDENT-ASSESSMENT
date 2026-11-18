import { db, ensureAppSettingsInitialized } from '../db/database';
import { AcademicYearStatus, type AcademicYear, type ServiceResult } from '../types/models';
import { createBaseFields, executeService, recordAuditLog } from './baseRepository';

export type AcademicYearInput = Omit<AcademicYear, 'id' | 'createdAt' | 'updatedAt'>;

export interface AcademicYearSummary {
  academicYearId: string;
  classesCount: number;
  studentsCount: number;
  assessmentsCount: number;
}

export const academicYearService = {
  async list(): Promise<ServiceResult<AcademicYear[]>> {
    return executeService(async () => {
      const items = await db.academicYears.toArray();
      return items.sort((a, b) => b.startDate.localeCompare(a.startDate));
    }, 'Không thể tải danh sách năm học.');
  },

  async getYearSummaries(): Promise<ServiceResult<Record<string, AcademicYearSummary>>> {
    return executeService(async () => {
      const [years, classes, students, daily, lesson, results] = await Promise.all([
        db.academicYears.toArray(),
        db.classes.toArray(),
        db.students.toArray(),
        db.dailyAssessments.toArray(),
        db.lessonAssessments.toArray(),
        db.assessmentResults.toArray(),
      ]);

      const map: Record<string, AcademicYearSummary> = {};
      for (const y of years) {
        map[y.id] = {
          academicYearId: y.id,
          classesCount: classes.filter((c) => c.academicYearId === y.id).length,
          studentsCount: students.filter((s) => s.academicYearId === y.id).length,
          assessmentsCount:
            daily.filter((d) => d.academicYearId === y.id).length +
            lesson.filter((l) => l.academicYearId === y.id).length +
            results.filter((r) => r.academicYearId === y.id).length,
        };
      }
      return map;
    }, 'Không thể tổng hợp thống kê theo năm học.');
  },

  async create(input: AcademicYearInput): Promise<ServiceResult<AcademicYear>> {
    return executeService(async () => {
      const code = input.code.trim();
      const name = input.name.trim();
      if (!code || !name) {
        throw new Error('Mã năm học và tên năm học không được để trống.');
      }
      if (input.startDate && input.endDate && input.startDate >= input.endDate) {
        throw new Error('Ngày bắt đầu năm học phải trước ngày kết thúc.');
      }

      const duplicate = await db.academicYears.where('code').equalsIgnoreCase(code).first();
      if (duplicate) {
        throw new Error(`Mã năm học "${code}" đã tồn tại.`);
      }

      const record: AcademicYear = {
        ...createBaseFields(),
        ...input,
        code,
        name,
      };

      await db.transaction('rw', db.academicYears, db.appSettings, async () => {
        if (record.isCurrent) {
          const all = await db.academicYears.toArray();
          for (const item of all) {
            if (item.isCurrent) {
              await db.academicYears.update(item.id, {
                isCurrent: false,
                updatedAt: new Date().toISOString(),
              });
            }
          }
          const settings = await ensureAppSettingsInitialized();
          await db.appSettings.update(settings.id, {
            activeAcademicYearId: record.id,
            updatedAt: new Date().toISOString(),
          });
        }
        await db.academicYears.add(record);
      });

      await recordAuditLog('CREATE', 'academicYears', `Tạo năm học ${record.name}`, record.id);
      return record;
    }, 'Không thể tạo năm học mới.');
  },

  async update(id: string, patch: Partial<AcademicYearInput>): Promise<ServiceResult<AcademicYear>> {
    return executeService(async () => {
      const existing = await db.academicYears.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy năm học cần cập nhật.');
      }

      const nextCode = patch.code !== undefined ? patch.code.trim() : existing.code;
      const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
      if (!nextCode || !nextName) {
        throw new Error('Mã năm học và tên năm học không được để trống.');
      }

      const nextStartDate = patch.startDate ?? existing.startDate;
      const nextEndDate = patch.endDate ?? existing.endDate;
      if (nextStartDate && nextEndDate && nextStartDate >= nextEndDate) {
        throw new Error('Ngày bắt đầu năm học phải trước ngày kết thúc.');
      }

      if (nextCode.toLowerCase() !== existing.code.toLowerCase()) {
        const duplicate = await db.academicYears.where('code').equalsIgnoreCase(nextCode).first();
        if (duplicate && duplicate.id !== id) {
          throw new Error(`Mã năm học "${nextCode}" đã được sử dụng.`);
        }
      }

      const updated: AcademicYear = {
        ...existing,
        ...patch,
        code: nextCode,
        name: nextName,
        updatedAt: new Date().toISOString(),
      };

      await db.transaction('rw', db.academicYears, db.appSettings, async () => {
        if (updated.isCurrent) {
          const all = await db.academicYears.toArray();
          for (const item of all) {
            if (item.id !== id && item.isCurrent) {
              await db.academicYears.update(item.id, {
                isCurrent: false,
                updatedAt: new Date().toISOString(),
              });
            }
          }
          const settings = await ensureAppSettingsInitialized();
          await db.appSettings.update(settings.id, {
            activeAcademicYearId: updated.id,
            updatedAt: new Date().toISOString(),
          });
        }
        await db.academicYears.put(updated);
      });

      await recordAuditLog('UPDATE', 'academicYears', `Cập nhật năm học ${updated.name}`, id);
      return updated;
    }, 'Không thể cập nhật năm học.');
  },

  async setActiveYear(id: string): Promise<ServiceResult<AcademicYear>> {
    return this.update(id, {
      isCurrent: true,
      status: AcademicYearStatus.ACTIVE,
    });
  },

  async remove(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      const existing = await db.academicYears.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy năm học cần xóa.');
      }

      const [classCount, studentCount, periodCount] = await Promise.all([
        db.classes.where('academicYearId').equals(id).count(),
        db.students.where('academicYearId').equals(id).count(),
        db.assessmentPeriods.where('academicYearId').equals(id).count(),
      ]);

      if (classCount > 0 || studentCount > 0 || periodCount > 0) {
        throw new Error(
          `Không thể xóa năm học "${existing.name}" vì đang liên kết với ${classCount} lớp học, ${studentCount} học sinh và ${periodCount} kỳ đánh giá.`
        );
      }

      await db.academicYears.delete(id);
      await recordAuditLog('DELETE', 'academicYears', `Xóa năm học ${existing.name}`, id);
    }, 'Không thể xóa năm học.');
  },
};
