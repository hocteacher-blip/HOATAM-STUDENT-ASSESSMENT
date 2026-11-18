import { db } from '../db/database';
import {
  DailyEvaluationStatus,
  TeacherAssignmentStatus,
  type DailyAssessment,
  type DailyAssessmentEditEntry,
  type DailyBehaviorCriterion,
  type DailyCriterionGroup,
  type SchoolClass,
  type ServiceResult,
  type Student,
  type TeacherAssignment,
} from '../types/models';
import { DAILY_EVALUATION_STATUS_LABELS } from '../utils/labels';
import { createBaseFields, executeService, recordAuditLog } from './baseRepository';
import type { OperatorPermissions } from './teacherService';

export interface DefaultDailyCriterionSeed {
  id: string;
  code: string;
  name: string;
  group: DailyCriterionGroup;
  description: string;
  displayOrder: number;
}

export const DEFAULT_DAILY_CRITERIA: DefaultDailyCriterionSeed[] = [
  // Nhóm tích cực (8 tiêu chí)
  {
    id: 'dc-pos-1',
    code: 'TC-CHAM-CHI',
    name: 'Chăm chỉ',
    group: 'POSITIVE',
    description: 'Chú ý lắng nghe, tích cực thực hiện nhiệm vụ học tập trên lớp.',
    displayOrder: 1,
  },
  {
    id: 'dc-pos-2',
    code: 'TC-PHAT-BIEU',
    name: 'Tích cực phát biểu',
    group: 'POSITIVE',
    description: 'Mạnh dạn giơ tay xây dựng bài, chia sẻ ý kiến trước lớp.',
    displayOrder: 2,
  },
  {
    id: 'dc-pos-3',
    code: 'TC-HOAN-THANH',
    name: 'Hoàn thành nhiệm vụ',
    group: 'POSITIVE',
    description: 'Hoàn thành đầy đủ bài tập và nhiệm vụ được giao trong ngày.',
    displayOrder: 3,
  },
  {
    id: 'dc-pos-4',
    code: 'TC-TIEN-BO',
    name: 'Có tiến bộ',
    group: 'POSITIVE',
    description: 'Có cố gắng vượt bậc hoặc cải thiện rõ rệt so với những ngày trước.',
    displayOrder: 4,
  },
  {
    id: 'dc-pos-5',
    code: 'TC-HOP-TAC',
    name: 'Hợp tác với bạn',
    group: 'POSITIVE',
    description: 'Biết lắng nghe, chia sẻ và làm việc nhóm ăn ý cùng bạn bè.',
    displayOrder: 5,
  },
  {
    id: 'dc-pos-6',
    code: 'TC-GIUP-BAN',
    name: 'Giúp đỡ bạn',
    group: 'POSITIVE',
    description: 'Sẵn sàng hỗ trợ, hướng dẫn bạn học tập và sinh hoạt chung.',
    displayOrder: 6,
  },
  {
    id: 'dc-pos-7',
    code: 'TC-CHU-DONG',
    name: 'Chủ động học tập',
    group: 'POSITIVE',
    description: 'Tự giác chuẩn bị bài, chủ động đặt câu hỏi và tìm hiểu kiến thức.',
    displayOrder: 7,
  },
  {
    id: 'dc-pos-8',
    code: 'TC-NOI-QUY',
    name: 'Thực hiện tốt nội quy',
    group: 'POSITIVE',
    description: 'Đi học đúng giờ, giữ gìn vệ sinh, nề nếp và lễ phép với thầy cô.',
    displayOrder: 8,
  },

  // Nhóm cần hỗ trợ (6 tiêu chí)
  {
    id: 'dc-sup-1',
    code: 'HT-CHUA-TAP-TRUNG',
    name: 'Chưa tập trung',
    group: 'NEEDS_SUPPORT',
    description: 'Dễ phân tâm trong giờ học, cần giáo viên nhắc nhẹ để chú ý bài.',
    displayOrder: 9,
  },
  {
    id: 'dc-sup-2',
    code: 'HT-NOI-CHUYEN',
    name: 'Nói chuyện riêng',
    group: 'NEEDS_SUPPORT',
    description: 'Cần điều chỉnh thói quen trao đổi riêng khi giáo viên hoặc bạn đang trình bày.',
    displayOrder: 10,
  },
  {
    id: 'dc-sup-3',
    code: 'HT-CHUA-HOAN-THANH',
    name: 'Chưa hoàn thành nhiệm vụ',
    group: 'NEEDS_SUPPORT',
    description: 'Cần thêm thời gian hoặc sự hướng dẫn trực tiếp để hoàn tất bài học.',
    displayOrder: 11,
  },
  {
    id: 'dc-sup-4',
    code: 'HT-CHUA-DO-DUNG',
    name: 'Chưa chuẩn bị đồ dùng',
    group: 'NEEDS_SUPPORT',
    description: 'Quên sách vở hoặc đồ dùng học tập cần thiết, cần phối hợp nhắc cùng phụ huynh.',
    displayOrder: 12,
  },
  {
    id: 'dc-sup-5',
    code: 'HT-CHUA-TICH-CUC',
    name: 'Chưa tích cực tham gia',
    group: 'NEEDS_SUPPORT',
    description: 'Còn rụt rè hoặc chưa mạnh dạn tham gia hoạt động nhóm và phát biểu.',
    displayOrder: 13,
  },
  {
    id: 'dc-sup-6',
    code: 'HT-CAN-HO-TRO',
    name: 'Cần hỗ trợ thêm',
    group: 'NEEDS_SUPPORT',
    description: 'Cần giáo viên hoặc gia đình kèm cặp, động viên thêm về kỹ năng hoặc tâm lý.',
    displayOrder: 14,
  },
];

