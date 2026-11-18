import * as XLSX from 'xlsx';
import writeXlsxFile from 'write-excel-file/browser';
import {
  DailyEvaluationStatus,
  DayOfWeek,
  StudentGender,
  StudentStatus,
  SubjectAssessmentMode,
  TeacherAssignmentStatus,
  TeacherStatus,
  type AcademicYear,
  type AssessmentResult,
  type DailyAssessment,
  type DailyBehaviorCriterion,
  type LessonAssessment,
  type SchoolClass,
  type Student,
  type Subject,
  type Teacher,
  type TeacherAssignment,
  type TeacherRole,
  type TeacherRoleGrant,
  type Timetable,
  type TimetableLesson,
} from '../types/models';
import {
  DAILY_EVALUATION_STATUS_LABELS,
  DAY_OF_WEEK_LABELS,
  LESSON_PARTICIPATION_LABELS,
  RATING_LEVEL_LABELS,
  STUDENT_STATUS_LABELS,
  SUBJECT_MODE_LABELS,
  TEACHER_ASSIGNMENT_STATUS_LABELS,
  TEACHER_STATUS_LABELS,
} from '../utils/labels';
import { recordAuditLog } from './baseRepository';
import { classStudentService } from './classStudentService';
import { curriculumService } from './curriculumService';
import { exportStructuredVietnamesePdfReport } from './pdfService';
import type {
  ClassReportModel,
  StudentReportModel,
  SubjectReportModel,
} from './reportService';
import { teacherService } from './teacherService';
import { timetableService } from './timetableService';

export interface ParsedExcelSheet {
  fileName: string;
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  rows: Record<string, string>[];
}

export type DuplicateCheckType = 'NONE' | 'EXACT_CODE_DB' | 'DUPLICATE_IN_FILE' | 'NAME_DOB_MATCH';

// ==========================================
// 1. ĐỌC FILE EXCEL & NHẬN DIỆN CỘT CHUNG
// ==========================================

export async function readExcelWorkbook(file: File, sheetIndex = 0): Promise<ParsedExcelSheet> {
  const lowerName = file.name.toLowerCase();
  if (!/\.(xlsx|xls|xlsm|ods)$/.test(lowerName)) {
    throw new Error('Định dạng tệp không hợp lệ. Vui lòng chọn tệp Excel (.xlsx hoặc .xls).');
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('Tệp Excel trống (0 byte).');
  }

  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error('Tệp Excel không có trang tính (sheet) nào.');
  }

  const activeSheet = sheetNames[Math.min(Math.max(0, sheetIndex), sheetNames.length - 1)];
  const worksheet = workbook.Sheets[activeSheet];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
    raw: false,
  });

  const headers =
    rawRows.length > 0 ? Object.keys(rawRows[0]).filter((h) => !h.startsWith('__EMPTY')) : [];
  const rows = rawRows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      normalized[key] = String(row[key] ?? '').trim();
    }
    return normalized;
  });

  return {
    fileName: file.name,
    sheetNames,
    activeSheet,
    headers: headers.length > 0 ? headers : rawRows.length > 0 ? Object.keys(rawRows[0]) : [],
    rows,
  };
}

function findMatchingHeader(headers: string[], candidates: string[]): string {
  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    if (candidates.some((c) => lower.includes(c))) {
      return header;
    }
  }
  return '';
}

function normalizeDateString(raw: string): { value: string; valid: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: '', valid: true };
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    return { value: trimmed, valid: !Number.isNaN(d.getTime()) };
  }
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(trimmed);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    const iso = `${year}-${month}-${day}`;
    const d = new Date(iso);
    return {
      value: iso,
      valid: !Number.isNaN(d.getTime()) && Number(month) <= 12 && Number(day) <= 31,
    };
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return { value: parsed.toISOString().slice(0, 10), valid: true };
  }
  return { value: trimmed, valid: false };
}

function parseWeekdayCell(raw: string): number {
  const s = raw.trim().toLowerCase();
  if (!s) return 0;
  const numMatch = /[2-7]/.exec(s);
  if (numMatch) return Number(numMatch[0]);
  if (s.includes('hai') || s.includes('mon')) return 2;
  if (s.includes('ba') || s.includes('tue')) return 3;
  if (s.includes('tư') || s.includes('tu') || s.includes('wed')) return 4;
  if (s.includes('năm') || s.includes('nam') || s.includes('thu')) return 5;
  if (s.includes('sáu') || s.includes('sau') || s.includes('fri')) return 6;
  if (s.includes('bảy') || s.includes('bay') || s.includes('sat')) return 7;
  return 0;
}

// ==========================================
// 2. NHẬP EXCEL: HỌC SINH
// ==========================================

export interface ExcelColumnMapping {
  studentCode: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  className: string;
  guardianName: string;
  guardianPhone: string;
  address: string;
}

export interface StudentImportPreview {
  rowIndex: number;
  studentCode: string;
  fullName: string;
  dateOfBirth: string;
  gender: StudentGender;
  classNameFromFile: string;
  resolvedClassId?: string;
  guardianName: string;
  guardianPhone: string;
  address: string;
  duplicateType: DuplicateCheckType;
  duplicateNote?: string;
  isDuplicate: boolean;
  error?: string;
}

export function detectStudentColumnMapping(headers: string[]): ExcelColumnMapping {
  return {
    studentCode: findMatchingHeader(headers, ['mã học sinh', 'mã hs', 'ma hs', 'mahocsinh', 'studentcode', 'mã']),
    fullName: findMatchingHeader(headers, ['họ và tên', 'họ tên', 'hoten', 'fullname', 'tên học sinh']),
    dateOfBirth: findMatchingHeader(headers, ['ngày sinh', 'ngaysinh', 'dob', 'năm sinh']),
    gender: findMatchingHeader(headers, ['giới tính', 'gioitinh', 'gender']),
    className: findMatchingHeader(headers, ['lớp', 'ten lop', 'class']),
    guardianName: findMatchingHeader(headers, ['phụ huynh', 'người giám hộ', 'cha mẹ', 'guardian']),
    guardianPhone: findMatchingHeader(headers, ['điện thoại', 'số điện thoại', 'sđt', 'sdt', 'phone']),
    address: findMatchingHeader(headers, ['địa chỉ', 'dia chi', 'address']),
  };
}

export function buildStudentImportPreview(
  rows: Record<string, string>[],
  mapping: ExcelColumnMapping,
  existingStudents: Student[],
  classesInYear: SchoolClass[],
  defaultClassId: string
): StudentImportPreview[] {
  const existingCodeMap = new Map(existingStudents.map((s) => [s.studentCode.toLowerCase(), s]));
  const existingNameDobMap = new Map(
    existingStudents.map((s) => [`${s.fullName.trim().toLowerCase()}|${s.dateOfBirth}`, s])
  );
  const classByNameOrCode = new Map<string, SchoolClass>();
  for (const cls of classesInYear) {
    classByNameOrCode.set(cls.name.toLowerCase().trim(), cls);
    classByNameOrCode.set(cls.code.toLowerCase().trim(), cls);
  }

  const seenCodesInFile = new Set<string>();

  return rows.map((row, index) => {
    const studentCode = mapping.studentCode ? (row[mapping.studentCode] ?? '').trim() : '';
    const fullName = mapping.fullName ? (row[mapping.fullName] ?? '').trim() : '';
    const rawDob = mapping.dateOfBirth ? (row[mapping.dateOfBirth] ?? '').trim() : '';
    const genderRaw = (mapping.gender ? row[mapping.gender] ?? '' : '').toLowerCase().trim();
    const classNameFromFile = mapping.className ? (row[mapping.className] ?? '').trim() : '';
    const guardianName = mapping.guardianName ? (row[mapping.guardianName] ?? '').trim() : '';
    const guardianPhone = mapping.guardianPhone ? (row[mapping.guardianPhone] ?? '').trim() : '';
    const address = mapping.address ? (row[mapping.address] ?? '').trim() : '';

    const dobNormalized = normalizeDateString(rawDob);
    const dateOfBirth = dobNormalized.value || '2017-01-01';

    let gender = StudentGender.OTHER;
    if (genderRaw.includes('nam') || genderRaw === 'm') gender = StudentGender.MALE;
    else if (genderRaw.includes('nữ') || genderRaw.includes('nu') || genderRaw === 'f')
      gender = StudentGender.FEMALE;

    const matchedClass = classNameFromFile
      ? classByNameOrCode.get(classNameFromFile.toLowerCase())
      : undefined;
    const resolvedClassId = matchedClass?.id ?? defaultClassId;

    let error: string | undefined;
    if (!studentCode) error = 'Thiếu mã học sinh';
    else if (!fullName) error = 'Thiếu họ và tên';
    else if (!dobNormalized.valid) error = `Ngày sinh không hợp lệ ("${rawDob}")`;
    else if (classNameFromFile && !matchedClass && !defaultClassId)
      error = `Không tìm thấy lớp "${classNameFromFile}"`;

    let duplicateType: DuplicateCheckType = 'NONE';
    let duplicateNote: string | undefined;

    if (studentCode) {
      const codeKey = studentCode.toLowerCase();
      if (existingCodeMap.has(codeKey)) {
        duplicateType = 'EXACT_CODE_DB';
        const match = existingCodeMap.get(codeKey)!;
        duplicateNote = `Trùng mã với học sinh "${match.fullName}" trong CSDL`;
      } else if (seenCodesInFile.has(codeKey)) {
        duplicateType = 'DUPLICATE_IN_FILE';
        duplicateNote = 'Trùng mã học sinh ngay trong tệp Excel';
      } else {
        seenCodesInFile.add(codeKey);
      }
    }

    if (duplicateType === 'NONE' && fullName) {
      const nameDobKey = `${fullName.toLowerCase()}|${dateOfBirth}`;
      const match = existingNameDobMap.get(nameDobKey);
      if (match) {
        duplicateType = 'NAME_DOB_MATCH';
        duplicateNote = `Trùng họ tên & ngày sinh với mã ${match.studentCode}`;
      }
    }

    return {
      rowIndex: index + 1,
      studentCode,
      fullName,
      dateOfBirth,
      gender,
      classNameFromFile,
      resolvedClassId,
      guardianName,
      guardianPhone,
      address,
      duplicateType,
      duplicateNote,
      isDuplicate: duplicateType !== 'NONE',
      error,
    };
  });
}

