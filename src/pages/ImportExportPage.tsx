import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Layers,
  Plus,
  RefreshCw,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { PageHeader } from '../components/common/PageHeader';
import { Pagination } from '../components/common/Pagination';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  buildAssignmentImportPreview,
  buildClassImportPreview,
  buildStudentImportPreview,
  buildSubjectImportPreview,
  buildTeacherImportPreview,
  buildTimetableImportPreview,
  commitAssignmentImport,
  commitClassImport,
  commitStudentImport,
  commitSubjectImport,
  commitTeacherImport,
  commitTimetableImport,
  detectAssignmentColumnMapping,
  detectClassColumnMapping,
  detectStudentColumnMapping,
  detectSubjectColumnMapping,
  detectTeacherColumnMapping,
  detectTimetableColumnMapping,
  exportAssessmentPdfReport,
  exportAssignmentTemplateExcel,
  exportClassesExcel,
  exportClassReportExcel,
  exportClassTemplateExcel,
  exportDailyAssessmentsExcel,
  exportLessonAssessmentsExcel,
  exportReportSourcesPdf,
  exportStudentReportExcel,
  exportStudentsExcel,
  exportStudentTemplateExcel,
  exportSubjectReportExcel,
  exportSubjectTemplateExcel,
  exportTeacherAssignmentsExcel,
  exportTeachersExcel,
  exportTeacherTemplateExcel,
  exportTimetableExcel,
  exportTimetableTemplateExcel,
  readExcelWorkbook,
  type AssignmentExcelColumnMapping,
  type AssignmentImportPreview,
  type ClassExcelColumnMapping,
  type ClassImportPreview,
  type ExcelColumnMapping,
  type ParsedExcelSheet,
  type StudentImportPreview,
  type SubjectExcelColumnMapping,
  type SubjectImportPreview,
  type TeacherExcelColumnMapping,
  type TeacherImportPreview,
  type TimetableExcelColumnMapping,
  type TimetableImportPreviewRow,
} from '../services/importExportService';
import { exportStudentProfilePdfReport } from '../services/pdfService';
import {
  buildClassReport,
  buildStudentReport,
  buildSubjectReport,
  loadReportDataset,
  type ReportDataset,
} from '../services/reportService';
import { DEFAULT_PERIOD_TIMES, timetableService } from '../services/timetableService';
import { DayOfWeek } from '../types/models';
import {
  DAY_OF_WEEK_LABELS,
  INPUT_CLASS,
  LABEL_CLASS,
  STUDENT_GENDER_LABELS,
  SUBJECT_MODE_LABELS,
  TEACHER_STATUS_LABELS,
} from '../utils/labels';

type PageTab = 'IMPORT' | 'EXPORT_EXCEL' | 'EXPORT_PDF';
type ImportEntityType =
  | 'STUDENTS'
  | 'TEACHERS'
  | 'CLASSES'
  | 'SUBJECTS'
  | 'ASSIGNMENTS'
  | 'TIMETABLE';

const IMPORT_TYPE_OPTIONS: Array<{
  id: ImportEntityType;
  label: string;
  targetRoute: string;
  targetRouteLabel: string;
  icon: React.FC<{ className?: string }>;
  description: string;
}> = [
  {
    id: 'STUDENTS',
    label: 'Học sinh',
    targetRoute: '/hoc-sinh',
    targetRouteLabel: 'Xem danh sách học sinh',
    icon: GraduationCap,
    description: 'Nhập danh sách học sinh, kiểm tra trùng mã & trùng họ tên + ngày sinh.',
  },
  {
    id: 'TEACHERS',
    label: 'Giáo viên',
    targetRoute: '/giao-vien',
    targetRouteLabel: 'Xem danh sách giáo viên',
    icon: UserCheck,
    description: 'Nhập hồ sơ giáo viên và tự động ánh xạ nhiều vai trò (GVCN, GVBM...).',
  },
  {
    id: 'CLASSES',
    label: 'Lớp học',
    targetRoute: '/lop-hoc',
    targetRouteLabel: 'Xem danh sách lớp học',
    icon: Users,
    description: 'Nhập lớp học (Khối 1–5) theo năm học và tự khớp GVCN nếu có.',
  },
  {
    id: 'SUBJECTS',
    label: 'Môn học',
    targetRoute: '/mon-hoc',
    targetRouteLabel: 'Xem danh sách môn học',
    icon: BookOpen,
    description: 'Nhập danh mục môn học, khối áp dụng và hình thức đánh giá.',
  },
  {
    id: 'ASSIGNMENTS',
    label: 'Phân công giáo viên',
    targetRoute: '/phan-cong',
    targetRouteLabel: 'Xem phân công nhiệm vụ',
    icon: ClipboardCheck,
    description: 'Nhập phân công GVCN / GVBM đa nhiệm vụ theo năm học, lớp và môn học.',
  },
  {
    id: 'TIMETABLE',
    label: 'Thời khóa biểu',
    targetRoute: '/thoi-khoa-bieu',
    targetRouteLabel: 'Xem thời khóa biểu',
    icon: CalendarDays,
    description: 'Nhập các tiết dạy từ Excel vào thời khóa biểu đích, kiểm tra trùng tiết.',
  },
];

const STEPS = [
  '1. Chọn loại & tệp',
  '2. Đọc trang tính',
  '3. Ánh xạ cột',
  '4. Xem trước & kiểm tra trùng',
  '5. Xác nhận nhập',
  '6. Kết quả',
];