export interface HomeroomClassDuty {
  schoolClass: SchoolClass;
  homeroomAssignment?: TeacherAssignment;
  homeroomTeacherId?: string;
}

export function getHomeroomScopeClasses(params: {
  academicYearId?: string;
  classes: SchoolClass[];
  assignments: TeacherAssignment[];
  permissions: OperatorPermissions;
}): HomeroomClassDuty[] {
  const { academicYearId, classes, assignments, permissions } = params;

  const yearClasses = classes.filter(
    (c) => !c.isArchived && (!academicYearId || c.academicYearId === academicYearId)
  );

  const filteredClasses = permissions.isScopedTeacher
    ? yearClasses.filter((c) => permissions.allowedHomeroomClassIds.has(c.id))
    : yearClasses;

  return filteredClasses
    .map((cls) => {
      const assignment = assignments.find(
        (a) =>
          (!academicYearId || a.academicYearId === academicYearId) &&
          a.classId === cls.id &&
          a.status === TeacherAssignmentStatus.ACTIVE &&
          (a.isHomeroom || a.role === 'GVCN')
      );
      return {
        schoolClass: cls,
        homeroomAssignment: assignment,
        homeroomTeacherId: assignment?.teacherId ?? cls.homeroomTeacherId,
      };
    })
    .sort((a, b) => a.schoolClass.gradeLevel - b.schoolClass.gradeLevel || a.schoolClass.name.localeCompare(b.schoolClass.name, 'vi'));
}

export function resolveEffectiveDailyStatus(params: {
  requestedStatus?: DailyEvaluationStatus;
  criterionIds: string[];
  comment: string;
}): DailyEvaluationStatus {
  const { requestedStatus, criterionIds, comment } = params;
  const hasObservations = criterionIds.length > 0 || comment.trim().length > 0;

  if (!requestedStatus) {
    return hasObservations ? DailyEvaluationStatus.ASSESSED : DailyEvaluationStatus.NOT_ASSESSED;
  }

  // If teacher ticked criteria or wrote a comment while status was NOT_ASSESSED, mark ASSESSED.
  if (requestedStatus === DailyEvaluationStatus.NOT_ASSESSED && hasObservations) {
    return DailyEvaluationStatus.ASSESSED;
  }

  return requestedStatus;
}

export function buildDailyEditSummary(params: {
  evaluationStatus: DailyEvaluationStatus;
  criterionIds: string[];
  comment: string;
  criteriaById: Map<string, DailyBehaviorCriterion>;
}): string {
  const { evaluationStatus, criterionIds, comment, criteriaById } = params;
  const statusLabel = DAILY_EVALUATION_STATUS_LABELS[evaluationStatus];
  const criteriaNames = criterionIds
    .map((id) => criteriaById.get(id)?.name)
    .filter((name): name is string => Boolean(name));

  const parts: string[] = [statusLabel];
  if (criteriaNames.length > 0) {
    parts.push(`Tiêu chí: ${criteriaNames.join(', ')}`);
  }
  if (comment.trim()) {
    parts.push(`Nhận xét: "${comment.trim()}"`);
  }
  return parts.join(' · ');
}