export async function commitStudentImport(
  items: StudentImportPreview[],
  defaultClass: SchoolClass,
  classesMap: Map<string, SchoolClass>,
  skipPotentialNameDobDuplicates = true
): Promise<{ imported: number; skippedDuplicate: number; failed: number }> {
  let imported = 0;
  let skippedDuplicate = 0;
  let failed = 0;

  for (const item of items) {
    if (item.error) {
      failed += 1;
      continue;
    }
    if (item.duplicateType === 'EXACT_CODE_DB' || item.duplicateType === 'DUPLICATE_IN_FILE') {
      skippedDuplicate += 1;
      continue;
    }
    if (item.duplicateType === 'NAME_DOB_MATCH' && skipPotentialNameDobDuplicates) {
      skippedDuplicate += 1;
      continue;
    }

    const targetClass =
      (item.resolvedClassId ? classesMap.get(item.resolvedClassId) : undefined) ?? defaultClass;

    const res = await classStudentService.createStudent({
      studentCode: item.studentCode,
      fullName: item.fullName,
      dateOfBirth: item.dateOfBirth,
      gender: item.gender,
      classId: targetClass.id,
      academicYearId: targetClass.academicYearId,
      guardianName: item.guardianName || undefined,
      guardianPhone: item.guardianPhone || undefined,
      address: item.address || undefined,
      status: StudentStatus.STUDYING,
    });
    if (res.ok) imported += 1;
    else failed += 1;
  }

  await recordAuditLog(
    'IMPORT',
    'students',
    `Nhập Excel học sinh: ${imported} thêm mới, ${skippedDuplicate} bỏ qua do trùng, ${failed} lỗi`
  );
  return { imported, skippedDuplicate, failed };
}

export async function exportStudentTemplateExcel(): Promise<void> {
  type TemplateRow = Record<string, string>;
  await writeXlsxFile<TemplateRow>([], {
    sheet: 'HocSinh',
    columns: [
      { header: { value: 'Mã học sinh', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.code ?? '' }) },
      { header: { value: 'Họ và tên', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.name ?? '' }) },
      { header: { value: 'Ngày sinh (YYYY-MM-DD)', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.dob ?? '' }) },
      { header: { value: 'Giới tính (Nam/Nữ)', fontWeight: 'bold' }, width: 20, cell: (r) => ({ type: String, value: r.gender ?? '' }) },
      { header: { value: 'Lớp', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.className ?? '' }) },
      { header: { value: 'Phụ huynh', fontWeight: 'bold' }, width: 26, cell: (r) => ({ type: String, value: r.guardian ?? '' }) },
      { header: { value: 'Số điện thoại', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.phone ?? '' }) },
      { header: { value: 'Địa chỉ', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.address ?? '' }) },
    ],
  }).toFile('mau_danh_sach_hoc_sinh_hoatam.xlsx');
}

// ==========================================
// 3. NHẬP EXCEL: GIÁO VIÊN
// ==========================================

export interface TeacherExcelColumnMapping {
  code: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  specialization: string;
  status: string;
  roles: string;
}

export interface TeacherImportPreview {
  rowIndex: number;
  code: string;
  fullName: string;
  username?: string;
  email?: string;
  phone?: string;
  specialization?: string;
  status: TeacherStatus;
  roleCodes: string[];
  resolvedRoleIds: string[];
  duplicateType: DuplicateCheckType;
  duplicateNote?: string;
  isDuplicate: boolean;
  error?: string;
}

export function detectTeacherColumnMapping(headers: string[]): TeacherExcelColumnMapping {
  return {
    code: findMatchingHeader(headers, ['mã giáo viên', 'mã gv', 'magv', 'code']),
    fullName: findMatchingHeader(headers, ['họ và tên', 'họ tên', 'tên giáo viên', 'fullname', 'hoten']),
    username: findMatchingHeader(headers, ['tên đăng nhập', 'username', 'tài khoản']),
    email: findMatchingHeader(headers, ['email', 'thư điện tử']),
    phone: findMatchingHeader(headers, ['điện thoại', 'số điện thoại', 'sđt', 'phone']),
    specialization: findMatchingHeader(headers, ['chuyên môn', 'bộ môn', 'trình độ']),
    status: findMatchingHeader(headers, ['trạng thái', 'tình trạng', 'status']),
    roles: findMatchingHeader(headers, ['vai trò', 'nhiệm vụ', 'role']),
  };
}

export function buildTeacherImportPreview(
  rows: Record<string, string>[],
  mapping: TeacherExcelColumnMapping,
  existingTeachers: Teacher[],
  availableRoles: TeacherRole[]
): TeacherImportPreview[] {
  const codeMap = new Map(existingTeachers.map((t) => [t.code.toLowerCase().trim(), t]));
  const namePhoneMap = new Map(
    existingTeachers
      .filter((t) => t.phone || t.email)
      .map((t) => [`${t.fullName.toLowerCase().trim()}|${(t.phone ?? t.email ?? '').toLowerCase()}`, t])
  );
  const roleByCode = new Map(availableRoles.map((r) => [r.code.toUpperCase(), r]));
  const roleByName = new Map(availableRoles.map((r) => [r.name.toLowerCase().trim(), r]));
  const seenInFile = new Set<string>();

  return rows.map((row, index) => {
    const code = mapping.code ? (row[mapping.code] ?? '').trim() : '';
    const fullName = mapping.fullName ? (row[mapping.fullName] ?? '').trim() : '';
    const username = mapping.username ? (row[mapping.username] ?? '').trim() : '';
    const email = mapping.email ? (row[mapping.email] ?? '').trim() : '';
    const phone = mapping.phone ? (row[mapping.phone] ?? '').trim() : '';
    const specialization = mapping.specialization ? (row[mapping.specialization] ?? '').trim() : '';
    const statusRaw = (mapping.status ? row[mapping.status] ?? '' : '').toLowerCase().trim();
    const rolesRaw = mapping.roles ? (row[mapping.roles] ?? '').trim() : '';

    let status = TeacherStatus.ACTIVE;
    if (statusRaw.includes('nghỉ phép')) status = TeacherStatus.ON_LEAVE;
    else if (statusRaw.includes('ngừng') || statusRaw.includes('thôi')) status = TeacherStatus.INACTIVE;

    const roleTokens = rolesRaw
      ? rolesRaw
          .split(/[,;|/]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const resolvedRoleIds: string[] = [];
    const roleCodes: string[] = [];
    for (const token of roleTokens) {
      const matched =
        roleByCode.get(token.toUpperCase()) ?? roleByName.get(token.toLowerCase());
      if (matched) {
        resolvedRoleIds.push(matched.id);
        roleCodes.push(matched.code);
      }
    }

    let error: string | undefined;
    if (!code) error = 'Thiếu mã giáo viên';
    else if (!fullName) error = 'Thiếu họ và tên giáo viên';

    let duplicateType: DuplicateCheckType = 'NONE';
    let duplicateNote: string | undefined;

    if (code) {
      const key = code.toLowerCase();
      if (codeMap.has(key)) {
        duplicateType = 'EXACT_CODE_DB';
        duplicateNote = `Trùng mã với "${codeMap.get(key)!.fullName}" trong CSDL`;
      } else if (seenInFile.has(key)) {
        duplicateType = 'DUPLICATE_IN_FILE';
        duplicateNote = 'Trùng mã giáo viên ngay trong file Excel';
      } else {
        seenInFile.add(key);
      }
    }

    if (duplicateType === 'NONE' && fullName && (phone || email)) {
      const match = namePhoneMap.get(`${fullName.toLowerCase()}|${(phone || email).toLowerCase()}`);
      if (match) {
        duplicateType = 'NAME_DOB_MATCH';
        duplicateNote = `Trùng họ tên & liên hệ với mã ${match.code}`;
      }
    }

    return {
      rowIndex: index + 1,
      code,
      fullName,
      username: username || undefined,
      email: email || undefined,
      phone: phone || undefined,
      specialization: specialization || undefined,
      status,
      roleCodes,
      resolvedRoleIds,
      duplicateType,
      duplicateNote,
      isDuplicate: duplicateType !== 'NONE',
      error,
    };
  });
}

export async function commitTeacherImport(
  items: TeacherImportPreview[],
  skipPotentialDuplicates = true
): Promise<{ imported: number; skippedDuplicate: number; failed: number }> {
  let imported = 0;
  let skippedDuplicate = 0;
  let failed = 0;

  for (const item of items) {
    if (item.error) {
      failed += 1;
      continue;
    }
    if (item.duplicateType === 'EXACT_CODE_DB' || item.duplicateType === 'DUPLICATE_IN_FILE') {
      skippedDuplicate += 1;
      continue;
    }
    if (item.duplicateType === 'NAME_DOB_MATCH' && skipPotentialDuplicates) {
      skippedDuplicate += 1;
      continue;
    }

    const res = await teacherService.createTeacher(
      {
        code: item.code,
        fullName: item.fullName,
        username: item.username,
        email: item.email,
        phone: item.phone,
        specialization: item.specialization,
        status: item.status,
      },
      item.resolvedRoleIds
    );
    if (res.ok) imported += 1;
    else failed += 1;
  }

  await recordAuditLog(
    'IMPORT',
    'teachers',
    `Nhập Excel giáo viên: ${imported} thêm mới, ${skippedDuplicate} bỏ qua trùng, ${failed} lỗi`
  );
  return { imported, skippedDuplicate, failed };
}

export async function exportTeacherTemplateExcel(): Promise<void> {
  type Row = Record<string, string>;
  await writeXlsxFile<Row>([], {
    sheet: 'GiaoVien',
    columns: [
      { header: { value: 'Mã giáo viên', fontWeight: 'bold' }, width: 16, cell: (r) => ({ type: String, value: r.code ?? '' }) },
      { header: { value: 'Họ và tên', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.name ?? '' }) },
      { header: { value: 'Tên đăng nhập', fontWeight: 'bold' }, width: 20, cell: (r) => ({ type: String, value: r.username ?? '' }) },
      { header: { value: 'Email', fontWeight: 'bold' }, width: 26, cell: (r) => ({ type: String, value: r.email ?? '' }) },
      { header: { value: 'Số điện thoại', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.phone ?? '' }) },
      { header: { value: 'Chuyên môn', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.spec ?? '' }) },
      { header: { value: 'Vai trò (GVCN, GVBM)', fontWeight: 'bold' }, width: 22, cell: (r) => ({ type: String, value: r.roles ?? '' }) },
      { header: { value: 'Trạng thái', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.status ?? '' }) },
    ],
  }).toFile('mau_giao_vien_hoatam.xlsx');
}

// ==========================================
// 4. NHẬP EXCEL: LỚP HỌC
// ==========================================

export interface ClassExcelColumnMapping {
  code: string;
  name: string;
  gradeLevel: string;
  homeroomTeacher: string;
  roomName: string;
  capacity: string;
  notes: string;
}

export interface ClassImportPreview {
  rowIndex: number;
  code: string;
  name: string;
  gradeLevel: 1 | 2 | 3 | 4 | 5;
  homeroomTeacherLabel: string;
  resolvedHomeroomTeacherId?: string;
  roomName?: string;
  capacity?: number;
  notes?: string;
  duplicateType: DuplicateCheckType;
  duplicateNote?: string;
  isDuplicate: boolean;
  error?: string;
  warning?: string;
}