export const ImportExportPage: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { academicYears, activeYear, settings, activeTeacher, refreshWorkspace } = useWorkspace();

  const [activeTab, setActiveTab] = useState<PageTab>('IMPORT');
  const [dataset, setDataset] = useState<ReportDataset | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Common scopes
  const [selectedYearId, setSelectedYearId] = useState<string>(activeYear?.id ?? '');
  const [targetClassId, setTargetClassId] = useState<string>('');
  const [targetTimetableId, setTargetTimetableId] = useState<string>('');

  // Quick timetable create inline
  const [creatingTimetable, setCreatingTimetable] = useState(false);
  const [quickTimetableName, setQuickTimetableName] = useState('Thời khóa biểu nhập Excel');

  // Import state
  const [importType, setImportType] = useState<ImportEntityType>('STUDENTS');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [parsedSheet, setParsedSheet] = useState<ParsedExcelSheet | null>(null);

  const [studentMapping, setStudentMapping] = useState<ExcelColumnMapping>({
    studentCode: '',
    fullName: '',
    dateOfBirth: '',
    gender: '',
    className: '',
    guardianName: '',
    guardianPhone: '',
    address: '',
  });
  const [teacherMapping, setTeacherMapping] = useState<TeacherExcelColumnMapping>({
    code: '',
    fullName: '',
    username: '',
    email: '',
    phone: '',
    specialization: '',
    status: '',
    roles: '',
  });
  const [classMapping, setClassMapping] = useState<ClassExcelColumnMapping>({
    code: '',
    name: '',
    gradeLevel: '',
    homeroomTeacher: '',
    roomName: '',
    capacity: '',
    notes: '',
  });
  const [subjectMapping, setSubjectMapping] = useState<SubjectExcelColumnMapping>({
    code: '',
    name: '',
    shortName: '',
    gradeLevels: '',
    assessmentMode: '',
    isCompulsory: '',
  });
  const [assignmentMapping, setAssignmentMapping] = useState<AssignmentExcelColumnMapping>({
    teacher: '',
    role: '',
    className: '',
    subject: '',
    weeklyPeriods: '',
    startDate: '',
    notes: '',
  });
  const [timetableMapping, setTimetableMapping] = useState<TimetableExcelColumnMapping>({
    day: '',
    period: '',
    lessonDate: '',
    className: '',
    subject: '',
    teacher: '',
    roomName: '',
    lessonTitle: '',
  });

  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'VALID' | 'ERROR' | 'DUPLICATE'>('ALL');
  const [skipPotentialDuplicates, setSkipPotentialDuplicates] = useState(true);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(10);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skippedDuplicate: number;
    failed: number;
  } | null>(null);

  // Export tab state
  const [exportYearId, setExportYearId] = useState<string>(activeYear?.id ?? '');
  const [exportClassId, setExportClassId] = useState<string>('');
  const [exportSubjectId, setExportSubjectId] = useState<string>('');
  const [exportStudentId, setExportStudentId] = useState<string>('');
  const [exportTimetableId, setExportTimetableId] = useState<string>('');
  const [exportPeriodId, setExportPeriodId] = useState<string>('');
  const [busyExportKey, setBusyExportKey] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    setLoadingData(true);
    const res = await loadReportDataset();
    setLoadingData(false);
    if (res.ok) {
      setDataset(res.data);
    } else {
      notify('error', 'Không thể tải dữ liệu từ IndexedDB', res.error);
    }
  }, [notify]);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    const defYear = activeYear?.id ?? academicYears[0]?.id ?? '';
    if (!selectedYearId && defYear) setSelectedYearId(defYear);
    if (!exportYearId && defYear) setExportYearId(defYear);
  }, [activeYear?.id, academicYears, selectedYearId, exportYearId]);

  const classesInSelectedYear = useMemo(() => {
    const all = dataset?.classes ?? [];
    return (selectedYearId ? all.filter((c) => c.academicYearId === selectedYearId) : all).filter(
      (c) => !c.isArchived
    );
  }, [dataset?.classes, selectedYearId]);

  const timetablesInSelectedYear = useMemo(() => {
    const all = dataset?.timetables ?? [];
    return selectedYearId ? all.filter((t) => t.academicYearId === selectedYearId) : all;
  }, [dataset?.timetables, selectedYearId]);

  useEffect(() => {
    if (
      classesInSelectedYear.length > 0 &&
      !classesInSelectedYear.some((c) => c.id === targetClassId)
    ) {
      setTargetClassId(classesInSelectedYear[0].id);
    }
  }, [classesInSelectedYear, targetClassId]);

  useEffect(() => {
    if (
      timetablesInSelectedYear.length > 0 &&
      !timetablesInSelectedYear.some((t) => t.id === targetTimetableId)
    ) {
      setTargetTimetableId(timetablesInSelectedYear[0].id);
    } else if (timetablesInSelectedYear.length === 0) {
      setTargetTimetableId('');
    }
  }, [timetablesInSelectedYear, targetTimetableId]);

  const classMap = useMemo(
    () => new Map((dataset?.classes ?? []).map((c) => [c.id, c])),
    [dataset?.classes]
  );

  const selectedTimetable = useMemo(
    () => timetablesInSelectedYear.find((t) => t.id === targetTimetableId),
    [timetablesInSelectedYear, targetTimetableId]
  );

  // Detect mapping when importType or parsedSheet changes
  const applyDetectedMappings = useCallback(
    (headers: string[], type: ImportEntityType) => {
      if (type === 'STUDENTS') setStudentMapping(detectStudentColumnMapping(headers));
      else if (type === 'TEACHERS') setTeacherMapping(detectTeacherColumnMapping(headers));
      else if (type === 'CLASSES') setClassMapping(detectClassColumnMapping(headers));
      else if (type === 'SUBJECTS') setSubjectMapping(detectSubjectColumnMapping(headers));
      else if (type === 'ASSIGNMENTS') setAssignmentMapping(detectAssignmentColumnMapping(headers));
      else setTimetableMapping(detectTimetableColumnMapping(headers));
    },
    []
  );

  const handleChangeImportType = (nextType: ImportEntityType) => {
    setImportType(nextType);
    setImportResult(null);
    setPreviewFilter('ALL');
    setPreviewPage(1);
    if (parsedSheet) {
      applyDetectedMappings(parsedSheet.headers, nextType);
    }
  };

  const resetWizard = () => {
    setSelectedFile(null);
    setParsedSheet(null);
    setImportResult(null);
    setPreviewFilter('ALL');
    setPreviewPage(1);
  };

  const parseSheetAtIndex = async (file: File, nextSheetIndex: number) => {
    try {
      const sheet = await readExcelWorkbook(file, nextSheetIndex);
      setParsedSheet(sheet);
      setSheetIndex(nextSheetIndex);
      setImportResult(null);
      setPreviewPage(1);
      applyDetectedMappings(sheet.headers, importType);
      notify(
        'info',
        `Đã đọc trang tính "${sheet.activeSheet}"`,
        `Tìm thấy ${sheet.headers.length} cột và ${sheet.rows.length} dòng dữ liệu.`
      );
    } catch (error) {
      resetWizard();
      notify(
        'error',
        'Không thể đọc tệp Excel',
        error instanceof Error ? error.message : 'Định dạng tệp không hợp lệ.'
      );
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSelectedFile(file);
    await parseSheetAtIndex(file, 0);
  };

  const handleDownloadTemplate = async () => {
    try {
      if (importType === 'STUDENTS') await exportStudentTemplateExcel();
      else if (importType === 'TEACHERS') await exportTeacherTemplateExcel();
      else if (importType === 'CLASSES') await exportClassTemplateExcel();
      else if (importType === 'SUBJECTS') await exportSubjectTemplateExcel();
      else if (importType === 'ASSIGNMENTS') await exportAssignmentTemplateExcel();
      else await exportTimetableTemplateExcel();
      notify('success', 'Đã tải xuống file Excel mẫu chuẩn');
    } catch (error) {
      notify('error', 'Không thể tạo tệp mẫu', error instanceof Error ? error.message : undefined);
    }
  };

  const handleQuickCreateTimetable = async () => {
    if (!selectedYearId) {
      notify('warning', 'Vui lòng chọn năm học trước khi tạo thời khóa biểu.');
      return;
    }
    setCreatingTimetable(true);
    const res = await timetableService.createTimetable({
      academicYearId: selectedYearId,
      name: quickTimetableName.trim() || 'Thời khóa biểu nhập Excel',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      schoolDays: [DayOfWeek.MON, DayOfWeek.TUE, DayOfWeek.WED, DayOfWeek.THU, DayOfWeek.FRI],
      periodsPerDay: 7,
      periodTimes: DEFAULT_PERIOD_TIMES.slice(0, 7),
      isActive: true,
    });
    setCreatingTimetable(false);
    if (res.ok) {
      await loadAllData();
      setTargetTimetableId(res.data.id);
      notify('success', `Đã tạo thời khóa biểu "${res.data.name}"`);
    } else {
      notify('error', 'Không thể tạo thời khóa biểu', res.error);
    }
  };

  // Previews per entity
  const studentPreview = useMemo<StudentImportPreview[]>(() => {
    if (!parsedSheet || importType !== 'STUDENTS') return [];
    return buildStudentImportPreview(
      parsedSheet.rows,
      studentMapping,
      dataset?.students ?? [],
      classesInSelectedYear,
      targetClassId
    );
  }, [parsedSheet, importType, studentMapping, dataset?.students, classesInSelectedYear, targetClassId]);

  const teacherPreview = useMemo<TeacherImportPreview[]>(() => {
    if (!parsedSheet || importType !== 'TEACHERS') return [];
    return buildTeacherImportPreview(
      parsedSheet.rows,
      teacherMapping,
      dataset?.teachers ?? [],
      dataset?.teacherRoles ?? []
    );
  }, [parsedSheet, importType, teacherMapping, dataset?.teachers, dataset?.teacherRoles]);

  const classPreview = useMemo<ClassImportPreview[]>(() => {
    if (!parsedSheet || importType !== 'CLASSES') return [];
    return buildClassImportPreview(
      parsedSheet.rows,
      classMapping,
      classesInSelectedYear,
      dataset?.teachers ?? []
    );
  }, [parsedSheet, importType, classMapping, classesInSelectedYear, dataset?.teachers]);

  const subjectPreview = useMemo<SubjectImportPreview[]>(() => {
    if (!parsedSheet || importType !== 'SUBJECTS') return [];
    return buildSubjectImportPreview(parsedSheet.rows, subjectMapping, dataset?.subjects ?? []);
  }, [parsedSheet, importType, subjectMapping, dataset?.subjects]);

  const assignmentPreview = useMemo<AssignmentImportPreview[]>(() => {
    if (!parsedSheet || importType !== 'ASSIGNMENTS') return [];
    return buildAssignmentImportPreview(parsedSheet.rows, assignmentMapping, {
      academicYearId: selectedYearId,
      teachers: dataset?.teachers ?? [],
      roles: dataset?.teacherRoles ?? [],
      classes: classesInSelectedYear,
      subjects: dataset?.subjects ?? [],
      existingAssignments: dataset?.teacherAssignments ?? [],
    });
  }, [
    parsedSheet,
    importType,
    assignmentMapping,
    selectedYearId,
    dataset?.teachers,
    dataset?.teacherRoles,
    classesInSelectedYear,
    dataset?.subjects,
    dataset?.teacherAssignments,
  ]);

  const timetablePreview = useMemo<TimetableImportPreviewRow[]>(() => {
    if (!parsedSheet || importType !== 'TIMETABLE') return [];
    const existingLessonsInTimetable = (dataset?.timetableLessons ?? []).filter(
      (l) => l.timetableId === targetTimetableId
    );
    return buildTimetableImportPreview({
      rows: parsedSheet.rows,
      classes: classesInSelectedYear,
      subjects: dataset?.subjects ?? [],
      teachers: dataset?.teachers ?? [],
      defaultTeacherId: selectedTimetable?.teacherId,
      defaultClassId: selectedTimetable?.classId,
      maxPeriods: selectedTimetable?.periodsPerDay ?? 8,
      allowedSchoolDays: selectedTimetable?.schoolDays ?? [2, 3, 4, 5, 6, 7],
      effectiveFrom: selectedTimetable?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      mapping: timetableMapping,
      existingLessonsInTimetable,
    });
  }, [
    parsedSheet,
    importType,
    dataset?.timetableLessons,
    targetTimetableId,
    classesInSelectedYear,
    dataset?.subjects,
    dataset?.teachers,
    selectedTimetable,
    timetableMapping,
  ]);

  // Unified preview summary for filtering / pagination / confirmation
  const unifiedRows = useMemo(() => {
    if (importType === 'STUDENTS') {
      return studentPreview.map((r) => ({
        rowIndex: r.rowIndex,
        isError: Boolean(r.error),
        isDuplicate: r.isDuplicate,
        isExactDup: r.duplicateType === 'EXACT_CODE_DB' || r.duplicateType === 'DUPLICATE_IN_FILE',
        isPotentialDup: r.duplicateType === 'NAME_DOB_MATCH',
        willImport:
          !r.error &&
          r.duplicateType !== 'EXACT_CODE_DB' &&
          r.duplicateType !== 'DUPLICATE_IN_FILE' &&
          !(r.duplicateType === 'NAME_DOB_MATCH' && skipPotentialDuplicates),
        raw: r,
      }));
    }
    if (importType === 'TEACHERS') {
      return teacherPreview.map((r) => ({
        rowIndex: r.rowIndex,
        isError: Boolean(r.error),
        isDuplicate: r.isDuplicate,
        isExactDup: r.duplicateType === 'EXACT_CODE_DB' || r.duplicateType === 'DUPLICATE_IN_FILE',
        isPotentialDup: r.duplicateType === 'NAME_DOB_MATCH',
        willImport:
          !r.error &&
          r.duplicateType !== 'EXACT_CODE_DB' &&
          r.duplicateType !== 'DUPLICATE_IN_FILE' &&
          !(r.duplicateType === 'NAME_DOB_MATCH' && skipPotentialDuplicates),
        raw: r,
      }));
    }
    if (importType === 'CLASSES') {
      return classPreview.map((r) => ({
        rowIndex: r.rowIndex,
        isError: Boolean(r.error),
        isDuplicate: r.isDuplicate,
        isExactDup: r.duplicateType === 'EXACT_CODE_DB' || r.duplicateType === 'DUPLICATE_IN_FILE',
        isPotentialDup: r.duplicateType === 'NAME_DOB_MATCH',
        willImport:
          !r.error &&
          r.duplicateType !== 'EXACT_CODE_DB' &&
          r.duplicateType !== 'DUPLICATE_IN_FILE' &&
          !(r.duplicateType === 'NAME_DOB_MATCH' && skipPotentialDuplicates),
        raw: r,
      }));
    }
    if (importType === 'SUBJECTS') {
      return subjectPreview.map((r) => ({
        rowIndex: r.rowIndex,
        isError: Boolean(r.error),
        isDuplicate: r.isDuplicate,
        isExactDup: r.duplicateType === 'EXACT_CODE_DB' || r.duplicateType === 'DUPLICATE_IN_FILE',
        isPotentialDup: r.duplicateType === 'NAME_DOB_MATCH',
        willImport:
          !r.error &&
          r.duplicateType !== 'EXACT_CODE_DB' &&
          r.duplicateType !== 'DUPLICATE_IN_FILE' &&
          !(r.duplicateType === 'NAME_DOB_MATCH' && skipPotentialDuplicates),
        raw: r,
      }));
    }
    if (importType === 'ASSIGNMENTS') {
      return assignmentPreview.map((r) => ({
        rowIndex: r.rowIndex,
        isError: Boolean(r.error),
        isDuplicate: r.isDuplicate,
        isExactDup: r.isDuplicate,
        isPotentialDup: false,
        willImport: !r.error && !r.isDuplicate,
        raw: r,
      }));
    }
    return timetablePreview.map((r) => {
      const isDup = Boolean(
        r.error && (r.error.includes('Trùng tiết') || r.error.includes('đã có trong TKB'))
      );
      return {
        rowIndex: r.rowIndex,
        isError: Boolean(r.error) && !isDup,
        isDuplicate: isDup,
        isExactDup: isDup,
        isPotentialDup: false,
        willImport: !r.error,
        raw: r,
      };
    });
  }, [
    importType,
    studentPreview,
    teacherPreview,
    classPreview,
    subjectPreview,
    assignmentPreview,
    timetablePreview,
    skipPotentialDuplicates,
  ]);

  const stats = useMemo(() => {
    let valid = 0;
    let errors = 0;
    let duplicates = 0;
    for (const r of unifiedRows) {
      if (r.isError) errors += 1;
      if (r.isDuplicate) duplicates += 1;
      if (r.willImport) valid += 1;
    }
    return { total: unifiedRows.length, valid, errors, duplicates };
  }, [unifiedRows]);

  const filteredUnified = useMemo(() => {
    return unifiedRows.filter((r) => {
      if (previewFilter === 'VALID') return r.willImport;
      if (previewFilter === 'ERROR') return r.isError;
      if (previewFilter === 'DUPLICATE') return r.isDuplicate;
      return true;
    });
  }, [unifiedRows, previewFilter]);

  const pagedUnified = useMemo(() => {
    const start = (previewPage - 1) * previewPageSize;
    return filteredUnified.slice(start, start + previewPageSize);
  }, [filteredUnified, previewPage, previewPageSize]);

  const activeStepNumber = importResult
    ? 6
    : confirmOpen
      ? 5
      : parsedSheet
        ? 4
        : 1;

  const canCommitImport = useMemo(() => {
    if (importing || stats.valid === 0) return false;
    if (importType === 'STUDENTS') return Boolean(targetClassId);
    if (importType === 'CLASSES' || importType === 'ASSIGNMENTS') return Boolean(selectedYearId);
    if (importType === 'TIMETABLE') return Boolean(selectedTimetable);
    return true;
  }, [importing, stats.valid, importType, targetClassId, selectedYearId, selectedTimetable]);

  const handleCommitImport = async () => {
    setConfirmOpen(false);
    setImporting(true);
    let result: { imported: number; skippedDuplicate: number; failed: number };

    try {
      if (importType === 'STUDENTS') {
        const defaultClass = classMap.get(targetClassId);
        if (!defaultClass) {
          setImporting(false);
          notify('warning', 'Chưa chọn lớp mặc định', 'Vui lòng chọn năm học và lớp tiếp nhận.');
          return;
        }
        result = await commitStudentImport(
          studentPreview,
          defaultClass,
          classMap,
          skipPotentialDuplicates
        );
      } else if (importType === 'TEACHERS') {
        result = await commitTeacherImport(teacherPreview, skipPotentialDuplicates);
      } else if (importType === 'CLASSES') {
        result = await commitClassImport(classPreview, selectedYearId, skipPotentialDuplicates);
      } else if (importType === 'SUBJECTS') {
        result = await commitSubjectImport(
          subjectPreview,
          (dataset?.subjects.length ?? 0) + 1,
          skipPotentialDuplicates
        );
      } else if (importType === 'ASSIGNMENTS') {
        result = await commitAssignmentImport(
          assignmentPreview,
          selectedYearId,
          activeTeacher?.fullName
        );
      } else {
        if (!selectedTimetable) {
          setImporting(false);
          notify('warning', 'Chưa chọn thời khóa biểu đích');
          return;
        }
        result = await commitTimetableImport({
          items: timetablePreview,
          timetable: selectedTimetable,
        });
      }

      setImportResult(result);
      notify(
        'success',
        'Hoàn tất nhập dữ liệu từ Excel',
        `Thêm mới ${result.imported} bản ghi · Bỏ qua trùng ${result.skippedDuplicate} · Lỗi ${result.failed}.`
      );
      await Promise.all([loadAllData(), refreshWorkspace()]);
    } catch (error) {
      notify(
        'error',
        'Lỗi lưu dữ liệu nhập Excel',
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setImporting(false);
    }
  };

  // ==========================================
  // EXPORT TAB HELPERS (10 EXCEL + VIETNAMESE PDF)
  // ==========================================

  const exportClassesInYear = useMemo(() => {
    const all = dataset?.classes ?? [];
    return exportYearId ? all.filter((c) => c.academicYearId === exportYearId) : all;
  }, [dataset?.classes, exportYearId]);

  const exportStudentsInScope = useMemo(() => {
    const all = dataset?.students ?? [];
    return all.filter((s) => {
      if (exportYearId && s.academicYearId !== exportYearId) return false;
      if (exportClassId && s.classId !== exportClassId) return false;
      return true;
    });
  }, [dataset?.students, exportYearId, exportClassId]);

  const exportTimetablesInYear = useMemo(() => {
    const all = dataset?.timetables ?? [];
    return exportYearId ? all.filter((t) => t.academicYearId === exportYearId) : all;
  }, [dataset?.timetables, exportYearId]);

  const exportPeriodsInYear = useMemo(() => {
    const all = dataset?.assessmentPeriods ?? [];
    return exportYearId ? all.filter((p) => p.academicYearId === exportYearId) : all;
  }, [dataset?.assessmentPeriods, exportYearId]);

  useEffect(() => {
    if (exportClassId && !exportClassesInYear.some((c) => c.id === exportClassId)) {
      setExportClassId('');
    }
  }, [exportClassesInYear, exportClassId]);

  useEffect(() => {
    if (
      exportStudentsInScope.length > 0 &&
      !exportStudentsInScope.some((s) => s.id === exportStudentId)
    ) {
      setExportStudentId(exportStudentsInScope[0].id);
    } else if (exportStudentsInScope.length === 0) {
      setExportStudentId('');
    }
  }, [exportStudentsInScope, exportStudentId]);

  useEffect(() => {
    if (
      exportTimetablesInYear.length > 0 &&
      !exportTimetablesInYear.some((t) => t.id === exportTimetableId)
    ) {
      setExportTimetableId(exportTimetablesInYear[0].id);
    } else if (exportTimetablesInYear.length === 0) {
      setExportTimetableId('');
    }
  }, [exportTimetablesInYear, exportTimetableId]);

  useEffect(() => {
    if (
      exportPeriodsInYear.length > 0 &&
      !exportPeriodsInYear.some((p) => p.id === exportPeriodId)
    ) {
      setExportPeriodId(exportPeriodsInYear[0].id);
    } else if (exportPeriodsInYear.length === 0) {
      setExportPeriodId('');
    }
  }, [exportPeriodsInYear, exportPeriodId]);

  const runExportAction = async (key: string, fn: () => Promise<void>, successMessage: string) => {
    setBusyExportKey(key);
    try {
      await fn();
      notify('success', successMessage);
    } catch (error) {
      notify('error', 'Xuất tệp thất bại', error instanceof Error ? error.message : undefined);
    } finally {
      setBusyExportKey(null);
    }
  };

  const currentTypeMeta = IMPORT_TYPE_OPTIONS.find((o) => o.id === importType)!;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhập / Xuất Excel & Xuất PDF tiếng Việt"
        description="Hỗ trợ nhập 6 loại danh mục từ Excel (có ánh xạ cột & phát hiện trùng), xuất 10 bộ dữ liệu/báo cáo Excel và xuất PDF tiếng Việt đúng dấu."
        actions={
          <Link
            to="/sao-luu"
            className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
          >
            <DatabaseBackup className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            Sao lưu – Khôi phục JSON
          </Link>
        }
      />

      {/* Tabs chính */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
        {(
          [
            { id: 'IMPORT', label: '1. Nhập Excel (6 mẫu)', icon: Upload },
            { id: 'EXPORT_EXCEL', label: '2. Xuất Excel (10 loại)', icon: FileSpreadsheet },
            { id: 'EXPORT_PDF', label: '3. Xuất PDF tiếng Việt', icon: FileText },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-teal-700 text-white'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* TAB 1: NHẬP EXCEL (6 LOẠI DỮ LIỆU)                       */}
      {/* ======================================================== */}
      {activeTab === 'IMPORT' && (
        <div className="space-y-5">
          {/* Chọn loại dữ liệu cần nhập */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_TYPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = importType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleChangeImportType(opt.id)}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                    selected
                      ? 'border-teal-600 bg-teal-50/70 dark:border-teal-500 dark:bg-teal-950/40'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      selected
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Nhập {opt.label}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                      {opt.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Thanh tiến trình */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs">
                {STEPS.map((label, idx) => {
                  const done = idx + 1 <= activeStepNumber;
                  return (
                    <span
                      key={label}
                      className={`rounded-md px-2.5 py-1 font-medium tabular-nums ${
                        done
                          ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => void handleDownloadTemplate()}
                className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 whitespace-nowrap"
              >
                <FileSpreadsheet className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                Tải mẫu Excel {currentTypeMeta.label} (.xlsx)
              </button>
            </div>
          </div>

          {/* Bước 1 - 2: Phạm vi đích, tệp & sheet */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Bước 1 – 2: Cấu hình đích & chọn tệp Excel ({currentTypeMeta.label})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {currentTypeMeta.description}
                </p>
              </div>
              {parsedSheet && (
                <button
                  type="button"
                  onClick={resetWizard}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Chọn tệp khác
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(importType === 'STUDENTS' ||
                importType === 'CLASSES' ||
                importType === 'ASSIGNMENTS' ||
                importType === 'TIMETABLE') && (
                <div>
                  <label className={LABEL_CLASS}>Năm học áp dụng *</label>
                  <select
                    value={selectedYearId}
                    onChange={(e) => setSelectedYearId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {academicYears.length === 0 && <option value="">Chưa có năm học</option>}
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {importType === 'STUDENTS' && (
                <div>
                  <label className={LABEL_CLASS}>Lớp mặc định khi file không ghi lớp *</label>
                  <select
                    value={targetClassId}
                    onChange={(e) => setTargetClassId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {classesInSelectedYear.length === 0 && (
                      <option value="">Chưa có lớp khả dụng</option>
                    )}
                    {classesInSelectedYear.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Khối {c.gradeLevel})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {importType === 'TIMETABLE' && (
                <div>
                  <label className={LABEL_CLASS}>Thời khóa biểu nhận tiết dạy *</label>
                  <select
                    value={targetTimetableId}
                    onChange={(e) => setTargetTimetableId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {timetablesInSelectedYear.length === 0 && (
                      <option value="">Chưa có thời khóa biểu</option>
                    )}
                    {timetablesInSelectedYear.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.weekNumber ? `(Tuần ${t.weekNumber})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className={LABEL_CLASS}>Chọn tệp Excel (.xlsx / .xls)</label>
                <label className="flex min-h-[42px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:border-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <Upload className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {parsedSheet ? parsedSheet.fileName : 'Chọn tệp Excel...'}
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.xlsm,.ods"
                    onChange={(e) => void handleFileChange(e)}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            {importType === 'TIMETABLE' && timetablesInSelectedYear.length === 0 && (
              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs dark:border-amber-900/60 dark:bg-amber-950/30">
                <div className="flex-1 min-w-[200px]">
                  <label className={LABEL_CLASS}>
                    Năm học chưa có Thời khóa biểu — Tạo nhanh để nhập Excel
                  </label>
                  <input
                    type="text"
                    value={quickTimetableName}
                    onChange={(e) => setQuickTimetableName(e.target.value)}
                    className={INPUT_CLASS}
                    placeholder="Tên thời khóa biểu mới..."
                  />
                </div>
                <button
                  type="button"
                  disabled={creatingTimetable || !selectedYearId}
                  onClick={() => void handleQuickCreateTimetable()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  Tạo nhanh TKB
                </button>
              </div>
            )}

            {parsedSheet && parsedSheet.sheetNames.length > 1 && selectedFile && (
              <div className="max-w-xs">
                <label className={LABEL_CLASS}>Trang tính (Sheet) cần đọc</label>
                <select
                  value={sheetIndex}
                  onChange={(e) => void parseSheetAtIndex(selectedFile, Number(e.target.value))}
                  className={INPUT_CLASS}
                >
                  {parsedSheet.sheetNames.map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Bước 3: Ánh xạ cột */}
          {parsedSheet && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Bước 3: Ánh xạ cột dữ liệu ({currentTypeMeta.label})
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Tìm thấy <strong className="tabular-nums">{parsedSheet.headers.length}</strong> cột:{' '}
                  {parsedSheet.headers.join(', ') || '(không có tiêu đề)'}. Có thể điều chỉnh lại ánh xạ bên dưới.
                </p>
              </div>

              {importType === 'STUDENTS' && (
                <MappingGrid
                  headers={parsedSheet.headers}
                  mapping={studentMapping}
                  onChange={setStudentMapping}
                  fields={[
                    { key: 'studentCode', label: 'Mã học sinh *' },
                    { key: 'fullName', label: 'Họ và tên *' },
                    { key: 'dateOfBirth', label: 'Ngày sinh' },
                    { key: 'gender', label: 'Giới tính' },
                    { key: 'className', label: 'Lớp (tùy chọn)' },
                    { key: 'guardianName', label: 'Phụ huynh' },
                    { key: 'guardianPhone', label: 'Số điện thoại' },
                    { key: 'address', label: 'Địa chỉ' },
                  ]}
                />
              )}

              {importType === 'TEACHERS' && (
                <MappingGrid
                  headers={parsedSheet.headers}
                  mapping={teacherMapping}
                  onChange={setTeacherMapping}
                  fields={[
                    { key: 'code', label: 'Mã giáo viên *' },
                    { key: 'fullName', label: 'Họ và tên *' },
                    { key: 'username', label: 'Tên đăng nhập' },
                    { key: 'email', label: 'Email' },
                    { key: 'phone', label: 'Số điện thoại' },
                    { key: 'specialization', label: 'Chuyên môn' },
                    { key: 'roles', label: 'Vai trò (GVCN, GVBM)' },
                    { key: 'status', label: 'Trạng thái' },
                  ]}
                />
              )}

              {importType === 'CLASSES' && (
                <MappingGrid
                  headers={parsedSheet.headers}
                  mapping={classMapping}
                  onChange={setClassMapping}
                  fields={[
                    { key: 'code', label: 'Mã lớp *' },
                    { key: 'name', label: 'Tên lớp *' },
                    { key: 'gradeLevel', label: 'Khối (1–5) *' },
                    { key: 'homeroomTeacher', label: 'GVCN' },
                    { key: 'roomName', label: 'Phòng học' },
                    { key: 'capacity', label: 'Sĩ số dự kiến' },
                    { key: 'notes', label: 'Ghi chú' },
                  ]}
                />
              )}

              {importType === 'SUBJECTS' && (
                <MappingGrid
                  headers={parsedSheet.headers}
                  mapping={subjectMapping}
                  onChange={setSubjectMapping}
                  fields={[
                    { key: 'code', label: 'Mã môn *' },
                    { key: 'name', label: 'Tên môn học *' },
                    { key: 'shortName', label: 'Tên viết tắt' },
                    { key: 'gradeLevels', label: 'Khối áp dụng' },
                    { key: 'assessmentMode', label: 'Hình thức đánh giá' },
                    { key: 'isCompulsory', label: 'Môn bắt buộc' },
                  ]}
                />
              )}

              {importType === 'ASSIGNMENTS' && (
                <MappingGrid
                  headers={parsedSheet.headers}
                  mapping={assignmentMapping}
                  onChange={setAssignmentMapping}
                  fields={[
                    { key: 'teacher', label: 'Giáo viên *' },
                    { key: 'role', label: 'Vai trò (GVCN/GVBM)' },
                    { key: 'className', label: 'Lớp' },
                    { key: 'subject', label: 'Môn học' },
                    { key: 'weeklyPeriods', label: 'Số tiết/tuần' },
                    { key: 'startDate', label: 'Ngày bắt đầu' },
                    { key: 'notes', label: 'Ghi chú' },
                  ]}
                />
              )}

              {importType === 'TIMETABLE' && (
                <MappingGrid
                  headers={parsedSheet.headers}
                  mapping={timetableMapping}
                  onChange={setTimetableMapping}
                  fields={[
                    { key: 'day', label: 'Thứ (2–7) *' },
                    { key: 'period', label: 'Tiết (1–8) *' },
                    { key: 'lessonDate', label: 'Ngày học' },
                    { key: 'className', label: 'Lớp *' },
                    { key: 'subject', label: 'Môn học *' },
                    { key: 'teacher', label: 'Giáo viên' },
                    { key: 'roomName', label: 'Phòng học' },
                    { key: 'lessonTitle', label: 'Nội dung bài dạy' },
                  ]}
                />
              )}
            </div>
          )}

          {/* Bước 4 - 5: Xem trước, kiểm tra trùng & xác nhận */}
          {parsedSheet && unifiedRows.length > 0 && !importResult && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Bước 4 – 5: Xem trước, kiểm tra hợp lệ & phát hiện trùng
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400">
                    <span className="tabular-nums">
                      Tổng dòng: <strong className="text-slate-900 dark:text-slate-100">{stats.total}</strong>
                    </span>
                    <span className="tabular-nums">
                      Sẵn sàng nhập:{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400">{stats.valid}</strong>
                    </span>
                    <span className="tabular-nums">
                      Lỗi dữ liệu:{' '}
                      <strong className="text-red-600 dark:text-red-400">{stats.errors}</strong>
                    </span>
                    <span className="tabular-nums">
                      Trùng / nghi trùng:{' '}
                      <strong className="text-amber-700 dark:text-amber-400">{stats.duplicates}</strong>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canCommitImport}
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {importing ? 'Đang lưu...' : `Xác nhận nhập (${stats.valid} bản ghi)`}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: 'ALL', label: `Tất cả (${stats.total})` },
                      { id: 'VALID', label: `Hợp lệ (${stats.valid})` },
                      { id: 'ERROR', label: `Lỗi (${stats.errors})` },
                      { id: 'DUPLICATE', label: `Trùng (${stats.duplicates})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setPreviewFilter(tab.id);
                        setPreviewPage(1);
                      }}
                      className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-medium tabular-nums ${
                        previewFilter === tab.id
                          ? 'bg-teal-700 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {(importType === 'STUDENTS' ||
                  importType === 'TEACHERS' ||
                  importType === 'CLASSES' ||
                  importType === 'SUBJECTS') && (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={skipPotentialDuplicates}
                      onChange={(e) => setSkipPotentialDuplicates(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-teal-700"
                    />
                    Bỏ qua dòng nghi trùng tên / thông tin liên hệ
                  </label>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {importType === 'STUDENTS' && (
                      <tr>
                        <th className="px-3 py-2.5">Dòng</th>
                        <th className="px-3 py-2.5">Mã HS</th>
                        <th className="px-3 py-2.5">Họ tên</th>
                        <th className="px-3 py-2.5">Ngày sinh</th>
                        <th className="px-3 py-2.5">Giới tính</th>
                        <th className="px-3 py-2.5">Lớp đích</th>
                        <th className="px-3 py-2.5">Trạng thái kiểm tra</th>
                      </tr>
                    )}
                    {importType === 'TEACHERS' && (
                      <tr>
                        <th className="px-3 py-2.5">Dòng</th>
                        <th className="px-3 py-2.5">Mã GV</th>
                        <th className="px-3 py-2.5">Họ tên</th>
                        <th className="px-3 py-2.5">Liên hệ</th>
                        <th className="px-3 py-2.5">Vai trò</th>
                        <th className="px-3 py-2.5">Trạng thái</th>
                        <th className="px-3 py-2.5">Kiểm tra</th>
                      </tr>
                    )}
                    {importType === 'CLASSES' && (
                      <tr>
                        <th className="px-3 py-2.5">Dòng</th>
                        <th className="px-3 py-2.5">Mã lớp</th>
                        <th className="px-3 py-2.5">Tên lớp</th>
                        <th className="px-3 py-2.5">Khối</th>
                        <th className="px-3 py-2.5">GVCN</th>
                        <th className="px-3 py-2.5">Phòng</th>
                        <th className="px-3 py-2.5">Kiểm tra</th>
                      </tr>
                    )}
                    {importType === 'SUBJECTS' && (
                      <tr>
                        <th className="px-3 py-2.5">Dòng</th>
                        <th className="px-3 py-2.5">Mã môn</th>
                        <th className="px-3 py-2.5">Tên môn</th>
                        <th className="px-3 py-2.5">Khối</th>
                        <th className="px-3 py-2.5">Hình thức</th>
                        <th className="px-3 py-2.5">Kiểm tra</th>
                      </tr>
                    )}
                    {importType === 'ASSIGNMENTS' && (
                      <tr>
                        <th className="px-3 py-2.5">Dòng</th>
                        <th className="px-3 py-2.5">Giáo viên</th>
                        <th className="px-3 py-2.5">Vai trò</th>
                        <th className="px-3 py-2.5">Lớp</th>
                        <th className="px-3 py-2.5">Môn học</th>
                        <th className="px-3 py-2.5">Tiết/tuần</th>
                        <th className="px-3 py-2.5">Kiểm tra</th>
                      </tr>
                    )}
                    {importType === 'TIMETABLE' && (
                      <tr>
                        <th className="px-3 py-2.5">Dòng</th>
                        <th className="px-3 py-2.5">Thứ</th>
                        <th className="px-3 py-2.5">Tiết</th>
                        <th className="px-3 py-2.5">Ngày học</th>
                        <th className="px-3 py-2.5">Lớp</th>
                        <th className="px-3 py-2.5">Môn</th>
                        <th className="px-3 py-2.5">Giáo viên</th>
                        <th className="px-3 py-2.5">Kiểm tra</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pagedUnified.map((entry) => {
                      if (importType === 'STUDENTS') {
                        const r = entry.raw as StudentImportPreview;
                        return (
                          <tr key={r.rowIndex}>
                            <td className="px-3 py-2 font-mono tabular-nums text-slate-500">{r.rowIndex}</td>
                            <td className="px-3 py-2 font-mono">{r.studentCode || '—'}</td>
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                              {r.fullName || '—'}
                            </td>
                            <td className="px-3 py-2 font-mono tabular-nums">{r.dateOfBirth}</td>
                            <td className="px-3 py-2">{STUDENT_GENDER_LABELS[r.gender]}</td>
                            <td className="px-3 py-2">
                              {r.resolvedClassId ? (classMap.get(r.resolvedClassId)?.name ?? '—') : '—'}
                            </td>
                            <td className="px-3 py-2">
                              <PreviewStatusCell
                                error={r.error}
                                duplicateType={r.duplicateType}
                                duplicateNote={r.duplicateNote}
                                skipPotential={skipPotentialDuplicates}
                              />
                            </td>
                          </tr>
                        );
                      }
                      if (importType === 'TEACHERS') {
                        const r = entry.raw as TeacherImportPreview;
                        return (
                          <tr key={r.rowIndex}>
                            <td className="px-3 py-2 font-mono tabular-nums text-slate-500">{r.rowIndex}</td>
                            <td className="px-3 py-2 font-mono">{r.code || '—'}</td>
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                              {r.fullName || '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                              {r.phone || r.email || '—'}
                            </td>
                            <td className="px-3 py-2">{r.roleCodes.join(', ') || '—'}</td>
                            <td className="px-3 py-2">{TEACHER_STATUS_LABELS[r.status]}</td>
                            <td className="px-3 py-2">
                              <PreviewStatusCell
                                error={r.error}
                                duplicateType={r.duplicateType}
                                duplicateNote={r.duplicateNote}
                                skipPotential={skipPotentialDuplicates}
                              />
                            </td>
                          </tr>
                        );
                      }
                      if (importType === 'CLASSES') {
                        const r = entry.raw as ClassImportPreview;
                        return (
                          <tr key={r.rowIndex}>
                            <td className="px-3 py-2 font-mono tabular-nums text-slate-500">{r.rowIndex}</td>
                            <td className="px-3 py-2 font-mono">{r.code || '—'}</td>
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                              {r.name || '—'}
                            </td>
                            <td className="px-3 py-2 tabular-nums">Khối {r.gradeLevel}</td>
                            <td className="px-3 py-2">{r.homeroomTeacherLabel || '—'}</td>
                            <td className="px-3 py-2">{r.roomName || '—'}</td>
                            <td className="px-3 py-2">
                              <PreviewStatusCell
                                error={r.error}
                                warning={r.warning}
                                duplicateType={r.duplicateType}
                                duplicateNote={r.duplicateNote}
                                skipPotential={skipPotentialDuplicates}
                              />
                            </td>
                          </tr>
                        );
                      }
                      if (importType === 'SUBJECTS') {
                        const r = entry.raw as SubjectImportPreview;
                        return (
                          <tr key={r.rowIndex}>
                            <td className="px-3 py-2 font-mono tabular-nums text-slate-500">{r.rowIndex}</td>
                            <td className="px-3 py-2 font-mono">{r.code || '—'}</td>
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                              {r.name || '—'}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{r.gradeLevels.join(', ')}</td>
                            <td className="px-3 py-2">{SUBJECT_MODE_LABELS[r.assessmentMode]}</td>
                            <td className="px-3 py-2">
                              <PreviewStatusCell
                                error={r.error}
                                duplicateType={r.duplicateType}
                                duplicateNote={r.duplicateNote}
                                skipPotential={skipPotentialDuplicates}
                              />
                            </td>
                          </tr>
                        );
                      }
                      if (importType === 'ASSIGNMENTS') {
                        const r = entry.raw as AssignmentImportPreview;
                        return (
                          <tr key={r.rowIndex}>
                            <td className="px-3 py-2 font-mono tabular-nums text-slate-500">{r.rowIndex}</td>
                            <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                              {r.teacherLabel || '—'}
                            </td>
                            <td className="px-3 py-2">{r.roleLabel || r.resolvedRoleCode || '—'}</td>
                            <td className="px-3 py-2">{r.classLabel || 'Toàn trường'}</td>
                            <td className="px-3 py-2">{r.subjectLabel || '—'}</td>
                            <td className="px-3 py-2 tabular-nums">{r.weeklyPeriods ?? '—'}</td>
                            <td className="px-3 py-2">
                              <PreviewStatusCell
                                error={r.error}
                                duplicateType={r.duplicateType}
                                duplicateNote={r.duplicateNote}
                                skipPotential={true}
                              />
                            </td>
                          </tr>
                        );
                      }
                      const r = entry.raw as TimetableImportPreviewRow;
                      return (
                        <tr key={r.rowIndex}>
                          <td className="px-3 py-2 font-mono tabular-nums text-slate-500">{r.rowIndex}</td>
                          <td className="px-3 py-2">
                            {DAY_OF_WEEK_LABELS[r.dayOfWeek as DayOfWeek] ?? (r.dayOfWeek || '—')}
                          </td>
                          <td className="px-3 py-2 font-mono tabular-nums">{r.periodNumber || '—'}</td>
                          <td className="px-3 py-2 font-mono tabular-nums">{r.lessonDate || '—'}</td>
                          <td className="px-3 py-2">{r.classLabel || '—'}</td>
                          <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                            {r.subjectLabel || '—'}
                          </td>
                          <td className="px-3 py-2">{r.teacherLabel || 'Theo TKB'}</td>
                          <td className="px-3 py-2">
                            {r.error ? (
                              <span
                                className={
                                  entry.isDuplicate
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-red-600 dark:text-red-400'
                                }
                              >
                                {r.error}
                              </span>
                            ) : r.warning ? (
                              <span className="text-amber-700 dark:text-amber-400">{r.warning}</span>
                            ) : (
                              <span className="text-emerald-700 dark:text-emerald-400">
                                Hợp lệ · Sẵn sàng nhập
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Pagination
                totalItems={filteredUnified.length}
                page={previewPage}
                pageSize={previewPageSize}
                onPageChange={setPreviewPage}
                onPageSizeChange={(s) => {
                  setPreviewPageSize(s);
                  setPreviewPage(1);
                }}
              />
            </div>
          )}

          {/* Bước 6: Kết quả nhập */}
          {importResult && (
            <div className="rounded-xl border border-emerald-200 bg-white p-6 dark:border-emerald-900 dark:bg-slate-900 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Bước 6: Hoàn tất nhập dữ liệu {currentTypeMeta.label} từ Excel
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Đã lưu{' '}
                    <strong className="text-emerald-700 tabular-nums dark:text-emerald-400">
                      {importResult.imported}
                    </strong>{' '}
                    bản ghi mới vào IndexedDB · Bỏ qua do trùng:{' '}
                    <strong className="tabular-nums">{importResult.skippedDuplicate}</strong> · Dòng lỗi:{' '}
                    <strong className="tabular-nums">{importResult.failed}</strong>.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => navigate(currentTypeMeta.targetRoute)}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
                >
                  {currentTypeMeta.targetRouteLabel}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={resetWizard}
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Nhập tệp Excel khác
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: XUẤT EXCEL (10 LOẠI DỮ LIỆU & BÁO CÁO)            */}
      {/* ======================================================== */}
      {activeTab === 'EXPORT_EXCEL' && (
        <div className="space-y-5">
          {/* Bộ lọc phạm vi xuất */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Phạm vi lọc dữ liệu trước khi xuất Excel
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Các tệp Excel đều sử dụng UTF-8 tiếng Việt đầy đủ, sẵn sàng mở trên Microsoft Excel hoặc Google Sheets.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className={LABEL_CLASS}>Năm học</label>
                <select
                  value={exportYearId}
                  onChange={(e) => setExportYearId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Tất cả năm học</option>
                  {(dataset?.academicYears ?? []).map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Lớp học</label>
                <select
                  value={exportClassId}
                  onChange={(e) => setExportClassId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Tất cả lớp trong năm</option>
                  {exportClassesInYear.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Khối {c.gradeLevel})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Học sinh (Báo cáo cá nhân)</label>
                <select
                  value={exportStudentId}
                  onChange={(e) => setExportStudentId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">-- Chọn học sinh --</option>
                  {exportStudentsInScope.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.studentCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Môn học (Báo cáo môn)</label>
                <select
                  value={exportSubjectId}
                  onChange={(e) => setExportSubjectId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Tất cả môn học</option>
                  {(dataset?.subjects ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Thời khóa biểu</label>
                <select
                  value={exportTimetableId}
                  onChange={(e) => setExportTimetableId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Tất cả TKB</option>
                  {exportTimetablesInYear.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loadingData || !dataset ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              Đang tải dữ liệu từ IndexedDB...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* 1. Danh sách học sinh */}
              <ExportCard
                title="1. Danh sách học sinh"
                subtitle={`${exportStudentsInScope.length} học sinh theo phạm vi lọc hiện tại`}
                busy={busyExportKey === 'students'}
                onExport={() =>
                  void runExportAction(
                    'students',
                    () => exportStudentsExcel(exportStudentsInScope, classMap),
                    `Đã xuất Excel ${exportStudentsInScope.length} học sinh`
                  )
                }
              />

              {/* 2. Danh sách lớp */}
              <ExportCard
                title="2. Danh sách lớp học"
                subtitle={`${exportClassesInYear.length} lớp kèm sĩ số thực tế & GVCN`}
                busy={busyExportKey === 'classes'}
                onExport={() =>
                  void runExportAction(
                    'classes',
                    () =>
                      exportClassesExcel({
                        classes: exportClassesInYear,
                        students: dataset.students,
                        teachersMap: new Map(dataset.teachers.map((t) => [t.id, t])),
                        yearsMap: new Map(dataset.academicYears.map((y) => [y.id, y])),
                      }),
                    `Đã xuất Excel ${exportClassesInYear.length} lớp học`
                  )
                }
              />

              {/* 3. Danh sách giáo viên */}
              <ExportCard
                title="3. Danh sách giáo viên"
                subtitle={`${dataset.teachers.length} giáo viên kèm vai trò & thông tin liên hệ`}
                busy={busyExportKey === 'teachers'}
                onExport={() =>
                  void runExportAction(
                    'teachers',
                    () =>
                      exportTeachersExcel({
                        teachers: dataset.teachers,
                        roleGrants: dataset.teacherRoleGrants,
                        rolesMap: new Map(dataset.teacherRoles.map((r) => [r.id, r])),
                      }),
                    `Đã xuất Excel ${dataset.teachers.length} giáo viên`
                  )
                }
              />

              {/* 4. Phân công nhiệm vụ */}
              <ExportCard
                title="4. Phân công nhiệm vụ giáo viên"
                subtitle="Bao gồm GVCN, GVBM, lớp, môn học và số tiết/tuần"
                busy={busyExportKey === 'assignments'}
                onExport={() => {
                  const filtered = dataset.teacherAssignments.filter(
                    (a) =>
                      (!exportYearId || a.academicYearId === exportYearId) &&
                      (!exportClassId || a.classId === exportClassId)
                  );
                  void runExportAction(
                    'assignments',
                    () =>
                      exportTeacherAssignmentsExcel({
                        assignments: filtered,
                        teachersMap: new Map(dataset.teachers.map((t) => [t.id, t])),
                        classesMap: classMap,
                        subjectsMap: new Map(dataset.subjects.map((s) => [s.id, s])),
                        yearsMap: new Map(dataset.academicYears.map((y) => [y.id, y])),
                      }),
                    `Đã xuất Excel ${filtered.length} phân công nhiệm vụ`
                  );
                }}
              />

              {/* 5. Thời khóa biểu */}
              <ExportCard
                title="5. Thời khóa biểu"
                subtitle="Xuất lịch các tiết học theo tuần, lớp, môn và giáo viên"
                busy={busyExportKey === 'timetable'}
                onExport={() => {
                  const selectedTb = dataset.timetables.find((t) => t.id === exportTimetableId);
                  const lessons = dataset.timetableLessons.filter((l) =>
                    exportTimetableId
                      ? l.timetableId === exportTimetableId
                      : !exportYearId || l.academicYearId === exportYearId
                  );
                  const subjectsMap = new Map(dataset.subjects.map((s) => [s.id, s]));
                  const teachersMap = new Map(dataset.teachers.map((t) => [t.id, t]));
                  void runExportAction(
                    'timetable',
                    () =>
                      exportTimetableExcel({
                        timetableName: selectedTb?.name ?? 'Thời khóa biểu tổng hợp',
                        weekLabel: selectedTb?.weekNumber ? `Tuần ${selectedTb.weekNumber}` : undefined,
                        lessons: lessons.map((l) => ({
                          dayOfWeek: l.dayOfWeek,
                          periodNumber: l.periodNumber,
                          lessonDate: l.lessonDate,
                          className: classMap.get(l.classId)?.name ?? '',
                          subjectName: subjectsMap.get(l.subjectId)?.name ?? '',
                          teacherName: l.teacherId ? (teachersMap.get(l.teacherId)?.fullName ?? '') : '',
                          roomName: l.roomName,
                          lessonTitle: l.lessonTitle,
                        })),
                      }),
                    `Đã xuất Excel thời khóa biểu (${lessons.length} tiết)`
                  );
                }}
              />

              {/* 6. Đánh giá hằng ngày */}
              <ExportCard
                title="6. Đánh giá hằng ngày (GVCN)"
                subtitle="Toàn bộ bản ghi đánh giá theo tiêu chí tích cực / cần hỗ trợ"
                busy={busyExportKey === 'daily'}
                onExport={() => {
                  const records = dataset.dailyAssessments.filter(
                    (d) =>
                      (!exportYearId || d.academicYearId === exportYearId) &&
                      (!exportClassId || d.classId === exportClassId)
                  );
                  void runExportAction(
                    'daily',
                    () =>
                      exportDailyAssessmentsExcel({
                        records,
                        studentsMap: new Map(dataset.students.map((s) => [s.id, s])),
                        classesMap: classMap,
                        teachersMap: new Map(dataset.teachers.map((t) => [t.id, t])),
                        dailyCriteriaMap: new Map(dataset.dailyCriteria.map((c) => [c.id, c])),
                      }),
                    `Đã xuất Excel ${records.length} bản ghi đánh giá hằng ngày`
                  );
                }}
              />

              {/* 7. Đánh giá theo tiết */}
              <ExportCard
                title="7. Đánh giá theo tiết học (GVBM)"
                subtitle="Mức hoàn thành, mức tham gia, khó khăn cần hỗ trợ & nhận xét"
                busy={busyExportKey === 'lesson'}
                onExport={() => {
                  const records = dataset.lessonAssessments.filter(
                    (l) =>
                      (!exportYearId || l.academicYearId === exportYearId) &&
                      (!exportClassId || l.classId === exportClassId) &&
                      (!exportSubjectId || l.subjectId === exportSubjectId)
                  );
                  void runExportAction(
                    'lesson',
                    () =>
                      exportLessonAssessmentsExcel({
                        records,
                        studentsMap: new Map(dataset.students.map((s) => [s.id, s])),
                        classesMap: classMap,
                        subjectsMap: new Map(dataset.subjects.map((s) => [s.id, s])),
                        teachersMap: new Map(dataset.teachers.map((t) => [t.id, t])),
                      }),
                    `Đã xuất Excel ${records.length} bản ghi đánh giá theo tiết`
                  );
                }}
              />

              {/* 8. Báo cáo theo học sinh */}
              <ExportCard
                title="8. Báo cáo tổng hợp theo học sinh"
                subtitle="Tách riêng đánh giá thường xuyên và kết quả định kỳ chính thức"
                busy={busyExportKey === 'report_student'}
                disabled={!exportStudentId}
                onExport={() => {
                  const report = buildStudentReport(dataset, {
                    academicYearId: exportYearId || undefined,
                    classId: exportClassId || undefined,
                    studentId: exportStudentId,
                    timeframeMode: 'FULL_YEAR',
                    referenceDate: new Date().toISOString().slice(0, 10),
                  });
                  void runExportAction(
                    'report_student',
                    () => exportStudentReportExcel(report),
                    `Đã xuất Excel báo cáo học sinh ${report.student?.fullName ?? ''}`
                  );
                }}
              />

              {/* 9. Báo cáo theo lớp */}
              <ExportCard
                title="9. Báo cáo tổng hợp theo lớp"
                subtitle="Danh sách HS, số đã/chưa đánh giá và nội dung cần hỗ trợ"
                busy={busyExportKey === 'report_class'}
                onExport={() => {
                  const report = buildClassReport(dataset, {
                    academicYearId: exportYearId || undefined,
                    classId: exportClassId || undefined,
                    timeframeMode: 'FULL_YEAR',
                    referenceDate: new Date().toISOString().slice(0, 10),
                  });
                  void runExportAction(
                    'report_class',
                    () => exportClassReportExcel(report),
                    `Đã xuất Excel báo cáo theo lớp (${report.studentRoster.length} học sinh)`
                  );
                }}
              />

              {/* 10. Báo cáo theo môn học */}
              <ExportCard
                title="10. Báo cáo tổng hợp theo môn học"
                subtitle="Phân bổ mức đánh giá T/H/C theo từng lớp & giáo viên"
                busy={busyExportKey === 'report_subject'}
                onExport={() => {
                  const report = buildSubjectReport(dataset, {
                    academicYearId: exportYearId || undefined,
                    classId: exportClassId || undefined,
                    subjectId: exportSubjectId || undefined,
                    timeframeMode: 'FULL_YEAR',
                    referenceDate: new Date().toISOString().slice(0, 10),
                  });
                  void runExportAction(
                    'report_subject',
                    () => exportSubjectReportExcel(report),
                    `Đã xuất Excel báo cáo môn học (${report.byClassBreakdown.length} lớp)`
                  );
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: XUẤT PDF TIẾNG VIỆT ĐÚNG DẤU                      */}
      {/* ======================================================== */}
      {activeTab === 'EXPORT_PDF' && dataset && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Mẫu báo cáo PDF tiếng Việt chuẩn Unicode (DejaVuSans)
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Hiển thị đầy đủ dấu tiếng Việt, quốc hiệu/tên trường ({settings?.schoolName ?? 'Trường Tiểu học Hoa Tâm'}), năm học, ngày lập báo cáo và khu vực chữ ký xác nhận.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={LABEL_CLASS}>Năm học</label>
                <select
                  value={exportYearId}
                  onChange={(e) => setExportYearId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Tất cả năm học</option>
                  {dataset.academicYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Lớp học</label>
                <select
                  value={exportClassId}
                  onChange={(e) => setExportClassId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Tất cả lớp trong năm</option>
                  {exportClassesInYear.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Học sinh (Phiếu cá nhân)</label>
                <select
                  value={exportStudentId}
                  onChange={(e) => setExportStudentId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">-- Chọn học sinh --</option>
                  {exportStudentsInScope.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.studentCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Đợt đánh giá định kỳ</label>
                <select
                  value={exportPeriodId}
                  onChange={(e) => setExportPeriodId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Tất cả đợt</option>
                  {exportPeriodsInYear.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ExportCard
              title="Phiếu báo cáo kết quả học sinh (PDF)"
              subtitle="Tổng hợp kết quả định kỳ chính thức, đánh giá thường xuyên & chữ ký GVCN / Hiệu trưởng"
              busy={busyExportKey === 'pdf_student'}
              disabled={!exportStudentId}
              icon={FileText}
              buttonLabel="Xuất PDF học sinh"
              onExport={() => {
                const report = buildStudentReport(dataset, {
                  academicYearId: exportYearId || undefined,
                  classId: exportClassId || undefined,
                  studentId: exportStudentId,
                  timeframeMode: 'FULL_YEAR',
                  referenceDate: new Date().toISOString().slice(0, 10),
                });
                void runExportAction(
                  'pdf_student',
                  () =>
                    exportStudentProfilePdfReport({
                      schoolName: settings?.schoolName ?? 'Trường Tiểu học Hoa Tâm',
                      departmentName: settings?.departmentName,
                      circularStandard: settings?.circularStandard,
                      principalName: settings?.principalName,
                      teacherSignerName: activeTeacher?.fullName,
                      report,
                    }).then(() => undefined),
                  `Đã xuất phiếu PDF tiếng Việt cho ${report.student?.fullName ?? 'học sinh'}`
                );
              }}
            />

            <ExportCard
              title="Bảng tổng hợp đánh giá định kỳ (PDF)"
              subtitle="Theo lớp / năm học / đợt đánh giá kèm điểm KTĐK, mức T/H/C và nhận xét"
              busy={busyExportKey === 'pdf_periodic'}
              icon={FileText}
              buttonLabel="Xuất PDF định kỳ"
              onExport={() => {
                const yearObj = dataset.academicYears.find((y) => y.id === exportYearId);
                const clsObj = exportClassId ? classMap.get(exportClassId) : undefined;
                const periodObj = dataset.assessmentPeriods.find((p) => p.id === exportPeriodId);
                const results = dataset.assessmentResults.filter(
                  (r) =>
                    (!exportYearId || r.academicYearId === exportYearId) &&
                    (!exportClassId || r.classId === exportClassId) &&
                    (!exportPeriodId || r.periodId === exportPeriodId)
                );
                void runExportAction(
                  'pdf_periodic',
                  () =>
                    exportAssessmentPdfReport({
                      schoolName: settings?.schoolName ?? 'Trường Tiểu học Hoa Tâm',
                      departmentName: settings?.departmentName,
                      principalName: settings?.principalName,
                      teacherSignerName: activeTeacher?.fullName,
                      academicYearName: yearObj?.name ?? 'Tất cả năm học',
                      title: `BẢNG TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ${clsObj ? ` LỚP ${clsObj.name}` : ''}${
                        periodObj ? ` (${periodObj.name})` : ''
                      }`,
                      students: dataset.students,
                      results,
                      classesMap: classMap,
                      subjectsMap: new Map(dataset.subjects.map((s) => [s.id, s])),
                    }),
                  `Đã xuất bảng PDF kết quả định kỳ (${results.length} bản ghi)`
                );
              }}
            />

            <ExportCard
              title="Báo cáo tổng hợp đa cấp theo lớp (PDF)"
              subtitle="Chi tiết minh chứng hằng ngày, theo tiết và định kỳ nguồn dữ liệu thực"
              busy={busyExportKey === 'pdf_class'}
              icon={FileText}
              buttonLabel="Xuất PDF lớp học"
              onExport={() => {
                const yearObj = dataset.academicYears.find((y) => y.id === exportYearId);
                const classRep = buildClassReport(dataset, {
                  academicYearId: exportYearId || undefined,
                  classId: exportClassId || undefined,
                  timeframeMode: 'FULL_YEAR',
                  referenceDate: new Date().toISOString().slice(0, 10),
                });
                void runExportAction(
                  'pdf_class',
                  () =>
                    exportReportSourcesPdf({
                      schoolName: settings?.schoolName ?? 'Trường Tiểu học Hoa Tâm',
                      departmentName: settings?.departmentName,
                      principalName: settings?.principalName,
                      teacherSignerName: activeTeacher?.fullName,
                      academicYearName: yearObj?.name ?? 'Tất cả năm học',
                      reportTitle: `BÁO CÁO ĐÁNH GIÁ THEO LỚP: ${
                        classRep.targetClasses.map((c) => c.name).join(', ') || 'Tất cả lớp'
                      }`,
                      timeRangeLabel: classRep.timeRange.label,
                      rows: classRep.sourceRecords,
                    }),
                  'Đã xuất PDF báo cáo tổng hợp theo lớp'
                );
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <Layers className="mt-0.5 h-5 w-5 shrink-0 text-teal-700 dark:text-teal-400" />
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Lưu ý: Excel/PDF phục vụ trao đổi & in ấn — không thay thế bản sao lưu hệ thống
                </div>
                <p className="mt-0.5">
                  Để lưu toàn bộ cơ sở dữ liệu dự phòng (23 bảng kèm mã toàn vẹn), hãy xuất tệp <strong>.json</strong> tại phân hệ Sao lưu – Khôi phục.
                </p>
              </div>
            </div>
            <Link
              to="/sao-luu"
              className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <DatabaseBackup className="h-4 w-4" />
              Mở Sao lưu – Khôi phục (.json)
            </Link>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        title={`Xác nhận nhập dữ liệu ${currentTypeMeta.label}`}
        message={`Hệ thống sẽ lưu ${stats.valid} bản ghi hợp lệ mới vào IndexedDB và tự động bỏ qua ${stats.duplicates + stats.errors} dòng trùng hoặc lỗi (không ghi đè dữ liệu cũ). Bạn muốn tiếp tục?`}
        confirmLabel="Xác nhận nhập"
        onConfirm={() => void handleCommitImport()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

// ==========================================
// SUBCOMPONENTS
// ==========================================

function MappingGrid<T extends object>(props: {
  headers: string[];
  mapping: T;
  onChange: (next: T) => void;
  fields: ReadonlyArray<{ key: keyof T; label: string }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {props.fields.map((field) => (
        <div key={String(field.key)}>
          <label className={LABEL_CLASS}>{field.label}</label>
          <select
            value={String(props.mapping[field.key] ?? '')}
            onChange={(e) =>
              props.onChange({
                ...props.mapping,
                [field.key]: e.target.value,
              })
            }
            className={INPUT_CLASS}
          >
            <option value="">-- Không ánh xạ --</option>
            {props.headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

function PreviewStatusCell(props: {
  error?: string;
  warning?: string;
  duplicateType: string;
  duplicateNote?: string;
  skipPotential: boolean;
}) {
  if (props.error) {
    return <span className="text-red-600 dark:text-red-400">{props.error}</span>;
  }
  if (props.duplicateType === 'EXACT_CODE_DB' || props.duplicateType === 'DUPLICATE_IN_FILE') {
    return (
      <span className="text-amber-700 dark:text-amber-400">
        {props.duplicateNote} (bỏ qua)
      </span>
    );
  }
  if (props.duplicateType === 'NAME_DOB_MATCH') {
    return (
      <span className="text-amber-700 dark:text-amber-400">
        {props.duplicateNote} ({props.skipPotential ? 'sẽ bỏ qua' : 'vẫn nhập mới'})
      </span>
    );
  }
  if (props.warning) {
    return <span className="text-amber-700 dark:text-amber-400">{props.warning}</span>;
  }
  return <span className="text-emerald-700 dark:text-emerald-400">Hợp lệ · Sẵn sàng nhập</span>;
}

function ExportCard(props: {
  title: string;
  subtitle: string;
  busy?: boolean;
  disabled?: boolean;
  buttonLabel?: string;
  icon?: React.FC<{ className?: string }>;
  onExport: () => void;
}) {
  const Icon = props.icon ?? Download;
  return (
    <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{props.title}</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{props.subtitle}</p>
      </div>
      <div>
        <button
          type="button"
          disabled={props.busy || props.disabled}
          onClick={props.onExport}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
        >
          <Icon className="h-4 w-4" />
          {props.busy ? 'Đang xuất...' : (props.buttonLabel ?? 'Tải xuống Excel (.xlsx)')}
        </button>
      </div>
    </div>
  );
}