export function getDateRangeForPeriod(params: {
  mode: 'DAY' | 'WEEK' | 'MONTH';
  anchorDate: string; // YYYY-MM-DD
  anchorMonth?: string; // YYYY-MM
}): { fromDate: string; toDate: string; label: string } {
  const { mode, anchorDate, anchorMonth } = params;
  if (mode === 'DAY') {
    return { fromDate: anchorDate, toDate: anchorDate, label: `Ngày ${anchorDate}` };
  }
  if (mode === 'MONTH') {
    const ym = anchorMonth || anchorDate.slice(0, 7);
    const [y, m] = ym.split('-').map(Number);
    const lastDay = y && m ? new Date(Date.UTC(y, m, 0)).getUTCDate() : 31;
    const fromDate = `${ym}-01`;
    const toDate = `${ym}-${String(lastDay).padStart(2, '0')}`;
    return { fromDate, toDate, label: `Tháng ${ym}` };
  }

  // WEEK (Mon -> Sun containing anchorDate)
  const d = new Date(`${anchorDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return { fromDate: anchorDate, toDate: anchorDate, label: `Tuần ${anchorDate}` };
  }
  const jsDay = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diffToMon = jsDay === 0 ? -6 : 1 - jsDay;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diffToMon);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const fromDate = mon.toISOString().slice(0, 10);
  const toDate = sun.toISOString().slice(0, 10);
  return { fromDate, toDate, label: `Tuần ${fromDate} → ${toDate}` };
}

export interface DailyCriterionCount {
  criterionId: string;
  name: string;
  group: DailyCriterionGroup;
  count: number;
}

export interface StudentDailySummary {
  studentId: string;
  assessedCount: number;
  notAssessedCount: number;
  noOpportunityCount: number;
  noNotableBehaviorCount: number;
  positiveMarksCount: number;
  supportMarksCount: number;
  positiveBreakdown: DailyCriterionCount[];
  supportBreakdown: DailyCriterionCount[];
  latestRecords: DailyAssessment[];
}

export interface DailyHistorySummary {
  totalRecords: number;
  assessedCount: number;
  notAssessedCount: number;
  noOpportunityCount: number;
  noNotableBehaviorCount: number;
  positiveMarksTotal: number;
  supportMarksTotal: number;
  positiveBreakdown: DailyCriterionCount[];
  supportBreakdown: DailyCriterionCount[];
  byStudent: Map<string, StudentDailySummary>;
}

export function summarizeDailyHistory(params: {
  records: DailyAssessment[];
  criteria: DailyBehaviorCriterion[];
  students: Student[];
}): DailyHistorySummary {
  const { records, criteria, students } = params;
  const criteriaById = new Map(criteria.map((c) => [c.id, c]));

  let assessedCount = 0;
  let notAssessedCount = 0;
  let noOpportunityCount = 0;
  let noNotableBehaviorCount = 0;
  let positiveMarksTotal = 0;
  let supportMarksTotal = 0;

  const classPosCounts = new Map<string, number>();
  const classSupCounts = new Map<string, number>();

  const studentAgg = new Map<
    string,
    {
      assessedCount: number;
      notAssessedCount: number;
      noOpportunityCount: number;
      noNotableBehaviorCount: number;
      positiveMarksCount: number;
      supportMarksCount: number;
      posCounts: Map<string, number>;
      supCounts: Map<string, number>;
      latestRecords: DailyAssessment[];
    }
  >();

  const ensureStu = (stuId: string) => {
    let entry = studentAgg.get(stuId);
    if (!entry) {
      entry = {
        assessedCount: 0,
        notAssessedCount: 0,
        noOpportunityCount: 0,
        noNotableBehaviorCount: 0,
        positiveMarksCount: 0,
        supportMarksCount: 0,
        posCounts: new Map(),
        supCounts: new Map(),
        latestRecords: [],
      };
      studentAgg.set(stuId, entry);
    }
    return entry;
  };

  for (const stu of students) {
    ensureStu(stu.id);
  }

  for (const rec of records) {
    const stu = ensureStu(rec.studentId);
    stu.latestRecords.push(rec);

    const status = rec.evaluationStatus ?? DailyEvaluationStatus.ASSESSED;
    if (status === DailyEvaluationStatus.ASSESSED) {
      assessedCount += 1;
      stu.assessedCount += 1;
    } else if (status === DailyEvaluationStatus.NO_OPPORTUNITY) {
      noOpportunityCount += 1;
      stu.noOpportunityCount += 1;
    } else if (status === DailyEvaluationStatus.NO_NOTABLE_BEHAVIOR) {
      noNotableBehaviorCount += 1;
      stu.noNotableBehaviorCount += 1;
    } else {
      notAssessedCount += 1;
      stu.notAssessedCount += 1;
    }

    // Never infer negative behavior from unassessed or neutral records;
    // only explicitly tagged criteria contribute to positive/support counts.
    const cIds = Array.isArray(rec.criterionIds)
      ? rec.criterionIds
      : rec.criterionId
        ? [rec.criterionId]
        : [];
    for (const cid of cIds) {
      const crit = criteriaById.get(cid);
      if (!crit) continue;
      if (crit.group === 'POSITIVE') {
        positiveMarksTotal += 1;
        stu.positiveMarksCount += 1;
        classPosCounts.set(cid, (classPosCounts.get(cid) ?? 0) + 1);
        stu.posCounts.set(cid, (stu.posCounts.get(cid) ?? 0) + 1);
      } else {
        supportMarksTotal += 1;
        stu.supportMarksCount += 1;
        classSupCounts.set(cid, (classSupCounts.get(cid) ?? 0) + 1);
        stu.supCounts.set(cid, (stu.supCounts.get(cid) ?? 0) + 1);
      }
    }
  }

  const mapCounts = (countsMap: Map<string, number>, group: DailyCriterionGroup): DailyCriterionCount[] =>
    Array.from(countsMap.entries())
      .map(([criterionId, count]) => ({
        criterionId,
        name: criteriaById.get(criterionId)?.name ?? criterionId,
        group,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));

  const byStudent = new Map<string, StudentDailySummary>();
  for (const [stuId, data] of studentAgg.entries()) {
    byStudent.set(stuId, {
      studentId: stuId,
      assessedCount: data.assessedCount,
      notAssessedCount: data.notAssessedCount,
      noOpportunityCount: data.noOpportunityCount,
      noNotableBehaviorCount: data.noNotableBehaviorCount,
      positiveMarksCount: data.positiveMarksCount,
      supportMarksCount: data.supportMarksCount,
      positiveBreakdown: mapCounts(data.posCounts, 'POSITIVE'),
      supportBreakdown: mapCounts(data.supCounts, 'NEEDS_SUPPORT'),
      latestRecords: data.latestRecords.sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate)),
    });
  }

  return {
    totalRecords: records.length,
    assessedCount,
    notAssessedCount,
    noOpportunityCount,
    noNotableBehaviorCount,
    positiveMarksTotal,
    supportMarksTotal,
    positiveBreakdown: mapCounts(classPosCounts, 'POSITIVE'),
    supportBreakdown: mapCounts(classSupCounts, 'NEEDS_SUPPORT'),
    byStudent,
  };
}

export interface SaveStudentDailyObservationInput {
  academicYearId: string;
  classId: string;
  studentId: string;
  teacherId?: string;
  editorName?: string;
  homeroomAssignmentId?: string;
  assessmentDate: string;
  evaluationStatus?: DailyEvaluationStatus;
  criterionIds: string[];
  comment: string;
}

export const dailyAssessmentService = {
  async ensureDefaultDailyCriteria(): Promise<ServiceResult<DailyBehaviorCriterion[]>> {
    return executeService(async () => {
      const count = await db.dailyCriteria.count();
      if (count === 0) {
        const now = new Date().toISOString();
        const records: DailyBehaviorCriterion[] = DEFAULT_DAILY_CRITERIA.map((seed) => ({
          id: seed.id,
          code: seed.code,
          name: seed.name,
          group: seed.group,
          description: seed.description,
          isHidden: false,
          isSystemDefault: true,
          displayOrder: seed.displayOrder,
          createdAt: now,
          updatedAt: now,
        }));
        await db.dailyCriteria.bulkPut(records);
      }
      const all = await db.dailyCriteria.toArray();
      return all.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'vi'));
    }, 'Không thể khởi tạo danh mục tiêu chí đánh giá hằng ngày.');
  },

  async listCriteria(includeHidden = true): Promise<ServiceResult<DailyBehaviorCriterion[]>> {
    return executeService(async () => {
      const ensured = await this.ensureDefaultDailyCriteria();
      const items = ensured.ok ? ensured.data : await db.dailyCriteria.toArray();
      return includeHidden ? items : items.filter((c) => !c.isHidden);
    }, 'Không thể tải danh mục tiêu chí đánh giá hằng ngày.');
  },

  async createCriterion(input: {
    name: string;
    group: DailyCriterionGroup;
    description?: string;
    teacherId?: string;
  }): Promise<ServiceResult<DailyBehaviorCriterion>> {
    return executeService(async () => {
      const name = input.name.trim();
      if (!name) {
        throw new Error('Tên tiêu chí không được để trống.');
      }
      const existing = await db.dailyCriteria.toArray();
      const maxOrder = existing.reduce((max, item) => Math.max(max, item.displayOrder), 0);
      const codePrefix = input.group === 'POSITIVE' ? 'TC' : 'HT';
      const code = `${codePrefix}-${maxOrder + 1}`;
      const record: DailyBehaviorCriterion = {
        ...createBaseFields(),
        code,
        name,
        group: input.group,
        description: input.description?.trim() || undefined,
        isHidden: false,
        isSystemDefault: false,
        displayOrder: maxOrder + 1,
        teacherId: input.teacherId,
      };
      await db.dailyCriteria.add(record);
      await recordAuditLog('CREATE', 'dailyCriteria', `Thêm tiêu chí hằng ngày "${record.name}"`, record.id);
      return record;
    }, 'Không thể thêm tiêu chí hằng ngày.');
  },

  async updateCriterion(
    id: string,
    patch: { name?: string; group?: DailyCriterionGroup; description?: string; isHidden?: boolean }
  ): Promise<ServiceResult<DailyBehaviorCriterion>> {
    return executeService(async () => {
      const existing = await db.dailyCriteria.get(id);
      if (!existing) {
        throw new Error('Không tìm thấy tiêu chí cần cập nhật.');
      }
      const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
      if (!nextName) {
        throw new Error('Tên tiêu chí không được để trống.');
      }
      const updated: DailyBehaviorCriterion = {
        ...existing,
        ...patch,
        name: nextName,
        description: patch.description !== undefined ? patch.description.trim() || undefined : existing.description,
        updatedAt: new Date().toISOString(),
      };
      await db.dailyCriteria.put(updated);
      await recordAuditLog('UPDATE', 'dailyCriteria', `Cập nhật tiêu chí hằng ngày "${updated.name}"`, id);
      return updated;
    }, 'Không thể cập nhật tiêu chí hằng ngày.');
  },

  async toggleHideCriterion(id: string, isHidden: boolean): Promise<ServiceResult<DailyBehaviorCriterion>> {
    return this.updateCriterion(id, { isHidden });
  },

  async listByClassAndDate(classId: string, assessmentDate: string): Promise<ServiceResult<DailyAssessment[]>> {
    return executeService(async () => {
      const rows = await db.dailyAssessments
        .where('[classId+assessmentDate]')
        .equals([classId, assessmentDate])
        .toArray();
      return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    }, 'Không thể tải đánh giá hằng ngày theo lớp.');
  },

  async listHistory(filters: {
    academicYearId?: string;
    classId?: string;
    studentId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ServiceResult<DailyAssessment[]>> {
    return executeService(async () => {
      let rows: DailyAssessment[];
      if (filters.studentId) {
        rows = await db.dailyAssessments.where('studentId').equals(filters.studentId).toArray();
      } else if (filters.classId) {
        rows = await db.dailyAssessments.where('classId').equals(filters.classId).toArray();
      } else {
        rows = await db.dailyAssessments.toArray();
      }

      return rows
        .filter((r) => {
          if (filters.academicYearId && r.academicYearId !== filters.academicYearId) return false;
          if (filters.classId && r.classId !== filters.classId) return false;
          if (filters.studentId && r.studentId !== filters.studentId) return false;
          if (filters.fromDate && r.assessmentDate < filters.fromDate) return false;
          if (filters.toDate && r.assessmentDate > filters.toDate) return false;
          return true;
        })
        .sort((a, b) => b.assessmentDate.localeCompare(a.assessmentDate) || b.savedAt.localeCompare(a.savedAt));
    }, 'Không thể tải lịch sử đánh giá hằng ngày.');
  },

  async saveStudentDailyObservation(
    input: SaveStudentDailyObservationInput
  ): Promise<ServiceResult<DailyAssessment>> {
    return executeService(async () => {
      if (!input.academicYearId || !input.classId || !input.studentId || !input.assessmentDate) {
        throw new Error('Vui lòng chọn đầy đủ năm học, lớp chủ nhiệm, học sinh và ngày đánh giá.');
      }

      const [existing, allCriteria] = await Promise.all([
        db.dailyAssessments
          .where('[classId+studentId+assessmentDate]')
          .equals([input.classId, input.studentId, input.assessmentDate])
          .first(),
        db.dailyCriteria.toArray(),
      ]);

      const criteriaById = new Map(allCriteria.map((c) => [c.id, c]));
      const uniqueCriterionIds = Array.from(new Set(input.criterionIds));
      const trimmedComment = input.comment.trim();
      const effectiveStatus = resolveEffectiveDailyStatus({
        requestedStatus: input.evaluationStatus,
        criterionIds: uniqueCriterionIds,
        comment: trimmedComment,
      });

      const snapshotLabels = uniqueCriterionIds
        .map((id) => criteriaById.get(id)?.name)
        .filter((n): n is string => Boolean(n));

      const now = new Date().toISOString();
      const editEntry: DailyAssessmentEditEntry = {
        editedAt: now,
        editorTeacherId: input.teacherId,
        editorName: input.editorName,
        evaluationStatus: effectiveStatus,
        criterionIds: uniqueCriterionIds,
        comment: trimmedComment,
        summary: buildDailyEditSummary({
          evaluationStatus: effectiveStatus,
          criterionIds: uniqueCriterionIds,
          comment: trimmedComment,
          criteriaById,
        }),
      };

      if (existing) {
        const updated: DailyAssessment = {
          ...existing,
          academicYearId: input.academicYearId,
          teacherId: input.teacherId ?? existing.teacherId,
          homeroomAssignmentId: input.homeroomAssignmentId ?? existing.homeroomAssignmentId,
          evaluationStatus: effectiveStatus,
          criterionIds: uniqueCriterionIds,
          criterionLabelsSnapshot: snapshotLabels,
          criterionId: uniqueCriterionIds[0],
          comment: trimmedComment,
          savedAt: now,
          updatedAt: now,
          editHistory: [editEntry, ...(existing.editHistory ?? [])],
        };
        await db.dailyAssessments.put(updated);
        await recordAuditLog(
          'UPDATE',
          'dailyAssessments',
          `Cập nhật đánh giá ngày ${updated.assessmentDate} (${DAILY_EVALUATION_STATUS_LABELS[effectiveStatus]})`,
          updated.id,
          input.editorName ? { actorName: input.editorName } : undefined
        );
        return updated;
      }

      const created: DailyAssessment = {
        ...createBaseFields(),
        academicYearId: input.academicYearId,
        classId: input.classId,
        studentId: input.studentId,
        teacherId: input.teacherId,
        homeroomAssignmentId: input.homeroomAssignmentId,
        assessmentDate: input.assessmentDate,
        evaluationStatus: effectiveStatus,
        criterionIds: uniqueCriterionIds,
        criterionLabelsSnapshot: snapshotLabels,
        criterionId: uniqueCriterionIds[0],
        comment: trimmedComment,
        savedAt: now,
        editHistory: [editEntry],
      };
      await db.dailyAssessments.add(created);
      await recordAuditLog(
        'CREATE',
        'dailyAssessments',
        `Lưu đánh giá hằng ngày ${created.assessmentDate} (${DAILY_EVALUATION_STATUS_LABELS[effectiveStatus]})`,
        created.id,
        input.editorName ? { actorName: input.editorName } : undefined
      );
      return created;
    }, 'Không thể lưu đánh giá hằng ngày.');
  },

  async saveClassDailyBatch(
    inputs: SaveStudentDailyObservationInput[]
  ): Promise<ServiceResult<DailyAssessment[]>> {
    return executeService(async () => {
      if (inputs.length === 0) return [];
      const now = new Date().toISOString();
      const allCriteria = await db.dailyCriteria.toArray();
      const criteriaById = new Map(allCriteria.map((c) => [c.id, c]));
      const saved: DailyAssessment[] = [];

      await db.transaction('rw', db.dailyAssessments, async () => {
        for (const input of inputs) {
          if (!input.academicYearId || !input.classId || !input.studentId || !input.assessmentDate) {
            continue;
          }

          const existing = await db.dailyAssessments
            .where('[classId+studentId+assessmentDate]')
            .equals([input.classId, input.studentId, input.assessmentDate])
            .first();

          const uniqueCriterionIds = Array.from(new Set(input.criterionIds));
          const trimmedComment = input.comment.trim();
          const effectiveStatus = resolveEffectiveDailyStatus({
            requestedStatus: input.evaluationStatus,
            criterionIds: uniqueCriterionIds,
            comment: trimmedComment,
          });

          // Skip untouched NOT_ASSESSED students if no prior record exists
          if (!existing && effectiveStatus === DailyEvaluationStatus.NOT_ASSESSED && uniqueCriterionIds.length === 0 && !trimmedComment) {
            continue;
          }

          const snapshotLabels = uniqueCriterionIds
            .map((id) => criteriaById.get(id)?.name)
            .filter((n): n is string => Boolean(n));

          // Avoid noisy redundant edit log entries when an already saved row is unchanged
          const isUnchanged =
            Boolean(existing) &&
            existing!.evaluationStatus === effectiveStatus &&
            existing!.comment === trimmedComment &&
            existing!.criterionIds.length === uniqueCriterionIds.length &&
            existing!.criterionIds.every((id) => uniqueCriterionIds.includes(id));

          if (existing && isUnchanged) {
            saved.push(existing);
            continue;
          }

          const editEntry: DailyAssessmentEditEntry = {
            editedAt: now,
            editorTeacherId: input.teacherId,
            editorName: input.editorName,
            evaluationStatus: effectiveStatus,
            criterionIds: uniqueCriterionIds,
            comment: trimmedComment,
            summary: buildDailyEditSummary({
              evaluationStatus: effectiveStatus,
              criterionIds: uniqueCriterionIds,
              comment: trimmedComment,
              criteriaById,
            }),
          };

          if (existing) {
            const updated: DailyAssessment = {
              ...existing,
              academicYearId: input.academicYearId,
              teacherId: input.teacherId ?? existing.teacherId,
              homeroomAssignmentId: input.homeroomAssignmentId ?? existing.homeroomAssignmentId,
              evaluationStatus: effectiveStatus,
              criterionIds: uniqueCriterionIds,
              criterionLabelsSnapshot: snapshotLabels,
              criterionId: uniqueCriterionIds[0],
              comment: trimmedComment,
              savedAt: now,
              updatedAt: now,
              editHistory: [editEntry, ...(existing.editHistory ?? [])],
            };
            await db.dailyAssessments.put(updated);
            saved.push(updated);
          } else {
            const created: DailyAssessment = {
              ...createBaseFields(),
              academicYearId: input.academicYearId,
              classId: input.classId,
              studentId: input.studentId,
              teacherId: input.teacherId,
              homeroomAssignmentId: input.homeroomAssignmentId,
              assessmentDate: input.assessmentDate,
              evaluationStatus: effectiveStatus,
              criterionIds: uniqueCriterionIds,
              criterionLabelsSnapshot: snapshotLabels,
              criterionId: uniqueCriterionIds[0],
              comment: trimmedComment,
              savedAt: now,
              editHistory: [editEntry],
            };
            await db.dailyAssessments.add(created);
            saved.push(created);
          }
        }
      });

      const first = inputs[0];
      await recordAuditLog(
        'UPDATE',
        'dailyAssessments',
        `Lưu đánh giá cả lớp ngày ${first?.assessmentDate ?? ''} (${saved.length} học sinh)`,
        undefined,
        first?.editorName ? { actorName: first.editorName } : undefined
      );
      return saved;
    }, 'Không thể lưu hàng loạt đánh giá hằng ngày.');
  },

  async removeDailyAssessment(id: string): Promise<ServiceResult<void>> {
    return executeService(async () => {
      await db.dailyAssessments.delete(id);
      await recordAuditLog('DELETE', 'dailyAssessments', 'Xóa bản ghi đánh giá hằng ngày', id);
    }, 'Không thể xóa bản ghi đánh giá hằng ngày.');
  },
};