export function detectClassColumnMapping(headers: string[]): ClassExcelColumnMapping {
  return {
    code: findMatchingHeader(headers, ['mã lớp', 'ma lop', 'code']),
    name: findMatchingHeader(headers, ['tên lớp', 'ten lop', 'lớp', 'name']),
    gradeLevel: findMatchingHeader(headers, ['khối', 'khoi', 'grade']),
    homeroomTeacher: findMatchingHeader(headers, ['chủ nhiệm', 'gvcn', 'giáo viên']),
    roomName: findMatchingHeader(headers, ['phòng', 'phong', 'room']),
    capacity: findMatchingHeader(headers, ['sĩ số', 'chỉ tiêu', 'capacity']),
    notes: findMatchingHeader(headers, ['ghi chú', 'notes']),
  };
}

export function buildClassImportPreview(
  rows: Record<string, string>[],
  mapping: ClassExcelColumnMapping,
  existingClassesInYear: SchoolClass[],
  teachers: Teacher[]
): ClassImportPreview[] {
  const existingCodeMap = new Map(existingClassesInYear.map((c) => [c.code.toLowerCase().trim(), c]));
  const existingNameMap = new Map(existingClassesInYear.map((c) => [c.name.toLowerCase().trim(), c]));
  const teacherLookup = new Map<string, Teacher>();
  for (const t of teachers) {
    teacherLookup.set(t.code.toLowerCase().trim(), t);
    teacherLookup.set(t.fullName.toLowerCase().trim(), t);
  }
  const seenCodes = new Set<string>();

  return rows.map((row, index) => {
    const code = mapping.code ? (row[mapping.code] ?? '').trim() : '';
    const name = mapping.name ? (row[mapping.name] ?? '').trim() : '';
    const gradeRaw = mapping.gradeLevel ? (row[mapping.gradeLevel] ?? '').trim() : '';
    const teacherRaw = mapping.homeroomTeacher ? (row[mapping.homeroomTeacher] ?? '').trim() : '';
    const roomName = mapping.roomName ? (row[mapping.roomName] ?? '').trim() : '';
    const capRaw = mapping.capacity ? (row[mapping.capacity] ?? '').trim() : '';
    const notes = mapping.notes ? (row[mapping.notes] ?? '').trim() : '';

    const gradeMatch = /[1-5]/.exec(gradeRaw || name || code);
    const gradeNum = gradeMatch ? Number(gradeMatch[0]) : 0;
    const gradeLevel = (gradeNum >= 1 && gradeNum <= 5 ? gradeNum : 1) as 1 | 2 | 3 | 4 | 5;

    const matchedTeacher = teacherRaw ? teacherLookup.get(teacherRaw.toLowerCase()) : undefined;
    const capNum = capRaw ? Number(capRaw.replace(/[^\d]/g, '')) : undefined;

    let error: string | undefined;
    let warning: string | undefined;
    if (!code) error = 'Thiếu mã lớp';
    else if (!name) error = 'Thiếu tên lớp';
    else if (!gradeMatch) error = `Không xác định được khối lớp (1–5) từ "${gradeRaw}"`;

    if (!error && teacherRaw && !matchedTeacher) {
      warning = `Không khớp GVCN "${teacherRaw}", lớp vẫn được tạo không gán GVCN`;
    }

    let duplicateType: DuplicateCheckType = 'NONE';
    let duplicateNote: string | undefined;
    if (code) {
      const k = code.toLowerCase();
      if (existingCodeMap.has(k)) {
        duplicateType = 'EXACT_CODE_DB';
        duplicateNote = `Mã lớp "${code}" đã tồn tại trong năm học`;
      } else if (seenCodes.has(k)) {
        duplicateType = 'DUPLICATE_IN_FILE';
        duplicateNote = 'Trùng mã lớp trong tệp Excel';
      } else {
        seenCodes.add(k);
      }
    }
    if (duplicateType === 'NONE' && name && existingNameMap.has(name.toLowerCase())) {
      duplicateType = 'NAME_DOB_MATCH';
      duplicateNote = `Tên lớp "${name}" đã tồn tại trong năm học`;
    }

    return {
      rowIndex: index + 1,
      code,
      name,
      gradeLevel,
      homeroomTeacherLabel: matchedTeacher?.fullName ?? teacherRaw,
      resolvedHomeroomTeacherId: matchedTeacher?.id,
      roomName: roomName || undefined,
      capacity: capNum && capNum > 0 ? capNum : undefined,
      notes: notes || undefined,
      duplicateType,
      duplicateNote,
      isDuplicate: duplicateType !== 'NONE',
      error,
      warning,
    };
  });
}

export async function commitClassImport(
  items: ClassImportPreview[],
  academicYearId: string,
  skipPotentialDuplicates = true
): Promise<{ imported: number; skippedDuplicate: number; failed: number }> {
  let imported = 0;
  let skippedDuplicate = 0;
  let failed = 0;

  for (const item of items) {
    if (item.error) {
      failed += 1;
      continue;
    }
    if (item.duplicateType === 'EXACT_CODE_DB' || item.duplicateType === 'DUPLICATE_IN_FILE') {
      skippedDuplicate += 1;
      continue;
    }
    if (item.duplicateType === 'NAME_DOB_MATCH' && skipPotentialDuplicates) {
      skippedDuplicate += 1;
      continue;
    }

    const res = await classStudentService.createClass({
      academicYearId,
      code: item.code,
      name: item.name,
      gradeLevel: item.gradeLevel,
      homeroomTeacherId: item.resolvedHomeroomTeacherId,
      roomName: item.roomName,
      capacity: item.capacity,
      notes: item.notes,
      isArchived: false,
    });
    if (res.ok) imported += 1;
    else failed += 1;
  }

  await recordAuditLog(
    'IMPORT',
    'classes',
    `Nhập Excel lớp học: ${imported} thêm mới, ${skippedDuplicate} bỏ qua trùng, ${failed} lỗi`
  );
  return { imported, skippedDuplicate, failed };
}

export async function exportClassTemplateExcel(): Promise<void> {
  type Row = Record<string, string>;
  await writeXlsxFile<Row>([], {
    sheet: 'LopHoc',
    columns: [
      { header: { value: 'Mã lớp', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.code ?? '' }) },
      { header: { value: 'Tên lớp', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.name ?? '' }) },
      { header: { value: 'Khối (1-5)', fontWeight: 'bold' }, width: 12, cell: (r) => ({ type: String, value: r.grade ?? '' }) },
      { header: { value: 'Giáo viên chủ nhiệm (Mã hoặc Họ tên)', fontWeight: 'bold' }, width: 32, cell: (r) => ({ type: String, value: r.teacher ?? '' }) },
      { header: { value: 'Phòng học', fontWeight: 'bold' }, width: 16, cell: (r) => ({ type: String, value: r.room ?? '' }) },
      { header: { value: 'Sĩ số dự kiến', fontWeight: 'bold' }, width: 16, cell: (r) => ({ type: String, value: r.cap ?? '' }) },
      { header: { value: 'Ghi chú', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.notes ?? '' }) },
    ],
  }).toFile('mau_lop_hoc_hoatam.xlsx');
}

// ==========================================
// 5. NHẬP EXCEL: MÔN HỌC
// ==========================================

export interface SubjectExcelColumnMapping {
  code: string;
  name: string;
  shortName: string;
  gradeLevels: string;
  assessmentMode: string;
  isCompulsory: string;
}

export interface SubjectImportPreview {
  rowIndex: number;
  code: string;
  name: string;
  shortName?: string;
  gradeLevels: number[];
  assessmentMode: SubjectAssessmentMode;
  isCompulsory: boolean;
  duplicateType: DuplicateCheckType;
  duplicateNote?: string;
  isDuplicate: boolean;
  error?: string;
}

export function detectSubjectColumnMapping(headers: string[]): SubjectExcelColumnMapping {
  return {
    code: findMatchingHeader(headers, ['mã môn', 'ma mon', 'code']),
    name: findMatchingHeader(headers, ['tên môn', 'môn học', 'ten mon', 'name']),
    shortName: findMatchingHeader(headers, ['viết tắt', 'tên ngắn', 'short']),
    gradeLevels: findMatchingHeader(headers, ['khối', 'grade']),
    assessmentMode: findMatchingHeader(headers, ['hình thức', 'cách đánh giá', 'mode']),
    isCompulsory: findMatchingHeader(headers, ['bắt buộc', 'compulsory']),
  };
}

export function buildSubjectImportPreview(
  rows: Record<string, string>[],
  mapping: SubjectExcelColumnMapping,
  existingSubjects: Subject[]
): SubjectImportPreview[] {
  const existingCodeMap = new Map(existingSubjects.map((s) => [s.code.toLowerCase().trim(), s]));
  const existingNameMap = new Map(existingSubjects.map((s) => [s.name.toLowerCase().trim(), s]));
  const seenCodes = new Set<string>();

  return rows.map((row, index) => {
    const code = mapping.code ? (row[mapping.code] ?? '').trim() : '';
    const name = mapping.name ? (row[mapping.name] ?? '').trim() : '';
    const shortName = mapping.shortName ? (row[mapping.shortName] ?? '').trim() : '';
    const gradesRaw = mapping.gradeLevels ? (row[mapping.gradeLevels] ?? '').trim() : '';
    const modeRaw = (mapping.assessmentMode ? row[mapping.assessmentMode] ?? '' : '').toLowerCase();
    const compRaw = (mapping.isCompulsory ? row[mapping.isCompulsory] ?? '' : '').toLowerCase();

    const parsedGrades = gradesRaw
      ? Array.from(new Set((gradesRaw.match(/[1-5]/g) ?? []).map(Number)))
      : [1, 2, 3, 4, 5];
    const gradeLevels = parsedGrades.length > 0 ? parsedGrades : [1, 2, 3, 4, 5];

    const assessmentMode =
      modeRaw.includes('điểm') || modeRaw.includes('score')
        ? SubjectAssessmentMode.COMMENT_AND_SCORE
        : SubjectAssessmentMode.COMMENT_ONLY;

    const isCompulsory = !(compRaw.includes('không') || compRaw.includes('tự chọn') || compRaw === 'no');

    let error: string | undefined;
    if (!code) error = 'Thiếu mã môn học';
    else if (!name) error = 'Thiếu tên môn học';

    let duplicateType: DuplicateCheckType = 'NONE';
    let duplicateNote: string | undefined;
    if (code) {
      const k = code.toLowerCase();
      if (existingCodeMap.has(k)) {
        duplicateType = 'EXACT_CODE_DB';
        duplicateNote = `Mã môn "${code}" đã tồn tại (${existingCodeMap.get(k)!.name})`;
      } else if (seenCodes.has(k)) {
        duplicateType = 'DUPLICATE_IN_FILE';
        duplicateNote = 'Trùng mã môn trong file Excel';
      } else {
        seenCodes.add(k);
      }
    }
    if (duplicateType === 'NONE' && name && existingNameMap.has(name.toLowerCase())) {
      duplicateType = 'NAME_DOB_MATCH';
      duplicateNote = `Tên môn "${name}" đã tồn tại`;
    }

    return {
      rowIndex: index + 1,
      code,
      name,
      shortName: shortName || undefined,
      gradeLevels,
      assessmentMode,
      isCompulsory,
      duplicateType,
      duplicateNote,
      isDuplicate: duplicateType !== 'NONE',
      error,
    };
  });
}

