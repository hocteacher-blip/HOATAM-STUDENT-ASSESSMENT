import { db } from '../db/database';
import {
  StudentStatus,
  type AssessmentEvidence,
  type AssessmentResult,
  type CommentRecord,
  type DailyAssessment,
  type LessonAssessment,
  type SchoolClass,
  type ServiceResult,
  type Student,
  type StudentClassHistory,
} from '../types/models';
import { createBaseFields, executeService, recordAuditLog } from './baseRepository';

export type SchoolClassInput = Omit<SchoolClass, 'id' | 'createdAt' | 'updatedAt'>;
export type StudentInput = Omit<Student, 'id' | 'createdAt' | 'updatedAt'>;

export interface StudentProfileDetails {
  student: Student;
  transferHistory: StudentClassHistory[];
  dailyAssessments: DailyAssessment[];
  lessonAssessments: LessonAssessment[];
  assessmentResults: AssessmentResult[];
  comments: CommentRecord[];
  evidence: AssessmentEvidence[];
}

export const classStudentService = {
  async listClasses(academicYearId?: string): Promise<ServiceResult<SchoolClass[]>> {
    return executeService(async () => {
      const items = academicYearId
        ? await db.classes.where('academicYearId').equals(academicYearId).toArray()
        : await db.classes.toArray();
      return items.sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name, 'vi'));
    }, 'Không thể tải danh sách lớp học.');
  },

  async createClass(input: SchoolClassInput): Promise<ServiceResult<SchoolClass>> {
    return executeService(async () => {
      const code = input.code.trim();
      const name = input.name.trim();
      if (!input.academicYearId || !code || !name) {
        throw new Error('Vui lòng chọn năm học và nhập đầy đủ mã lớp, tên lớp.');
      }

      const existingSameYear = await db.classes
        .where('academicYearId')
        .equals(input.academicYearId)
        .filter((c) => c.code.toLowerCase() === code.toLowerCase())
        .first();

      if (existingSameYear) {
        throw new Error(`Mã lớp "${code}" đã tồn tại trong năm học đã chọn.`);
      }

      const record: SchoolClass = {
        ...createBaseFields(),
        ...input,
        code,
        name,
        isArchived: input.isArchived ?? false,
      };
      await db.classes.add(record);
      await recordAuditLog('CREATE', 'classes', `Tạo lớp ${record.name}`, record.id);
      return record;
    }, 'Không thể tạo lớp học mới.');
  },

  async updateClass(id: string, patch: Partial<SchoolClassInput>): Promise<ServiceResult<SchoolClass>> {
    return executeService(async () => {
      const existing = await db.classes.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy lớp học cần cập nhật.');
      }

      const nextCode = patch.code !== undefined ? patch.code.trim() : existing.code;
      const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
      if (!nextCode || !nextName) {
        throw new Error('Mã lớp và tên lớp không được để trống.');
      }

      if (nextCode.toLowerCase() !== existing.code.toLowerCase()) {
        const duplicate = await db.classes
          .where('academicYearId')
          .equals(patch.academicYearId ?? existing.academicYearId)
          .filter((c) => c.id !== id && c.code.toLowerCase() === nextCode.toLowerCase())
          .first();
        if (duplicate) {
          throw new Error(`Mã lớp "${nextCode}" đã tồn tại trong năm học này.`);
        }
      }

      const updated: SchoolClass = {
        ...existing,
        ...patch,
        code: nextCode,
        name: nextName,
        updatedAt: new Date().toISOString(),
      };
      await db.classes.put(updated);
      await recordAuditLog('UPDATE', 'classes', `Cập nhật lớp ${updated.name}`, id);
      return updated;
    }, 'Không thể cập nhật lớp học.');
  },

  async toggleArchiveClass(id: string, isArchived: boolean): Promise<ServiceResult<SchoolClass>> {
    return executeService(async () => {
      const existing = await db.classes.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy lớp học.');
      }
      const updated: SchoolClass = {
        ...existing,
        isArchived,
        updatedAt: new Date().toISOString(),
      };
      await db.classes.put(updated);
      await recordAuditLog(
        'UPDATE',
        'classes',
        `${isArchived ? 'Lưu trữ' : 'Khôi phục'} lớp ${updated.name}`,
        id
      );
      return updated;
    }, 'Không thể thay đổi trạng thái lưu trữ lớp học.');
  },

  async removeClass(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      const existing = await db.classes.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy lớp học cần xóa.');
      }
      const studentCount = await db.students.where('classId').equals(id).count();
      if (studentCount > 0) {
        throw new Error(`Không thể xóa lớp "${existing.name}" vì đang có ${studentCount} học sinh.`);
      }
      await db.classes.delete(id);
      await recordAuditLog('DELETE', 'classes', `Xóa lớp ${existing.name}`, id);
    }, 'Không thể xóa lớp học.');
  },

  async listStudents(filters?: { academicYearId?: string; classId?: string }): Promise<ServiceResult<Student[]>> {
    return executeService(async () => {
      let items: Student[];
      if (filters?.classId) {
        items = await db.students.where('classId').equals(filters.classId).toArray();
      } else if (filters?.academicYearId) {
        items = await db.students.where('academicYearId').equals(filters.academicYearId).toArray();
      } else {
        items = await db.students.toArray();
      }
      return items.sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
    }, 'Không thể tải danh sách học sinh.');
  },

  async createStudent(input: StudentInput): Promise<ServiceResult<Student>> {
    return executeService(async () => {
      const studentCode = input.studentCode.trim();
      const fullName = input.fullName.trim();
      if (!studentCode || !fullName || !input.classId || !input.academicYearId) {
        throw new Error('Vui lòng nhập mã học sinh, họ tên và chọn lớp học.');
      }

      const duplicate = await db.students.where('studentCode').equalsIgnoreCase(studentCode).first();
      if (duplicate) {
        throw new Error(`Mã học sinh "${studentCode}" đã tồn tại.`);
      }

      const record: Student = {
        ...createBaseFields(),
        ...input,
        studentCode,
        fullName,
      };
      await db.students.add(record);
      await recordAuditLog('CREATE', 'students', `Thêm học sinh ${record.fullName} (${record.studentCode})`, record.id);
      return record;
    }, 'Không thể thêm học sinh.');
  },

  async updateStudent(id: string, patch: Partial<StudentInput>): Promise<ServiceResult<Student>> {
    return executeService(async () => {
      const existing = await db.students.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy hồ sơ học sinh.');
      }

      const nextCode = patch.studentCode !== undefined ? patch.studentCode.trim() : existing.studentCode;
      const nextName = patch.fullName !== undefined ? patch.fullName.trim() : existing.fullName;
      if (!nextCode || !nextName) {
        throw new Error('Mã học sinh và họ tên không được để trống.');
      }

      if (nextCode.toLowerCase() !== existing.studentCode.toLowerCase()) {
        const duplicate = await db.students.where('studentCode').equalsIgnoreCase(nextCode).first();
        if (duplicate && duplicate.id !== id) {
          throw new Error(`Mã học sinh "${nextCode}" đã được sử dụng.`);
        }
      }

      const updated: Student = {
        ...existing,
        ...patch,
        studentCode: nextCode,
        fullName: nextName,
        updatedAt: new Date().toISOString(),
      };
      await db.students.put(updated);
      await recordAuditLog('UPDATE', 'students', `Cập nhật học sinh ${updated.fullName}`, id);
      return updated;
    }, 'Không thể cập nhật học sinh.');
  },

  async transferStudentClass(params: {
    studentId: string;
    targetClassId: string;
    transferDate: string;
    reason?: string;
    nextStatus?: StudentStatus;
  }): Promise<ServiceResult<Student>> {
    return executeService(async () => {
      const student = await db.students.get(params.studentId);
      if (!student) {
        throw new Error('Không tìm thấy hồ sơ học sinh cần chuyển lớp.');
      }
      const targetClass = await db.classes.get(params.targetClassId);
      if (!targetClass) {
        throw new Error('Không tìm thấy lớp học đích.');
      }
      if (student.classId === targetClass.id) {
        throw new Error('Học sinh hiện đang học tại lớp này.');
      }

      const sourceClass = await db.classes.get(student.classId);

      const historyRecord: StudentClassHistory = {
        ...createBaseFields(),
        studentId: student.id,
        fromClassId: student.classId,
        toClassId: targetClass.id,
        fromAcademicYearId: student.academicYearId,
        toAcademicYearId: targetClass.academicYearId,
        transferDate: params.transferDate || new Date().toISOString().slice(0, 10),
        reason: params.reason?.trim() || undefined,
      };

      const updatedStudent: Student = {
        ...student,
        classId: targetClass.id,
        academicYearId: targetClass.academicYearId,
        status: params.nextStatus ?? StudentStatus.STUDYING,
        updatedAt: new Date().toISOString(),
      };

      await db.transaction('rw', db.students, db.studentClassHistory, async () => {
        await db.studentClassHistory.add(historyRecord);
        await db.students.put(updatedStudent);
      });

      await recordAuditLog(
        'UPDATE',
        'students',
        `Chuyển lớp học sinh ${student.fullName} từ ${sourceClass?.name ?? 'lớp cũ'} sang ${targetClass.name} (giữ nguyên lịch sử đánh giá)`,
        student.id
      );
      return updatedStudent;
    }, 'Không thể chuyển lớp cho học sinh.');
  },

  async getStudentProfileDetails(studentId: string): Promise<ServiceResult<StudentProfileDetails>> {
    return executeService(async () => {
      const student = await db.students.get(studentId);
      if (!student) {
        throw new Error('Không tìm thấy hồ sơ học sinh.');
      }

      const [
        transferHistory,
        dailyAssessments,
        lessonAssessments,
        assessmentResults,
        comments,
        evidence,
      ] = await Promise.all([
        db.studentClassHistory.where('studentId').equals(studentId).toArray(),
        db.dailyAssessments.where('studentId').equals(studentId).toArray(),
        db.lessonAssessments.where('studentId').equals(studentId).toArray(),
        db.assessmentResults.where('studentId').equals(studentId).toArray(),
        db.comments.where('studentId').equals(studentId).toArray(),
        db.assessmentEvidence.where('studentId').equals(studentId).toArray(),
      ]);

      return {
        student,
        transferHistory: transferHistory.sort((a, b) => b.transferDate.localeCompare(a.transferDate)),
        dailyAssessments: dailyAssessments.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate)),
        lessonAssessments: lessonAssessments.sort((a, b) => b.lessonDate.localeCompare(a.lessonDate)),
        assessmentResults: assessmentResults.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        comments: comments.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        evidence: evidence.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
      };
    }, 'Không thể tải chi tiết hồ sơ học sinh.');
  },

  async removeStudent(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      const existing = await db.students.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy học sinh cần xóa.');
      }

      const [dailyCount, lessonCount, resultCount] = await Promise.all([
        db.dailyAssessments.where('studentId').equals(id).count(),
        db.lessonAssessments.where('studentId').equals(id).count(),
        db.assessmentResults.where('studentId').equals(id).count(),
      ]);

      if (dailyCount > 0 || lessonCount > 0 || resultCount > 0) {
        throw new Error(
          `Không thể xóa học sinh "${existing.fullName}" vì đã có dữ liệu đánh giá (${dailyCount + lessonCount + resultCount} bản ghi).`
        );
      }

      await db.students.delete(id);
      await recordAuditLog('DELETE', 'students', `Xóa học sinh ${existing.fullName}`, id);
    }, 'Không thể xóa học sinh.');
  },
};

