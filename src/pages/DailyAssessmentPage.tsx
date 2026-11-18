import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  Eye,
  EyeOff,
  History,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { classStudentService } from '../services/classStudentService';
import {
  dailyAssessmentService,
  getDateRangeForPeriod,
  getHomeroomScopeClasses,
  resolveEffectiveDailyStatus,
  summarizeDailyHistory,
  type SaveStudentDailyObservationInput,
} from '../services/dailyAssessmentService';
import {
  DailyEvaluationStatus,
  type DailyAssessment,
  type DailyBehaviorCriterion,
  type DailyCriterionGroup,
  type Student,
} from '../types/models';
import {
  DAILY_CRITERION_GROUP_LABELS,
  DAILY_EVALUATION_STATUS_LABELS,
  formatDateTimeVi,
  INPUT_CLASS,
  LABEL_CLASS,
} from '../utils/labels';

interface StudentDailyDraft {
  evaluationStatus: DailyEvaluationStatus;
  criterionIds: string[];
  comment: string;
}

const EMPTY_DRAFT: StudentDailyDraft = {
  evaluationStatus: DailyEvaluationStatus.NOT_ASSESSED,
  criterionIds: [],
  comment: '',
};

export const DailyAssessmentPage: React.FC = () => {
  const { notify } = useNotification();
  const {
    academicYears,
    activeYear,
    setActiveYearId,
    classes,
    teachers,
    teacherAssignments,
    activeTeacher,
    permissions,
  } = useWorkspace();
  const [searchParams] = useSearchParams();

  const homeroomDuties = useMemo(
    () =>
      getHomeroomScopeClasses({
        academicYearId: activeYear?.id,
        classes,
        assignments: teacherAssignments,
        permissions,
      }),
    [activeYear?.id, classes, teacherAssignments, permissions]
  );

  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);

  const [activeTab, setActiveTab] = useState<'class' | 'student' | 'history'>('class');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  const [students, setStudents] = useState<Student[]>([]);
  const [allCriteria, setAllCriteria] = useState<DailyBehaviorCriterion[]>([]);
  const [dayRecords, setDayRecords] = useState<DailyAssessment[]>([]);
  const [draftsByStudent, setDraftsByStudent] = useState<Record<string, StudentDailyDraft>>({});
  const [savingBatch, setSavingBatch] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);

  // Mode A: Single student selection
  const [focusedStudentId, setFocusedStudentId] = useState('');

  // History tab state
  const [historyScope, setHistoryScope] = useState<'CLASS' | 'STUDENT'>('CLASS');
  const [historyPeriod, setHistoryPeriod] = useState<'DAY' | 'WEEK' | 'MONTH'>('WEEK');
  const [historyAnchorDate, setHistoryAnchorDate] = useState(new Date().toISOString().slice(0, 10));
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7));
  const [historyStudentId, setHistoryStudentId] = useState('');
  const [historyRecords, setHistoryRecords] = useState<DailyAssessment[]>([]);
  const [editHistoryTarget, setEditHistoryTarget] = useState<DailyAssessment | null>(null);

  // Criteria Customization modal
  const [criteriaModalOpen, setCriteriaModalOpen] = useState(false);
  const [editingCriterionId, setEditingCriterionId] = useState<string | null>(null);
  const [critName, setCritName] = useState('');
  const [critGroup, setCritGroup] = useState<DailyCriterionGroup>('POSITIVE');
  const [critDesc, setCritDesc] = useState('');

  const appliedClassParamRef = useRef<string | null>(null);

  // Sync classId from URL or homeroom list
  useEffect(() => {
    const paramClassId = searchParams.get('classId');
    if (paramClassId && paramClassId !== appliedClassParamRef.current) {
      if (homeroomDuties.some((d) => d.schoolClass.id === paramClassId)) {
        appliedClassParamRef.current = paramClassId;
        setSelectedClassId(paramClassId);
        return;
      }
    }
    if (homeroomDuties.length === 0) {
      setSelectedClassId('');
    } else if (!selectedClassId || !homeroomDuties.some((d) => d.schoolClass.id === selectedClassId)) {
      setSelectedClassId(homeroomDuties[0].schoolClass.id);
    }
  }, [homeroomDuties, selectedClassId, searchParams]);

  const currentDuty = useMemo(
    () => homeroomDuties.find((d) => d.schoolClass.id === selectedClassId) ?? null,
    [homeroomDuties, selectedClassId]
  );

  const visibleCriteria = useMemo(() => allCriteria.filter((c) => !c.isHidden), [allCriteria]);
  const positiveCriteria = useMemo(
    () => visibleCriteria.filter((c) => c.group === 'POSITIVE'),
    [visibleCriteria]
  );
  const supportCriteria = useMemo(
    () => visibleCriteria.filter((c) => c.group === 'NEEDS_SUPPORT'),
    [visibleCriteria]
  );
  const criteriaById = useMemo(() => new Map(allCriteria.map((c) => [c.id, c])), [allCriteria]);

  const loadCriteria = async () => {
    const res = await dailyAssessmentService.listCriteria(true);
    if (res.ok) setAllCriteria(res.data);
  };

  useEffect(() => {
    void loadCriteria();
  }, []);

  const loadClassAndDayData = async () => {
    if (!selectedClassId) {
      setStudents([]);
      setDayRecords([]);
      setDraftsByStudent({});
      return;
    }

    const [stuRes, recRes] = await Promise.all([
      classStudentService.listStudents({ classId: selectedClassId }),
      dailyAssessmentService.listByClassAndDate(selectedClassId, selectedDate),
    ]);

    const loadedStudents = stuRes.ok ? stuRes.data : [];
    const loadedRecords = recRes.ok ? recRes.data : [];
    setStudents(loadedStudents);
    setDayRecords(loadedRecords);

    const recordByStudent = new Map(loadedRecords.map((r) => [r.studentId, r]));
    const nextDrafts: Record<string, StudentDailyDraft> = {};
    for (const stu of loadedStudents) {
      const existing = recordByStudent.get(stu.id);
      nextDrafts[stu.id] = existing
        ? {
            evaluationStatus: existing.evaluationStatus ?? DailyEvaluationStatus.ASSESSED,
            criterionIds: Array.isArray(existing.criterionIds)
              ? existing.criterionIds
              : existing.criterionId
                ? [existing.criterionId]
                : [],
            comment: existing.comment ?? '',
          }
        : { ...EMPTY_DRAFT };
    }
    setDraftsByStudent(nextDrafts);
  };

  useEffect(() => {
    void loadClassAndDayData();
  }, [selectedClassId, selectedDate]);

  useEffect(() => {
    if (students.length === 0) {
      setFocusedStudentId('');
      setHistoryStudentId('');
      return;
    }
    if (!focusedStudentId || !students.some((s) => s.id === focusedStudentId)) {
      setFocusedStudentId(students[0].id);
    }
    if (!historyStudentId || !students.some((s) => s.id === historyStudentId)) {
      setHistoryStudentId(students[0].id);
    }
  }, [students, focusedStudentId, historyStudentId]);

  const historyRange = useMemo(
    () =>
      getDateRangeForPeriod({
        mode: historyPeriod,
        anchorDate: historyAnchorDate,
        anchorMonth: historyMonth,
      }),
    [historyPeriod, historyAnchorDate, historyMonth]
  );

  const loadHistoryData = async () => {
    if (!selectedClassId) {
      setHistoryRecords([]);
      return;
    }
    const res = await dailyAssessmentService.listHistory({
      academicYearId: activeYear?.id,
      classId: selectedClassId,
      studentId: historyScope === 'STUDENT' && historyStudentId ? historyStudentId : undefined,
      fromDate: historyRange.fromDate,
      toDate: historyRange.toDate,
    });
    if (res.ok) setHistoryRecords(res.data);
  };

  useEffect(() => {
    if (activeTab === 'history') {
      void loadHistoryData();
    }
  }, [activeTab, activeYear?.id, selectedClassId, historyScope, historyStudentId, historyRange]);

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const dayRecordByStudent = useMemo(
    () => new Map(dayRecords.map((r) => [r.studentId, r])),
    [dayRecords]
  );

  const dayStatusSummary = useMemo(() => {
    let assessed = 0;
    let notAssessed = 0;
    let noOpportunity = 0;
    let noNotable = 0;
    for (const stu of students) {
      const d = draftsByStudent[stu.id] ?? EMPTY_DRAFT;
      if (d.evaluationStatus === DailyEvaluationStatus.ASSESSED) assessed += 1;
      else if (d.evaluationStatus === DailyEvaluationStatus.NO_OPPORTUNITY) noOpportunity += 1;
      else if (d.evaluationStatus === DailyEvaluationStatus.NO_NOTABLE_BEHAVIOR) noNotable += 1;
      else notAssessed += 1;
    }
    return { assessed, notAssessed, noOpportunity, noNotable };
  }, [students, draftsByStudent]);

  const historySummary = useMemo(
    () =>
      summarizeDailyHistory({
        records: historyRecords,
        criteria: allCriteria,
        students,
      }),
    [historyRecords, allCriteria, students]
  );

  const updateStudentDraft = (studentId: string, updater: (prev: StudentDailyDraft) => StudentDailyDraft) => {
    setDraftsByStudent((prev) => {
      const current = prev[studentId] ?? EMPTY_DRAFT;
      return {
        ...prev,
        [studentId]: updater(current),
      };
    });
  };

  const toggleCriterionForStudent = (studentId: string, criterionId: string) => {
    updateStudentDraft(studentId, (prev) => {
      const exists = prev.criterionIds.includes(criterionId);
      const nextCriteria = exists
        ? prev.criterionIds.filter((id) => id !== criterionId)
        : [...prev.criterionIds, criterionId];
      const nextStatus = resolveEffectiveDailyStatus({
        requestedStatus: prev.evaluationStatus,
        criterionIds: nextCriteria,
        comment: prev.comment,
      });
      return {
        ...prev,
        criterionIds: nextCriteria,
        evaluationStatus: nextStatus,
      };
    });
  };

  const buildObservationInput = (stuId: string): SaveStudentDailyObservationInput => {
    const draft = draftsByStudent[stuId] ?? EMPTY_DRAFT;
    const effectiveTeacherId = activeTeacher?.id ?? currentDuty?.homeroomTeacherId;
    const editorName = activeTeacher?.fullName ?? 'Quản trị viên';
    return {
      academicYearId: activeYear?.id ?? '',
      classId: selectedClassId,
      studentId: stuId,
      teacherId: effectiveTeacherId,
      editorName,
      homeroomAssignmentId: currentDuty?.homeroomAssignment?.id,
      assessmentDate: selectedDate,
      evaluationStatus: draft.evaluationStatus,
      criterionIds: draft.criterionIds,
      comment: draft.comment,
    };
  };

  const handleSaveSingleStudent = async (stuId: string) => {
    if (!activeYear || !selectedClassId || !stuId) return;
    setSavingStudentId(stuId);
    const res = await dailyAssessmentService.saveStudentDailyObservation(buildObservationInput(stuId));
    setSavingStudentId(null);
    if (res.ok) {
      const stuName = studentMap.get(stuId)?.fullName ?? 'học sinh';
      notify('success', `Đã lưu đánh giá hằng ngày cho ${stuName}`);
      await loadClassAndDayData();
    } else {
      notify('error', 'Không thể lưu đánh giá', res.error);
    }
  };

  const handleSaveWholeClass = async () => {
    if (!activeYear || !selectedClassId || students.length === 0) return;
    setSavingBatch(true);
    const inputs = students.map((stu) => buildObservationInput(stu.id));
    const res = await dailyAssessmentService.saveClassDailyBatch(inputs);
    setSavingBatch(false);
    if (res.ok) {
      notify(
        'success',
        `Đã lưu đánh giá cả lớp (${res.data.length} bản ghi được ghi nhận/cập nhật)`,
        'Học sinh chưa có thao tác ghi nhận vẫn giữ nguyên trạng thái Chưa đánh giá.'
      );
      await loadClassAndDayData();
    } else {
      notify('error', 'Không thể lưu đánh giá cả lớp', res.error);
    }
  };

  const handleSaveCriterionModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = editingCriterionId
      ? await dailyAssessmentService.updateCriterion(editingCriterionId, {
          name: critName,
          group: critGroup,
          description: critDesc,
        })
      : await dailyAssessmentService.createCriterion({
          name: critName,
          group: critGroup,
          description: critDesc,
          teacherId: activeTeacher?.id,
        });

    if (res.ok) {
      notify('success', editingCriterionId ? 'Đã cập nhật tiêu chí' : 'Đã thêm tiêu chí mới');
      setEditingCriterionId(null);
      setCritName('');
      setCritDesc('');
      await loadCriteria();
    } else {
      notify('error', 'Không thể lưu tiêu chí', res.error);
    }
  };

  const focusedStudentIndex = students.findIndex((s) => s.id === focusedStudentId);
  const focusedStudent = focusedStudentIndex >= 0 ? students[focusedStudentIndex] : null;
  const focusedDraft = focusedStudent ? draftsByStudent[focusedStudent.id] ?? EMPTY_DRAFT : EMPTY_DRAFT;
  const focusedSavedRecord = focusedStudent ? dayRecordByStudent.get(focusedStudent.id) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đánh giá học sinh hằng ngày"
        description="Ghi nhận quan sát thường xuyên dành cho Giáo viên chủ nhiệm theo lớp được phân công, theo dõi tiến bộ và hỗ trợ học sinh."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingCriterionId(null);
                setCritName('');
                setCritGroup('POSITIVE');
                setCritDesc('');
                setCriteriaModalOpen(true);
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Tùy chỉnh tiêu chí ({visibleCriteria.length})
            </button>
            {activeTab === 'class' && selectedClassId && students.length > 0 && (
              <button
                type="button"
                disabled={savingBatch}
                onClick={() => void handleSaveWholeClass()}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
              >
                <Save className="h-4 w-4" />
                {savingBatch ? 'Đang lưu...' : 'Lưu toàn bộ cả lớp'}
              </button>
            )}
          </div>
        }
      />

      {permissions.isScopedTeacher && activeTeacher && (
        <div className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-xs text-teal-900 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
          <span>
            Đang thao tác dưới hồ sơ GVCN <strong>{activeTeacher.fullName}</strong>: chỉ hiển thị các lớp được phân công nhiệm vụ chủ nhiệm trong năm học đã chọn ({homeroomDuties.length} lớp).
          </span>
        </div>
      )}

      {/* 1. CHỌN NHIỆM VỤ: Năm học + Lớp chủ nhiệm + Ngày đánh giá */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <label className={LABEL_CLASS}>Năm học</label>
            <select
              value={activeYear?.id ?? ''}
              onChange={(e) => void setActiveYearId(e.target.value)}
              className={INPUT_CLASS}
            >
              {academicYears.length === 0 && <option value="">Chưa có năm học</option>}
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} {y.isCurrent ? '(Hiện hành)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-5">
            <label className={LABEL_CLASS}>Lớp chủ nhiệm được phân công</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className={INPUT_CLASS}
            >
              {homeroomDuties.length === 0 && (
                <option value="">
                  {permissions.isScopedTeacher
                    ? 'Giáo viên chưa được phân công chủ nhiệm lớp nào'
                    : 'Chưa có lớp học trong năm học này'}
                </option>
              )}
              {homeroomDuties.map((duty) => {
                const gvcnName = duty.homeroomTeacherId
                  ? teacherMap.get(duty.homeroomTeacherId)?.fullName
                  : undefined;
                return (
                  <option key={duty.schoolClass.id} value={duty.schoolClass.id}>
                    {duty.schoolClass.name}
                    {gvcnName ? ` · GVCN: ${gvcnName}` : ' · Chưa gán GVCN'}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="md:col-span-4">
            <label className={LABEL_CLASS}>Ngày đánh giá</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('class')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                activeTab === 'class'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Đánh giá cả lớp
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('student')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                activeTab === 'student'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Đánh giá từng học sinh
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                activeTab === 'history'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              Lịch sử & Tiến bộ
            </button>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Chỉ phục vụ theo dõi tiến bộ & hỗ trợ hằng ngày — không tự động quy đổi thành kết quả xếp loại chính thức.
          </p>
        </div>
      </div>

      {homeroomDuties.length === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title="Chưa có lớp chủ nhiệm thuộc phân công"
          description={
            permissions.isScopedTeacher
              ? 'Giáo viên hiện chỉ được phân công bộ môn hoặc chưa có nhiệm vụ GVCN trong năm học này.'
              : 'Vui lòng tạo lớp học và phân công giáo viên chủ nhiệm tại phân hệ Lớp học / Phân công nhiệm vụ.'
          }
        />
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Lớp chủ nhiệm chưa có danh sách học sinh"
          description="Hãy thêm hoặc nhập danh sách học sinh cho lớp trước khi thực hiện đánh giá hằng ngày."
        />
      ) : activeTab === 'class' ? (
        /* TAB 1: ĐÁNH GIÁ CẢ LỚP (DÙNG CHUNG NGUỒN DỮ LIỆU VỚI ĐÁNH GIÁ TỪNG HỌC SINH) */
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Đã đánh giá</div>
              <div className="mt-1 text-xl font-semibold text-teal-700 tabular-nums dark:text-teal-400">
                {dayStatusSummary.assessed}/{students.length}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Chưa đánh giá</div>
              <div className="mt-1 text-xl font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                {dayStatusSummary.notAssessed}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Chưa có cơ hội quan sát</div>
              <div className="mt-1 text-xl font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                {dayStatusSummary.noOpportunity}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Không biểu hiện nổi bật</div>
              <div className="mt-1 text-xl font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                {dayStatusSummary.noNotable}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="w-12 px-3 py-3">STT</th>
                  <th className="w-48 px-3 py-3">Học sinh</th>
                  <th className="w-48 px-3 py-3">Trạng thái</th>
                  <th className="px-3 py-3">Tiêu chí tích cực & cần hỗ trợ (chạm để đánh dấu)</th>
                  <th className="w-60 px-3 py-3">Nhận xét trực tiếp</th>
                  <th className="w-36 px-3 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {students.map((stu, idx) => {
                  const draft = draftsByStudent[stu.id] ?? EMPTY_DRAFT;
                  const savedRecord = dayRecordByStudent.get(stu.id);
                  const isSavingThis = savingStudentId === stu.id;

                  return (
                    <tr key={stu.id} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-3 font-mono text-xs tabular-nums text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{stu.fullName}</div>
                        <div className="font-mono text-[11px] text-slate-500">{stu.studentCode}</div>
                        {savedRecord && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 tabular-nums">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span>{formatDateTimeVi(savedRecord.savedAt)}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 space-y-1.5">
                        <select
                          aria-label={`Trạng thái đánh giá ${stu.fullName}`}
                          value={draft.evaluationStatus}
                          onChange={(e) =>
                            updateStudentDraft(stu.id, (prev) => ({
                              ...prev,
                              evaluationStatus: e.target.value as DailyEvaluationStatus,
                            }))
                          }
                          className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                        >
                          {Object.entries(DAILY_EVALUATION_STATUS_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {savedRecord && savedRecord.editHistory.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setEditHistoryTarget(savedRecord)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-400"
                          >
                            <History className="h-3 w-3" />
                            Lịch sử sửa ({savedRecord.editHistory.length})
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {positiveCriteria.map((cr) => {
                            const selected = draft.criterionIds.includes(cr.id);
                            return (
                              <button
                                key={cr.id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => toggleCriterionForStudent(stu.id, cr.id)}
                                className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                                  selected
                                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-200'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {selected ? '✓ ' : '+ '}
                                {cr.name}
                              </button>
                            );
                          })}
                        </div>
                        {supportCriteria.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                            {supportCriteria.map((cr) => {
                              const selected = draft.criterionIds.includes(cr.id);
                              return (
                                <button
                                  key={cr.id}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => toggleCriterionForStudent(stu.id, cr.id)}
                                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                                    selected
                                      ? 'border-amber-600 bg-amber-50 text-amber-900 dark:border-amber-500 dark:bg-amber-950/60 dark:text-amber-200'
                                      : 'border-slate-200 bg-white text-slate-500 hover:border-amber-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                                  }`}
                                >
                                  {selected ? '✓ ' : ''}
                                  {cr.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <textarea
                          rows={2}
                          value={draft.comment}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateStudentDraft(stu.id, (prev) => ({
                              ...prev,
                              comment: val,
                              evaluationStatus: resolveEffectiveDailyStatus({
                                requestedStatus: prev.evaluationStatus,
                                criterionIds: prev.criterionIds,
                                comment: val,
                              }),
                            }));
                          }}
                          placeholder="Nhận xét nhanh..."
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <button
                            type="button"
                            disabled={isSavingThis}
                            onClick={() => void handleSaveSingleStudent(stu.id)}
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-teal-700 px-3 py-1 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
                          >
                            <Save className="h-3 w-3" />
                            {isSavingThis ? 'Đang lưu...' : 'Lưu HS'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFocusedStudentId(stu.id);
                              setActiveTab('student');
                            }}
                            className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 whitespace-nowrap"
                          >
                            <Edit2 className="h-3 w-3" />
                            Chi tiết
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'student' ? (
        /* TAB 2: ĐÁNH GIÁ TỪNG HỌC SINH (DÙNG CHUNG NGUỒN DỮ LIỆU VỚI ĐÁNH GIÁ CẢ LỚP) */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                disabled={focusedStudentIndex <= 0}
                onClick={() => {
                  if (focusedStudentIndex > 0) {
                    setFocusedStudentId(students[focusedStudentIndex - 1].id);
                  }
                }}
                aria-label="Học sinh trước"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <select
                aria-label="Chọn học sinh đánh giá"
                value={focusedStudentId}
                onChange={(e) => setFocusedStudentId(e.target.value)}
                className="h-10 min-w-[240px] flex-1 max-w-md rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium dark:border-slate-700 dark:bg-slate-800"
              >
                {students.map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    {idx + 1}. {s.fullName} ({s.studentCode})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={focusedStudentIndex < 0 || focusedStudentIndex >= students.length - 1}
                onClick={() => {
                  if (focusedStudentIndex >= 0 && focusedStudentIndex < students.length - 1) {
                    setFocusedStudentId(students[focusedStudentIndex + 1].id);
                  }
                }}
                aria-label="Học sinh tiếp theo"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {focusedSavedRecord && (
              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Lưu lần cuối: <strong className="text-slate-700 dark:text-slate-200">{formatDateTimeVi(focusedSavedRecord.savedAt)}</strong>
              </div>
            )}
          </div>

          {focusedStudent && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASS}>Trạng thái đánh giá ngày {selectedDate}</label>
                  <select
                    value={focusedDraft.evaluationStatus}
                    onChange={(e) =>
                      updateStudentDraft(focusedStudent.id, (prev) => ({
                        ...prev,
                        evaluationStatus: e.target.value as DailyEvaluationStatus,
                      }))
                    }
                    className={INPUT_CLASS}
                  >
                    {Object.entries(DAILY_EVALUATION_STATUS_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Lưu ý: Chưa đánh giá hoặc chưa đánh dấu tích cực không mặc định là hành vi chưa tốt.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-400">
                    Nhóm tích cực ({positiveCriteria.length})
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {positiveCriteria.map((cr) => {
                      const checked = focusedDraft.criterionIds.includes(cr.id);
                      return (
                        <label
                          key={cr.id}
                          className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs transition ${
                            checked
                              ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100'
                              : 'border-slate-200 text-slate-700 hover:border-emerald-400 dark:border-slate-800 dark:text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCriterionForStudent(focusedStudent.id, cr.id)}
                            className="mt-0.5"
                          />
                          <div>
                            <div className="font-medium">{cr.name}</div>
                            {cr.description && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {cr.description}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
                    Nhóm cần hỗ trợ ({supportCriteria.length})
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {supportCriteria.map((cr) => {
                      const checked = focusedDraft.criterionIds.includes(cr.id);
                      return (
                        <label
                          key={cr.id}
                          className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs transition ${
                            checked
                              ? 'border-amber-600 bg-amber-50/80 text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100'
                              : 'border-slate-200 text-slate-700 hover:border-amber-400 dark:border-slate-800 dark:text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCriterionForStudent(focusedStudent.id, cr.id)}
                            className="mt-0.5"
                          />
                          <div>
                            <div className="font-medium">{cr.name}</div>
                            {cr.description && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {cr.description}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>Nhận xét hằng ngày của GVCN</label>
                <textarea
                  rows={3}
                  value={focusedDraft.comment}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateStudentDraft(focusedStudent.id, (prev) => ({
                      ...prev,
                      comment: val,
                      evaluationStatus: resolveEffectiveDailyStatus({
                        requestedStatus: prev.evaluationStatus,
                        criterionIds: prev.criterionIds,
                        comment: val,
                      }),
                    }));
                  }}
                  placeholder="Ghi nhận sự tiến bộ, điểm cần khích lệ hoặc hướng dẫn phối hợp cùng gia đình..."
                  className={INPUT_CLASS}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {focusedSavedRecord ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await dailyAssessmentService.removeDailyAssessment(focusedSavedRecord.id);
                      if (res.ok) {
                        notify('success', 'Đã xóa ghi nhận ngày này của học sinh');
                        await loadClassAndDayData();
                      } else {
                        notify('error', 'Không thể xóa ghi nhận ngày này', res.error);
                      }
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xóa ghi nhận ngày này
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="button"
                  disabled={savingStudentId === focusedStudent.id}
                  onClick={() => void handleSaveSingleStudent(focusedStudent.id)}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {savingStudentId === focusedStudent.id ? 'Đang lưu...' : 'Lưu đánh giá học sinh'}
                </button>
              </div>

              {focusedSavedRecord && focusedSavedRecord.editHistory.length > 0 && (
                <div className="border-t border-slate-100 pt-4 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Lịch sử chỉnh sửa ({focusedSavedRecord.editHistory.length} lần)
                  </div>
                  <div className="space-y-1.5">
                    {focusedSavedRecord.editHistory.map((entry, idx) => (
                      <div
                        key={`${entry.editedAt}-${idx}`}
                        className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="font-mono tabular-nums">{formatDateTimeVi(entry.editedAt)}</span>
                          <span>Người lưu: {entry.editorName ?? 'Giáo viên'}</span>
                        </div>
                        <div className="mt-1 text-slate-700 dark:text-slate-200">{entry.summary}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* TAB 3: LỊCH SỬ & TIẾN BỘ (NGÀY / TUẦN / THÁNG · HỌC SINH / LỚP) */
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-3">
                <label className={LABEL_CLASS}>Phạm vi xem</label>
                <select
                  value={historyScope}
                  onChange={(e) => setHistoryScope(e.target.value as 'CLASS' | 'STUDENT')}
                  className={INPUT_CLASS}
                >
                  <option value="CLASS">Theo cả lớp</option>
                  <option value="STUDENT">Theo từng học sinh</option>
                </select>
              </div>

              {historyScope === 'STUDENT' && (
                <div className="md:col-span-3">
                  <label className={LABEL_CLASS}>Chọn học sinh</label>
                  <select
                    value={historyStudentId}
                    onChange={(e) => setHistoryStudentId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} ({s.studentCode})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={historyScope === 'STUDENT' ? 'md:col-span-3' : 'md:col-span-4'}>
                <label className={LABEL_CLASS}>Khung thời gian</label>
                <select
                  value={historyPeriod}
                  onChange={(e) => setHistoryPeriod(e.target.value as 'DAY' | 'WEEK' | 'MONTH')}
                  className={INPUT_CLASS}
                >
                  <option value="DAY">Theo ngày</option>
                  <option value="WEEK">Theo tuần</option>
                  <option value="MONTH">Theo tháng</option>
                </select>
              </div>

              <div className={historyScope === 'STUDENT' ? 'md:col-span-3' : 'md:col-span-5'}>
                <label className={LABEL_CLASS}>
                  {historyPeriod === 'MONTH' ? 'Chọn tháng' : 'Ngày mốc'} ({historyRange.label})
                </label>
                {historyPeriod === 'MONTH' ? (
                  <input
                    type="month"
                    value={historyMonth}
                    onChange={(e) => setHistoryMonth(e.target.value)}
                    className={INPUT_CLASS}
                  />
                ) : (
                  <input
                    type="date"
                    value={historyAnchorDate}
                    onChange={(e) => setHistoryAnchorDate(e.target.value)}
                    className={INPUT_CLASS}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Neutral summary metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500">Lượt đã đánh giá</div>
              <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {historySummary.assessedCount}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500">Biểu hiện tích cực</div>
              <div className="mt-1 text-xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                {historySummary.positiveMarksTotal}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500">Nội dung cần hỗ trợ</div>
              <div className="mt-1 text-xl font-semibold text-amber-700 tabular-nums dark:text-amber-400">
                {historySummary.supportMarksTotal}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500">Chưa đánh giá / Trung lập</div>
              <div className="mt-1 text-xl font-semibold text-slate-700 tabular-nums dark:text-slate-300">
                {historySummary.notAssessedCount +
                  historySummary.noOpportunityCount +
                  historySummary.noNotableBehaviorCount}
              </div>
            </div>
          </div>

          {/* Progress & Support Breakdown */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-400">
                Tiến bộ & Điểm tích cực ghi nhận được
              </div>
              {historySummary.positiveBreakdown.length === 0 ? (
                <p className="text-xs text-slate-500">Chưa có ghi nhận tích cực trong khoảng thời gian này.</p>
              ) : (
                <div className="space-y-1.5">
                  {historySummary.positiveBreakdown.map((item) => (
                    <div key={item.criterionId} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 dark:text-slate-300">{item.name}</span>
                      <span className="font-mono font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                        {item.count} lượt
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
                Nội dung cần quan tâm, hỗ trợ thêm
              </div>
              {historySummary.supportBreakdown.length === 0 ? (
                <p className="text-xs text-slate-500">Không có nội dung cần hỗ trợ được đánh dấu trong khoảng thời gian này.</p>
              ) : (
                <div className="space-y-1.5">
                  {historySummary.supportBreakdown.map((item) => (
                    <div key={item.criterionId} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 dark:text-slate-300">{item.name}</span>
                      <span className="font-mono font-semibold text-amber-700 tabular-nums dark:text-amber-400">
                        {item.count} lượt
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {historyScope === 'CLASS' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Học sinh</th>
                    <th className="px-4 py-3">Ngày đã ĐG</th>
                    <th className="px-4 py-3">Điểm tích cực nổi bật</th>
                    <th className="px-4 py-3">Cần hỗ trợ</th>
                    <th className="px-4 py-3 text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {students.map((stu) => {
                    const summary = historySummary.byStudent.get(stu.id);
                    return (
                      <tr key={stu.id}>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {stu.fullName}
                          <div className="font-mono text-[11px] font-normal text-slate-500">
                            {stu.studentCode}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                          {summary?.assessedCount ?? 0}
                        </td>
                        <td className="px-4 py-3 text-xs text-emerald-800 dark:text-emerald-300">
                          {summary && summary.positiveBreakdown.length > 0
                            ? summary.positiveBreakdown
                                .slice(0, 3)
                                .map((b) => `${b.name} (${b.count})`)
                                .join(', ')
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
                          {summary && summary.supportBreakdown.length > 0
                            ? summary.supportBreakdown
                                .slice(0, 3)
                                .map((b) => `${b.name} (${b.count})`)
                                .join(', ')
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryStudentId(stu.id);
                              setHistoryScope('STUDENT');
                            }}
                            className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                          >
                            Xem nhật ký
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Detailed chronological records */}
          {historyRecords.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Chưa có dữ liệu lịch sử trong khoảng thời gian đã chọn"
              description="Các ghi nhận đã lưu ở cả hai chế độ Đánh giá cả lớp và Đánh giá từng học sinh sẽ xuất hiện tại đây."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Ngày</th>
                    <th className="px-4 py-3">Học sinh</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">Tiêu chí ghi nhận</th>
                    <th className="px-4 py-3">Nhận xét</th>
                    <th className="px-4 py-3">Lưu lúc</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {historyRecords.map((rec) => {
                    const labels =
                      rec.criterionIds && rec.criterionIds.length > 0
                        ? rec.criterionIds
                            .map((id) => criteriaById.get(id)?.name)
                            .filter((n): n is string => Boolean(n))
                        : rec.criterionLabelsSnapshot ?? [];
                    const displayLabels =
                      labels.length > 0 ? labels : rec.criterionLabelsSnapshot ?? [];

                    return (
                      <tr key={rec.id} className="align-top">
                        <td className="px-4 py-3 font-mono text-xs tabular-nums whitespace-nowrap">
                          {rec.assessmentDate}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {studentMap.get(rec.studentId)?.fullName ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {DAILY_EVALUATION_STATUS_LABELS[rec.evaluationStatus ?? DailyEvaluationStatus.ASSESSED]}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                          {displayLabels.length > 0 ? displayLabels.join(', ') : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                          {rec.comment || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                          {formatDateTimeVi(rec.savedAt)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {rec.editHistory && rec.editHistory.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setEditHistoryTarget(rec)}
                                className="text-xs font-medium text-slate-600 hover:underline dark:text-slate-400"
                              >
                                Sửa ({rec.editHistory.length})
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDate(rec.assessmentDate);
                                setFocusedStudentId(rec.studentId);
                                setActiveTab('student');
                              }}
                              className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                            >
                              Mở sửa
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: LỊCH SỬ CHỈNH SỬA BẢN GHI */}
      <Modal
        isOpen={Boolean(editHistoryTarget)}
        title={`Lịch sử chỉnh sửa — ${studentMap.get(editHistoryTarget?.studentId ?? '')?.fullName ?? 'Học sinh'} (${editHistoryTarget?.assessmentDate ?? ''})`}
        onClose={() => setEditHistoryTarget(null)}
      >
        <div className="space-y-3">
          {!editHistoryTarget || editHistoryTarget.editHistory.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có lịch sử chỉnh sửa được ghi nhận.</p>
          ) : (
            editHistoryTarget.editHistory.map((entry, idx) => (
              <div
                key={`${entry.editedAt}-${idx}`}
                className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800 space-y-1"
              >
                <div className="flex justify-between gap-2 text-[11px] text-slate-500">
                  <span className="font-mono tabular-nums">{formatDateTimeVi(entry.editedAt)}</span>
                  <span>{entry.editorName ?? 'Giáo viên'}</span>
                </div>
                <div className="text-slate-800 dark:text-slate-200">{entry.summary}</div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* MODAL: TÙY CHỈNH TIÊU CHÍ ĐÁNH GIÁ HẰNG NGÀY */}
      <Modal
        isOpen={criteriaModalOpen}
        title="Tùy chỉnh tiêu chí đánh giá hằng ngày"
        onClose={() => setCriteriaModalOpen(false)}
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-5">
          <form
            onSubmit={(e) => void handleSaveCriterionModal(e)}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-3"
          >
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {editingCriterionId ? 'Chỉnh sửa tiêu chí' : 'Thêm tiêu chí quan sát mới'}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className={LABEL_CLASS}>Tên tiêu chí *</label>
                <input
                  required
                  value={critName}
                  onChange={(e) => setCritName(e.target.value)}
                  placeholder="VD: Biết giữ gìn sách vở sạch đẹp"
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Nhóm tiêu chí</label>
                <select
                  value={critGroup}
                  onChange={(e) => setCritGroup(e.target.value as DailyCriterionGroup)}
                  className={INPUT_CLASS}
                >
                  <option value="POSITIVE">{DAILY_CRITERION_GROUP_LABELS.POSITIVE}</option>
                  <option value="NEEDS_SUPPORT">{DAILY_CRITERION_GROUP_LABELS.NEEDS_SUPPORT}</option>
                </select>
              </div>
            </div>
            <div>
              <label className={LABEL_CLASS}>Ghi chú gợi ý quan sát (tùy chọn)</label>
              <input
                value={critDesc}
                onChange={(e) => setCritDesc(e.target.value)}
                placeholder="Mô tả ngắn biểu hiện cần quan sát..."
                className={INPUT_CLASS}
              />
            </div>
            <div className="flex justify-end gap-2">
              {editingCriterionId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCriterionId(null);
                    setCritName('');
                    setCritDesc('');
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Hủy sửa
                </button>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
              >
                <Plus className="h-3.5 w-3.5" />
                {editingCriterionId ? 'Lưu cập nhật' : 'Thêm tiêu chí'}
              </button>
            </div>
          </form>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {allCriteria.map((cr) => (
              <div
                key={cr.id}
                className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs ${
                  cr.isHidden ? 'opacity-55 bg-slate-50/70 dark:bg-slate-900' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`font-semibold ${
                        cr.group === 'POSITIVE'
                          ? 'text-emerald-800 dark:text-emerald-400'
                          : 'text-amber-800 dark:text-amber-400'
                      }`}
                    >
                      [{DAILY_CRITERION_GROUP_LABELS[cr.group]}]
                    </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {cr.name}
                    </span>
                    {cr.isHidden && (
                      <span className="text-[11px] text-slate-500">(Đang ẩn)</span>
                    )}
                  </div>
                  {cr.description && (
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {cr.description}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCriterionId(cr.id);
                      setCritName(cr.name);
                      setCritGroup(cr.group);
                      setCritDesc(cr.description ?? '');
                    }}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    <Edit2 className="h-3 w-3" />
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await dailyAssessmentService.toggleHideCriterion(cr.id, !cr.isHidden);
                      if (res.ok) {
                        notify('success', cr.isHidden ? `Đã hiển thị lại "${cr.name}"` : `Đã ẩn "${cr.name}"`);
                        await loadCriteria();
                      } else {
                        notify('error', 'Không thể cập nhật trạng thái tiêu chí', res.error);
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    {cr.isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {cr.isHidden ? 'Hiện' : 'Ẩn'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};