export async function commitSubjectImport(
  items: SubjectImportPreview[],
  startOrder = 1,
  skipPotentialDuplicates = true
): Promise<{ imported: number; skippedDuplicate: number; failed: number }> {
  let imported = 0;
  let skippedDuplicate = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.error) {
      failed += 1;
      continue;
    }
    if (item.duplicateType === 'EXACT_CODE_DB' || item.duplicateType === 'DUPLICATE_IN_FILE') {
      skippedDuplicate += 1;
      continue;
    }
    if (item.duplicateType === 'NAME_DOB_MATCH' && skipPotentialDuplicates) {
      skippedDuplicate += 1;
      continue;
    }

    const res = await curriculumService.createSubject({
      code: item.code,
      name: item.name,
      shortName: item.shortName,
      gradeLevels: item.gradeLevels,
      assessmentMode: item.assessmentMode,
      isCompulsory: item.isCompulsory,
      isActive: true,
      displayOrder: startOrder + imported,
    });
    if (res.ok) imported += 1;
    else failed += 1;
  }

  await recordAuditLog(
    'IMPORT',
    'subjects',
    `Nhập Excel môn học: ${imported} thêm mới, ${skippedDuplicate} bỏ qua trùng, ${failed} lỗi`
  );
  return { imported, skippedDuplicate, failed };
}

export async function exportSubjectTemplateExcel(): Promise<void> {
  type Row = Record<string, string>;
  await writeXlsxFile<Row>([], {
    sheet: 'MonHoc',
    columns: [
      { header: { value: 'Mã môn', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.code ?? '' }) },
      { header: { value: 'Tên môn học', fontWeight: 'bold' }, width: 26, cell: (r) => ({ type: String, value: r.name ?? '' }) },
      { header: { value: 'Tên viết tắt', fontWeight: 'bold' }, width: 16, cell: (r) => ({ type: String, value: r.shortName ?? '' }) },
      { header: { value: 'Khối áp dụng (1,2,3,4,5)', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.grades ?? '' }) },
      { header: { value: 'Hình thức đánh giá (Nhận xét / Kết hợp điểm)', fontWeight: 'bold' }, width: 38, cell: (r) => ({ type: String, value: r.mode ?? '' }) },
      { header: { value: 'Bắt buộc (Có/Không)', fontWeight: 'bold' }, width: 20, cell: (r) => ({ type: String, value: r.comp ?? '' }) },
    ],
  }).toFile('mau_mon_hoc_hoatam.xlsx');
}

export async function importSubjectsFromExcel(
  rows: Record<string, string>[]
): Promise<{ imported: number; skipped: number }> {
  const existingRes = await curriculumService.listSubjects();
  const existing = existingRes.ok ? existingRes.data : [];
  const mapping = detectSubjectColumnMapping(rows.length > 0 ? Object.keys(rows[0]) : []);
  const preview = buildSubjectImportPreview(rows, mapping, existing);
  const res = await commitSubjectImport(preview, existing.length + 1, true);
  return { imported: res.imported, skipped: res.skippedDuplicate + res.failed };
}

// ==========================================
// 6. NHẬP EXCEL: PHÂN CÔNG GIÁO VIÊN
// ==========================================

export interface AssignmentExcelColumnMapping {
  teacher: string;
  role: string;
  className: string;
  subject: string;
  weeklyPeriods: string;
  startDate: string;
  notes: string;
}

export interface AssignmentImportPreview {
  rowIndex: number;
  teacherLabel: string;
  resolvedTeacherId?: string;
  roleLabel: string;
  resolvedRoleId?: string;
  resolvedRoleCode: string;
  classLabel: string;
  resolvedClassId?: string;
  subjectLabel: string;
  resolvedSubjectId?: string;
  weeklyPeriods?: number;
  startDate?: string;
  notes?: string;
  duplicateType: DuplicateCheckType;
  duplicateNote?: string;
  isDuplicate: boolean;
  error?: string;
}

export function detectAssignmentColumnMapping(headers: string[]): AssignmentExcelColumnMapping {
  return {
    teacher: findMatchingHeader(headers, ['giáo viên', 'giao vien', 'gv', 'teacher']),
    role: findMatchingHeader(headers, ['vai trò', 'nhiệm vụ', 'role']),
    className: findMatchingHeader(headers, ['lớp', 'lop', 'class']),
    subject: findMatchingHeader(headers, ['môn', 'mon', 'subject']),
    weeklyPeriods: findMatchingHeader(headers, ['số tiết', 'tiết/tuần', 'tiet']),
    startDate: findMatchingHeader(headers, ['ngày bắt đầu', 'bắt đầu', 'start']),
    notes: findMatchingHeader(headers, ['ghi chú', 'notes']),
  };
}

export function buildAssignmentImportPreview(
  rows: Record<string, string>[],
  mapping: AssignmentExcelColumnMapping,
  params: {
    academicYearId: string;
    teachers: Teacher[];
    roles: TeacherRole[];
    classes: SchoolClass[];
    subjects: Subject[];
    existingAssignments: TeacherAssignment[];
  }
): AssignmentImportPreview[] {
  const teacherLookup = new Map<string, Teacher>();
  for (const t of params.teachers) {
    teacherLookup.set(t.code.toLowerCase().trim(), t);
    teacherLookup.set(t.fullName.toLowerCase().trim(), t);
  }
  const roleLookup = new Map<string, TeacherRole>();
  for (const r of params.roles) {
    roleLookup.set(r.code.toLowerCase().trim(), r);
    roleLookup.set(r.name.toLowerCase().trim(), r);
  }
  const classLookup = new Map<string, SchoolClass>();
  for (const c of params.classes) {
    classLookup.set(c.code.toLowerCase().trim(), c);
    classLookup.set(c.name.toLowerCase().trim(), c);
  }
  const subjectLookup = new Map<string, Subject>();
  for (const s of params.subjects) {
    subjectLookup.set(s.code.toLowerCase().trim(), s);
    subjectLookup.set(s.name.toLowerCase().trim(), s);
  }

  const activeKeys = new Set(
    params.existingAssignments
      .filter(
        (a) =>
          a.academicYearId === params.academicYearId &&
          a.status === TeacherAssignmentStatus.ACTIVE
      )
      .map((a) => `${a.teacherId}|${(a.role ?? '').toUpperCase()}|${a.classId ?? ''}|${a.subjectId ?? ''}`)
  );
  const seenKeys = new Set<string>();

  return rows.map((row, index) => {
    const teacherRaw = mapping.teacher ? (row[mapping.teacher] ?? '').trim() : '';
    const roleRaw = mapping.role ? (row[mapping.role] ?? '').trim() : '';
    const classRaw = mapping.className ? (row[mapping.className] ?? '').trim() : '';
    const subjRaw = mapping.subject ? (row[mapping.subject] ?? '').trim() : '';
    const weeklyRaw = mapping.weeklyPeriods ? (row[mapping.weeklyPeriods] ?? '').trim() : '';
    const startRaw = mapping.startDate ? (row[mapping.startDate] ?? '').trim() : '';
    const notes = mapping.notes ? (row[mapping.notes] ?? '').trim() : '';

    const matchedTeacher = teacherRaw ? teacherLookup.get(teacherRaw.toLowerCase()) : undefined;
    const matchedRole = roleRaw
      ? roleLookup.get(roleRaw.toLowerCase())
      : subjRaw
        ? roleLookup.get('gvbm')
        : roleLookup.get('gvcn');
    const matchedClass = classRaw ? classLookup.get(classRaw.toLowerCase()) : undefined;
    const matchedSubject = subjRaw ? subjectLookup.get(subjRaw.toLowerCase()) : undefined;
    const dateNorm = normalizeDateString(startRaw);
    const weeklyPeriods = weeklyRaw ? Number(weeklyRaw.replace(/[^\d]/g, '')) || undefined : undefined;

    let error: string | undefined;
    if (!matchedTeacher) error = `Không tìm thấy giáo viên "${teacherRaw || 'trống'}"`;
    else if (!matchedRole) error = `Không xác định được vai trò "${roleRaw}"`;
    else if (classRaw && !matchedClass) error = `Không tìm thấy lớp "${classRaw}"`;
    else if (subjRaw && !matchedSubject) error = `Không tìm thấy môn "${subjRaw}"`;
    else if (!dateNorm.valid) error = `Ngày bắt đầu không hợp lệ ("${startRaw}")`;

    const roleCode = (matchedRole?.code ?? roleRaw).toUpperCase();
    const dupKey = matchedTeacher
      ? `${matchedTeacher.id}|${roleCode}|${matchedClass?.id ?? ''}|${matchedSubject?.id ?? ''}`
      : '';

    let duplicateType: DuplicateCheckType = 'NONE';
    let duplicateNote: string | undefined;
    if (!error && dupKey) {
      if (activeKeys.has(dupKey)) {
        duplicateType = 'EXACT_CODE_DB';
        duplicateNote = 'Phân công đang hoạt động đã tồn tại trong CSDL';
      } else if (seenKeys.has(dupKey)) {
        duplicateType = 'DUPLICATE_IN_FILE';
        duplicateNote = 'Trùng phân công ngay trong tệp Excel';
      } else {
        seenKeys.add(dupKey);
      }
    }

    return {
      rowIndex: index + 1,
      teacherLabel: matchedTeacher?.fullName ?? teacherRaw,
      resolvedTeacherId: matchedTeacher?.id,
      roleLabel: matchedRole?.name ?? roleRaw,
      resolvedRoleId: matchedRole?.id,
      resolvedRoleCode: roleCode,
      classLabel: matchedClass?.name ?? classRaw,
      resolvedClassId: matchedClass?.id,
      subjectLabel: matchedSubject?.name ?? subjRaw,
      resolvedSubjectId: matchedSubject?.id,
      weeklyPeriods,
      startDate: dateNorm.value || undefined,
      notes: notes || undefined,
      duplicateType,
      duplicateNote,
      isDuplicate: duplicateType !== 'NONE',
      error,
    };
  });
}

