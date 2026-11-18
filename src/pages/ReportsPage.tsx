import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Eye,
  FileText,
  Filter,
  GraduationCap,
  Layers,
  MessageSquare,
  SlidersHorizontal,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { ReportPeriodConfigModal } from '../components/reports/ReportPeriodConfigModal';
import { SourceDataModal } from '../components/reports/SourceDataModal';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  exportClassReportExcel,
  exportReportSourcesExcel,
  exportReportSourcesPdf,
  exportStudentReportExcel,
  exportSubjectReportExcel,
} from '../services/importExportService';
import { exportStudentProfilePdfReport } from '../services/pdfService';
import {
  REPORT_TIMEFRAME_LABELS,
  buildClassReport,
  buildStudentReport,
  buildSubjectReport,
  buildTeacherReport,
  buildTimeframeReport,
  loadReportDataset,
  type ReportDataset,
  type ReportFilter,
  type ReportSourceRecord,
  type ReportTimeframeMode,
} from '../services/reportService';
import {
  INPUT_CLASS,
  LABEL_CLASS,
  LESSON_PARTICIPATION_LABELS,
  LESSON_WORKFLOW_STATUS_LABELS,
  PERIOD_TYPE_LABELS,
  RATING_LEVEL_LABELS,
  STUDENT_GENDER_LABELS,
  STUDENT_STATUS_LABELS,
  TEACHER_ASSIGNMENT_STATUS_LABELS,
} from '../utils/labels';

type ReportTab = 'STUDENT' | 'CLASS' | 'TEACHER' | 'SUBJECT' | 'TIMEFRAME';

const TAB_DEFINITIONS: Array<{
  id: ReportTab;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'STUDENT', label: 'Theo học sinh', icon: GraduationCap },
  { id: 'CLASS', label: 'Theo lớp', icon: Users },
  { id: 'TEACHER', label: 'Theo giáo viên', icon: UserCheck },
  { id: 'SUBJECT', label: 'Theo môn học', icon: BookOpen },
  { id: 'TIMEFRAME', label: 'Theo thời gian', icon: CalendarRange },
];

