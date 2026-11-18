import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Edit2,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  AI_ADVISORY_DISCLAIMER,
  buildAnonymizedAiPayload,
} from '../services/aiAnalysisService';
import { aiService } from '../services/aiService';
import {
  evaluateEvidenceAgainstRules,
  isRatingAllowedForScope,
} from '../services/assessmentRuleService';
import { assessmentService } from '../services/assessmentService';
import { classStudentService } from '../services/classStudentService';
import { curriculumService } from '../services/curriculumService';
import { dailyAssessmentService } from '../services/dailyAssessmentService';
import {
  AssessmentPeriodType,
  AssessmentRatingLevel,
  type AssessmentEvidence,
  type AssessmentPeriod,
  type AssessmentResult,
  type AssessmentRule,
  type Criterion,
  type DailyAssessment,
  type DailyBehaviorCriterion,
  type LessonAssessment,
  type Student,
  type Subject,
} from '../types/models';
import {
  getRatingOptionsForScope,
  INPUT_CLASS,
  LABEL_CLASS,
  PERIOD_TYPE_LABELS,
  RATING_LEVEL_LABELS,
} from '../utils/labels';

export const PeriodicAssessmentPage: React.FC = () => {
  const { notify } = useNotification();
  const { activeYear, classes, activeTeacher, permissions, settings } = useWorkspace();
  const [searchParams] = useSearchParams();
  const isOnline = useOnlineStatus();
  const aiEnabled = settings?.aiEnabled !== false;

  const availableClasses = useMemo(() => {
    const yearFiltered = classes.filter(
      (c) => !c.isArchived && (!activeYear || c.academicYearId === activeYear.id)
    );
    if (!permissions.isScopedTeacher) return yearFiltered;
    return yearFiltered.filter((c) => permissions.allAllowedClassIds.has(c.id));
  }, [classes, activeYear, permissions]);

  const [periods, setPeriods] = useState<AssessmentPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rules, setRules] = useState<AssessmentRule[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [dailyCriteria, setDailyCriteria] = useState<DailyBehaviorCriterion[]>([]);
  const [lessonAssessments, setLessonAssessments] = useState<LessonAssessment[]>([]);
  const [dailyAssessments, setDailyAssessments] = useState<DailyAssessment[]>([]);
  const [evidenceList, setEvidenceList] = useState<AssessmentEvidence[]>([]);
  const [results, setResults] = useState<AssessmentResult[]>([]);

  const [periodModal, setPeriodModal] = useState(false);
  const [pCode, setPCode] = useState('HK1-CUOI');
  const [pName, setPName] = useState('Cuối học kỳ I');
  const [pType, setPType] = useState<AssessmentPeriodType>(AssessmentPeriodType.END_TERM_1);
  const [pStart, setPStart] = useState(new Date().toISOString().slice(0, 10));
  const [pEnd, setPEnd] = useState(new Date().toISOString().slice(0, 10));

  const [resultModal, setResultModal] = useState(false);
  const [editingResultId, setEditingResultId] = useState<string | null>(null);
  const [rStudentId, setRStudentId] = useState('');
  const [rSubjectId, setRSubjectId] = useState('');
  const [rScope, setRScope] = useState<'SUBJECT' | 'QUALITY' | 'COMPETENCY' | 'OVERALL'>('SUBJECT');
  const [rRating, setRRating] = useState<AssessmentRatingLevel>(AssessmentRatingLevel.HTT);
  const [rScore, setRScore] = useState('');
  const [rComment, setRComment] = useState('');

  // Advisory AI suggestion inside modal (never auto-saves or alters teacher result)
  const [loadingAiDraft, setLoadingAiDraft] = useState(false);
  const [aiDraftSuggestions, setAiDraftSuggestions] = useState<string[]>([]);
  const [aiConflictNotes, setAiConflictNotes] = useState<string[]>([]);

  const isHomeroomForSelected =
    !permissions.isScopedTeacher ||
    (selectedClassId ? permissions.allowedHomeroomClassIds.has(selectedClassId) : false);

  const allowedSubjects = useMemo(() => {
    const activeSubjs = subjects.filter((s) => s.isActive);
    if (!permissions.isScopedTeacher || !selectedClassId) return activeSubjs;
    if (permissions.allowedHomeroomClassIds.has(selectedClassId)) return activeSubjs;
    const assignedIds = permissions.allowedSubjectIdsByClass.get(selectedClassId);
    if (!assignedIds) return [];
    return activeSubjs.filter((s) => assignedIds.has(s.id));
  }, [subjects, permissions, selectedClassId]);

  const appliedClassParamRef = useRef<string | null>(null);

  useEffect(() => {
    const paramClassId = searchParams.get('classId');
    if (paramClassId && paramClassId !== appliedClassParamRef.current) {
      if (availableClasses.some((c) => c.id === paramClassId)) {
        appliedClassParamRef.current = paramClassId;
        setSelectedClassId(paramClassId);
        return;
      }
    }
    if (availableClasses.length === 0) {
      setSelectedClassId('');
    } else if (!selectedClassId || !availableClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(availableClasses[0].id);
    }
  }, [availableClasses, selectedClassId, searchParams]);

  const loadPeriodsAndSubjects = async () => {
    const [pRes, sRes, rRes, cRes, dcRes] = await Promise.all([
      assessmentService.listPeriods(activeYear?.id),
      curriculumService.listSubjects(),
      curriculumService.listRules(),
      curriculumService.listCriteria(),
      dailyAssessmentService.listCriteria(true),
    ]);
    if (pRes.ok) {
      setPeriods(pRes.data);
      const paramPeriodId = searchParams.get('periodId');
      if (paramPeriodId && pRes.data.some((p) => p.id === paramPeriodId)) {
        setSelectedPeriodId(paramPeriodId);
      } else if (pRes.data.length > 0) {
        setSelectedPeriodId((prev) => (pRes.data.some((p) => p.id === prev) ? prev : pRes.data[0].id));
      } else {
        setSelectedPeriodId('');
      }
    }
    if (sRes.ok) setSubjects(sRes.data);
    if (rRes.ok) setRules(rRes.data);
    if (cRes.ok) setCriteria(cRes.data);
    if (dcRes.ok) setDailyCriteria(dcRes.data);
  };

  const loadResults = async () => {
    const [stuRes, resList, lessonRes, dailyRes, evRes] = await Promise.all([
      selectedClassId
        ? classStudentService.listStudents({ classId: selectedClassId })
        : Promise.resolve({ ok: true as const, data: [] as Student[] }),
      selectedClassId
        ? assessmentService.listResults({
            periodId: selectedPeriodId || undefined,
            classId: selectedClassId,
          })
        : Promise.resolve({ ok: true as const, data: [] as AssessmentResult[] }),
      selectedClassId
        ? assessmentService.listLessonAssessments({ classId: selectedClassId })
        : Promise.resolve({ ok: true as const, data: [] as LessonAssessment[] }),
      selectedClassId
        ? assessmentService.listDailyAssessments({ classId: selectedClassId })
        : Promise.resolve({ ok: true as const, data: [] as DailyAssessment[] }),
      assessmentService.listEvidence(activeYear ? { academicYearId: activeYear.id } : undefined),
    ]);
    if (stuRes.ok) setStudents(stuRes.data);
    if (lessonRes.ok) setLessonAssessments(lessonRes.data);
    if (dailyRes.ok) setDailyAssessments(dailyRes.data);
    if (evRes.ok) setEvidenceList(evRes.data);
    if (resList.ok) {
      let nextResults = resList.data;
      if (permissions.isScopedTeacher && selectedClassId && !isHomeroomForSelected) {
        const allowedSubIds = permissions.allowedSubjectIdsByClass.get(selectedClassId);
        nextResults = allowedSubIds
          ? nextResults.filter((r) => r.resultScope === 'SUBJECT' && r.subjectId && allowedSubIds.has(r.subjectId))
          : [];
      }
      setResults(nextResults);
    }
  };

  useEffect(() => {
    void loadPeriodsAndSubjects();
  }, [activeYear?.id]);

  useEffect(() => {
    void loadResults();
  }, [selectedPeriodId, selectedClassId, isHomeroomForSelected, permissions]);

  const activePeriod = periods.find((p) => p.id === selectedPeriodId);
  const activeClass = availableClasses.find((c) => c.id === selectedClassId);
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  const effectiveModalScope = isHomeroomForSelected ? rScope : 'SUBJECT';
  const validModalRatingOptions = getRatingOptionsForScope(effectiveModalScope);

  // Enforce strict scale separation when switching scope
  useEffect(() => {
    if (!isRatingAllowedForScope(rRating, effectiveModalScope)) {
      setRRating(validModalRatingOptions[0].value);
    }
  }, [effectiveModalScope, rRating, validModalRatingOptions]);

  const modalRuleAdvisory = useMemo(() => {
    if (!resultModal || !rStudentId) return null;
    const stuLessons = lessonAssessments.filter((l) => l.studentId === rStudentId);
    const stuDaily = dailyAssessments.filter((d) => d.studentId === rStudentId);
    const stuEvidence = evidenceList.filter((e) => e.studentId === rStudentId);
    const parsedScore = rScore.trim() ? Number(rScore) : undefined;

    return evaluateEvidenceAgainstRules({
      rules,
      scope: effectiveModalScope,
      academicYearId: activeYear?.id,
      gradeLevel: activeClass?.gradeLevel,
      subjectId: effectiveModalScope === 'SUBJECT' ? rSubjectId || undefined : undefined,
      periodType: activePeriod?.periodType,
      lessonAssessments: stuLessons,
      dailyAssessments: stuDaily,
      evidenceList: stuEvidence,
      periodicScore: parsedScore,
    });
  }, [
    resultModal,
    rStudentId,
    lessonAssessments,
    dailyAssessments,
    evidenceList,
    rScore,
    rules,
    effectiveModalScope,
    activeYear?.id,
    activeClass?.gradeLevel,
    rSubjectId,
    activePeriod?.periodType,
  ]);

  const modalLocalEvidencePayload = useMemo(() => {
    if (!resultModal || !rStudentId) return null;
    const stu = studentMap.get(rStudentId);
    if (!stu) return null;
    return buildAnonymizedAiPayload({
      student: stu,
      schoolClass: activeClass,
      scope:
        effectiveModalScope === 'SUBJECT'
          ? 'SUBJECT'
          : effectiveModalScope === 'QUALITY' || effectiveModalScope === 'COMPETENCY'
            ? 'QUALITY_COMPETENCY'
            : 'PERIODIC_PREP',
      subject: effectiveModalScope === 'SUBJECT' ? subjectMap.get(rSubjectId) : undefined,
      period: activePeriod,
      lessonAssessments,
      dailyAssessments,
      evidenceList,
      officialResults: results,
      criteria,
      dailyCriteria,
      rules,
    });
  }, [
    resultModal,
    rStudentId,
    studentMap,
    activeClass,
    effectiveModalScope,
    rSubjectId,
    subjectMap,
    activePeriod,
    lessonAssessments,
    dailyAssessments,
    evidenceList,
    results,
    criteria,
    dailyCriteria,
    rules,
  ]);

  const openResultModal = () => {
    if (!selectedClassId) {
      notify('warning', 'Chưa có lớp thuộc phạm vi phụ trách');
      return;
    }
    if (students.length === 0) {
      notify('warning', 'Chưa có học sinh trong lớp');
      return;
    }
    const paramSubjectId = searchParams.get('subjectId');
    const preferredSubject =
      paramSubjectId && allowedSubjects.some((s) => s.id === paramSubjectId)
        ? paramSubjectId
        : allowedSubjects[0]?.id ?? '';
    setEditingResultId(null);
    setRStudentId(students[0].id);
    setRScope('SUBJECT');
    setRRating(AssessmentRatingLevel.HTT);
    setRSubjectId(preferredSubject);
    setRScore('');
    setRComment('');
    setAiDraftSuggestions([]);
    setAiConflictNotes([]);
    setResultModal(true);
  };

  const openEditResultModal = (existing: AssessmentResult) => {
    setEditingResultId(existing.id);
    setRStudentId(existing.studentId);
    setRScope(existing.resultScope);
    setRSubjectId(existing.subjectId ?? allowedSubjects[0]?.id ?? '');
    setRRating(existing.ratingLevel);
    setRScore(existing.numericScore !== undefined ? String(existing.numericScore) : '');
    setRComment(existing.summaryComment ?? '');
    setAiDraftSuggestions([]);
    setAiConflictNotes([]);
    setResultModal(true);
  };

  const handleRequestAiDraftForModal = async () => {
    if (!modalLocalEvidencePayload) return;
    setLoadingAiDraft(true);
    const res = await aiService.analyzeStudentEvidence({
      anonymizedContext: modalLocalEvidencePayload.contextText,
      teacherQuestion:
        'Hãy gợi ý 2–3 nhận xét định kỳ ngắn gọn, mang tính khích lệ, phù hợp lứa tuổi tiểu học để giáo viên tham khảo và chỉnh sửa trước khi xác nhận.',
      scope: modalLocalEvidencePayload.scopeLabel,
    });
    setLoadingAiDraft(false);
    if (res.ok) {
      setAiDraftSuggestions(res.data.analysis.suggestedComments);
      setAiConflictNotes(res.data.analysis.dataGapsOrConflicts);
    } else {
      notify('error', 'Không thể lấy gợi ý từ Trợ lý AI', res.error);
    }
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.canManageAssignments) {
      notify('error', 'Không có quyền', 'Chỉ Quản trị viên hoặc Quản lý chuyên môn mới được tạo kỳ đánh giá.');
      return;
    }
    if (!activeYear) {
      notify('warning', 'Chưa có năm học', 'Hãy tạo năm học trước.');
      return;
    }
    const res = await assessmentService.createPeriod({
      academicYearId: activeYear.id,
      code: pCode,
      name: pName,
      periodType: pType,
      startDate: pStart,
      endDate: pEnd,
      isLocked: false,
    });
    if (res.ok) {
      notify('success', 'Đã tạo kỳ đánh giá');
      setPeriodModal(false);
      await loadPeriodsAndSubjects();
      setSelectedPeriodId(res.data.id);
    } else {
      notify('error', 'Không thể tạo kỳ đánh giá', res.error);
    }
  };

  const handleSaveResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeYear || !selectedPeriodId || !selectedClassId) return;
    const effectiveScope = isHomeroomForSelected ? rScope : 'SUBJECT';
    if (!isRatingAllowedForScope(rRating, effectiveScope)) {
      notify(
        'error',
        'Mức đánh giá không khớp nhóm quy định',
        'Môn học sử dụng mức T/H/C (HTT/HT/CHT); Phẩm chất và Năng lực sử dụng mức T/Đ/C (T/Đ/CCG).'
      );
      return;
    }
    const res = await assessmentService.saveResult({
      id: editingResultId ?? undefined,
      academicYearId: activeYear.id,
      periodId: selectedPeriodId,
      classId: selectedClassId,
      studentId: rStudentId,
      teacherId: activeTeacher?.id,
      subjectId: effectiveScope === 'SUBJECT' ? rSubjectId || undefined : undefined,
      resultScope: effectiveScope,
      ratingLevel: rRating,
      numericScore: rScore ? Number(rScore) : undefined,
      summaryComment: rComment.trim(),
    });
    if (res.ok) {
      notify('success', editingResultId ? 'Đã cập nhật kết quả đánh giá định kỳ' : 'Đã lưu kết quả đánh giá định kỳ');
      setResultModal(false);
      await loadResults();
    } else {
      notify('error', 'Không thể lưu kết quả', res.error);
    }
  };

  const canEnterResult =
    Boolean(selectedPeriodId && selectedClassId && !activePeriod?.isLocked) &&
    (isHomeroomForSelected || allowedSubjects.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đánh giá định kỳ"
        description="Quản lý các kỳ đánh giá (Giữa kỳ I, Cuối kỳ I, Giữa kỳ II, Cuối năm), đối chiếu bộ quy tắc đánh giá và xác nhận kết quả chính thức."
        actions={
          <div className="flex flex-wrap gap-2">
            {permissions.canManageAssignments && (
              <button
                type="button"
                onClick={() => setPeriodModal(true)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Tạo kỳ đánh giá
              </button>
            )}
            <button
              type="button"
              disabled={!canEnterResult}
              onClick={openResultModal}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Nhập kết quả định kỳ
            </button>
          </div>
        }
      />

      {permissions.isScopedTeacher && activeTeacher && (
        <div className="flex items-center gap-2.5 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-xs text-teal-900 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-200">
          <ShieldCheck className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
          <span>
            Đang thao tác với quyền giáo viên <strong>{activeTeacher.fullName}</strong>:{' '}
            {selectedClassId
              ? isHomeroomForSelected
                ? 'Bạn là GVCN của lớp này — được phép nhập kết quả toàn bộ môn học, phẩm chất, năng lực và tổng hợp chung.'
                : `Bạn là GVBM tại lớp này — được phép nhập kết quả ${allowedSubjects.length} môn học được phân công.`
              : 'Chưa có lớp thuộc phạm vi phụ trách.'}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedPeriodId}
          onChange={(e) => setSelectedPeriodId(e.target.value)}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {periods.length === 0 && <option value="">Chưa có kỳ đánh giá</option>}
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({PERIOD_TYPE_LABELS[p.periodType]})
            </option>
          ))}
        </select>

        <select
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {availableClasses.length === 0 && (
            <option value="">
              {permissions.isScopedTeacher ? 'Chưa được phân công lớp nào' : 'Chưa có lớp học'}
            </option>
          )}
          {availableClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {activePeriod && (
          permissions.canManageAssignments ? (
            <button
              type="button"
              onClick={async () => {
                const res = await assessmentService.togglePeriodLock(
                  activePeriod.id,
                  !activePeriod.isLocked
                );
                if (res.ok) {
                  notify('success', activePeriod.isLocked ? 'Đã mở khóa kỳ đánh giá' : 'Đã khóa kỳ đánh giá');
                  await loadPeriodsAndSubjects();
                } else {
                  notify('error', 'Không thể thay đổi trạng thái khóa sổ', res.error);
                }
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {activePeriod.isLocked ? (
                <>
                  <Lock className="h-3.5 w-3.5 text-amber-600" />
                  Đang khóa sổ (Nhấn để mở)
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5 text-emerald-600" />
                  Đang mở nhập liệu
                </>
              )}
            </button>
          ) : (
            <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
              {activePeriod.isLocked ? (
                <>
                  <Lock className="h-3.5 w-3.5 text-amber-600" />
                  Kỳ đánh giá đang khóa sổ
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5 text-emerald-600" />
                  Đang mở nhập liệu
                </>
              )}
            </span>
          )
        )}
      </div>

      {periods.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Chưa có kỳ đánh giá định kỳ"
          description={
            permissions.canManageAssignments
              ? 'Tạo các mốc đánh giá định kỳ trong năm học để nhập kết quả môn học, phẩm chất và năng lực.'
              : 'Quản trị viên hoặc Tổ chuyên môn chưa tạo kỳ đánh giá cho năm học này.'
          }
          actionLabel={permissions.canManageAssignments ? 'Tạo kỳ đánh giá đầu tiên' : undefined}
          onAction={permissions.canManageAssignments ? () => setPeriodModal(true) : undefined}
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Chưa có kết quả trong kỳ này"
          description="Chọn lớp học và nhấn Nhập kết quả định kỳ để đối chiếu quy tắc, xem gợi ý nhận xét và xác nhận kết quả chính thức."
          actionLabel={canEnterResult ? 'Nhập kết quả' : undefined}
          onAction={canEnterResult ? openResultModal : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Học sinh</th>
                <th className="px-4 py-3">Phạm vi / Môn học</th>
                <th className="px-4 py-3">Mức đạt</th>
                <th className="px-4 py-3">Điểm KTĐK</th>
                <th className="px-4 py-3">Nhận xét tổng hợp</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {results.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {studentMap.get(r.studentId)?.fullName ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {r.subjectId
                      ? (subjectMap.get(r.subjectId)?.name ?? 'Môn học')
                      : r.resultScope === 'QUALITY'
                        ? 'Phẩm chất chủ yếu (T / Đ / C)'
                        : r.resultScope === 'COMPETENCY'
                          ? 'Năng lực chung (T / Đ / C)'
                          : 'Tổng hợp chung'}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-teal-800 dark:text-teal-300">
                    {RATING_LEVEL_LABELS[r.ratingLevel]}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums">
                    {r.numericScore ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {r.summaryComment || '—'}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={activePeriod?.isLocked}
                        onClick={() => openEditResultModal(r)}
                        title="Xem & Sửa kết quả"
                        className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={activePeriod?.isLocked}
                        onClick={async () => {
                          const res = await assessmentService.removeResult(r.id);
                          if (res.ok) {
                            notify('success', 'Đã xóa kết quả');
                            await loadResults();
                          } else {
                            notify('error', 'Không thể xóa kết quả', res.error);
                          }
                        }}
                        title="Xóa kết quả"
                        className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40 dark:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL TẠO KỲ ĐÁNH GIÁ */}
      <Modal isOpen={periodModal} title="Tạo kỳ đánh giá định kỳ" onClose={() => setPeriodModal(false)}>
        <form onSubmit={(e) => void handleCreatePeriod(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Mã kỳ *</label>
              <input
                required
                value={pCode}
                onChange={(e) => setPCode(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Loại kỳ</label>
              <select
                value={pType}
                onChange={(e) => setPType(e.target.value as AssessmentPeriodType)}
                className={INPUT_CLASS}
              >
                {Object.entries(PERIOD_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Tên kỳ đánh giá *</label>
            <input
              required
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Từ ngày</label>
              <input
                type="date"
                value={pStart}
                onChange={(e) => setPStart(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Đến ngày</label>
              <input
                type="date"
                value={pEnd}
                onChange={(e) => setPEnd(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPeriodModal(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              Tạo kỳ đánh giá
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL NHẬP / SỬA KẾT QUẢ ĐỊNH KỲ (KÈM ĐỐI CHIẾU QUY TẮC & GỢI Ý AI THAM KHẢO) */}
      <Modal
        isOpen={resultModal}
        title={
          editingResultId
            ? 'Xem, chỉnh sửa & xác nhận kết quả đánh giá định kỳ'
            : 'Nhập & xác nhận kết quả đánh giá định kỳ'
        }
        onClose={() => setResultModal(false)}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={(e) => void handleSaveResult(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Học sinh *</label>
              <select
                required
                value={rStudentId}
                onChange={(e) => {
                  setRStudentId(e.target.value);
                  setAiDraftSuggestions([]);
                  setAiConflictNotes([]);
                }}
                className={INPUT_CLASS}
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Phạm vi đánh giá (Phân tách mức đánh giá)</label>
              <select
                value={effectiveModalScope}
                disabled={!isHomeroomForSelected}
                onChange={(e) => {
                  setRScope(e.target.value as 'SUBJECT' | 'QUALITY' | 'COMPETENCY' | 'OVERALL');
                  setAiDraftSuggestions([]);
                }}
                className={INPUT_CLASS}
              >
                <option value="SUBJECT">Môn học &amp; HĐGD (Mức T / H / C)</option>
                {isHomeroomForSelected && (
                  <>
                    <option value="QUALITY">Phẩm chất chủ yếu (Mức T / Đ / C)</option>
                    <option value="COMPETENCY">Năng lực chung (Mức T / Đ / C)</option>
                    <option value="OVERALL">Tổng hợp kết quả giáo dục (Mức T / H / C)</option>
                  </>
                )}
              </select>
            </div>
          </div>

          {effectiveModalScope === 'SUBJECT' && (
            <div>
              <label className={LABEL_CLASS}>Môn học *</label>
              <select
                required
                value={rSubjectId}
                onChange={(e) => {
                  setRSubjectId(e.target.value);
                  setAiDraftSuggestions([]);
                }}
                className={INPUT_CLASS}
              >
                {allowedSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>
                Mức đạt ({effectiveModalScope === 'QUALITY' || effectiveModalScope === 'COMPETENCY' ? 'Hệ Phẩm chất/Năng lực: T / Đ / C' : 'Hệ Môn học: T / H / C'})
              </label>
              <select
                value={rRating}
                onChange={(e) => setRRating(e.target.value as AssessmentRatingLevel)}
                className={INPUT_CLASS}
              >
                {validModalRatingOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Điểm kiểm tra định kỳ (nếu môn có bài thi)</label>
              <input
                type="number"
                step="0.5"
                min={0}
                max={10}
                disabled={effectiveModalScope === 'QUALITY' || effectiveModalScope === 'COMPETENCY'}
                value={rScore}
                onChange={(e) => setRScore(e.target.value)}
                placeholder="Không bắt buộc"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* Khối đối chiếu Bộ quy tắc đánh giá đang áp dụng */}
          {modalRuleAdvisory && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 text-xs space-y-2 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Đối chiếu Bộ quy tắc:{' '}
                {modalRuleAdvisory.matchedRule
                  ? `${modalRuleAdvisory.matchedRule.name} (${modalRuleAdvisory.matchedRule.circularReference})`
                  : 'Chưa cấu hình quy tắc riêng — sử dụng checklist bằng chứng cơ bản'}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                {modalRuleAdvisory.checklist.map((item) => (
                  <span key={item.evidenceType} className="inline-flex items-center gap-1">
                    {item.satisfied ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    )}
                    {item.label}: {item.availableCount}
                  </span>
                ))}
              </div>
              {modalRuleAdvisory.scoreGuidanceNote && (
                <div className="text-[11px] text-teal-800 dark:text-teal-300">
                  {modalRuleAdvisory.scoreGuidanceNote}
                </div>
              )}
              {modalRuleAdvisory.suggestedTemplates.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Chèn nhanh mẫu nhận xét từ quy tắc (giáo viên sửa lại trước khi lưu):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {modalRuleAdvisory.suggestedTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setRComment(tpl.templateText)}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        + {tpl.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Khối hỗ trợ chuẩn bị nhận xét từ Trợ lý AI (chỉ tham khảo) */}
          <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3.5 text-xs space-y-2 dark:border-teal-900/50 dark:bg-teal-950/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-teal-900 dark:text-teal-200">
                Chuẩn bị nhận xét định kỳ (Gợi ý tham khảo, không tự động lưu)
              </div>
              <button
                type="button"
                disabled={!aiEnabled || !isOnline || loadingAiDraft || !modalLocalEvidencePayload}
                onClick={() => void handleRequestAiDraftForModal()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-white px-2.5 py-1 text-[11px] font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50 dark:bg-slate-900 dark:text-teal-300"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {loadingAiDraft
                  ? 'Đang gợi ý...'
                  : !aiEnabled
                    ? 'AI đang tắt'
                    : !isOnline
                      ? 'Cần mạng cho AI'
                      : 'Nhờ Trợ lý AI gợi ý nhận xét'}
              </button>
            </div>

            {modalLocalEvidencePayload && modalLocalEvidencePayload.localAnalysis.dataIssues.length > 0 && (
              <div className="text-[11px] text-amber-800 dark:text-amber-300">
                Lưu ý dữ liệu: {modalLocalEvidencePayload.localAnalysis.dataIssues[0]}
              </div>
            )}

            {aiConflictNotes.length > 0 && (
              <div className="text-[11px] text-amber-800 dark:text-amber-300">
                AI lưu ý rà soát: {aiConflictNotes.join(' · ')}
              </div>
            )}

            {aiDraftSuggestions.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  {AI_ADVISORY_DISCLAIMER}
                </div>
                {aiDraftSuggestions.map((draft, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between gap-2 rounded border border-teal-200 bg-white p-2 dark:border-teal-900/50 dark:bg-slate-900"
                  >
                    <span className="text-slate-800 dark:text-slate-200">{draft}</span>
                    <button
                      type="button"
                      onClick={() => setRComment(draft)}
                      className="shrink-0 font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      Chép vào ô nhận xét
                    </button>
                  </div>
                ))}
              </div>
            ) : modalLocalEvidencePayload && (
              <div className="flex flex-wrap gap-1.5">
                {modalLocalEvidencePayload.localAnalysis.suggestedDraftComments.map((localDraft, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setRComment(localDraft)}
                    className="rounded border border-slate-200 bg-white px-2.5 py-1 text-left text-[11px] text-slate-700 hover:border-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    Gợi ý cục bộ #{idx + 1}: &ldquo;{localDraft.slice(0, 65)}...&rdquo;
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={LABEL_CLASS}>Nhận xét tổng hợp (Giáo viên xem, chỉnh sửa và xác nhận)</label>
            <textarea
              rows={3}
              value={rComment}
              onChange={(e) => setRComment(e.target.value)}
              placeholder="Giáo viên trực tiếp viết hoặc chỉnh sửa nhận xét tại đây trước khi bấm Xác nhận & Lưu..."
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setResultModal(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              {editingResultId ? 'Xác nhận & Cập nhật kết quả' : 'Xác nhận & Lưu kết quả'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