export async function commitAssignmentImport(
  items: AssignmentImportPreview[],
  academicYearId: string,
  actorName?: string
): Promise<{ imported: number; skippedDuplicate: number; failed: number }> {
  let imported = 0;
  let skippedDuplicate = 0;
  let failed = 0;

  for (const item of items) {
    if (item.error || !item.resolvedTeacherId || !item.resolvedRoleId) {
      failed += 1;
      continue;
    }
    if (item.duplicateType !== 'NONE') {
      skippedDuplicate += 1;
      continue;
    }

    const res = await teacherService.createAssignment(
      {
        academicYearId,
        teacherId: item.resolvedTeacherId,
        roleId: item.resolvedRoleId,
        role: item.resolvedRoleCode,
        classId: item.resolvedClassId,
        subjectId: item.resolvedSubjectId,
        isHomeroom: item.resolvedRoleCode === 'GVCN',
        weeklyPeriods: item.weeklyPeriods,
        startDate: item.startDate,
        notes: item.notes,
      },
      actorName
    );
    if (res.ok) imported += 1;
    else failed += 1;
  }

  await recordAuditLog(
    'IMPORT',
    'teacherAssignments',
    `Nhập Excel phân công giáo viên: ${imported} thêm mới, ${skippedDuplicate} bỏ qua trùng, ${failed} lỗi`
  );
  return { imported, skippedDuplicate, failed };
}

export async function exportAssignmentTemplateExcel(): Promise<void> {
  type Row = Record<string, string>;
  await writeXlsxFile<Row>([], {
    sheet: 'PhanCong',
    columns: [
      { header: { value: 'Giáo viên (Mã hoặc Họ tên)', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.teacher ?? '' }) },
      { header: { value: 'Vai trò (GVCN / GVBM / CHUYEN_MON)', fontWeight: 'bold' }, width: 30, cell: (r) => ({ type: String, value: r.role ?? '' }) },
      { header: { value: 'Lớp (Mã hoặc Tên)', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.cls ?? '' }) },
      { header: { value: 'Môn học (nếu GVBM)', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.subj ?? '' }) },
      { header: { value: 'Số tiết/tuần', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.periods ?? '' }) },
      { header: { value: 'Ngày bắt đầu (YYYY-MM-DD)', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.start ?? '' }) },
      { header: { value: 'Ghi chú', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.notes ?? '' }) },
    ],
  }).toFile('mau_phan_cong_giao_vien_hoatam.xlsx');
}

// ==========================================
// 7. NHẬP EXCEL: THỜI KHÓA BIỂU
// ==========================================

export interface TimetableExcelColumnMapping {
  day: string;
  period: string;
  lessonDate: string;
  className: string;
  subject: string;
  teacher: string;
  roomName: string;
  lessonTitle: string;
}

export interface TimetableImportPreviewRow {
  rowIndex: number;
  dayOfWeek: number;
  periodNumber: number;
  lessonDate: string;
  classLabel: string;
  resolvedClassId?: string;
  subjectLabel: string;
  resolvedSubjectId?: string;
  teacherLabel: string;
  resolvedTeacherId?: string;
  roomName: string;
  lessonTitle: string;
  error?: string;
  warning?: string;
}

export function detectTimetableColumnMapping(headers: string[]): TimetableExcelColumnMapping {
  return {
    day: findMatchingHeader(headers, ['thứ', 'thu', 'day']),
    period: findMatchingHeader(headers, ['tiết', 'tiet', 'period']),
    lessonDate: findMatchingHeader(headers, ['ngày học', 'ngay hoc', 'ngày', 'date']),
    className: findMatchingHeader(headers, ['lớp', 'lop', 'class']),
    subject: findMatchingHeader(headers, ['môn', 'mon', 'subject']),
    teacher: findMatchingHeader(headers, ['giáo viên', 'giao vien', 'gv', 'teacher']),
    roomName: findMatchingHeader(headers, ['phòng', 'phong', 'room']),
    lessonTitle: findMatchingHeader(headers, ['nội dung', 'noi dung', 'bài', 'ghi chú', 'title']),
  };
}

export function buildTimetableImportPreview(params: {
  rows: Record<string, string>[];
  classes: SchoolClass[];
  subjects: Subject[];
  teachers: Array<{ id: string; code: string; fullName: string }>;
  defaultTeacherId?: string;
  defaultClassId?: string;
  maxPeriods: number;
  allowedSchoolDays: number[];
  effectiveFrom: string;
  mapping?: TimetableExcelColumnMapping;
  existingLessonsInTimetable?: TimetableLesson[];
}): TimetableImportPreviewRow[] {
  const {
    rows,
    classes,
    subjects,
    teachers,
    defaultTeacherId,
    defaultClassId,
    maxPeriods,
    allowedSchoolDays,
    effectiveFrom,
    mapping,
    existingLessonsInTimetable = [],
  } = params;

  const classLookup = new Map<string, SchoolClass>();
  for (const c of classes) {
    classLookup.set(c.code.toLowerCase().trim(), c);
    classLookup.set(c.name.toLowerCase().trim(), c);
  }
  const subjectLookup = new Map<string, Subject>();
  for (const s of subjects) {
    subjectLookup.set(s.code.toLowerCase().trim(), s);
    subjectLookup.set(s.name.toLowerCase().trim(), s);
  }
  const teacherLookup = new Map<string, { id: string; code: string; fullName: string }>();
  for (const t of teachers) {
    teacherLookup.set(t.code.toLowerCase().trim(), t);
    teacherLookup.set(t.fullName.toLowerCase().trim(), t);
  }

  const existingSlots = new Set(
    existingLessonsInTimetable.map((l) => `${l.dayOfWeek}|${l.periodNumber}`)
  );
  const seenSlots = new Set<string>();

  return rows.map((row, index) => {
    const keys = Object.keys(row);
    const activeMap = mapping ?? detectTimetableColumnMapping(keys);

    const dayRaw = activeMap.day ? (row[activeMap.day] ?? '') : '';
    const periodRaw = activeMap.period ? (row[activeMap.period] ?? '') : '';
    const dateRaw = activeMap.lessonDate ? (row[activeMap.lessonDate] ?? '') : '';
    const classRaw = activeMap.className ? (row[activeMap.className] ?? '') : '';
    const subjRaw = activeMap.subject ? (row[activeMap.subject] ?? '') : '';
    const teacherRaw = activeMap.teacher ? (row[activeMap.teacher] ?? '') : '';
    const roomRaw = activeMap.roomName ? (row[activeMap.roomName] ?? '') : '';
    const titleRaw = activeMap.lessonTitle ? (row[activeMap.lessonTitle] ?? '') : '';

    const dayOfWeek = parseWeekdayCell(dayRaw);
    const periodNumber = Number(String(periodRaw).replace(/[^\d]/g, '')) || 0;
    const normalizedDate = normalizeDateString(dateRaw);

    const matchedClass = classRaw
      ? classLookup.get(classRaw.toLowerCase().trim())
      : defaultClassId
        ? classes.find((c) => c.id === defaultClassId)
        : undefined;
    const matchedSubject = subjRaw ? subjectLookup.get(subjRaw.toLowerCase().trim()) : undefined;
    const matchedTeacher = teacherRaw
      ? teacherLookup.get(teacherRaw.toLowerCase().trim())
      : defaultTeacherId
        ? teachers.find((t) => t.id === defaultTeacherId)
        : undefined;

    let computedDate = normalizedDate.value;
    if (!computedDate && effectiveFrom && dayOfWeek >= 2 && dayOfWeek <= 7) {
      const anchor = new Date(`${effectiveFrom}T12:00:00Z`);
      if (!Number.isNaN(anchor.getTime())) {
        const jsDay = anchor.getUTCDay();
        const offsetToMonday = jsDay === 0 ? 1 : 1 - jsDay;
        anchor.setUTCDate(anchor.getUTCDate() + offsetToMonday + (dayOfWeek - 2));
        computedDate = anchor.toISOString().slice(0, 10);
      }
    }

    let error: string | undefined;
    let warning: string | undefined;

    if (!dayOfWeek || !allowedSchoolDays.includes(dayOfWeek)) {
      error = `Thứ không hợp lệ (${dayRaw || 'trống'})`;
    } else if (periodNumber < 1 || periodNumber > maxPeriods) {
      error = `Tiết không hợp lệ (${periodRaw || 'trống'})`;
    } else if (!matchedClass) {
      error = `Không tìm thấy lớp "${classRaw}"`;
    } else if (!matchedSubject) {
      error = `Không tìm thấy môn "${subjRaw}"`;
    } else if (!normalizedDate.valid) {
      error = `Ngày học không hợp lệ ("${dateRaw}")`;
    }

    const slotKey = `${dayOfWeek}|${periodNumber}`;
    if (!error) {
      if (seenSlots.has(slotKey)) {
        error = `Trùng tiết ${periodNumber} Thứ ${dayOfWeek} trong file Excel`;
      } else if (existingSlots.has(slotKey)) {
        error = `Tiết ${periodNumber} Thứ ${dayOfWeek} đã có trong TKB đích`;
      } else {
        seenSlots.add(slotKey);
      }
    }

    if (!error && teacherRaw && !matchedTeacher) {
      warning = `Không khớp giáo viên "${teacherRaw}", sẽ để trống hoặc theo TKB`;
    }

    return {
      rowIndex: index + 1,
      dayOfWeek,
      periodNumber,
      lessonDate: computedDate,
      classLabel: matchedClass?.name ?? classRaw,
      resolvedClassId: matchedClass?.id,
      subjectLabel: matchedSubject?.name ?? subjRaw,
      resolvedSubjectId: matchedSubject?.id,
      teacherLabel: matchedTeacher?.fullName ?? teacherRaw,
      resolvedTeacherId: matchedTeacher?.id,
      roomName: roomRaw.trim(),
      lessonTitle: titleRaw.trim(),
      error,
      warning,
    };
  });
}

export async function commitTimetableImport(params: {
  items: TimetableImportPreviewRow[];
  timetable: Timetable;
}): Promise<{ imported: number; skippedDuplicate: number; failed: number }> {
  let imported = 0;
  let skippedDuplicate = 0;
  let failed = 0;

  for (const item of params.items) {
    if (item.error) {
      if (item.error.includes('Trùng tiết') || item.error.includes('đã có trong TKB')) {
        skippedDuplicate += 1;
      } else {
        failed += 1;
      }
      continue;
    }
    if (!item.resolvedClassId || !item.resolvedSubjectId) {
      failed += 1;
      continue;
    }

    const res = await timetableService.upsertLesson({
      timetableId: params.timetable.id,
      academicYearId: params.timetable.academicYearId,
      classId: item.resolvedClassId,
      dayOfWeek: item.dayOfWeek as DayOfWeek,
      periodNumber: item.periodNumber,
      lessonDate: item.lessonDate || undefined,
      session: item.periodNumber <= 4 ? 'MORNING' : 'AFTERNOON',
      subjectId: item.resolvedSubjectId,
      teacherId: item.resolvedTeacherId ?? params.timetable.teacherId,
      roomName: item.roomName || undefined,
      lessonTitle: item.lessonTitle || undefined,
      ignoreSoftConflicts: true,
    });
    if (res.ok) imported += 1;
    else failed += 1;
  }

  await recordAuditLog(
    'IMPORT',
    'timetableLessons',
    `Nhập Excel thời khóa biểu "${params.timetable.name}": ${imported} tiết mới, ${skippedDuplicate} trùng, ${failed} lỗi`
  );
  return { imported, skippedDuplicate, failed };
}

