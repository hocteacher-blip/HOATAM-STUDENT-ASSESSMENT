import { DB_SCHEMA_VERSION, db, ensureAppSettingsInitialized } from '../db/database';
import type {
  AppSettings,
  AuditLog,
  BackupPackage,
  ServiceResult,
} from '../types/models';
import { executeService, recordAuditLog } from './baseRepository';

export const BACKUP_FORMAT_VERSION = 2;

export interface OverviewStats {
  academicYearsCount: number;
  teachersCount: number;
  classesCount: number;
  studentsCount: number;
  subjectsCount: number;
  criteriaCount: number;
  dailyAssessmentsCount: number;
  lessonAssessmentsCount: number;
  periodicResultsCount: number;
  recentLogs: AuditLog[];
  ratingBreakdown: Array<{ rating: string; label: string; count: number }>;
  classStudentCounts: Array<{ className: string; studentCount: number }>;
}

const RATING_LABELS: Record<string, string> = {
  HTT: 'Hoàn thành tốt',
  HT: 'Hoàn thành',
  CHT: 'Chưa hoàn thành',
  T: 'Tốt',
  D: 'Đạt',
  CCG: 'Cần cố gắng',
};

const BACKUP_TABLE_KEYS: Array<keyof BackupPackage['tables']> = [
  'academicYears',
  'teachers',
  'teacherRoles',
  'teacherRoleGrants',
  'teacherAssignments',
  'teacherAssignmentHistory',
  'classes',
  'students',
  'studentClassHistory',
  'subjects',
  'criteria',
  'dailyCriteria',
  'timetables',
  'timetableLessons',
  'assessmentPeriods',
  'dailyAssessments',
  'lessonAssessments',
  'assessmentEvidence',
  'assessmentResults',
  'assessmentRules',
  'comments',
  'auditLogs',
  'appSettings',
];

export const BACKUP_TABLE_LABELS: Record<string, string> = {
  academicYears: 'Năm học',
  teachers: 'Giáo viên',
  teacherRoles: 'Vai trò',
  teacherRoleGrants: 'Phân quyền vai trò',
  teacherAssignments: 'Phân công nhiệm vụ',
  teacherAssignmentHistory: 'Lịch sử phân công',
  classes: 'Lớp học',
  students: 'Học sinh',
  studentClassHistory: 'Lịch sử chuyển lớp',
  subjects: 'Môn học',
  criteria: 'Tiêu chí đánh giá',
  dailyCriteria: 'Tiêu chí hằng ngày',
  timetables: 'Thời khóa biểu',
  timetableLessons: 'Tiết học TKB',
  assessmentPeriods: 'Đợt đánh giá',
  dailyAssessments: 'Đánh giá hằng ngày',
  lessonAssessments: 'Đánh giá theo tiết',
  assessmentEvidence: 'Minh chứng đánh giá',
  assessmentResults: 'Kết quả định kỳ',
  assessmentRules: 'Bộ quy tắc đánh giá',
  comments: 'Nhận xét',
  auditLogs: 'Nhật ký hệ thống',
  appSettings: 'Cài đặt hệ thống',
};

/**
 * Deterministic 64-bit integrity hash (two independent 32-bit FNV-1a passes)
 * working identically offline in browser and Node without async WebCrypto limitations.
 */
export function computeBackupChecksum(tables: BackupPackage['tables']): string {
  const canonicalPayload = JSON.stringify(
    BACKUP_TABLE_KEYS.map((k) => [k, tables[k] ?? []])
  );
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < canonicalPayload.length; i++) {
    const c = canonicalPayload.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (c + (i & 0xff)) >>> 0;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `HTCHK-${h1.toString(16).padStart(8, '0')}-${h2.toString(16).padStart(8, '0')}`;
}

export interface BackupValidationDetails {
  pkg: BackupPackage;
  totalBackupRecords: number;
  checksumStatus: 'VERIFIED' | 'MISSING_LEGACY' | 'MISMATCH';
  warnings: string[];
}

export interface BackupRestoreInspection {
  totalCurrentRecords: number;
  totalBackupRecords: number;
  newRecordsCount: number;
  overlappingIdCount: number;
  willLoseCurrentOnlyCount: number;
  perTable: Array<{
    tableKey: string;
    tableLabel: string;
    currentCount: number;
    backupCount: number;
    overlappingCount: number;
    newCount: number;
  }>;
}