const TEACHER_CHART_COLORS: Record<'ASSESSED' | 'IN_PROGRESS' | 'UNASSESSED', string> = {
  ASSESSED: '#0F766E',
  IN_PROGRESS: '#D97706',
  UNASSESSED: '#64748B',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export const ReportsPage: React.FC = () => {
  const { notify } = useNotification();
  const { activeYear, settings, permissions, activeTeacher } = useWorkspace();

  const [dataset, setDataset] = useState<ReportDataset | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<ReportTab>('CLASS');
  const [academicYearId, setAcademicYearId] = useState<string>('');
  const [gradeLevel, setGradeLevel] = useState<string>('');
  const [classId, setClassId] = useState<string>('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [teacherId, setTeacherId] = useState<string>('');
  const [studentId, setStudentId] = useState<string>('');
  const [timeframeMode, setTimeframeMode] = useState<ReportTimeframeMode>('FULL_YEAR');
  const [referenceDate, setReferenceDate] = useState<string>(todayIso());
  const [referenceMonth, setReferenceMonth] = useState<string>(todayIso().slice(0, 7));
  const [periodId, setPeriodId] = useState<string>('');

  const [sourceModal, setSourceModal] = useState<{
    open: boolean;
    title: string;
    subtitle?: string;
    records: ReportSourceRecord[];
  }>({ open: false, title: '', records: [] });

  const [periodConfigOpen, setPeriodConfigOpen] = useState(false);

  const reloadData = useCallback(async () => {
    setLoading(true);
    const res = await loadReportDataset();
    setLoading(false);
    if (res.ok) {
      setDataset(res.data);
    } else {
      notify('error', 'Không thể tải dữ liệu báo cáo', res.error);
    }
  }, [notify]);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  // Default year / teacher / class / student once loaded
  useEffect(() => {
    if (!dataset) return;
    if (!academicYearId) {
      const defYearId = activeYear?.id ?? dataset.academicYears[0]?.id ?? '';
      if (defYearId) setAcademicYearId(defYearId);
    }
    if (!teacherId) {
      if (permissions.isScopedTeacher && activeTeacher?.id) {
        setTeacherId(activeTeacher.id);
      } else if (dataset.teachers.length > 0) {
        setTeacherId(dataset.teachers[0].id);
      }
    }
  }, [dataset, activeYear?.id, academicYearId, teacherId, permissions.isScopedTeacher, activeTeacher?.id]);

  // Available options respecting year, gradeLevel, and teacher permissions
  const availableClasses = useMemo(() => {
    if (!dataset) return [];
    return dataset.classes.filter((c) => {
      if (academicYearId && c.academicYearId !== academicYearId) return false;
      if (gradeLevel && c.gradeLevel !== Number(gradeLevel)) return false;
      if (permissions.isScopedTeacher && !permissions.allAllowedClassIds.has(c.id)) return false;
      return true;
    });
  }, [dataset, academicYearId, gradeLevel, permissions]);

  const availableStudents = useMemo(() => {
    if (!dataset) return [];
    const allowedClassIds = new Set(availableClasses.map((c) => c.id));
    return dataset.students.filter((s) => {
      if (classId) return s.classId === classId;
      return allowedClassIds.has(s.classId);
    });
  }, [dataset, availableClasses, classId]);

  const availablePeriods = useMemo(() => {
    if (!dataset) return [];
    return dataset.assessmentPeriods.filter(
      (p) => !academicYearId || p.academicYearId === academicYearId
    );
  }, [dataset, academicYearId]);

  const availableSubjects = useMemo(() => {
    if (!dataset) return [];
    if (!gradeLevel) return dataset.subjects;
    const g = Number(gradeLevel);
    return dataset.subjects.filter((s) => s.gradeLevels.includes(g));
  }, [dataset, gradeLevel]);

  // Keep classId / studentId / subjectId valid when cascading filters change
  useEffect(() => {
    if (classId && !availableClasses.some((c) => c.id === classId)) {
      setClassId('');
    }
    if (!classId && activeTab === 'CLASS' && availableClasses.length > 0) {
      setClassId(availableClasses[0].id);
    }
  }, [availableClasses, classId, activeTab]);

  useEffect(() => {
    if (studentId && !availableStudents.some((s) => s.id === studentId)) {
      setStudentId('');
    }
    if (!studentId && activeTab === 'STUDENT' && availableStudents.length > 0) {
      setStudentId(availableStudents[0].id);
    }
  }, [availableStudents, studentId, activeTab]);

  useEffect(() => {
    if (activeTab === 'SUBJECT' && !subjectId && availableSubjects.length > 0) {
      setSubjectId(availableSubjects[0].id);
    }
  }, [activeTab, subjectId, availableSubjects]);

  const reportFilter: ReportFilter = useMemo(
    () => ({
      academicYearId: academicYearId || undefined,
      gradeLevel: gradeLevel ? Number(gradeLevel) : undefined,
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      teacherId:
        activeTab === 'TEACHER'
          ? teacherId || undefined
          : teacherId && activeTab !== 'CLASS' && activeTab !== 'STUDENT' && activeTab !== 'TIMEFRAME'
            ? teacherId
            : undefined,
      studentId: studentId || undefined,
      timeframeMode,
      referenceDate,
      referenceMonth,
      periodId: periodId || undefined,
      permissions,
    }),
    [
      academicYearId,
      gradeLevel,
      classId,
      subjectId,
      teacherId,
      studentId,
      timeframeMode,
      referenceDate,
      referenceMonth,
      periodId,
      permissions,
      activeTab,
    ]
  );

  // Explicit teacher filter only applies on Subject/Timeframe if user explicitly chooses a teacher filter, or on Teacher tab
  const [explicitTeacherFilter, setExplicitTeacherFilter] = useState<string>('');
  const effectiveFilter: ReportFilter = useMemo(() => {
    if (activeTab === 'TEACHER') {
      return { ...reportFilter, teacherId: teacherId || undefined };
    }
    return {
      ...reportFilter,
      teacherId: explicitTeacherFilter || undefined,
    };
  }, [reportFilter, activeTab, teacherId, explicitTeacherFilter]);

  const studentReport = useMemo(
    () => (dataset && activeTab === 'STUDENT' ? buildStudentReport(dataset, effectiveFilter) : null),
    [dataset, activeTab, effectiveFilter]
  );
  const classReport = useMemo(
    () => (dataset && activeTab === 'CLASS' ? buildClassReport(dataset, effectiveFilter) : null),
    [dataset, activeTab, effectiveFilter]
  );
  const teacherReport = useMemo(
    () => (dataset && activeTab === 'TEACHER' ? buildTeacherReport(dataset, effectiveFilter) : null),
    [dataset, activeTab, effectiveFilter]
  );
  const subjectReport = useMemo(
    () => (dataset && activeTab === 'SUBJECT' ? buildSubjectReport(dataset, effectiveFilter) : null),
    [dataset, activeTab, effectiveFilter]
  );
  const timeframeReport = useMemo(
    () => (dataset && activeTab === 'TIMEFRAME' ? buildTimeframeReport(dataset, effectiveFilter) : null),
    [dataset, activeTab, effectiveFilter]
  );

  const currentReportMeta = useMemo(() => {
    if (activeTab === 'STUDENT' && studentReport) {
      return {
        title: `Báo cáo học sinh: ${studentReport.student?.fullName ?? 'Chưa chọn'}`,
        timeRangeLabel: studentReport.timeRange.label,
        sources: studentReport.sourceRecords,
      };
    }
    if (activeTab === 'CLASS' && classReport) {
      return {
        title: `Báo cáo theo lớp: ${classReport.targetClasses.map((c) => c.name).join(', ') || 'Chưa chọn'}`,
        timeRangeLabel: classReport.timeRange.label,
        sources: classReport.sourceRecords,
      };
    }
    if (activeTab === 'TEACHER' && teacherReport) {
      return {
        title: `Báo cáo giáo viên: ${teacherReport.teacher?.fullName ?? 'Chưa chọn'}`,
        timeRangeLabel: teacherReport.timeRange.label,
        sources: teacherReport.sourceRecords,
      };
    }
    if (activeTab === 'SUBJECT' && subjectReport) {
      return {
        title: `Báo cáo môn học: ${subjectReport.subject?.name ?? 'Tất cả môn'}`,
        timeRangeLabel: subjectReport.timeRange.label,
        sources: subjectReport.sourceRecords,
      };
    }
    if (activeTab === 'TIMEFRAME' && timeframeReport) {
      return {
        title: `Báo cáo theo thời gian (${timeframeReport.timeRange.label})`,
        timeRangeLabel: timeframeReport.timeRange.label,
        sources: timeframeReport.sourceRecords,
      };
    }
    return { title: 'Báo cáo đánh giá', timeRangeLabel: '', sources: [] as ReportSourceRecord[] };
  }, [activeTab, studentReport, classReport, teacherReport, subjectReport, timeframeReport]);

  const openSources = (title: string, records: ReportSourceRecord[], subtitle?: string) => {
    setSourceModal({ open: true, title, subtitle, records });
  };

  const handleExportExcel = async () => {
    try {
      if (activeTab === 'STUDENT' && studentReport?.student) {
        await exportStudentReportExcel(studentReport);
        notify('success', `Đã xuất Excel báo cáo học sinh ${studentReport.student.fullName}`);
        return;
      }
      if (activeTab === 'CLASS' && classReport) {
        await exportClassReportExcel(classReport);
        notify('success', `Đã xuất Excel báo cáo theo lớp (${classReport.studentRoster.length} học sinh)`);
        return;
      }
      if (activeTab === 'SUBJECT' && subjectReport) {
        await exportSubjectReportExcel(subjectReport);
        notify('success', `Đã xuất Excel báo cáo môn học (${subjectReport.byClassBreakdown.length} lớp)`);
        return;
      }
      await exportReportSourcesExcel({
        reportTitle: currentReportMeta.title,
        timeRangeLabel: currentReportMeta.timeRangeLabel,
        rows: currentReportMeta.sources,
      });
      notify('success', `Đã xuất Excel (${currentReportMeta.sources.length} bản ghi nguồn)`);
    } catch (error) {
      notify('error', 'Lỗi xuất Excel', error instanceof Error ? error.message : undefined);
    }
  };

  const handleExportPdf = async () => {
    try {
      const selectedYear = dataset?.academicYears.find((y) => y.id === academicYearId);
      const schoolName = settings?.schoolName ?? 'Trường Tiểu học Hoa Tâm';
      const departmentName = settings?.departmentName ?? 'Phòng Giáo dục và Đào tạo';
      const circularStandard = settings?.circularStandard;
      const principalName = settings?.principalName;
      const teacherSignerName = activeTeacher?.fullName;

      if (activeTab === 'STUDENT' && studentReport?.student) {
        await exportStudentProfilePdfReport({
          schoolName,
          departmentName,
          circularStandard,
          principalName,
          teacherSignerName,
          report: studentReport,
        });
        notify('success', `Đã xuất phiếu PDF tiếng Việt cho học sinh ${studentReport.student.fullName}`);
        return;
      }

      await exportReportSourcesPdf({
        schoolName,
        departmentName,
        principalName,
        teacherSignerName,
        academicYearName: selectedYear?.name ?? 'Tất cả năm học',
        reportTitle: currentReportMeta.title,
        timeRangeLabel: currentReportMeta.timeRangeLabel,
        rows: currentReportMeta.sources,
      });
      notify('success', 'Đã xuất báo cáo PDF tiếng Việt đúng dấu');
    } catch (error) {
      notify('error', 'Lỗi xuất PDF', error instanceof Error ? error.message : undefined);
    }
  };

  const canConfigurePeriods = permissions.isAdmin || permissions.isSpecialistManager;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Báo cáo – Thống kê đánh giá"
        description="Hệ thống báo cáo đa cấp độ tổng hợp trực tiếp từ dữ liệu IndexedDB, tách bạch đánh giá thường xuyên và kết quả định kỳ chính thức."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canConfigurePeriods && (
              <button
                type="button"
                onClick={() => setPeriodConfigOpen(true)}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Cấu hình đợt đánh giá
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                openSources(
                  `Nguồn dữ liệu: ${currentReportMeta.title}`,
                  currentReportMeta.sources,
                  `Khoảng thời gian: ${currentReportMeta.timeRangeLabel}`
                )
              }
              className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
            >
              <Database className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              Xem nguồn dữ liệu ({currentReportMeta.sources.length})
            </button>
            <button
              type="button"
              onClick={() => void handleExportExcel()}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              Xuất Excel
            </button>
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <FileText className="h-4 w-4" />
              Xuất PDF
            </button>
          </div>
        }
      />

      {/* Tabs cấp độ báo cáo */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
        {TAB_DEFINITIONS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
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

      {/* Thanh bộ lọc thống nhất */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <Filter className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            Bộ lọc dữ liệu báo cáo
          </div>
          <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
            Khoảng áp dụng: <strong className="text-slate-800 dark:text-slate-200">{currentReportMeta.timeRangeLabel || '—'}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div>
            <label className={LABEL_CLASS}>Năm học</label>
            <select
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
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

          {activeTab !== 'TEACHER' && (
            <div>
              <label className={LABEL_CLASS}>Khối lớp</label>
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Tất cả khối (1–5)</option>
                {[1, 2, 3, 4, 5].map((g) => (
                  <option key={g} value={String(g)}>
                    Khối {g}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={LABEL_CLASS}>Lớp học</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Tất cả lớp phù hợp</option>
              {availableClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (Khối {c.gradeLevel})
                </option>
              ))}
            </select>
          </div>

          {activeTab === 'STUDENT' && (
            <div>
              <label className={LABEL_CLASS}>Học sinh</label>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">-- Chọn học sinh --</option>
                {availableStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.studentCode})
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeTab === 'TEACHER' ? (
            <div>
              <label className={LABEL_CLASS}>Giáo viên</label>
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                disabled={permissions.isScopedTeacher}
                className={INPUT_CLASS}
              >
                <option value="">-- Chọn giáo viên --</option>
                {(dataset?.teachers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} ({t.code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className={LABEL_CLASS}>Lọc theo giáo viên</label>
              <select
                value={explicitTeacherFilter}
                onChange={(e) => setExplicitTeacherFilter(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Tất cả giáo viên</option>
                {(dataset?.teachers ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(activeTab === 'SUBJECT' || activeTab === 'STUDENT' || activeTab === 'TIMEFRAME') && (
            <div>
              <label className={LABEL_CLASS}>Môn học</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Tất cả môn học</option>
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={LABEL_CLASS}>Mốc / Chu kỳ thời gian</label>
            <select
              value={timeframeMode}
              onChange={(e) => setTimeframeMode(e.target.value as ReportTimeframeMode)}
              className={INPUT_CLASS}
            >
              {(Object.entries(REPORT_TIMEFRAME_LABELS) as Array<[ReportTimeframeMode, string]>).map(
                ([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                )
              )}
            </select>
          </div>

          {(timeframeMode === 'DAY' || timeframeMode === 'WEEK') && (
            <div>
              <label className={LABEL_CLASS}>
                {timeframeMode === 'DAY' ? 'Chọn ngày' : 'Chọn ngày trong tuần'}
              </label>
              <input
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          )}

          {timeframeMode === 'MONTH' && (
            <div>
              <label className={LABEL_CLASS}>Chọn tháng</label>
              <input
                type="month"
                value={referenceMonth}
                onChange={(e) => setReferenceMonth(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          )}

          {timeframeMode === 'CONFIGURED_PERIOD' && (
            <div>
              <label className={LABEL_CLASS}>Đợt đánh giá đã cấu hình</label>
              <select
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">-- Chọn đợt đánh giá --</option>
                {availablePeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({PERIOD_TYPE_LABELS[p.periodType]})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Ghi chú nguyên tắc thống kê minh bạch */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5 font-medium text-teal-800 dark:text-teal-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Dữ liệu thực 100% từ IndexedDB
          </span>
          <span>
            • <strong>Đánh giá thường xuyên</strong> (hằng ngày / theo tiết) tách biệt hoàn toàn với{' '}
            <strong>Kết quả định kỳ chính thức</strong>.
          </span>
          <span>
            • Bản ghi / học sinh / tiết <strong>Chưa đánh giá</strong> luôn thống kê riêng, không tính là chưa hoàn thành / không đạt.
          </span>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Đang tổng hợp dữ liệu báo cáo từ IndexedDB...
        </div>
      )}

      {/* ==================== 1. BÁO CÁO THEO HỌC SINH ==================== */}
      {!loading && activeTab === 'STUDENT' && studentReport && (
        <div className="space-y-5">
          {!studentReport.student ? (
            <EmptyState
              icon={GraduationCap}
              title="Chưa chọn học sinh"
              description="Vui lòng chọn lớp và học sinh ở thanh bộ lọc phía trên để xem hồ sơ báo cáo chi tiết."
            />
          ) : (
            <>
              {/* Thông tin học sinh */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {studentReport.student.fullName}
                      </h2>
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {studentReport.student.studentCode}
                      </span>
                      <span className="rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/50 dark:text-teal-300">
                        {STUDENT_STATUS_LABELS[studentReport.student.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 tabular-nums dark:text-slate-400">
                      Lớp: <strong>{studentReport.schoolClass?.name ?? '—'}</strong> · Năm học:{' '}
                      <strong>{studentReport.academicYear?.name ?? '—'}</strong> · Ngày sinh:{' '}
                      {studentReport.student.dateOfBirth} · Giới tính:{' '}
                      {STUDENT_GENDER_LABELS[studentReport.student.gender]}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      openSources(
                        `Nguồn dữ liệu học sinh ${studentReport.student?.fullName}`,
                        studentReport.sourceRecords,
                        studentReport.timeRange.label
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Xem tất cả nguồn ({studentReport.sourceRecords.length})
                  </button>
                </div>

                {studentReport.hasData && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Hằng ngày (Đã ĐG)</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {studentReport.metrics.dailyAssessedCount}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        Chưa ĐG: {studentReport.metrics.dailyUnassessedOrNoOppCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Biểu hiện tích cực</div>
                      <div className="mt-1 text-xl font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                        {studentReport.metrics.dailyPositiveCount}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        Cần hỗ trợ: {studentReport.metrics.dailySupportCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Theo tiết (Thường xuyên)</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {studentReport.metrics.lessonCount}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        T:{studentReport.metrics.lessonHttCount} · H:{studentReport.metrics.lessonHtCount} · C:{studentReport.metrics.lessonChtCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Định kỳ môn học</div>
                      <div className="mt-1 text-xl font-semibold text-sky-700 tabular-nums dark:text-sky-400">
                        {studentReport.metrics.officialSubjectCount}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Kết quả chính thức</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Phẩm chất & Năng lực</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {studentReport.metrics.officialQualityCompetencyCount}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Mức T / Đ / C</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Tổng nhận xét</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {studentReport.metrics.commentsCount}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">GVCN & GVBM</div>
                    </div>
                  </div>
                )}
              </div>

              {!studentReport.hasData ? (
                <EmptyState
                  icon={BarChart3}
                  title="Chưa có dữ liệu đánh giá cho học sinh này"
                  description={`Không tìm thấy bản ghi hằng ngày, theo tiết hay định kỳ nào trong khoảng "${studentReport.timeRange.label}".`}
                />
              ) : (
                <>
                  {/* Biểu đồ tiến bộ theo thời gian + Nội dung cần hỗ trợ */}
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Tiến bộ theo thời gian (Dữ liệu thực theo ngày)
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Thang quy đổi quan sát: 3 = Tốt / HTT, 2 = Đạt / HT, 1 = CHT / Cần cố gắng (tách riêng Thường xuyên và Định kỳ).
                      </p>
                      <div className="mt-4 h-64">
                        {studentReport.progressionChartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={studentReport.progressionChartData}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} allowDecimals />
                              <Tooltip />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Line
                                type="monotone"
                                dataKey="dailyPositiveCount"
                                name="Tiêu chí tích cực (Hằng ngày)"
                                stroke="#0F766E"
                                strokeWidth={2}
                              />
                              <Line
                                type="monotone"
                                dataKey="lessonLevelValue"
                                name="Mức theo tiết (Thường xuyên)"
                                stroke="#0284C7"
                                strokeWidth={2}
                                connectNulls
                              />
                              <Line
                                type="monotone"
                                dataKey="officialLevelValue"
                                name="Mức định kỳ chính thức"
                                stroke="#D97706"
                                strokeWidth={2}
                                connectNulls
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-500">
                            Chưa có dữ liệu chuỗi thời gian.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Các nội dung cần hỗ trợ của học sinh
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Chỉ tổng hợp từ tiêu chí nhóm Cần hỗ trợ, khó khăn tiết học hoặc kết quả CHT/CCG được ghi nhận thực tế.
                      </p>
                      <div className="mt-4 h-64">
                        {studentReport.supportNeeds.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={studentReport.supportNeeds.slice(0, 7)} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                              <YAxis
                                type="category"
                                dataKey="topic"
                                width={160}
                                tick={{ fontSize: 11 }}
                              />
                              <Tooltip formatter={(v) => [`${v} lượt ghi nhận`, 'Tần suất']} />
                              <Bar dataKey="count" name="Lượt ghi nhận" fill="#D97706" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            Không có nội dung cần hỗ trợ nào được ghi nhận trong khoảng thời gian này.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Kết quả định kỳ chính thức (Tách riêng) */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          A. Kết quả đánh giá định kỳ chính thức
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Môn học (T: Hoàn thành tốt / H: Hoàn thành / C: Chưa hoàn thành) và Phẩm chất – Năng lực (T: Tốt / Đ: Đạt / C: Cần cố gắng).
                        </p>
                      </div>
                    </div>

                    {studentReport.officialSubjectResults.length === 0 &&
                    studentReport.officialQualityCompetencyResults.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        Chưa có kết quả đánh giá định kỳ chính thức trong khoảng thời gian đã chọn.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div>
                          <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Kết quả môn học & Tổng hợp ({studentReport.officialSubjectResults.length})
                          </div>
                          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                                <tr>
                                  <th className="px-3 py-2 font-semibold">Đợt</th>
                                  <th className="px-3 py-2 font-semibold">Môn học</th>
                                  <th className="px-3 py-2 font-semibold">Mức đạt</th>
                                  <th className="px-3 py-2 font-semibold">Điểm</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {studentReport.officialSubjectResults.map((row) => (
                                  <tr key={row.record.id}>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.periodName}</td>
                                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{row.subjectName}</td>
                                    <td className="px-3 py-2 font-medium text-teal-700 dark:text-teal-400">{row.ratingLabel}</td>
                                    <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                                      {row.record.numericScore ?? '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Phẩm chất & Năng lực ({studentReport.officialQualityCompetencyResults.length})
                          </div>
                          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                                <tr>
                                  <th className="px-3 py-2 font-semibold">Đợt</th>
                                  <th className="px-3 py-2 font-semibold">Phẩm chất / Năng lực</th>
                                  <th className="px-3 py-2 font-semibold">Mức đạt</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {studentReport.officialQualityCompetencyResults.map((row) => (
                                  <tr key={row.record.id}>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.periodName}</td>
                                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{row.criterionName}</td>
                                    <td className="px-3 py-2 font-medium text-sky-700 dark:text-sky-400">{row.ratingLabel}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Lịch sử Đánh giá thường xuyên (Hằng ngày + Theo tiết) */}
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        B1. Lịch sử đánh giá hằng ngày (GVCN · Thường xuyên)
                      </h3>
                      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                        {studentReport.dailyHistory.length === 0 ? (
                          <div className="text-xs text-slate-500">Không có bản ghi hằng ngày.</div>
                        ) : (
                          studentReport.dailyHistory.map((item) => (
                            <div
                              key={item.record.id}
                              className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                                  {item.record.assessmentDate}
                                </span>
                                <span className="text-slate-600 dark:text-slate-400">
                                  {item.statusLabel} · {item.teacherName}
                                </span>
                              </div>
                              {(item.positiveLabels.length > 0 || item.supportLabels.length > 0) && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {item.positiveLabels.map((lbl) => (
                                    <span
                                      key={lbl}
                                      className="rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[11px] text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/50 dark:text-teal-300"
                                    >
                                      {lbl}
                                    </span>
                                  ))}
                                  {item.supportLabels.map((lbl) => (
                                    <span
                                      key={lbl}
                                      className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300"
                                    >
                                      Hỗ trợ: {lbl}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {item.record.comment && (
                                <p className="mt-1.5 text-slate-700 italic dark:text-slate-300">
                                  “{item.record.comment}”
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        B2. Lịch sử đánh giá theo tiết học (GVBM · Thường xuyên)
                      </h3>
                      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                        {studentReport.lessonHistory.length === 0 ? (
                          <div className="text-xs text-slate-500">Không có bản ghi đánh giá theo tiết.</div>
                        ) : (
                          studentReport.lessonHistory.map((item) => (
                            <div
                              key={item.record.id}
                              className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-slate-900 dark:text-slate-100">
                                  {item.subjectName} — {item.record.lessonTopic}
                                </span>
                                <span className="font-medium text-slate-600 tabular-nums dark:text-slate-400">
                                  {item.record.lessonDate} · {RATING_LEVEL_LABELS[item.record.ratingLevel]}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                                GV: {item.teacherName}
                                {item.record.participationLevel
                                  ? ` · ${LESSON_PARTICIPATION_LABELS[item.record.participationLevel]}`
                                  : ''}
                                {item.record.score !== undefined ? ` · Điểm: ${item.record.score}` : ''}
                              </div>
                              {item.record.difficulties && (
                                <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                                  Cần hỗ trợ: {item.record.difficulties}
                                </div>
                              )}
                              {item.record.comment && (
                                <p className="mt-1 text-slate-700 italic dark:text-slate-300">
                                  “{item.record.comment}”
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Nhận xét của giáo viên */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Tổng hợp nhận xét của giáo viên ({studentReport.teacherComments.length})
                      </h3>
                    </div>
                    {studentReport.teacherComments.length === 0 ? (
                      <div className="text-xs text-slate-500">Chưa có nhận xét bằng lời được ghi nhận.</div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {studentReport.teacherComments.map((cmt) => (
                          <div key={cmt.id} className="py-2.5 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {cmt.sourceLabel}
                                {cmt.subjectName ? ` · ${cmt.subjectName}` : ''} — {cmt.authorName}
                              </span>
                              <span className="text-slate-500 tabular-nums dark:text-slate-400">{cmt.date}</span>
                            </div>
                            <p className="mt-1 text-slate-700 dark:text-slate-300">{cmt.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ==================== 2. BÁO CÁO THEO LỚP ==================== */}
      {!loading && activeTab === 'CLASS' && classReport && (
        <div className="space-y-5">
          {classReport.targetClasses.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Chưa có lớp học phù hợp bộ lọc"
              description="Hãy kiểm tra bộ lọc Năm học / Khối / Lớp hoặc tạo lớp học trong phân hệ Lớp & Học sinh."
            />
          ) : !classReport.hasData ? (
            <EmptyState
              icon={BarChart3}
              title="Chưa có dữ liệu đánh giá thực tế trong lớp đã chọn"
              description={`Sĩ số hiện có ${classReport.metrics.totalStudents} học sinh, nhưng chưa phát sinh bản ghi đánh giá thường xuyên hay định kỳ trong khoảng "${classReport.timeRange.label}". Không hiển thị số liệu giả lập.`}
            />
          ) : (
            <>
              {/* KPI cards lớp học */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Tổng sĩ số</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {classReport.metrics.totalStudents}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">Học sinh</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Đã ĐG thường xuyên</div>
                  <div className="mt-1 text-2xl font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                    {classReport.metrics.regularAssessedStudents}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                    Tỷ lệ: {classReport.metrics.regularCompletionRate ?? '—'}%
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Chưa ĐG thường xuyên</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                    {classReport.metrics.regularUnassessedStudents}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">Không xếp là chưa đạt</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Đã có KQ định kỳ</div>
                  <div className="mt-1 text-2xl font-semibold text-sky-700 tabular-nums dark:text-sky-400">
                    {classReport.metrics.officialAssessedStudents}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                    Tỷ lệ: {classReport.metrics.officialCompletionRate ?? '—'}%
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Chưa có KQ định kỳ</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                    {classReport.metrics.officialUnassessedStudents}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">Tách riêng khỏi mức C</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500 dark:text-slate-400">HS cần hỗ trợ</div>
                  <div className="mt-1 text-2xl font-semibold text-amber-700 tabular-nums dark:text-amber-400">
                    {classReport.metrics.supportCasesCount}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">Theo ghi nhận thực tế</div>
                </div>
              </div>

              {/* Biểu đồ lớp: Tình hình đánh giá + Kết quả theo môn */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Tình hình đánh giá của lớp (Thường xuyên vs Định kỳ)
                  </h3>
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={classReport.evaluationStatusChart}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                        <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="daDanhGia" name="Đã đánh giá (HS)" fill="#0F766E" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="chuaDanhGia" name="Chưa đánh giá (HS)" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Kết quả định kỳ chính thức theo môn học
                  </h3>
                  <div className="mt-4 h-64">
                    {classReport.subjectChartData.some((s) => s.htt + s.ht + s.cht > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={classReport.subjectChartData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                          <XAxis dataKey="subjectName" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="htt" name="T: Hoàn thành tốt" fill="#0F766E" stackId="a" />
                          <Bar dataKey="ht" name="H: Hoàn thành" fill="#0284C7" stackId="a" />
                          <Bar dataKey="cht" name="C: Chưa hoàn thành" fill="#DC2626" stackId="a" />
                          <Bar dataKey="chuaDanhGia" name="Chưa đánh giá" fill="#94A3B8" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                        Chưa có kết quả định kỳ chính thức theo môn để hiển thị biểu đồ.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Nội dung cần hỗ trợ của lớp */}
              {classReport.supportNeeds.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Các nội dung cần hỗ trợ nổi bật trong lớp
                  </h3>
                  <div className="mt-4 h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={classReport.supportNeeds.slice(0, 8)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="topic" width={200} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => [`${v} lượt`, 'Số lượt ghi nhận']} />
                        <Bar dataKey="count" name="Lượt ghi nhận" fill="#D97706" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Tổng hợp kết quả theo môn (Tách rõ Thường xuyên và Định kỳ) */}
              {classReport.subjectSummary.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Tổng hợp theo môn học (Tách biệt Thường xuyên & Định kỳ chính thức)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Môn học</th>
                          <th className="px-3 py-2 font-semibold">Thường xuyên (Theo tiết)</th>
                          <th className="px-3 py-2 font-semibold">Định kỳ: Đã ĐG / Chưa ĐG</th>
                          <th className="px-3 py-2 font-semibold">Định kỳ chính thức (T / H / C)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {classReport.subjectSummary.map((row) => (
                          <tr key={row.subjectId}>
                            <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                              {row.subjectName}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700 tabular-nums dark:text-slate-300">
                              {row.lessonRecordsCount} lượt ({row.regularAssessedStudents}/{row.totalStudents} HS) · T:{row.lessonHtt} H:{row.lessonHt} C:{row.lessonCht}
                            </td>
                            <td className="px-3 py-2.5 tabular-nums">
                              <span className="font-medium text-teal-700 dark:text-teal-400">
                                {row.officialAssessedStudents} đã ĐG
                              </span>{' '}
                              /{' '}
                              <span className="text-slate-500 dark:text-slate-400">
                                {row.officialUnassessedStudents} chưa ĐG
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-medium tabular-nums text-slate-800 dark:text-slate-200">
                              T: {row.officialHtt} · H: {row.officialHt} · C: {row.officialCht}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Danh sách học sinh trong lớp */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Danh sách chi tiết học sinh ({classReport.studentRoster.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Mã HS</th>
                        <th className="px-3 py-2 font-semibold">Họ và tên</th>
                        <th className="px-3 py-2 font-semibold">Thường xuyên</th>
                        <th className="px-3 py-2 font-semibold">Định kỳ chính thức</th>
                        <th className="px-3 py-2 font-semibold">Nội dung cần hỗ trợ</th>
                        <th className="px-3 py-2 font-semibold text-right">Nguồn dữ liệu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {classReport.studentRoster.map((row) => (
                        <tr key={row.student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-3 py-2.5 font-medium tabular-nums text-slate-600 dark:text-slate-400">
                            {row.student.studentCode}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                            {row.student.fullName}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {row.regularStatus === 'ASSESSED' ? (
                              <span className="text-teal-700 dark:text-teal-400">
                                Đã ĐG ({row.dailyAssessedCount} ngày · {row.lessonAssessedCount} tiết)
                              </span>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400">Chưa đánh giá</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums">
                            {row.officialStatus === 'ASSESSED' ? (
                              <span className="text-sky-700 dark:text-sky-400">
                                {row.officialResultsCount} KQ ({row.latestOfficialRatings.join(', ')})
                              </span>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400">Chưa đánh giá</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                            {row.supportTopics.length > 0 ? row.supportTopics.join('; ') : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                openSources(
                                  `Minh chứng của ${row.student.fullName}`,
                                  classReport.sourceRecords.filter((s) => s.studentId === row.student.id),
                                  classReport.timeRange.label
                                )
                              }
                              className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                            >
                              <Eye className="h-3 w-3" />
                              Xem nguồn
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== 3. BÁO CÁO THEO GIÁO VIÊN ==================== */}
      {!loading && activeTab === 'TEACHER' && teacherReport && (
        <div className="space-y-5">
          {!teacherReport.teacher ? (
            <EmptyState
              icon={UserCheck}
              title="Chưa chọn giáo viên"
              description="Vui lòng chọn giáo viên từ bộ lọc phía trên để xem phân công, tiết dạy và tiến độ đánh giá."
            />
          ) : (
            <>
              {/* Hồ sơ & vai trò đa nhiệm */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {teacherReport.teacher.fullName}
                      </h2>
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {teacherReport.teacher.code}
                      </span>
                      {teacherReport.roles.map((r) => (
                        <span
                          key={r.id}
                          className="rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/50 dark:text-teal-300"
                        >
                          {r.name}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Lớp chủ nhiệm:{' '}
                      <strong>
                        {teacherReport.homeroomClasses.map((c) => c.name).join(', ') || 'Không chủ nhiệm'}
                      </strong>{' '}
                      · Nhiệm vụ giảng dạy:{' '}
                      <strong>
                        {teacherReport.taughtPairs.length > 0
                          ? teacherReport.taughtPairs.map((p) => `${p.subjectName} (${p.className})`).join(', ')
                          : 'Chưa gán lớp/môn bộ môn'}
                      </strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      openSources(
                        `Nguồn dữ liệu giáo viên ${teacherReport.teacher?.fullName}`,
                        teacherReport.sourceRecords,
                        teacherReport.timeRange.label
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Xem nguồn ({teacherReport.sourceRecords.length})
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Tổng tiết TKB</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                      {teacherReport.metrics.totalScheduledLessons}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Tiết đã đánh giá</div>
                    <div className="mt-1 text-xl font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                      {teacherReport.metrics.assessedLessons}
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      Tỷ lệ: {teacherReport.metrics.lessonCompletionRate ?? '—'}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Tiết chưa đánh giá</div>
                    <div className="mt-1 text-xl font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                      {teacherReport.metrics.unassessedLessons}
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      Đang ĐG: {teacherReport.metrics.inProgressLessons}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Lượt ĐG hằng ngày</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                      {teacherReport.metrics.dailySavedCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Lượt ĐG theo tiết</div>
                    <div className="mt-1 text-xl font-semibold text-sky-700 tabular-nums dark:text-sky-400">
                      {teacherReport.metrics.lessonSavedCount}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">KQ định kỳ đã lưu</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                      {teacherReport.metrics.officialSavedCount}
                    </div>
                  </div>
                </div>
              </div>

              {!teacherReport.hasData ? (
                <EmptyState
                  icon={UserCheck}
                  title="Chưa có dữ liệu công việc cho giáo viên này"
                  description="Giáo viên chưa có phân công nhiệm vụ, tiết thời khóa biểu hay bản ghi đánh giá nào trong khoảng thời gian đã chọn."
                />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Tỷ lệ hoàn thành đánh giá tiết dạy theo TKB
                      </h3>
                      <div className="mt-4 h-64">
                        {teacherReport.completionChartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={teacherReport.completionChartData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={86}
                                label={(entry) => `${entry.name}: ${entry.value}`}
                              >
                                {teacherReport.completionChartData.map((item) => (
                                  <Cell key={item.key} fill={TEACHER_CHART_COLORS[item.key]} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                            Chưa có tiết thời khóa biểu nào trong khoảng thời gian đã chọn.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Nhiệm vụ được phân công ({teacherReport.assignments.length})
                      </h3>
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {teacherReport.assignments.length === 0 ? (
                          <div className="text-xs text-slate-500">Chưa có phân công nhiệm vụ.</div>
                        ) : (
                          teacherReport.assignments.map((item) => (
                            <div
                              key={item.assignment.id}
                              className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-slate-900 dark:text-slate-100">
                                  {item.assignment.role} · {item.className} · {item.subjectName}
                                </span>
                                <span className="text-slate-600 dark:text-slate-400">
                                  {TEACHER_ASSIGNMENT_STATUS_LABELS[item.assignment.status]}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {item.academicYearName}
                                {item.assignment.startDate ? ` · Từ ${item.assignment.startDate}` : ''}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Danh sách tiết dạy & Lịch sử công việc */}
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Tiết học được phân công ({teacherReport.lessonsList.length})
                      </h3>
                      <div className="max-h-80 overflow-auto">
                        {teacherReport.lessonsList.length === 0 ? (
                          <div className="text-xs text-slate-500">Không có tiết học nào trong khoảng thời gian này.</div>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                              <tr>
                                <th className="px-2.5 py-2 font-semibold">Ngày / Tiết</th>
                                <th className="px-2.5 py-2 font-semibold">Lớp · Môn</th>
                                <th className="px-2.5 py-2 font-semibold">Trạng thái</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {teacherReport.lessonsList.map((row) => (
                                <tr key={row.lesson.id}>
                                  <td className="px-2.5 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                                    {row.lesson.lessonDate || `Thứ ${row.lesson.dayOfWeek}`} · T{row.lesson.periodNumber}
                                  </td>
                                  <td className="px-2.5 py-2 font-medium text-slate-900 dark:text-slate-100">
                                    {row.className} · {row.subjectName}
                                  </td>
                                  <td className="px-2.5 py-2 tabular-nums">
                                    <span
                                      className={
                                        row.status === 'SAVED' || row.status === 'COMPLETED'
                                          ? 'font-medium text-teal-700 dark:text-teal-400'
                                          : row.status === 'IN_PROGRESS'
                                            ? 'font-medium text-amber-700 dark:text-amber-400'
                                            : 'text-slate-500 dark:text-slate-400'
                                      }
                                    >
                                      {LESSON_WORKFLOW_STATUS_LABELS[row.status]} ({row.assessedStudentsCount}/{row.classStudentCount})
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-3 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Lịch sử công việc thực tế ({teacherReport.workHistory.length})
                        </h3>
                      </div>
                      <div className="max-h-80 space-y-2 overflow-y-auto">
                        {teacherReport.workHistory.length === 0 ? (
                          <div className="text-xs text-slate-500">Chưa có nhật ký công việc trong khoảng lọc.</div>
                        ) : (
                          teacherReport.workHistory.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-800"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {item.category}
                                </span>
                                <span className="text-slate-500 tabular-nums dark:text-slate-400">
                                  {item.timestamp}
                                </span>
                              </div>
                              <div className="mt-1 text-slate-700 dark:text-slate-300">{item.summary}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ==================== 4. BÁO CÁO THEO MÔN HỌC ==================== */}
      {!loading && activeTab === 'SUBJECT' && subjectReport && (
        <div className="space-y-5">
          {!subjectReport.hasData ? (
            <EmptyState
              icon={BookOpen}
              title="Chưa có dữ liệu cho môn học và bộ lọc hiện tại"
              description={`Không có dữ liệu đánh giá theo tiết hoặc kết quả định kỳ chính thức trong khoảng "${subjectReport.timeRange.label}".`}
            />
          ) : (
            <>
              {/* Tách biệt Thường xuyên theo tiết vs Định kỳ chính thức */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                    ĐÁNH GIÁ THƯỜNG XUYÊN (THEO TIẾT HỌC)
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[11px] text-slate-500">HS đã đánh giá</div>
                      <div className="text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {subjectReport.metrics.regularAssessedStudents} / {subjectReport.metrics.targetStudentsCount}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        Chưa ĐG: {subjectReport.metrics.regularUnassessedStudents}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">Tổng lượt tiết</div>
                      <div className="text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {subjectReport.metrics.regularRecordsCount}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        Điểm TB: {subjectReport.metrics.regularAvgScore ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">Mức thường xuyên</div>
                      <div className="mt-1 text-xs font-medium text-slate-800 tabular-nums dark:text-slate-200">
                        T: {subjectReport.metrics.regularHtt} · H: {subjectReport.metrics.regularHt} · C: {subjectReport.metrics.regularCht}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                    KẾT QUẢ ĐÁNH GIÁ ĐỊNH KỲ CHÍNH THỨC
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[11px] text-slate-500">HS đã có kết quả</div>
                      <div className="text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {subjectReport.metrics.officialAssessedStudents} / {subjectReport.metrics.targetStudentsCount}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        Chưa ĐG: {subjectReport.metrics.officialUnassessedStudents}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">Điểm KTĐK TB</div>
                      <div className="text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                        {subjectReport.metrics.officialAvgScore ?? '—'}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {subjectReport.metrics.officialRecordsCount} kết quả
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">Mức định kỳ (T / H / C)</div>
                      <div className="mt-1 text-xs font-medium text-slate-800 tabular-nums dark:text-slate-200">
                        T: {subjectReport.metrics.officialHtt} · H: {subjectReport.metrics.officialHt} · C: {subjectReport.metrics.officialCht}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Độ phủ đánh giá theo lớp (Thường xuyên vs Định kỳ)
                  </h3>
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={subjectReport.regularVsOfficialChart}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                        <XAxis dataKey="className" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="regularAssessed" name="HS ĐG thường xuyên" fill="#0F766E" />
                        <Bar dataKey="officialAssessed" name="HS có KQ định kỳ" fill="#0284C7" />
                        <Bar dataKey="officialUnassessed" name="Chưa có KQ định kỳ" fill="#94A3B8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Phân bổ kết quả định kỳ chính thức & Chưa đánh giá
                  </h3>
                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={subjectReport.subjectDistributionChart}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Số học sinh" fill="#0284C7" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {subjectReport.supportNeeds.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Khó khăn / Nội dung cần hỗ trợ trong môn học
                  </h3>
                  <div className="mt-4 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={subjectReport.supportNeeds.slice(0, 7)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="topic" width={200} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Lượt ghi nhận" fill="#D97706" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Chi tiết theo từng lớp học
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Lớp</th>
                        <th className="px-3 py-2 font-semibold">Giáo viên</th>
                        <th className="px-3 py-2 font-semibold">Thường xuyên (Theo tiết)</th>
                        <th className="px-3 py-2 font-semibold">Định kỳ chính thức (T/H/C)</th>
                        <th className="px-3 py-2 font-semibold">Chưa ĐG định kỳ</th>
                        <th className="px-3 py-2 font-semibold text-right">Nguồn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {subjectReport.byClassBreakdown.map((row) => (
                        <tr key={row.classId}>
                          <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                            {row.className} (K{row.gradeLevel})
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                            {row.teacherNames.join(', ') || '—'}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                            {row.regularAssessedStudents}/{row.totalStudents} HS · T:{row.regularHtt} H:{row.regularHt} C:{row.regularCht}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums font-medium text-sky-700 dark:text-sky-400">
                            T:{row.officialHtt} · H:{row.officialHt} · C:{row.officialCht}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-500 dark:text-slate-400">
                            {row.officialUnassessedStudents} HS
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                openSources(
                                  `Nguồn môn học lớp ${row.className}`,
                                  subjectReport.sourceRecords.filter((s) => s.classId === row.classId),
                                  subjectReport.timeRange.label
                                )
                              }
                              className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                            >
                              <Eye className="h-3 w-3" />
                              Xem nguồn
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== 5. BÁO CÁO THEO THỜI GIAN ==================== */}
      {!loading && activeTab === 'TIMEFRAME' && timeframeReport && (
        <div className="space-y-5">
          {!timeframeReport.timeRange.isConfiguredPeriod &&
            (timeframeMode === 'MID_TERM_1' ||
              timeframeMode === 'END_TERM_1' ||
              timeframeMode === 'MID_TERM_2' ||
              timeframeMode === 'END_TERM_2') && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                <span className="inline-flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Chưa có đợt đánh giá định kỳ chính thức được cấu hình cho mốc này trong năm học đã chọn; số liệu đánh giá thường xuyên đang lọc theo khung ngày ước tính của năm học.
                </span>
                {canConfigurePeriods && (
                  <button
                    type="button"
                    onClick={() => setPeriodConfigOpen(true)}
                    className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200 whitespace-nowrap"
                  >
                    Cấu hình ngay
                  </button>
                )}
              </div>
            )}

          {!timeframeReport.hasData ? (
            <EmptyState
              icon={CalendarRange}
              title="Không có dữ liệu thực tế trong khoảng thời gian đã chọn"
              description={`Không tìm thấy bản ghi đánh giá thường xuyên, tiết dạy TKB hay kết quả định kỳ nào cho "${timeframeReport.timeRange.label}".`}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500">Học sinh phạm vi</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {timeframeReport.metrics.totalStudentsInScope}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500">Hằng ngày đã ĐG</div>
                  <div className="mt-1 text-2xl font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                    {timeframeReport.metrics.dailyAssessedRecords}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500">Lượt theo tiết</div>
                  <div className="mt-1 text-2xl font-semibold text-sky-700 tabular-nums dark:text-sky-400">
                    {timeframeReport.metrics.lessonAssessedRecords}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500">KQ định kỳ chính thức</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {timeframeReport.metrics.officialRecords}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500">Tiết TKB đã ĐG</div>
                  <div className="mt-1 text-2xl font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                    {timeframeReport.metrics.scheduledLessonsAssessed} / {timeframeReport.metrics.scheduledLessonsTotal}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500">Tiết TKB chưa ĐG</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                    {timeframeReport.metrics.scheduledLessonsUnassessed}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* 1. Tiến bộ theo thời gian */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Tiến bộ & Hoạt động đánh giá theo thời gian
                  </h3>
                  <div className="mt-4 h-64">
                    {timeframeReport.progressionTrendChart.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timeframeReport.progressionTrendChart}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                          <XAxis dataKey="bucketLabel" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Line type="monotone" dataKey="dailyAssessed" name="Hằng ngày" stroke="#0F766E" strokeWidth={2} />
                          <Line type="monotone" dataKey="lessonAssessed" name="Theo tiết" stroke="#0284C7" strokeWidth={2} />
                          <Line type="monotone" dataKey="officialAssessed" name="Định kỳ chính thức" stroke="#D97706" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500">
                        Chưa có dữ liệu theo mốc thời gian.
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Tình hình đánh giá của lớp */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Tình hình đánh giá của các lớp (Đã ĐG vs Chưa ĐG)
                  </h3>
                  <div className="mt-4 h-64">
                    {timeframeReport.classStatusChart.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={timeframeReport.classStatusChart}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                          <XAxis dataKey="className" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="regularAssessed" name="HS ĐG thường xuyên" fill="#0F766E" />
                          <Bar dataKey="regularUnassessed" name="Chưa ĐG thường xuyên" fill="#CBD5E1" />
                          <Bar dataKey="officialAssessed" name="HS có KQ định kỳ" fill="#0284C7" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500">
                        Chưa có lớp học có sĩ số trong phạm vi lọc.
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Kết quả theo môn */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Kết quả định kỳ chính thức theo môn
                  </h3>
                  <div className="mt-4 h-64">
                    {timeframeReport.subjectResultsChart.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={timeframeReport.subjectResultsChart}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                          <XAxis dataKey="subjectName" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="htt" name="T: Hoàn thành tốt" fill="#0F766E" stackId="s" />
                          <Bar dataKey="ht" name="H: Hoàn thành" fill="#0284C7" stackId="s" />
                          <Bar dataKey="cht" name="C: Chưa hoàn thành" fill="#DC2626" stackId="s" />
                          <Bar dataKey="chuaDanhGia" name="Chưa đánh giá" fill="#94A3B8" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                        Chưa có kết quả định kỳ chính thức trong khoảng thời gian này.
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Tỷ lệ hoàn thành đánh giá */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Tỷ lệ hoàn thành đánh giá
                  </h3>
                  <div className="mt-4 h-64">
                    {timeframeReport.completionChart.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={timeframeReport.completionChart}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="assessed" name="Đã đánh giá" fill="#0F766E" />
                          <Bar dataKey="unassessed" name="Chưa đánh giá" fill="#94A3B8" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-500">
                        Chưa có dữ liệu hoàn thành đánh giá.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 5. Nội dung cần hỗ trợ */}
              {timeframeReport.supportNeeds.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-2 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Nội dung cần hỗ trợ tổng hợp trong giai đoạn
                    </h3>
                  </div>
                  <div className="mt-3 h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={timeframeReport.supportNeeds.slice(0, 8)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="topic" width={220} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => [`${v} lượt`, 'Số lượt']} />
                        <Bar dataKey="count" name="Lượt ghi nhận" fill="#D97706" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Drill-down Source Data Modal */}
      <SourceDataModal
        open={sourceModal.open}
        title={sourceModal.title}
        subtitle={sourceModal.subtitle}
        records={sourceModal.records}
        onClose={() => setSourceModal((prev) => ({ ...prev, open: false }))}
      />

      {/* Assessment Period Config Modal */}
      <ReportPeriodConfigModal
        open={periodConfigOpen}
        academicYears={dataset?.academicYears ?? []}
        defaultAcademicYearId={academicYearId}
        periods={dataset?.assessmentPeriods ?? []}
        onClose={() => setPeriodConfigOpen(false)}
        onChanged={reloadData}
      />
    </div>
  );
};