export async function exportTimetableTemplateExcel(): Promise<void> {
  type TblTemplate = Record<string, string>;
  await writeXlsxFile<TblTemplate>([], {
    sheet: 'ThoiKhoaBieu',
    columns: [
      { header: { value: 'Thứ (2-7)', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.day ?? '' }) },
      { header: { value: 'Tiết (1-8)', fontWeight: 'bold' }, width: 12, cell: (r) => ({ type: String, value: r.period ?? '' }) },
      { header: { value: 'Ngày học (YYYY-MM-DD)', fontWeight: 'bold' }, width: 22, cell: (r) => ({ type: String, value: r.date ?? '' }) },
      { header: { value: 'Lớp (Mã hoặc Tên)', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.cls ?? '' }) },
      { header: { value: 'Môn học (Mã hoặc Tên)', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.subj ?? '' }) },
      { header: { value: 'Giáo viên (Mã hoặc Họ tên)', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.teacher ?? '' }) },
      { header: { value: 'Phòng học', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.room ?? '' }) },
      { header: { value: 'Nội dung bài dạy', fontWeight: 'bold' }, width: 32, cell: (r) => ({ type: String, value: r.title ?? '' }) },
    ],
  }).toFile('mau_thoi_khoa_bieu_hoatam.xlsx');
}

// ==========================================
// 8. XUẤT EXCEL (10 LOẠI DỮ LIỆU & BÁO CÁO)
// ==========================================

export async function exportStudentsExcel(
  students: Student[],
  classesMap: Map<string, SchoolClass>
): Promise<void> {
  const rows = students.map((s, idx) => ({
    stt: idx + 1,
    code: s.studentCode,
    fullName: s.fullName,
    dob: s.dateOfBirth,
    gender: s.gender === StudentGender.MALE ? 'Nam' : s.gender === StudentGender.FEMALE ? 'Nữ' : 'Không phân loại',
    className: classesMap.get(s.classId)?.name ?? '',
    status: STUDENT_STATUS_LABELS[s.status],
    guardian: s.guardianName ?? '',
    phone: s.guardianPhone ?? '',
    address: s.address ?? '',
  }));

  await writeXlsxFile(rows, {
    sheet: 'HocSinh',
    columns: [
      { header: { value: 'STT', fontWeight: 'bold' }, width: 7, cell: (r) => ({ type: Number, value: r.stt }) },
      { header: { value: 'Mã học sinh', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.code }) },
      { header: { value: 'Họ và tên', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.fullName }) },
      { header: { value: 'Ngày sinh', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.dob }) },
      { header: { value: 'Giới tính', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.gender }) },
      { header: { value: 'Lớp', fontWeight: 'bold' }, width: 12, cell: (r) => ({ type: String, value: r.className }) },
      { header: { value: 'Trạng thái', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.status }) },
      { header: { value: 'Phụ huynh', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.guardian }) },
      { header: { value: 'Điện thoại', fontWeight: 'bold' }, width: 16, cell: (r) => ({ type: String, value: r.phone }) },
      { header: { value: 'Địa chỉ', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.address }) },
    ],
  }).toFile(`danh_sach_hoc_sinh_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await recordAuditLog('EXPORT', 'students', `Xuất Excel danh sách ${rows.length} học sinh`);
}

export async function exportClassesExcel(params: {
  classes: SchoolClass[];
  students: Student[];
  teachersMap: Map<string, Teacher>;
  yearsMap: Map<string, AcademicYear>;
}): Promise<void> {
  const countByClass = new Map<string, number>();
  for (const stu of params.students) {
    countByClass.set(stu.classId, (countByClass.get(stu.classId) ?? 0) + 1);
  }
  const rows = params.classes.map((c, idx) => ({
    stt: idx + 1,
    code: c.code,
    name: c.name,
    grade: `Khối ${c.gradeLevel}`,
    year: params.yearsMap.get(c.academicYearId)?.name ?? '',
    homeroom: c.homeroomTeacherId ? (params.teachersMap.get(c.homeroomTeacherId)?.fullName ?? '') : '',
    studentCount: countByClass.get(c.id) ?? 0,
    room: c.roomName ?? '',
    status: c.isArchived ? 'Đã lưu trữ' : 'Đang hoạt động',
  }));

  await writeXlsxFile(rows, {
    sheet: 'LopHoc',
    columns: [
      { header: { value: 'STT', fontWeight: 'bold' }, width: 7, cell: (r) => ({ type: Number, value: r.stt }) },
      { header: { value: 'Mã lớp', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.code }) },
      { header: { value: 'Tên lớp', fontWeight: 'bold' }, width: 16, cell: (r) => ({ type: String, value: r.name }) },
      { header: { value: 'Khối', fontWeight: 'bold' }, width: 10, cell: (r) => ({ type: String, value: r.grade }) },
      { header: { value: 'Năm học', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.year }) },
      { header: { value: 'Giáo viên chủ nhiệm', fontWeight: 'bold' }, width: 26, cell: (r) => ({ type: String, value: r.homeroom }) },
      { header: { value: 'Sĩ số', fontWeight: 'bold' }, width: 10, cell: (r) => ({ type: Number, value: r.studentCount }) },
      { header: { value: 'Phòng học', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.room }) },
      { header: { value: 'Trạng thái', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.status }) },
    ],
  }).toFile(`danh_sach_lop_hoc_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await recordAuditLog('EXPORT', 'classes', `Xuất Excel danh sách ${rows.length} lớp học`);
}

export async function exportTeachersExcel(params: {
  teachers: Teacher[];
  roleGrants: TeacherRoleGrant[];
  rolesMap: Map<string, TeacherRole>;
}): Promise<void> {
  const grantsByTeacher = new Map<string, string[]>();
  for (const g of params.roleGrants) {
    const arr = grantsByTeacher.get(g.teacherId) ?? [];
    arr.push(params.rolesMap.get(g.roleId)?.name ?? g.roleCode);
    grantsByTeacher.set(g.teacherId, arr);
  }
  const rows = params.teachers.map((t, idx) => ({
    stt: idx + 1,
    code: t.code,
    fullName: t.fullName,
    roles: (grantsByTeacher.get(t.id) ?? []).join(', '),
    email: t.email ?? '',
    phone: t.phone ?? '',
    spec: t.specialization ?? '',
    status: TEACHER_STATUS_LABELS[t.status],
  }));

  await writeXlsxFile(rows, {
    sheet: 'GiaoVien',
    columns: [
      { header: { value: 'STT', fontWeight: 'bold' }, width: 7, cell: (r) => ({ type: Number, value: r.stt }) },
      { header: { value: 'Mã GV', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.code }) },
      { header: { value: 'Họ và tên', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.fullName }) },
      { header: { value: 'Vai trò được cấp', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.roles }) },
      { header: { value: 'Email', fontWeight: 'bold' }, width: 26, cell: (r) => ({ type: String, value: r.email }) },
      { header: { value: 'Điện thoại', fontWeight: 'bold' }, width: 16, cell: (r) => ({ type: String, value: r.phone }) },
      { header: { value: 'Chuyên môn', fontWeight: 'bold' }, width: 22, cell: (r) => ({ type: String, value: r.spec }) },
      { header: { value: 'Trạng thái', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.status }) },
    ],
  }).toFile(`danh_sach_giao_vien_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await recordAuditLog('EXPORT', 'teachers', `Xuất Excel danh sách ${rows.length} giáo viên`);
}

export async function exportTeacherAssignmentsExcel(params: {
  assignments: TeacherAssignment[];
  teachersMap: Map<string, Teacher>;
  classesMap: Map<string, SchoolClass>;
  subjectsMap: Map<string, Subject>;
  yearsMap: Map<string, AcademicYear>;
}): Promise<void> {
  const rows = params.assignments.map((a, idx) => ({
    stt: idx + 1,
    year: params.yearsMap.get(a.academicYearId)?.name ?? '',
    teacher: params.teachersMap.get(a.teacherId)?.fullName ?? '',
    role: a.role,
    className: a.classId ? (params.classesMap.get(a.classId)?.name ?? '') : 'Toàn trường',
    subjectName: a.subjectId ? (params.subjectsMap.get(a.subjectId)?.name ?? '') : a.isHomeroom ? 'Chủ nhiệm' : '',
    weeklyPeriods: a.weeklyPeriods ?? null,
    status: TEACHER_ASSIGNMENT_STATUS_LABELS[a.status],
    startDate: a.startDate ?? '',
  }));

  await writeXlsxFile(rows, {
    sheet: 'PhanCongNhiemVu',
    columns: [
      { header: { value: 'STT', fontWeight: 'bold' }, width: 7, cell: (r) => ({ type: Number, value: r.stt }) },
      { header: { value: 'Năm học', fontWeight: 'bold' }, width: 16, cell: (r) => ({ type: String, value: r.year }) },
      { header: { value: 'Giáo viên', fontWeight: 'bold' }, width: 26, cell: (r) => ({ type: String, value: r.teacher }) },
      { header: { value: 'Vai trò', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.role }) },
      { header: { value: 'Lớp', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.className }) },
      { header: { value: 'Môn học / Nhiệm vụ', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.subjectName }) },
      { header: { value: 'Tiết/tuần', fontWeight: 'bold' }, width: 12, cell: (r) => r.weeklyPeriods !== null ? { type: Number, value: r.weeklyPeriods } : null },
      { header: { value: 'Trạng thái', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.status }) },
      { header: { value: 'Ngày bắt đầu', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.startDate }) },
    ],
  }).toFile(`phan_cong_nhiem_vu_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await recordAuditLog('EXPORT', 'teacherAssignments', `Xuất Excel ${rows.length} phân công nhiệm vụ`);
}