export const systemService = {
  async getSettings(): Promise<ServiceResult<AppSettings>> {
    return executeService(async () => {
      return ensureAppSettingsInitialized();
    }, 'Không thể tải cài đặt hệ thống.');
  },

  async updateSettings(
    patch: Partial<Omit<AppSettings, 'id' | 'key' | 'createdAt' | 'updatedAt'>>
  ): Promise<ServiceResult<AppSettings>> {
    return executeService(async () => {
      const current = await ensureAppSettingsInitialized();
      const updated: AppSettings = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      await db.appSettings.put(updated);
      await recordAuditLog('UPDATE', 'appSettings', 'Cập nhật cấu hình hệ thống', updated.id);
      return updated;
    }, 'Không thể lưu cài đặt hệ thống.');
  },

  async listAuditLogs(limit = 100): Promise<ServiceResult<AuditLog[]>> {
    return executeService(async () => {
      const items = await db.auditLogs.orderBy('createdAt').reverse().limit(limit).toArray();
      return items;
    }, 'Không thể tải nhật ký hoạt động.');
  },

  async getOverviewStats(activeAcademicYearId?: string): Promise<ServiceResult<OverviewStats>> {
    return executeService(async () => {
      const [
        academicYearsCount,
        teachersCount,
        allClasses,
        allStudents,
        subjectsCount,
        criteriaCount,
        allDaily,
        allLesson,
        allResults,
        recentLogs,
      ] = await Promise.all([
        db.academicYears.count(),
        db.teachers.count(),
        db.classes.toArray(),
        db.students.toArray(),
        db.subjects.count(),
        db.criteria.count(),
        db.dailyAssessments.toArray(),
        db.lessonAssessments.toArray(),
        db.assessmentResults.toArray(),
        db.auditLogs.orderBy('createdAt').reverse().limit(8).toArray(),
      ]);

      const classes = activeAcademicYearId
        ? allClasses.filter((c) => c.academicYearId === activeAcademicYearId)
        : allClasses;
      const students = activeAcademicYearId
        ? allStudents.filter((s) => s.academicYearId === activeAcademicYearId)
        : allStudents;
      const daily = activeAcademicYearId
        ? allDaily.filter((d) => d.academicYearId === activeAcademicYearId)
        : allDaily;
      const lesson = activeAcademicYearId
        ? allLesson.filter((l) => l.academicYearId === activeAcademicYearId)
        : allLesson;
      const results = activeAcademicYearId
        ? allResults.filter((r) => r.academicYearId === activeAcademicYearId)
        : allResults;

      const ratingCounter = new Map<string, number>();
      for (const item of [...daily, ...lesson, ...results]) {
        if (!item.ratingLevel) continue;
        ratingCounter.set(item.ratingLevel, (ratingCounter.get(item.ratingLevel) ?? 0) + 1);
      }

      const ratingBreakdown = Array.from(ratingCounter.entries()).map(([rating, count]) => ({
        rating,
        label: RATING_LABELS[rating] ?? rating,
        count,
      }));

      const classStudentCounts = classes.map((cls) => ({
        className: cls.name,
        studentCount: students.filter((s) => s.classId === cls.id).length,
      }));

      return {
        academicYearsCount,
        teachersCount,
        classesCount: classes.length,
        studentsCount: students.length,
        subjectsCount,
        criteriaCount,
        dailyAssessmentsCount: daily.length,
        lessonAssessmentsCount: lesson.length,
        periodicResultsCount: results.length,
        recentLogs,
        ratingBreakdown,
        classStudentCounts,
      };
    }, 'Không thể tổng hợp số liệu tổng quan.');
  },

  async createBackupPackage(exportedBy?: string): Promise<ServiceResult<BackupPackage>> {
    return executeService(async () => {
      const [
        academicYears,
        teachers,
        teacherRoles,
        teacherRoleGrants,
        teacherAssignments,
        teacherAssignmentHistory,
        classes,
        students,
        studentClassHistory,
        subjects,
        criteria,
        dailyCriteria,
        timetables,
        timetableLessons,
        assessmentPeriods,
        dailyAssessments,
        lessonAssessments,
        assessmentEvidence,
        assessmentResults,
        assessmentRules,
        comments,
        auditLogs,
        appSettings,
      ] = await Promise.all([
        db.academicYears.toArray(),
        db.teachers.toArray(),
        db.teacherRoles.toArray(),
        db.teacherRoleGrants.toArray(),
        db.teacherAssignments.toArray(),
        db.teacherAssignmentHistory.toArray(),
        db.classes.toArray(),
        db.students.toArray(),
        db.studentClassHistory.toArray(),
        db.subjects.toArray(),
        db.criteria.toArray(),
        db.dailyCriteria.toArray(),
        db.timetables.toArray(),
        db.timetableLessons.toArray(),
        db.assessmentPeriods.toArray(),
        db.dailyAssessments.toArray(),
        db.lessonAssessments.toArray(),
        db.assessmentEvidence.toArray(),
        db.assessmentResults.toArray(),
        db.assessmentRules.toArray(),
        db.comments.toArray(),
        db.auditLogs.toArray(),
        db.appSettings.toArray(),
      ]);

      const tables: BackupPackage['tables'] = {
        academicYears,
        teachers,
        teacherRoles,
        teacherRoleGrants,
        teacherAssignments,
        teacherAssignmentHistory,
        classes,
        students,
        studentClassHistory,
        subjects,
        criteria,
        dailyCriteria,
        timetables,
        timetableLessons,
        assessmentPeriods,
        dailyAssessments,
        lessonAssessments,
        assessmentEvidence,
        assessmentResults,
        assessmentRules,
        comments,
        auditLogs,
        appSettings,
      };

      const tableCounts: Record<string, number> = {};
      for (const [key, list] of Object.entries(tables)) {
        tableCounts[key] = list.length;
      }

      const exportedAt = new Date().toISOString();
      const settings = await ensureAppSettingsInitialized();
      await db.appSettings.update(settings.id, {
        lastBackupAt: exportedAt,
        updatedAt: exportedAt,
      });

      await recordAuditLog('BACKUP', 'system', 'Xuất gói sao lưu toàn bộ dữ liệu IndexedDB (JSON v2)');

      return {
        appName: 'HOATAM_STUDENT_ASSESSMENT',
        formatVersion: BACKUP_FORMAT_VERSION,
        dbSchemaVersion: DB_SCHEMA_VERSION,
        exportedAt,
        schoolName: settings.schoolName,
        exportedBy: exportedBy || 'Quản trị hệ thống cục bộ',
        checksum: computeBackupChecksum(tables),
        tableCounts,
        tables,
      };
    }, 'Không thể tạo bản sao lưu dữ liệu.');
  },

  validateBackupPackageDetailed(raw: unknown): ServiceResult<BackupValidationDetails> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'Tệp sao lưu không hợp lệ hoặc bị hỏng cấu trúc JSON.' };
    }

    const candidate = raw as Partial<BackupPackage>;
    if (candidate.appName !== 'HOATAM_STUDENT_ASSESSMENT') {
      return {
        ok: false,
        error: 'Tệp không phải gói sao lưu chuẩn của HOATAM Student Assessment.',
      };
    }

    if (typeof candidate.formatVersion !== 'number' || candidate.formatVersion < 1) {
      return { ok: false, error: 'Thiếu thông tin phiên bản định dạng sao lưu (formatVersion).' };
    }
    if (candidate.formatVersion > BACKUP_FORMAT_VERSION) {
      return {
        ok: false,
        error: `Phiên bản tệp sao lưu (v${candidate.formatVersion}) mới hơn phiên bản ứng dụng hỗ trợ (v${BACKUP_FORMAT_VERSION}). Vui lòng cập nhật ứng dụng trước khi khôi phục.`,
      };
    }
    if (typeof candidate.dbSchemaVersion !== 'number' || candidate.dbSchemaVersion < 1) {
      return { ok: false, error: 'Thiếu thông tin phiên bản cấu trúc cơ sở dữ liệu (dbSchemaVersion).' };
    }
    if (candidate.dbSchemaVersion > DB_SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Phiên bản CSDL của bản sao lưu (v${candidate.dbSchemaVersion}) cao hơn CSDL hiện tại (v${DB_SCHEMA_VERSION}). Không thể khôi phục ngược phiên bản.`,
      };
    }

    if (!candidate.tables || typeof candidate.tables !== 'object' || Array.isArray(candidate.tables)) {
      return { ok: false, error: 'Gói sao lưu bị thiếu khối dữ liệu "tables".' };
    }

    const tablesObj = candidate.tables as Record<string, unknown>;
    let totalBackupRecords = 0;

    // Validate core table types and row ID integrity
    for (const key of BACKUP_TABLE_KEYS) {
      const value = tablesObj[key];
      if (value === undefined) continue;
      if (!Array.isArray(value)) {
        return {
          ok: false,
          error: `Bảng "${BACKUP_TABLE_LABELS[key] ?? key}" trong tệp sao lưu không đúng định dạng mảng.`,
        };
      }
      for (let i = 0; i < value.length; i++) {
        const row = value[i];
        if (!row || typeof row !== 'object' || typeof (row as { id?: unknown }).id !== 'string' || !(row as { id: string }).id.trim()) {
          return {
            ok: false,
            error: `Bản ghi thứ ${i + 1} trong bảng "${BACKUP_TABLE_LABELS[key] ?? key}" bị thiếu trường định danh (id) hợp lệ.`,
          };
        }
      }
      totalBackupRecords += value.length;
    }

    const normalizedPkg = candidate as BackupPackage;
    let checksumStatus: BackupValidationDetails['checksumStatus'] = 'MISSING_LEGACY';
    const warnings: string[] = [];

    if (candidate.checksum) {
      const expected = computeBackupChecksum(normalizedPkg.tables);
      if (expected !== candidate.checksum) {
        return {
          ok: false,
          error:
            'Kiểm tra tính toàn vẹn thất bại (checksum không khớp). Tệp sao lưu có thể đã bị chỉnh sửa thủ công hoặc bị hỏng.',
        };
      }
      checksumStatus = 'VERIFIED';
    } else {
      warnings.push('Tệp sao lưu thuộc định dạng v1 (chưa có mã kiểm tra checksum), đã vượt qua kiểm tra cấu trúc bảng.');
    }

    if (candidate.dbSchemaVersion < DB_SCHEMA_VERSION) {
      warnings.push(
        `Bản sao lưu xuất từ schema v${candidate.dbSchemaVersion} (hiện tại v${DB_SCHEMA_VERSION}); các bảng mới hơn sẽ giữ mặc định an toàn.`
      );
    }

    return {
      ok: true,
      data: {
        pkg: normalizedPkg,
        totalBackupRecords,
        checksumStatus,
        warnings,
      },
    };
  },

  validateBackupPackage(raw: unknown): ServiceResult<BackupPackage> {
    const detailed = this.validateBackupPackageDetailed(raw);
    if (!detailed.ok) {
      return detailed;
    }
    return { ok: true, data: detailed.data.pkg };
  },

  async inspectBackupAgainstCurrentDb(
    pkg: BackupPackage
  ): Promise<ServiceResult<BackupRestoreInspection>> {
    return executeService(async () => {
      const currentRowsByKey: Record<string, Array<{ id: string }>> = {
        academicYears: await db.academicYears.toArray(),
        teachers: await db.teachers.toArray(),
        teacherRoles: await db.teacherRoles.toArray(),
        teacherRoleGrants: await db.teacherRoleGrants.toArray(),
        teacherAssignments: await db.teacherAssignments.toArray(),
        teacherAssignmentHistory: await db.teacherAssignmentHistory.toArray(),
        classes: await db.classes.toArray(),
        students: await db.students.toArray(),
        studentClassHistory: await db.studentClassHistory.toArray(),
        subjects: await db.subjects.toArray(),
        criteria: await db.criteria.toArray(),
        dailyCriteria: await db.dailyCriteria.toArray(),
        timetables: await db.timetables.toArray(),
        timetableLessons: await db.timetableLessons.toArray(),
        assessmentPeriods: await db.assessmentPeriods.toArray(),
        dailyAssessments: await db.dailyAssessments.toArray(),
        lessonAssessments: await db.lessonAssessments.toArray(),
        assessmentEvidence: await db.assessmentEvidence.toArray(),
        assessmentResults: await db.assessmentResults.toArray(),
        assessmentRules: await db.assessmentRules.toArray(),
        comments: await db.comments.toArray(),
        auditLogs: await db.auditLogs.toArray(),
        appSettings: await db.appSettings.toArray(),
      };

      let totalCurrentRecords = 0;
      let totalBackupRecords = 0;
      let newRecordsCount = 0;
      let overlappingIdCount = 0;
      let willLoseCurrentOnlyCount = 0;

      const perTable: BackupRestoreInspection['perTable'] = [];

      for (const key of BACKUP_TABLE_KEYS) {
        const currentRows = currentRowsByKey[key] ?? [];
        const backupRows = (pkg.tables[key] as Array<{ id: string }> | undefined) ?? [];
        const currentIds = new Set(currentRows.map((r) => r.id));
        const backupIds = new Set(backupRows.map((r) => r.id));

        let overlap = 0;
        let onlyInBackup = 0;
        for (const id of backupIds) {
          if (currentIds.has(id)) overlap += 1;
          else onlyInBackup += 1;
        }
        let onlyInCurrent = 0;
        for (const id of currentIds) {
          if (!backupIds.has(id)) onlyInCurrent += 1;
        }

        totalCurrentRecords += currentRows.length;
        totalBackupRecords += backupRows.length;
        overlappingIdCount += overlap;
        newRecordsCount += onlyInBackup;
        willLoseCurrentOnlyCount += onlyInCurrent;

        if (currentRows.length > 0 || backupRows.length > 0) {
          perTable.push({
            tableKey: key,
            tableLabel: BACKUP_TABLE_LABELS[key] ?? key,
            currentCount: currentRows.length,
            backupCount: backupRows.length,
            overlappingCount: overlap,
            newCount: onlyInBackup,
          });
        }
      }

      return {
        totalCurrentRecords,
        totalBackupRecords,
        newRecordsCount,
        overlappingIdCount,
        willLoseCurrentOnlyCount,
        perTable,
      };
    }, 'Không thể đối chiếu dữ liệu bản sao lưu với cơ sở dữ liệu hiện tại.');
  },

  async restoreBackupPackage(
    pkg: BackupPackage,
    mode: 'merge_missing' | 'replace_all'
  ): Promise<ServiceResult<{ restoredCount: number; skippedCount: number }>> {
    return executeService(async () => {
      // Re-validate integrity strictly before modifying anything
      const check = this.validateBackupPackageDetailed(pkg);
      if (!check.ok) {
        throw new Error(check.error);
      }

      let restoredCount = 0;
      let skippedCount = 0;

      await db.transaction('rw', db.tables, async () => {
        const tableMap: Array<{
          table: import('dexie').Table<{ id: string }, string>;
          rows: Array<{ id: string }>;
        }> = [
          { table: db.academicYears as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.academicYears ?? [] },
          { table: db.teachers as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.teachers ?? [] },
          { table: db.teacherRoles as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.teacherRoles ?? [] },
          { table: db.teacherRoleGrants as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.teacherRoleGrants ?? [] },
          { table: db.teacherAssignments as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.teacherAssignments ?? [] },
          { table: db.teacherAssignmentHistory as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.teacherAssignmentHistory ?? [] },
          { table: db.classes as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.classes ?? [] },
          { table: db.students as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.students ?? [] },
          { table: db.studentClassHistory as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.studentClassHistory ?? [] },
          { table: db.subjects as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.subjects ?? [] },
          { table: db.criteria as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.criteria ?? [] },
          { table: db.dailyCriteria as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.dailyCriteria ?? [] },
          { table: db.timetables as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.timetables ?? [] },
          { table: db.timetableLessons as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.timetableLessons ?? [] },
          { table: db.assessmentPeriods as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.assessmentPeriods ?? [] },
          { table: db.dailyAssessments as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.dailyAssessments ?? [] },
          { table: db.lessonAssessments as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.lessonAssessments ?? [] },
          { table: db.assessmentEvidence as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.assessmentEvidence ?? [] },
          { table: db.assessmentResults as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.assessmentResults ?? [] },
          { table: db.assessmentRules as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.assessmentRules ?? [] },
          { table: db.comments as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.comments ?? [] },
          { table: db.auditLogs as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.auditLogs ?? [] },
          { table: db.appSettings as import('dexie').Table<{ id: string }, string>, rows: pkg.tables.appSettings ?? [] },
        ];

        if (mode === 'replace_all') {
          for (const entry of tableMap) {
            await entry.table.clear();
            if (entry.rows.length > 0) {
              await entry.table.bulkPut(entry.rows);
              restoredCount += entry.rows.length;
            }
          }
        } else {
          for (const entry of tableMap) {
            for (const row of entry.rows) {
              const existing = await entry.table.get(row.id);
              if (existing) {
                skippedCount += 1;
              } else {
                await entry.table.put(row);
                restoredCount += 1;
              }
            }
          }
        }
      });

      await recordAuditLog(
        'RESTORE',
        'system',
        `Khôi phục dữ liệu (${mode === 'replace_all' ? 'Thay thế toàn bộ' : 'Chỉ bổ sung bản ghi mới'}): ${restoredCount} bản ghi`
      );

      return { restoredCount, skippedCount };
    }, 'Không thể khôi phục dữ liệu từ tệp sao lưu.');
  },
};