export async function exportDailyAssessmentsExcel(params: {
  records: DailyAssessment[];
  studentsMap: Map<string, Student>;
  classesMap: Map<string, SchoolClass>;
  teachersMap: Map<string, Teacher>;
  dailyCriteriaMap: Map<string, DailyBehaviorCriterion>;
}): Promise<void> {
  const rows = params.records.map((d, idx) => {
    const stu = params.studentsMap.get(d.studentId);
    const critNames = (d.criterionIds ?? [])
      .map((cid) => params.dailyCriteriaMap.get(cid)?.name)
      .filter((n): n is string => Boolean(n));
    const labels = critNames.length > 0 ? critNames : d.criterionLabelsSnapshot ?? [];
    return {
      stt: idx + 1,
      date: d.assessmentDate,
      className: params.classesMap.get(d.classId)?.name ?? '',
      studentCode: stu?.studentCode ?? '',
      studentName: stu?.fullName ?? '',
      teacherName: d.teacherId ? (params.teachersMap.get(d.teacherId)?.fullName ?? '') : '',
      status: DAILY_EVALUATION_STATUS_LABELS[d.evaluationStatus ?? DailyEvaluationStatus.ASSESSED],
      criteria: labels.join(', '),
      comment: d.comment ?? '',
    };
  });

  await writeXlsxFile(rows, {
    sheet: 'DanhGiaHangNgay',
    columns: [
      { header: { value: 'STT', fontWeight: 'bold' }, width: 7, cell: (r) => ({ type: Number, value: r.stt }) },
      { header: { value: 'Ngày', fontWeight: 'bold' }, width: 13, cell: (r) => ({ type: String, value: r.date }) },
      { header: { value: 'Lớp', fontWeight: 'bold' }, width: 12, cell: (r) => ({ type: String, value: r.className }) },
      { header: { value: 'Mã HS', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.studentCode }) },
      { header: { value: 'Họ và tên', fontWeight: 'bold' }, width: 26, cell: (r) => ({ type: String, value: r.studentName }) },
      { header: { value: 'Giáo viên', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.teacherName }) },
      { header: { value: 'Trạng thái', fontWeight: 'bold' }, width: 22, cell: (r) => ({ type: String, value: r.status }) },
      { header: { value: 'Tiêu chí ghi nhận', fontWeight: 'bold' }, width: 34, cell: (r) => ({ type: String, value: r.criteria }) },
      { header: { value: 'Nhận xét', fontWeight: 'bold' }, width: 38, cell: (r) => ({ type: String, value: r.comment }) },
    ],
  }).toFile(`danh_gia_hang_ngay_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await recordAuditLog('EXPORT', 'dailyAssessments', `Xuất Excel ${rows.length} đánh giá hằng ngày`);
}

export async function exportLessonAssessmentsExcel(params: {
  records: LessonAssessment[];
  studentsMap: Map<string, Student>;
  classesMap: Map<string, SchoolClass>;
  subjectsMap: Map<string, Subject>;
  teachersMap: Map<string, Teacher>;
}): Promise<void> {
  const rows = params.records.map((l, idx) => {
    const stu = params.studentsMap.get(l.studentId);
    return {
      stt: idx + 1,
      date: l.lessonDate,
      className: params.classesMap.get(l.classId)?.name ?? '',
      subjectName: params.subjectsMap.get(l.subjectId)?.name ?? '',
      topic: l.lessonTopic,
      studentCode: stu?.studentCode ?? '',
      studentName: stu?.fullName ?? '',
      teacherName: l.teacherId ? (params.teachersMap.get(l.teacherId)?.fullName ?? '') : '',
      rating: RATING_LEVEL_LABELS[l.ratingLevel],
      participation: l.participationLevel ? LESSON_PARTICIPATION_LABELS[l.participationLevel] : '',
      score: l.score ?? null,
      difficulties: l.difficulties ?? '',
      comment: l.comment ?? '',
    };
  });

  await writeXlsxFile(rows, {
    sheet: 'DanhGiaTheoTiet',
    columns: [
      { header: { value: 'STT', fontWeight: 'bold' }, width: 7, cell: (r) => ({ type: Number, value: r.stt }) },
      { header: { value: 'Ngày dạy', fontWeight: 'bold' }, width: 13, cell: (r) => ({ type: String, value: r.date }) },
      { header: { value: 'Lớp', fontWeight: 'bold' }, width: 11, cell: (r) => ({ type: String, value: r.className }) },
      { header: { value: 'Môn học', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.subjectName }) },
      { header: { value: 'Tên bài học', fontWeight: 'bold' }, width: 26, cell: (r) => ({ type: String, value: r.topic }) },
      { header: { value: 'Mã HS', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.studentCode }) },
      { header: { value: 'Họ và tên', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.studentName }) },
      { header: { value: 'Giáo viên', fontWeight: 'bold' }, width: 22, cell: (r) => ({ type: String, value: r.teacherName }) },
      { header: { value: 'Mức đánh giá', fontWeight: 'bold' }, width: 22, cell: (r) => ({ type: String, value: r.rating }) },
      { header: { value: 'Tham gia', fontWeight: 'bold' }, width: 22, cell: (r) => ({ type: String, value: r.participation }) },
      { header: { value: 'Điểm', fontWeight: 'bold' }, width: 10, cell: (r) => r.score !== null ? { type: Number, value: r.score } : null },
      { header: { value: 'Cần hỗ trợ', fontWeight: 'bold' }, width: 26, cell: (r) => ({ type: String, value: r.difficulties }) },
      { header: { value: 'Nhận xét', fontWeight: 'bold' }, width: 34, cell: (r) => ({ type: String, value: r.comment }) },
    ],
  }).toFile(`danh_gia_theo_tiet_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await recordAuditLog('EXPORT', 'lessonAssessments', `Xuất Excel ${rows.length} đánh giá theo tiết`);
}

export async function exportStudentReportExcel(report: StudentReportModel): Promise<void> {
  if (!report.student) throw new Error('Chưa chọn học sinh.');
  const rows = report.sourceRecords.map((r, idx) => ({
    stt: idx + 1,
    date: r.date,
    category: r.categoryLabel,
    subjectName: r.subjectName ?? '',
    teacherName: r.teacherName ?? '',
    title: r.title,
    statusOrRating: r.statusOrRating,
    detail: r.detail,
    comment: r.comment ?? '',
  }));

  await writeXlsxFile(rows, {
    sheet: 'BaoCaoHocSinh',
    columns: [
      { header: { value: 'STT', fontWeight: 'bold' }, width: 7, cell: (r) => ({ type: Number, value: r.stt }) },
      { header: { value: 'Ngày', fontWeight: 'bold' }, width: 13, cell: (r) => ({ type: String, value: r.date }) },
      { header: { value: 'Phân loại nguồn', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.category }) },
      { header: { value: 'Môn học', fontWeight: 'bold' }, width: 18, cell: (r) => ({ type: String, value: r.subjectName }) },
      { header: { value: 'Giáo viên', fontWeight: 'bold' }, width: 22, cell: (r) => ({ type: String, value: r.teacherName }) },
      { header: { value: 'Nội dung', fontWeight: 'bold' }, width: 32, cell: (r) => ({ type: String, value: r.title }) },
      { header: { value: 'Mức / Trạng thái', fontWeight: 'bold' }, width: 22, cell: (r) => ({ type: String, value: r.statusOrRating }) },
      { header: { value: 'Chi tiết', fontWeight: 'bold' }, width: 34, cell: (r) => ({ type: String, value: r.detail }) },
      { header: { value: 'Nhận xét', fontWeight: 'bold' }, width: 36, cell: (r) => ({ type: String, value: r.comment }) },
    ],
  }).toFile(`bao_cao_hoc_sinh_${report.student.studentCode}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await recordAuditLog('EXPORT', 'assessmentResults', `Xuất Excel báo cáo học sinh ${report.student.fullName}`);
}

export async function exportClassReportExcel(report: ClassReportModel): Promise<void> {
  const rows = report.studentRoster.map((r, idx) => ({
    stt: idx + 1,
    studentCode: r.student.studentCode,
    fullName: r.student.fullName,
    regularStatus:
      r.regularStatus === 'ASSESSED'
        ? `Đã đánh giá (${r.dailyAssessedCount} ngày, ${r.lessonAssessedCount} tiết)`
        : 'Chưa đánh giá',
    officialStatus:
      r.officialStatus === 'ASSESSED'
        ? `${r.officialResultsCount} kết quả (${r.latestOfficialRatings.join(', ')})`
        : 'Chưa đánh giá',
    supportTopics: r.supportTopics.join('; '),
  }));

  await writeXlsxFile(rows, {
    sheet: 'BaoCaoLopHoc',
    columns: [
      { header: { value: 'STT', fontWeight: 'bold' }, width: 7, cell: (r) => ({ type: Number, value: r.stt }) },
      { header: { value: 'Mã HS', fontWeight: 'bold' }, width: 16, cell: (r) => ({ type: String, value: r.studentCode }) },
      { header: { value: 'Họ và tên', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.fullName }) },
      { header: { value: 'Đánh giá thường xuyên', fontWeight: 'bold' }, width: 30, cell: (r) => ({ type: String, value: r.regularStatus }) },
      { header: { value: 'Kết quả định kỳ chính thức', fontWeight: 'bold' }, width: 34, cell: (r) => ({ type: String, value: r.officialStatus }) },
      { header: { value: 'Nội dung cần hỗ trợ', fontWeight: 'bold' }, width: 36, cell: (r) => ({ type: String, value: r.supportTopics }) },
    ],
  }).toFile(`bao_cao_lop_hoc_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await recordAuditLog('EXPORT', 'assessmentResults', `Xuất Excel báo cáo theo lớp (${rows.length} học sinh)`);
}

export async function exportSubjectReportExcel(report: SubjectReportModel): Promise<void> {
  const rows = report.byClassBreakdown.map((r, idx) => ({
    stt: idx + 1,
    className: r.className,
    grade: `Khối ${r.gradeLevel}`,
    teachers: r.teacherNames.join(', '),
    totalStudents: r.totalStudents,
    regularSummary: `${r.regularAssessedStudents}/${r.totalStudents} HS (T:${r.regularHtt} H:${r.regularHt} C:${r.regularCht})`,
    officialSummary: `T:${r.officialHtt} · H:${r.officialHt} · C:${r.officialCht}`,
    officialUnassessed: r.officialUnassessedStudents,
  }));

  await writeXlsxFile(rows, {
    sheet: 'BaoCaoMonHoc',
    columns: [
      { header: { value: 'STT', fontWeight: 'bold' }, width: 7, cell: (r) => ({ type: Number, value: r.stt }) },
      { header: { value: 'Lớp', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.className }) },
      { header: { value: 'Khối', fontWeight: 'bold' }, width: 10, cell: (r) => ({ type: String, value: r.grade }) },
      { header: { value: 'Giáo viên', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.teachers }) },
      { header: { value: 'Sĩ số', fontWeight: 'bold' }, width: 10, cell: (r) => ({ type: Number, value: r.totalStudents }) },
      { header: { value: 'Thường xuyên (Theo tiết)', fontWeight: 'bold' }, width: 30, cell: (r) => ({ type: String, value: r.regularSummary }) },
      { header: { value: 'Định kỳ chính thức (T/H/C)', fontWeight: 'bold' }, width: 26, cell: (r) => ({ type: String, value: r.officialSummary }) },
      { header: { value: 'Chưa ĐG định kỳ', fontWeight: 'bold' }, width: 16, cell: (r) => ({ type: Number, value: r.officialUnassessed }) },
    ],
  }).toFile(`bao_cao_mon_hoc_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await recordAuditLog('EXPORT', 'assessmentResults', `Xuất Excel báo cáo môn học (${rows.length} lớp)`);
}

export async function exportAssessmentResultsExcel(
  results: AssessmentResult[],
  studentsMap: Map<string, Student>,
  subjectsMap: Map<string, Subject>,
  classesMap: Map<string, SchoolClass>
): Promise<void> {
  const rows = results.map((r, idx) => ({
    stt: idx + 1,
    studentCode: studentsMap.get(r.studentId)?.studentCode ?? '',
    studentName: studentsMap.get(r.studentId)?.fullName ?? '',
    className: classesMap.get(r.classId)?.name ?? '',
    subjectName: r.subjectId ? (subjectsMap.get(r.subjectId)?.name ?? '') : 'Tổng hợp',
    ratingLevel: r.ratingLevel,
    numericScore: r.numericScore ?? null,
    summaryComment: r.summaryComment ?? '',
  }));

  await writeXlsxFile(rows, {
    sheet: 'DanhGia',
    columns: [
      { header: { value: 'STT', fontWeight: 'bold' }, width: 8, cell: (r) => ({ type: Number, value: r.stt }) },
      { header: { value: 'Mã HS', fontWeight: 'bold' }, width: 16, cell: (r) => ({ type: String, value: r.studentCode }) },
      { header: { value: 'Họ và tên', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.studentName }) },
      { header: { value: 'Lớp', fontWeight: 'bold' }, width: 12, cell: (r) => ({ type: String, value: r.className }) },
      { header: { value: 'Môn học / Nội dung', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.subjectName }) },
      { header: { value: 'Mức đạt', fontWeight: 'bold' }, width: 12, cell: (r) => ({ type: String, value: r.ratingLevel }) },
      { header: { value: 'Điểm KTĐK', fontWeight: 'bold' }, width: 14, cell: (r) => r.numericScore !== null ? { type: Number, value: r.numericScore } : null },
      { header: { value: 'Nhận xét', fontWeight: 'bold' }, width: 42, cell: (r) => ({ type: String, value: r.summaryComment }) },
    ],
  }).toFile(`bao_cao_danh_gia_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await recordAuditLog('EXPORT', 'assessmentResults', `Xuất Excel ${rows.length} kết quả đánh giá`);
}

export async function exportTimetableExcel(params: {
  timetableName: string;
  weekLabel?: string;
  lessons: Array<{
    dayOfWeek: number;
    periodNumber: number;
    lessonDate?: string;
    className: string;
    subjectName: string;
    teacherName: string;
    roomName?: string;
    lessonTitle?: string;
    timeRange?: string;
  }>;
}): Promise<void> {
  const rows = params.lessons.map((l) => ({
    timetableName: params.timetableName,
    weekLabel: params.weekLabel ?? '',
    dayLabel: DAY_OF_WEEK_LABELS[l.dayOfWeek as DayOfWeek] ?? `Thứ ${l.dayOfWeek}`,
    periodNumber: l.periodNumber,
    timeRange: l.timeRange ?? '',
    lessonDate: l.lessonDate ?? '',
    className: l.className,
    subjectName: l.subjectName,
    teacherName: l.teacherName,
    roomName: l.roomName ?? '',
    lessonTitle: l.lessonTitle ?? '',
  }));

  await writeXlsxFile(rows, {
    sheet: 'ThoiKhoaBieu',
    columns: [
      { header: { value: 'Thời khóa biểu', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.timetableName }) },
      { header: { value: 'Tuần', fontWeight: 'bold' }, width: 10, cell: (r) => ({ type: String, value: r.weekLabel }) },
      { header: { value: 'Thứ', fontWeight: 'bold' }, width: 12, cell: (r) => ({ type: String, value: r.dayLabel }) },
      { header: { value: 'Tiết', fontWeight: 'bold' }, width: 8, cell: (r) => ({ type: Number, value: r.periodNumber }) },
      { header: { value: 'Giờ học', fontWeight: 'bold' }, width: 15, cell: (r) => ({ type: String, value: r.timeRange }) },
      { header: { value: 'Ngày học', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.lessonDate }) },
      { header: { value: 'Lớp', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.className }) },
      { header: { value: 'Môn học', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.subjectName }) },
      { header: { value: 'Giáo viên', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.teacherName }) },
      { header: { value: 'Phòng học', fontWeight: 'bold' }, width: 14, cell: (r) => ({ type: String, value: r.roomName }) },
      { header: { value: 'Nội dung bài dạy', fontWeight: 'bold' }, width: 32, cell: (r) => ({ type: String, value: r.lessonTitle }) },
    ],
  }).toFile(`thoi_khoa_bieu_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await recordAuditLog('EXPORT', 'timetables', `Xuất Excel thời khóa biểu (${rows.length} tiết)`);
}

// ==========================================
// 9. XUẤT PDF TIẾNG VIỆT ĐÚNG DẤU (DEJAVUSANS)
// ==========================================

export async function exportAssessmentPdfReport(params: {
  schoolName: string;
  departmentName?: string;
  principalName?: string;
  teacherSignerName?: string;
  academicYearName: string;
  title: string;
  students: Student[];
  results: AssessmentResult[];
  classesMap: Map<string, SchoolClass>;
  subjectsMap: Map<string, Subject>;
}): Promise<void> {
  const studentById = new Map(params.students.map((s) => [s.id, s]));
  const rows = params.results.map((r, idx) => {
    const stu = studentById.get(r.studentId);
    const cls = params.classesMap.get(r.classId);
    const subj = r.subjectId ? params.subjectsMap.get(r.subjectId) : undefined;
    return [
      String(idx + 1),
      stu?.studentCode ?? '',
      stu?.fullName ?? '',
      cls?.name ?? '',
      subj?.name ?? 'Tổng hợp',
      RATING_LEVEL_LABELS[r.ratingLevel] ?? r.ratingLevel,
      r.numericScore !== undefined ? String(r.numericScore) : '—',
      r.summaryComment ?? '',
    ];
  });

  await exportStructuredVietnamesePdfReport({
    orientation: 'portrait',
    schoolName: params.schoolName,
    departmentName: params.departmentName,
    principalName: params.principalName,
    teacherSignerName: params.teacherSignerName,
    academicYearName: params.academicYearName,
    title: params.title,
    contextInfoLines: [`Tổng số bản ghi kết quả định kỳ: ${params.results.length}`],
    columns: ['STT', 'Mã HS', 'Họ và tên', 'Lớp', 'Môn học', 'Mức đạt', 'Điểm', 'Nhận xét'],
    rows,
    includeSignatures: true,
  });
}

export interface ExportableReportSourceRow {
  categoryLabel: string;
  date: string;
  studentName?: string;
  className?: string;
  subjectName?: string;
  teacherName?: string;
  periodName?: string;
  title: string;
  statusOrRating: string;
  detail: string;
  comment?: string;
}

export async function exportReportSourcesExcel(params: {
  reportTitle: string;
  timeRangeLabel: string;
  rows: ExportableReportSourceRow[];
}): Promise<void> {
  const mapped = params.rows.map((r, idx) => ({
    stt: idx + 1,
    date: r.date,
    category: r.categoryLabel,
    className: r.className ?? '',
    studentName: r.studentName ?? '',
    subjectName: r.subjectName ?? '',
    teacherName: r.teacherName ?? '',
    periodName: r.periodName ?? '',
    title: r.title,
    statusOrRating: r.statusOrRating,
    detail: r.detail,
    comment: r.comment ?? '',
  }));

  await writeXlsxFile(mapped, {
    sheet: 'BaoCaoTongHop',
    columns: [
      { header: { value: 'STT', fontWeight: 'bold' }, width: 7, cell: (r) => ({ type: Number, value: r.stt }) },
      { header: { value: 'Ngày', fontWeight: 'bold' }, width: 13, cell: (r) => ({ type: String, value: r.date }) },
      { header: { value: 'Phân loại', fontWeight: 'bold' }, width: 22, cell: (r) => ({ type: String, value: r.category }) },
      { header: { value: 'Lớp', fontWeight: 'bold' }, width: 10, cell: (r) => ({ type: String, value: r.className }) },
      { header: { value: 'Học sinh', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.studentName }) },
      { header: { value: 'Môn học', fontWeight: 'bold' }, width: 20, cell: (r) => ({ type: String, value: r.subjectName }) },
      { header: { value: 'Giáo viên', fontWeight: 'bold' }, width: 22, cell: (r) => ({ type: String, value: r.teacherName }) },
      { header: { value: 'Đợt / Tiêu đề', fontWeight: 'bold' }, width: 28, cell: (r) => ({ type: String, value: r.periodName || r.title }) },
      { header: { value: 'Mức / Trạng thái', fontWeight: 'bold' }, width: 24, cell: (r) => ({ type: String, value: r.statusOrRating }) },
      { header: { value: 'Chi tiết minh chứng', fontWeight: 'bold' }, width: 36, cell: (r) => ({ type: String, value: r.detail }) },
      { header: { value: 'Nhận xét', fontWeight: 'bold' }, width: 38, cell: (r) => ({ type: String, value: r.comment }) },
    ],
  }).toFile(`bao_cao_da_cap_${new Date().toISOString().slice(0, 10)}.xlsx`);

  await recordAuditLog(
    'EXPORT',
    'assessmentResults',
    `Xuất Excel "${params.reportTitle}" (${params.timeRangeLabel}) · ${mapped.length} bản ghi nguồn`
  );
}

export async function exportReportSourcesPdf(params: {
  schoolName: string;
  departmentName?: string;
  principalName?: string;
  teacherSignerName?: string;
  academicYearName: string;
  reportTitle: string;
  timeRangeLabel: string;
  rows: ExportableReportSourceRow[];
}): Promise<void> {
  const rows = params.rows.slice(0, 350).map((r, idx) => [
    String(idx + 1),
    r.date,
    r.categoryLabel,
    r.className ?? '—',
    r.studentName ?? '—',
    r.subjectName ?? '—',
    r.statusOrRating,
    r.comment || r.detail,
  ]);

  await exportStructuredVietnamesePdfReport({
    orientation: 'landscape',
    schoolName: params.schoolName,
    departmentName: params.departmentName,
    principalName: params.principalName,
    teacherSignerName: params.teacherSignerName,
    academicYearName: params.academicYearName,
    title: params.reportTitle,
    contextInfoLines: [
      `Thời gian áp dụng: ${params.timeRangeLabel}   |   Tổng số bản ghi nguồn: ${params.rows.length}`,
    ],
    columns: ['STT', 'Ngày', 'Phân loại', 'Lớp', 'Học sinh', 'Môn', 'Mức / Trạng thái', 'Chi tiết & Nhận xét'],
    rows,
    includeSignatures: true,
  });
}

export { SUBJECT_MODE_LABELS };
