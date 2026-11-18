import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
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
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { assessmentService } from '../services/assessmentService';
import { classStudentService } from '../services/classStudentService';
import { curriculumService } from '../services/curriculumService';
import {
  buildStudentSubjectProgressReport,
  computeTimetableLessonStatus,
  getScopedTimetableLessons,
  getSubjectCriteriaForLesson,
  lessonAssessmentService,
  type SaveLessonObservationInput,
} from '../services/lessonAssessmentService';
import { timetableService } from '../services/timetableService';
import {
  AssessmentRatingLevel,
  SubjectAssessmentMode,
  type Criterion,
  type LessonAssessment,
  type LessonParticipationLevel,
  type Student,
  type Subject,
  type Timetable,
  type TimetableLesson,
} from '../types/models';
import {
  DAY_OF_WEEK_LABELS,
  formatDateTimeVi,
  INPUT_CLASS,
  LABEL_CLASS,
  LESSON_PARTICIPATION_LABELS,
  LESSON_WORKFLOW_STATUS_LABELS,
  RATING_LEVEL_LABELS,
} from '../utils/labels';

interface StudentLessonDraft {
  existingId?: string;
  ratingLevel: AssessmentRatingLevel;
  participationLevel: LessonParticipationLevel;
  criterionIds: string[];
  knowledgeAndSkills: string;
  learningProduct: string;
  difficulties: string;
  score: string;
  comment: string;
}

const DEFAULT_STUDENT_DRAFT: StudentLessonDraft = {
  ratingLevel: AssessmentRatingLevel.HT,
  participationLevel: 'MODERATE',
  criterionIds: [],
  knowledgeAndSkills: '',
  learningProduct: '',
  difficulties: '',
  score: '',
  comment: '',
};

const LESSON_COMPLETION_OPTIONS: Array<{ value: AssessmentRatingLevel; label: string }> = [
  { value: AssessmentRatingLevel.HTT, label: RATING_LEVEL_LABELS[AssessmentRatingLevel.HTT] },
  { value: AssessmentRatingLevel.HT, label: RATING_LEVEL_LABELS[AssessmentRatingLevel.HT] },
  { value: AssessmentRatingLevel.CHT, label: RATING_LEVEL_LABELS[AssessmentRatingLevel.CHT] },
];

export const LessonAssessmentPage: React.FC = () => {
  const { notify } = useNotification();
  const { activeYear, classes, teachers, activeTeacher, permissions } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();

  // Primary navigation tabs inside Lesson Assessment
  const initialLessonId = searchParams.get('timetableLessonId') ?? '';
  const initialClassId = searchParams.get('classId') ?? '';
  const initialSubjectId = searchParams.get('subjectId') ?? '';
  const [mainTab, setMainTab] = useState<'schedule' | 'assess' | 'progress'>(
    initialLessonId ? 'assess' : 'schedule'
  );
  const [assessViewMode, setAssessViewMode] = useState<'table' | 'student'>('table');

  // Core data
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [timetableLessons, setTimetableLessons] = useState<TimetableLesson[]>([]);
  const [allYearLessonAssessments, setAllYearLessonAssessments] = useState<LessonAssessment[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  // Active lesson selection
  const [selectedTimetableLessonId, setSelectedTimetableLessonId] = useState(initialLessonId);

  // Schedule filters
  const [schedTimetableId, setSchedTimetableId] = useState('');
  const [schedSubjectId, setSchedSubjectId] = useState(initialSubjectId);
  const [schedClassId, setSchedClassId] = useState(initialClassId);
  const [schedStatusFilter, setSchedStatusFilter] = useState('');

  // Lesson metadata inputs + student drafts (shared between Table view & Single-student view)
  const [slotDateInput, setSlotDateInput] = useState(new Date().toISOString().slice(0, 10));
  const [slotTopicInput, setSlotTopicInput] = useState('');
  const [draftsByStudent, setDraftsByStudent] = useState<Record<string, StudentLessonDraft>>({});
  const [focusedStudentId, setFocusedStudentId] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);

  // Subject criteria customization modal
  const [criteriaModalOpen, setCriteriaModalOpen] = useState(false);
  const [critModalSubjectId, setCritModalSubjectId] = useState('');
  const [editingCritId, setEditingCritId] = useState<string | null>(null);
  const [critName, setCritName] = useState('');
  const [critDesc, setCritDesc] = useState('');

  // Edit history modal
  const [historyModalRecord, setHistoryModalRecord] = useState<LessonAssessment | null>(null);

  // Progress Report tab state
  const [progSubjectId, setProgSubjectId] = useState('');
  const [progClassId, setProgClassId] = useState('');
  const [progStudentId, setProgStudentId] = useState('');
  const [progClassStudents, setProgClassStudents] = useState<Student[]>([]);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const timetableMap = useMemo(() => new Map(timetables.map((t) => [t.id, t])), [timetables]);

  const loadAllBase = async () => {
    const [subRes, critRes, ttRes, lessonRes, assessRes] = await Promise.all([
      curriculumService.listSubjects(),
      curriculumService.listCriteria(),
      timetableService.listTimetables(activeYear ? { academicYearId: activeYear.id } : undefined),
      timetableService.listLessons(activeYear ? { academicYearId: activeYear.id } : undefined),
      assessmentService.listLessonAssessments(activeYear ? { academicYearId: activeYear.id } : undefined),
    ]);
    if (subRes.ok) setSubjects(subRes.data);
    if (critRes.ok) setCriteria(critRes.data);
    if (ttRes.ok) setTimetables(ttRes.data);
    if (lessonRes.ok) setTimetableLessons(lessonRes.data);
    if (assessRes.ok) {
      setAllYearLessonAssessments(assessRes.data);
    }
  };

  useEffect(() => {
    void loadAllBase();
  }, [activeYear?.id]);

  const lastSyncedQueryRef = useRef<string>(searchParams.toString());

  // Sync URL query params -> lesson selection or schedule filters
  useEffect(() => {
    const queryStr = searchParams.toString();
    if (queryStr === lastSyncedQueryRef.current) return;
    lastSyncedQueryRef.current = queryStr;

    const paramLessonId = searchParams.get('timetableLessonId') ?? '';
    if (paramLessonId) {
      setSelectedTimetableLessonId(paramLessonId);
      setMainTab('assess');
      return;
    }

    const paramClassId = searchParams.get('classId') ?? '';
    const paramSubjectId = searchParams.get('subjectId') ?? '';
    if (paramClassId || paramSubjectId) {
      setSchedClassId(paramClassId);
      setSchedSubjectId(paramSubjectId);
      setMainTab('schedule');
    }
  }, [searchParams]);

  // Scoped lessons visible to current teacher (all lessons for Admin)
  const scopedLessons = useMemo(
    () =>
      getScopedTimetableLessons({
        lessons: timetableLessons,
        teacherId: activeTeacher?.id,
        permissions,
      }),
    [timetableLessons, activeTeacher?.id, permissions]
  );

  // Group assessments by timetableLessonId for fast status calculation
  const assessmentsByLessonId = useMemo(() => {
    const map = new Map<string, LessonAssessment[]>();
    for (const a of allYearLessonAssessments) {
      if (!a.timetableLessonId) continue;
      const arr = map.get(a.timetableLessonId) ?? [];
      arr.push(a);
      map.set(a.timetableLessonId, arr);
    }
    return map;
  }, [allYearLessonAssessments]);

  const todayIso = new Date().toISOString().slice(0, 10);

  const filteredScheduleLessons = useMemo(() => {
    return scopedLessons
      .filter((l) => {
        if (schedTimetableId && l.timetableId !== schedTimetableId) return false;
        if (schedSubjectId && l.subjectId !== schedSubjectId) return false;
        if (schedClassId && l.classId !== schedClassId) return false;
        if (schedStatusFilter) {
          const st = computeTimetableLessonStatus({
            lesson: l,
            assessmentsForLesson: assessmentsByLessonId.get(l.id) ?? [],
            today: todayIso,
          });
          if (st !== schedStatusFilter) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          (a.lessonDate ?? '').localeCompare(b.lessonDate ?? '') ||
          a.dayOfWeek - b.dayOfWeek ||
          a.periodNumber - b.periodNumber
      );
  }, [
    scopedLessons,
    schedTimetableId,
    schedSubjectId,
    schedClassId,
    schedStatusFilter,
    assessmentsByLessonId,
    todayIso,
  ]);

  const activeLesson = useMemo(
    () => scopedLessons.find((l) => l.id === selectedTimetableLessonId) ?? null,
    [scopedLessons, selectedTimetableLessonId]
  );

  const activeLessonRecords = useMemo(() => {
    if (!activeLesson) return [];
    return assessmentsByLessonId.get(activeLesson.id) ?? [];
  }, [activeLesson, assessmentsByLessonId]);

  const activeSubject = activeLesson ? subjectMap.get(activeLesson.subjectId) : undefined;
  const activeClass = activeLesson ? classMap.get(activeLesson.classId) : undefined;

  const activeLessonCriteria = useMemo(() => {
    if (!activeLesson) return [];
    return getSubjectCriteriaForLesson({
      criteria,
      subjectId: activeLesson.subjectId,
      gradeLevel: activeClass?.gradeLevel,
      includeHidden: false,
    });
  }, [criteria, activeLesson, activeClass?.gradeLevel]);

  // When activeLesson changes, load student roster & prefill shared drafts (no duplicates on reopen)
  useEffect(() => {
    if (!activeLesson) {
      setStudents([]);
      setDraftsByStudent({});
      return;
    }

    let cancelled = false;
    const syncLessonDetails = async () => {
      const stuRes = await classStudentService.listStudents({ classId: activeLesson.classId });
      if (cancelled) return;
      const loadedStudents = stuRes.ok ? stuRes.data : [];
      setStudents(loadedStudents);

      if (loadedStudents.length > 0) {
        setFocusedStudentId((prev) =>
          prev && loadedStudents.some((s) => s.id === prev) ? prev : loadedStudents[0].id
        );
      } else {
        setFocusedStudentId('');
      }

      const existingRecords = assessmentsByLessonId.get(activeLesson.id) ?? [];
      const recordByStudent = new Map(existingRecords.map((r) => [r.studentId, r]));

      setSlotDateInput(
        existingRecords[0]?.lessonDate ||
          activeLesson.lessonDate ||
          new Date().toISOString().slice(0, 10)
      );
      const subjName = subjectMap.get(activeLesson.subjectId)?.name ?? 'Môn học';
      setSlotTopicInput(
        existingRecords[0]?.lessonTopic ||
          activeLesson.lessonTitle ||
          `${subjName} · Tiết ${activeLesson.periodNumber} (${DAY_OF_WEEK_LABELS[activeLesson.dayOfWeek]})`
      );

      const nextDrafts: Record<string, StudentLessonDraft> = {};
      for (const stu of loadedStudents) {
        const rec = recordByStudent.get(stu.id);
        nextDrafts[stu.id] = rec
          ? {
              existingId: rec.id,
              ratingLevel: rec.ratingLevel,
              participationLevel: rec.participationLevel ?? 'MODERATE',
              criterionIds:
                rec.criterionIds && rec.criterionIds.length > 0
                  ? rec.criterionIds
                  : rec.criterionId
                    ? [rec.criterionId]
                    : [],
              knowledgeAndSkills: rec.knowledgeAndSkills ?? '',
              learningProduct: rec.learningProduct ?? '',
              difficulties: rec.difficulties ?? '',
              score: rec.score !== undefined ? String(rec.score) : '',
              comment: rec.comment ?? '',
            }
          : { ...DEFAULT_STUDENT_DRAFT };
      }
      setDraftsByStudent(nextDrafts);
    };

    void syncLessonDetails();
    return () => {
      cancelled = true;
    };
  }, [activeLesson?.id, allYearLessonAssessments]);

  // Available classes & subjects scoped for Progress Report
  const scopedClasses = useMemo(() => {
    const yearClasses = classes.filter(
      (c) => !c.isArchived && (!activeYear || c.academicYearId === activeYear.id)
    );
    if (!permissions.isScopedTeacher) return yearClasses;
    return yearClasses.filter((c) => permissions.allAllowedClassIds.has(c.id));
  }, [classes, activeYear, permissions]);

  const scopedSubjects = useMemo(() => {
    const activeSubjs = subjects.filter((s) => s.isActive);
    if (!permissions.isScopedTeacher) return activeSubjs;
    const allowedIds = new Set<string>();
    for (const cls of scopedClasses) {
      if (permissions.allowedHomeroomClassIds.has(cls.id)) {
        activeSubjs.forEach((s) => allowedIds.add(s.id));
      } else {
        const set = permissions.allowedSubjectIdsByClass.get(cls.id);
        set?.forEach((sid) => allowedIds.add(sid));
      }
    }
    return activeSubjs.filter((s) => allowedIds.has(s.id));
  }, [subjects, permissions, scopedClasses]);

  useEffect(() => {
    if (!progSubjectId && scopedSubjects.length > 0) {
      setProgSubjectId(activeLesson?.subjectId ?? scopedSubjects[0].id);
    }
    if (!progClassId && scopedClasses.length > 0) {
      setProgClassId(activeLesson?.classId ?? scopedClasses[0].id);
    }
  }, [scopedSubjects, scopedClasses, progSubjectId, progClassId, activeLesson]);

  useEffect(() => {
    if (!progClassId) {
      setProgClassStudents([]);
      setProgStudentId('');
      return;
    }
    void classStudentService.listStudents({ classId: progClassId }).then((res) => {
      if (res.ok) {
        setProgClassStudents(res.data);
        setProgStudentId((prev) =>
          prev && res.data.some((s) => s.id === prev) ? prev : (res.data[0]?.id ?? '')
        );
      }
    });
  }, [progClassId]);

  const studentProgressReport = useMemo(() => {
    if (!progStudentId || !progSubjectId) return null;
    return buildStudentSubjectProgressReport({
      assessments: allYearLessonAssessments,
      criteria,
      studentId: progStudentId,
      subjectId: progSubjectId,
    });
  }, [allYearLessonAssessments, criteria, progStudentId, progSubjectId]);

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const recordByStudent = useMemo(
    () => new Map(activeLessonRecords.map((r) => [r.studentId, r])),
    [activeLessonRecords]
  );

  const openLessonForAssessment = (lesson: TimetableLesson) => {
    setSelectedTimetableLessonId(lesson.id);
    setSearchParams({ timetableLessonId: lesson.id });
    setMainTab('assess');
  };

  const updateDraft = (stuId: string, updater: (prev: StudentLessonDraft) => StudentLessonDraft) => {
    setDraftsByStudent((prev) => ({
      ...prev,
      [stuId]: updater(prev[stuId] ?? DEFAULT_STUDENT_DRAFT),
    }));
  };

  const toggleCriterion = (stuId: string, criterionId: string) => {
    updateDraft(stuId, (prev) => {
      const exists = prev.criterionIds.includes(criterionId);
      return {
        ...prev,
        criterionIds: exists
          ? prev.criterionIds.filter((id) => id !== criterionId)
          : [...prev.criterionIds, criterionId],
      };
    });
  };

  const buildObservationInput = (stuId: string): SaveLessonObservationInput => {
    const draft = draftsByStudent[stuId] ?? DEFAULT_STUDENT_DRAFT;
    return {
      id: draft.existingId,
      academicYearId: activeYear?.id ?? activeLesson?.academicYearId ?? '',
      classId: activeLesson!.classId,
      timetableLessonId: activeLesson!.id,
      subjectId: activeLesson!.subjectId,
      teacherId: activeLesson!.teacherId ?? activeTeacher?.id,
      editorName: activeTeacher?.fullName ?? 'Quản trị viên',
      studentId: stuId,
      lessonDate: slotDateInput || activeLesson!.lessonDate || todayIso,
      lessonTopic: slotTopicInput.trim() || `Tiết ${activeLesson!.periodNumber} ${activeSubject?.name ?? ''}`.trim(),
      criterionIds: draft.criterionIds,
      ratingLevel: draft.ratingLevel,
      participationLevel: draft.participationLevel,
      knowledgeAndSkills: draft.knowledgeAndSkills,
      learningProduct: draft.learningProduct,
      difficulties: draft.difficulties,
      score: draft.score ? Number(draft.score) : undefined,
      comment: draft.comment,
    };
  };

  const handleSaveSingleStudent = async (stuId: string) => {
    if (!activeLesson) return;
    setSavingStudentId(stuId);
    const res = await lessonAssessmentService.saveSingleObservation(
      buildObservationInput(stuId),
      activeLesson.assessmentWorkflowStatus === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS'
    );
    setSavingStudentId(null);
    if (res.ok) {
      const name = studentMap.get(stuId)?.fullName ?? 'học sinh';
      notify('success', `Đã lưu đánh giá tiết học cho ${name}`);
      await loadAllBase();
    } else {
      notify('error', 'Không thể lưu đánh giá', res.error);
    }
  };

  const handleSaveBatch = async (workflowStatus: 'IN_PROGRESS' | 'SAVED' | 'COMPLETED') => {
    if (!activeLesson || students.length === 0) return;
    setSavingBatch(true);
    const inputs = students.map((stu) => buildObservationInput(stu.id));
    const res = await lessonAssessmentService.saveBatchObservations({
      inputs,
      timetableLessonId: activeLesson.id,
      workflowStatus,
      editorName: activeTeacher?.fullName ?? 'Quản trị viên',
    });
    setSavingBatch(false);
    if (res.ok) {
      notify(
        'success',
        `${LESSON_WORKFLOW_STATUS_LABELS[workflowStatus]} — ${res.data.length} học sinh`,
        'Mở lại tiết học này sẽ tự động tải dữ liệu cũ và lưu lịch sử chỉnh sửa, không tạo bản ghi trùng.'
      );
      await loadAllBase();
    } else {
      notify('error', 'Không thể lưu đánh giá cả lớp', res.error);
    }
  };

  const handleOpenCriteriaModal = (subjectId?: string) => {
    const targetSubjId = subjectId || activeLesson?.subjectId || scopedSubjects[0]?.id || '';
    setCritModalSubjectId(targetSubjId);
    setEditingCritId(null);
    setCritName('');
    setCritDesc('');
    setCriteriaModalOpen(true);
  };

  const modalSubjectCriteria = useMemo(() => {
    if (!critModalSubjectId) return [];
    return criteria.filter((c) => c.subjectId === critModalSubjectId);
  }, [criteria, critModalSubjectId]);

  const modalSubject = critModalSubjectId ? subjectMap.get(critModalSubjectId) : undefined;
  const isArtSubject = Boolean(
    modalSubject?.name.toLowerCase().includes('mĩ thuật') ||
      modalSubject?.name.toLowerCase().includes('mỹ thuật')
  );

  const handleSaveCustomCriterion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!critModalSubjectId) return;
    const res = editingCritId
      ? await lessonAssessmentService.updateSubjectCriterion(editingCritId, {
          name: critName,
          description: critDesc,
        })
      : await lessonAssessmentService.createSubjectCriterion({
          subjectId: critModalSubjectId,
          name: critName,
          description: critDesc,
        });

    if (res.ok) {
      notify('success', editingCritId ? 'Đã cập nhật tiêu chí môn học' : 'Đã thêm tiêu chí môn học');
      setEditingCritId(null);
      setCritName('');
      setCritDesc('');
      await loadAllBase();
    } else {
      notify('error', 'Không thể lưu tiêu chí', res.error);
    }
  };

  const activeLessonStatus = activeLesson
    ? computeTimetableLessonStatus({
        lesson: activeLesson,
        assessmentsForLesson: activeLessonRecords,
        today: todayIso,
      })
    : null;

  const focusedIdx = students.findIndex((s) => s.id === focusedStudentId);
  const focusedStudent = focusedIdx >= 0 ? students[focusedIdx] : null;
  const focusedDraft = focusedStudent ? draftsByStudent[focusedStudent.id] ?? DEFAULT_STUDENT_DRAFT : DEFAULT_STUDENT_DRAFT;
  const focusedSavedRecord = focusedStudent ? recordByStudent.get(focusedStudent.id) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đánh giá theo từng tiết học"
        description="Chọn tiết từ Thời khóa biểu của tôi để ghi nhận mức độ hoàn thành, tham gia, kỹ năng, sản phẩm và tiến bộ học sinh theo môn học."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenCriteriaModal()}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Tùy chỉnh tiêu chí môn
            </button>
          </div>
        }
      />

      {permissions.isScopedTeacher && activeTeacher && (
        <div className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-xs text-teal-900 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
          <span>
            Đang thao tác dưới hồ sơ <strong>{activeTeacher.fullName}</strong>: chỉ hiển thị các tiết học và báo cáo môn học thuộc nhiệm vụ được phân công ({scopedLessons.length} tiết trong TKB).
          </span>
        </div>
      )}

      {/* Tabs: Thời khóa biểu của tôi | Đánh giá tiết học | Báo cáo tiến bộ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setMainTab('schedule')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-medium whitespace-nowrap ${
              mainTab === 'schedule'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Thời khóa biểu của tôi ({scopedLessons.length})
          </button>
          <button
            type="button"
            onClick={() => setMainTab('assess')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-medium whitespace-nowrap ${
              mainTab === 'assess'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Đánh giá tiết học
          </button>
          <button
            type="button"
            onClick={() => setMainTab('progress')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-medium whitespace-nowrap ${
              mainTab === 'progress'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Báo cáo tiến bộ theo môn
          </button>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Bằng chứng quá trình thường xuyên theo môn — không tự động kết luận định kỳ hay trộn nhận xét chủ nhiệm.
        </p>
      </div>

      {/* TAB 1: THỜI KHÓA BIỂU CỦA TÔI */}
      {mainTab === 'schedule' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={LABEL_CLASS}>Thời khóa biểu / Tuần</label>
                <select
                  value={schedTimetableId}
                  onChange={(e) => setSchedTimetableId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Tất cả thời khóa biểu</option>
                  {timetables.map((tt) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.name} {tt.weekNumber ? `(Tuần ${tt.weekNumber})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Lớp học</label>
                <select
                  value={schedClassId}
                  onChange={(e) => setSchedClassId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Tất cả lớp</option>
                  {scopedClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Môn học</label>
                <select
                  value={schedSubjectId}
                  onChange={(e) => setSchedSubjectId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Tất cả môn học</option>
                  {scopedSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Trạng thái tiết học</label>
                <select
                  value={schedStatusFilter}
                  onChange={(e) => setSchedStatusFilter(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Tất cả trạng thái</option>
                  {Object.entries(LESSON_WORKFLOW_STATUS_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {filteredScheduleLessons.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Chưa có tiết học phù hợp trong Thời khóa biểu của tôi"
              description="Hãy tạo thời khóa biểu và xếp tiết dạy tại phân hệ Thời khóa biểu trước khi đánh giá theo tiết học."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Thứ / Ngày dạy</th>
                    <th className="px-4 py-3">Tiết</th>
                    <th className="px-4 py-3">Lớp</th>
                    <th className="px-4 py-3">Môn học</th>
                    <th className="px-4 py-3">Giáo viên & TKB</th>
                    <th className="px-4 py-3">Trạng thái đánh giá</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredScheduleLessons.map((l) => {
                    const recs = assessmentsByLessonId.get(l.id) ?? [];
                    const status = computeTimetableLessonStatus({
                      lesson: l,
                      assessmentsForLesson: recs,
                      today: todayIso,
                    });
                    const tt = timetableMap.get(l.timetableId);
                    const cls = classMap.get(l.classId);
                    const subj = subjectMap.get(l.subjectId);
                    const tchr = l.teacherId ? teacherMap.get(l.teacherId) : undefined;

                    return (
                      <tr key={l.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {DAY_OF_WEEK_LABELS[l.dayOfWeek]}
                          </div>
                          <div className="font-mono text-xs text-slate-500 tabular-nums">
                            {l.lessonDate || tt?.effectiveFrom || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                          Tiết {l.periodNumber}
                        </td>
                        <td className="px-4 py-3 font-medium">{cls?.name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-teal-800 dark:text-teal-300">
                            {subj?.name ?? '—'}
                          </div>
                          {l.lessonTitle && (
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {l.lessonTitle}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                          <div>{tchr?.fullName ?? 'Chưa gán GV'}</div>
                          <div className="text-[11px] text-slate-400">{tt?.name ?? ''}</div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div
                            className={`font-semibold ${
                              status === 'COMPLETED'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : status === 'SAVED'
                                  ? 'text-teal-700 dark:text-teal-400'
                                  : status === 'IN_PROGRESS'
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {LESSON_WORKFLOW_STATUS_LABELS[status]}
                          </div>
                          {recs.length > 0 && (
                            <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                              {recs.length} HS đã ghi nhận
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openLessonForAssessment(l)}
                            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap"
                          >
                            {status === 'SAVED' || status === 'COMPLETED' || status === 'IN_PROGRESS'
                              ? 'Mở lại / Sửa'
                              : 'Đánh giá tiết'}
                          </button>
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

      {/* TAB 2: ĐÁNH GIÁ TIẾT HỌC (2 CÁCH: BẢNG CẢ LỚP HOẶC TỪNG HỌC SINH) */}
      {mainTab === 'assess' && (
        <div className="space-y-4">
          {!activeLesson ? (
            <EmptyState
              icon={CalendarDays}
              title="Chưa chọn tiết học nào để đánh giá"
              description="Vui lòng mở mục Thời khóa biểu của tôi và bấm vào một tiết dạy để tự động nạp lớp, danh sách học sinh, môn học và tiêu chí."
              actionLabel="Mở Thời khóa biểu của tôi"
              onAction={() => setMainTab('schedule')}
            />
          ) : (
            <>
              {/* Lesson Header Card */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                      <span>{activeSubject?.name ?? 'Môn học'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeClass?.name ?? 'Lớp học'}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {DAY_OF_WEEK_LABELS[activeLesson.dayOfWeek]}, Tiết {activeLesson.periodNumber}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Giáo viên phụ trách:{' '}
                        <strong className="font-medium text-slate-700 dark:text-slate-200">
                          {activeLesson.teacherId
                            ? teacherMap.get(activeLesson.teacherId)?.fullName ?? '—'
                            : activeTeacher?.fullName ?? 'Chưa gán giáo viên'}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Trạng thái tiết:{' '}
                        <strong className="font-semibold text-teal-700 dark:text-teal-400">
                          {activeLessonStatus
                            ? LESSON_WORKFLOW_STATUS_LABELS[activeLessonStatus]
                            : 'Chưa đánh giá'}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        Tiêu chí môn: {activeLessonCriteria.length} tiêu chí
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenCriteriaModal(activeLesson.subjectId)}
                        className="font-medium text-teal-700 hover:underline dark:text-teal-400"
                      >
                        (Tùy chỉnh)
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMainTab('schedule')}
                      className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                    >
                      Đổi tiết khác
                    </button>
                    {assessViewMode === 'table' && students.length > 0 && (
                      <>
                        <button
                          type="button"
                          disabled={savingBatch}
                          onClick={() => void handleSaveBatch('IN_PROGRESS')}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                        >
                          Lưu nháp (Đang ĐG)
                        </button>
                        <button
                          type="button"
                          disabled={savingBatch}
                          onClick={() => void handleSaveBatch('SAVED')}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Lưu đánh giá
                        </button>
                        <button
                          type="button"
                          disabled={savingBatch}
                          onClick={() => void handleSaveBatch('COMPLETED')}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Hoàn thành tiết
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <div>
                    <label className={LABEL_CLASS}>Ngày dạy *</label>
                    <input
                      type="date"
                      value={slotDateInput}
                      onChange={(e) => setSlotDateInput(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={LABEL_CLASS}>Tên bài học / Chủ đề tiết dạy *</label>
                    <input
                      value={slotTopicInput}
                      onChange={(e) => setSlotTopicInput(e.target.value)}
                      placeholder="VD: Vẽ tranh đề tài ngày hội trường"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="inline-flex w-full rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() => setAssessViewMode('table')}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                          assessViewMode === 'table'
                            ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Users className="h-3.5 w-3.5" />
                        Cả lớp
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssessViewMode('student')}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                          assessViewMode === 'student'
                            ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Từng HS
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {students.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={`Lớp ${activeClass?.name ?? ''} chưa có học sinh`}
                  description="Vui lòng bổ sung danh sách học sinh vào lớp trước khi chấm tiết học."
                />
              ) : assessViewMode === 'table' ? (
                /* CÁCH 1: ĐÁNH GIÁ CẢ LỚP BẰNG BẢNG */
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <table className="w-full min-w-[1200px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                      <tr>
                        <th className="w-10 px-3 py-3">STT</th>
                        <th className="w-44 px-3 py-3">Học sinh</th>
                        <th className="w-44 px-3 py-3">Hoàn thành & Tham gia</th>
                        <th className="w-72 px-3 py-3">Tiêu chí môn {activeSubject?.name ?? ''}</th>
                        <th className="w-60 px-3 py-3">Kiến thức/Kỹ năng & Sản phẩm</th>
                        <th className="w-60 px-3 py-3">Khó khăn & Nhận xét riêng</th>
                        {activeSubject?.assessmentMode === SubjectAssessmentMode.COMMENT_AND_SCORE && (
                          <th className="w-20 px-3 py-3">Điểm</th>
                        )}
                        <th className="w-32 px-3 py-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {students.map((stu, idx) => {
                        const draft = draftsByStudent[stu.id] ?? DEFAULT_STUDENT_DRAFT;
                        const savedRec = recordByStudent.get(stu.id);
                        return (
                          <tr key={stu.id} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            <td className="px-3 py-3 font-mono text-xs tabular-nums text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-3">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {stu.fullName}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500">{stu.studentCode}</div>
                              {savedRec?.savedAt && (
                                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 tabular-nums">
                                  <Clock className="h-3 w-3 shrink-0" />
                                  <span>{formatDateTimeVi(savedRec.savedAt)}</span>
                                </div>
                              )}
                              {savedRec?.editHistory && savedRec.editHistory.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setHistoryModalRecord(savedRec)}
                                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-400"
                                >
                                  <History className="h-3 w-3" />
                                  Lịch sử ({savedRec.editHistory.length})
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-3 space-y-2">
                              <select
                                aria-label={`Mức độ hoàn thành ${stu.fullName}`}
                                value={draft.ratingLevel}
                                onChange={(e) =>
                                  updateDraft(stu.id, (prev) => ({
                                    ...prev,
                                    ratingLevel: e.target.value as AssessmentRatingLevel,
                                  }))
                                }
                                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                              >
                                {LESSON_COMPLETION_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                aria-label={`Mức độ tham gia ${stu.fullName}`}
                                value={draft.participationLevel}
                                onChange={(e) =>
                                  updateDraft(stu.id, (prev) => ({
                                    ...prev,
                                    participationLevel: e.target.value as LessonParticipationLevel,
                                  }))
                                }
                                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                              >
                                {Object.entries(LESSON_PARTICIPATION_LABELS).map(([k, label]) => (
                                  <option key={k} value={k}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-3">
                              {activeLessonCriteria.length === 0 ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenCriteriaModal(activeLesson.subjectId)}
                                  className="text-xs text-teal-700 hover:underline dark:text-teal-400"
                                >
                                  + Thiết lập tiêu chí môn này
                                </button>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {activeLessonCriteria.map((cr) => {
                                    const active = draft.criterionIds.includes(cr.id);
                                    return (
                                      <button
                                        key={cr.id}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => toggleCriterion(stu.id, cr.id)}
                                        className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                                          active
                                            ? 'border-teal-600 bg-teal-50 text-teal-900 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-200'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-teal-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                        }`}
                                      >
                                        {active ? '✓ ' : '+ '}
                                        {cr.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 space-y-1.5">
                              <input
                                value={draft.knowledgeAndSkills}
                                onChange={(e) =>
                                  updateDraft(stu.id, (prev) => ({
                                    ...prev,
                                    knowledgeAndSkills: e.target.value,
                                  }))
                                }
                                placeholder="Kiến thức / kỹ năng thể hiện..."
                                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                              <input
                                value={draft.learningProduct}
                                onChange={(e) =>
                                  updateDraft(stu.id, (prev) => ({
                                    ...prev,
                                    learningProduct: e.target.value,
                                  }))
                                }
                                placeholder="Sản phẩm học tập (nếu có)..."
                                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                            </td>
                            <td className="px-3 py-3 space-y-1.5">
                              <input
                                value={draft.difficulties}
                                onChange={(e) =>
                                  updateDraft(stu.id, (prev) => ({
                                    ...prev,
                                    difficulties: e.target.value,
                                  }))
                                }
                                placeholder="Khó khăn cần hỗ trợ..."
                                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                              <input
                                value={draft.comment}
                                onChange={(e) =>
                                  updateDraft(stu.id, (prev) => ({
                                    ...prev,
                                    comment: e.target.value,
                                  }))
                                }
                                placeholder="Nhận xét riêng..."
                                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                            </td>
                            {activeSubject?.assessmentMode === SubjectAssessmentMode.COMMENT_AND_SCORE && (
                              <td className="px-3 py-3">
                                <input
                                  type="number"
                                  step="0.5"
                                  min={0}
                                  max={10}
                                  value={draft.score}
                                  onChange={(e) =>
                                    updateDraft(stu.id, (prev) => ({
                                      ...prev,
                                      score: e.target.value,
                                    }))
                                  }
                                  placeholder="—"
                                  className="h-8 w-16 rounded-lg border border-slate-300 bg-white px-2 text-xs font-mono tabular-nums dark:border-slate-700 dark:bg-slate-800"
                                />
                              </td>
                            )}
                            <td className="px-3 py-3 text-right">
                              <div className="flex flex-col items-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={savingStudentId === stu.id}
                                  onClick={() => void handleSaveSingleStudent(stu.id)}
                                  className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
                                >
                                  <Save className="h-3 w-3" />
                                  Lưu HS
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFocusedStudentId(stu.id);
                                    setAssessViewMode('student');
                                  }}
                                  className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
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
              ) : (
                /* CÁCH 2: ĐÁNH GIÁ TỪNG HỌC SINH (DÙNG CHUNG DỮ LIỆU) */
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                      <button
                        type="button"
                        disabled={focusedIdx <= 0}
                        onClick={() => {
                          if (focusedIdx > 0) setFocusedStudentId(students[focusedIdx - 1].id);
                        }}
                        aria-label="Học sinh trước"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <select
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
                        disabled={focusedIdx < 0 || focusedIdx >= students.length - 1}
                        onClick={() => {
                          if (focusedIdx >= 0 && focusedIdx < students.length - 1) {
                            setFocusedStudentId(students[focusedIdx + 1].id);
                          }
                        }}
                        aria-label="Học sinh tiếp theo"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    {focusedSavedRecord?.savedAt && (
                      <div className="text-xs text-slate-500 tabular-nums">
                        Lưu lần cuối: <strong>{formatDateTimeVi(focusedSavedRecord.savedAt)}</strong>
                      </div>
                    )}
                  </div>

                  {focusedStudent && (
                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-5">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div>
                          <label className={LABEL_CLASS}>Mức độ hoàn thành nhiệm vụ</label>
                          <select
                            value={focusedDraft.ratingLevel}
                            onChange={(e) =>
                              updateDraft(focusedStudent.id, (prev) => ({
                                ...prev,
                                ratingLevel: e.target.value as AssessmentRatingLevel,
                              }))
                            }
                            className={INPUT_CLASS}
                          >
                            {LESSON_COMPLETION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={LABEL_CLASS}>Mức độ tham gia tiết học</label>
                          <select
                            value={focusedDraft.participationLevel}
                            onChange={(e) =>
                              updateDraft(focusedStudent.id, (prev) => ({
                                ...prev,
                                participationLevel: e.target.value as LessonParticipationLevel,
                              }))
                            }
                            className={INPUT_CLASS}
                          >
                            {Object.entries(LESSON_PARTICIPATION_LABELS).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={LABEL_CLASS}>Điểm luyện tập (nếu môn có chấm điểm)</label>
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            max={10}
                            value={focusedDraft.score}
                            onChange={(e) =>
                              updateDraft(focusedStudent.id, (prev) => ({
                                ...prev,
                                score: e.target.value,
                              }))
                            }
                            placeholder="Không bắt buộc"
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className={LABEL_CLASS}>
                            Tiêu chí môn {activeSubject?.name ?? ''} ({activeLessonCriteria.length})
                          </label>
                          <button
                            type="button"
                            onClick={() => handleOpenCriteriaModal(activeLesson.subjectId)}
                            className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                          >
                            + Tùy chỉnh tiêu chí môn này
                          </button>
                        </div>
                        {activeLessonCriteria.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800">
                            Môn học này chưa có tiêu chí riêng. Nhấn Tùy chỉnh tiêu chí môn này để thiết lập (VD: 7 tiêu chí môn Mĩ thuật).
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {activeLessonCriteria.map((cr) => {
                              const checked = focusedDraft.criterionIds.includes(cr.id);
                              return (
                                <label
                                  key={cr.id}
                                  className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs transition ${
                                    checked
                                      ? 'border-teal-600 bg-teal-50/80 text-teal-950 dark:border-teal-500 dark:bg-teal-950/40 dark:text-teal-100'
                                      : 'border-slate-200 text-slate-700 hover:border-teal-400 dark:border-slate-800 dark:text-slate-300'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleCriterion(focusedStudent.id, cr.id)}
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
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className={LABEL_CLASS}>Kiến thức và kỹ năng thể hiện</label>
                          <input
                            value={focusedDraft.knowledgeAndSkills}
                            onChange={(e) =>
                              updateDraft(focusedStudent.id, (prev) => ({
                                ...prev,
                                knowledgeAndSkills: e.target.value,
                              }))
                            }
                            placeholder="VD: Sử dụng đường nét dứt khoát, phối màu hài hòa..."
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div>
                          <label className={LABEL_CLASS}>Sản phẩm học tập (nếu có)</label>
                          <input
                            value={focusedDraft.learningProduct}
                            onChange={(e) =>
                              updateDraft(focusedStudent.id, (prev) => ({
                                ...prev,
                                learningProduct: e.target.value,
                              }))
                            }
                            placeholder="VD: Tranh vẽ A4 hoàn chỉnh, phiếu bài tập nhóm..."
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className={LABEL_CLASS}>Khó khăn cần hỗ trợ</label>
                          <textarea
                            rows={2}
                            value={focusedDraft.difficulties}
                            onChange={(e) =>
                              updateDraft(focusedStudent.id, (prev) => ({
                                ...prev,
                                difficulties: e.target.value,
                              }))
                            }
                            placeholder="Điểm học sinh còn lúng túng cần hướng dẫn thêm..."
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div>
                          <label className={LABEL_CLASS}>Nhận xét riêng của giáo viên</label>
                          <textarea
                            rows={2}
                            value={focusedDraft.comment}
                            onChange={(e) =>
                              updateDraft(focusedStudent.id, (prev) => ({
                                ...prev,
                                comment: e.target.value,
                              }))
                            }
                            placeholder="Nhận xét khích lệ sự cố gắng và tiến bộ của học sinh..."
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
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

                      {focusedSavedRecord?.editHistory && focusedSavedRecord.editHistory.length > 0 && (
                        <div className="border-t border-slate-100 pt-4 dark:border-slate-800 space-y-2">
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Lịch sử thay đổi ({focusedSavedRecord.editHistory.length} lần)
                          </div>
                          <div className="space-y-1.5">
                            {focusedSavedRecord.editHistory.map((entry, idx) => (
                              <div
                                key={`${entry.editedAt}-${idx}`}
                                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/40"
                              >
                                <div className="flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
                                  <span className="font-mono tabular-nums">
                                    {formatDateTimeVi(entry.editedAt)}
                                  </span>
                                  <span>Người sửa: {entry.editorName ?? 'Giáo viên'}</span>
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
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 3: BÁO CÁO TIẾN BỘ THEO HỌC SINH VÀ MÔN HỌC */}
      {mainTab === 'progress' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className={LABEL_CLASS}>Môn học *</label>
                <select
                  value={progSubjectId}
                  onChange={(e) => setProgSubjectId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  {scopedSubjects.length === 0 && <option value="">Chưa có môn thuộc phân công</option>}
                  {scopedSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Lớp học *</label>
                <select
                  value={progClassId}
                  onChange={(e) => setProgClassId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  {scopedClasses.length === 0 && <option value="">Chưa có lớp thuộc phân công</option>}
                  {scopedClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Học sinh *</label>
                <select
                  value={progStudentId}
                  onChange={(e) => setProgStudentId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  {progClassStudents.length === 0 && <option value="">Lớp chưa có học sinh</option>}
                  {progClassStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.studentCode})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {!studentProgressReport || studentProgressReport.totalEvaluations === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="Chưa có dữ liệu tiến bộ môn học cho học sinh này"
              description="Hãy thực hiện đánh giá theo tiết học từ Thời khóa biểu của tôi để hệ thống tổng hợp số lần đánh giá, điểm mạnh và quá trình tiến bộ theo môn."
            />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500">Số lần được đánh giá môn</div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                    {studentProgressReport.totalEvaluations} tiết
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500">Điểm mạnh ghi nhận</div>
                  <div className="mt-1 text-2xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                    {studentProgressReport.strengths.length} tiêu chí/kỹ năng
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-xs text-slate-500">Nội dung cần hỗ trợ</div>
                  <div className="mt-1 text-2xl font-semibold text-amber-700 tabular-nums dark:text-amber-400">
                    {studentProgressReport.supportNeeds.length} ghi nhận
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-400">
                    Các điểm mạnh & Kỹ năng thể hiện tốt
                  </div>
                  {studentProgressReport.strengths.length === 0 ? (
                    <p className="text-xs text-slate-500">Chưa có tiêu chí điểm mạnh cụ thể.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {studentProgressReport.strengths.map((st, idx) => (
                        <div key={`${st.label}-${idx}`} className="flex items-center justify-between text-xs">
                          <span className="text-slate-800 dark:text-slate-200">{st.label}</span>
                          <span className="font-mono font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                            {st.count} lần
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
                    Các nội dung cần hỗ trợ thêm
                  </div>
                  {studentProgressReport.supportNeeds.length === 0 ? (
                    <p className="text-xs text-slate-500">Chưa ghi nhận khó khăn cần hỗ trợ đặc biệt.</p>
                  ) : (
                    <div className="space-y-2">
                      {studentProgressReport.supportNeeds.map((sp, idx) => (
                        <div key={`${sp.lessonDate}-${idx}`} className="text-xs">
                          <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {sp.lessonDate} · {sp.lessonTopic}
                          </div>
                          <div className="text-slate-800 dark:text-slate-200">{sp.difficulty}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  Quá trình tiến bộ & Nhận xét theo thời gian (chỉ từ các tiết {subjectMap.get(progSubjectId)?.name ?? 'môn học'})
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Ngày dạy</th>
                      <th className="px-4 py-3">Bài học</th>
                      <th className="px-4 py-3">Hoàn thành & Tham gia</th>
                      <th className="px-4 py-3">Tiêu chí & Sản phẩm</th>
                      <th className="px-4 py-3">Nhận xét theo thời gian</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {studentProgressReport.timeline.map((rec) => (
                      <tr key={rec.id} className="align-top">
                        <td className="px-4 py-3 font-mono text-xs tabular-nums whitespace-nowrap">
                          {rec.lessonDate}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {rec.lessonTopic}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-semibold text-teal-800 dark:text-teal-300">
                            {RATING_LEVEL_LABELS[rec.ratingLevel]}
                          </div>
                          {rec.participationLevel && (
                            <div className="text-slate-500">
                              {LESSON_PARTICIPATION_LABELS[rec.participationLevel]}
                            </div>
                          )}
                          {rec.score !== undefined && (
                            <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              Điểm: {rec.score}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                          {rec.criterionLabelsSnapshot && rec.criterionLabelsSnapshot.length > 0 && (
                            <div>{rec.criterionLabelsSnapshot.join(', ')}</div>
                          )}
                          {rec.learningProduct && (
                            <div className="text-slate-500">SP: {rec.learningProduct}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                          {rec.comment || rec.knowledgeAndSkills || '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {rec.editHistory && rec.editHistory.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setHistoryModalRecord(rec)}
                                className="text-xs font-medium text-slate-600 hover:underline dark:text-slate-400"
                              >
                                Sửa ({rec.editHistory.length})
                              </button>
                            )}
                            {rec.timetableLessonId && (
                              <button
                                type="button"
                                onClick={() => {
                                  const match = timetableLessons.find(
                                    (l) => l.id === rec.timetableLessonId
                                  );
                                  if (match) {
                                    setFocusedStudentId(rec.studentId);
                                    openLessonForAssessment(match);
                                  }
                                }}
                                className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                              >
                                Mở tiết
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: LỊCH SỬ CHỈNH SỬA TIẾT HỌC */}
      <Modal
        isOpen={Boolean(historyModalRecord)}
        title={`Lịch sử thay đổi — ${historyModalRecord?.lessonTopic ?? ''}`}
        onClose={() => setHistoryModalRecord(null)}
      >
        <div className="space-y-3">
          {!historyModalRecord?.editHistory || historyModalRecord.editHistory.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có lịch sử chỉnh sửa.</p>
          ) : (
            historyModalRecord.editHistory.map((entry, idx) => (
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

      {/* MODAL: TÙY CHỈNH TIÊU CHÍ THEO MÔN HỌC */}
      <Modal
        isOpen={criteriaModalOpen}
        title="Tùy chỉnh bộ tiêu chí theo môn học"
        onClose={() => setCriteriaModalOpen(false)}
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className={LABEL_CLASS}>Chọn môn học cần cấu hình tiêu chí</label>
              <select
                value={critModalSubjectId}
                onChange={(e) => {
                  setCritModalSubjectId(e.target.value);
                  setEditingCritId(null);
                  setCritName('');
                  setCritDesc('');
                }}
                className={INPUT_CLASS}
              >
                {subjects
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            {isArtSubject && (
              <button
                type="button"
                onClick={async () => {
                  const res = await lessonAssessmentService.applyArtSampleCriteria(critModalSubjectId);
                  if (res.ok) {
                    notify('success', `Đã nạp ${res.data.length} tiêu chí mẫu cho môn Mĩ thuật`);
                    await loadAllBase();
                  } else {
                    notify('error', 'Không thể nạp bộ tiêu chí mẫu', res.error);
                  }
                }}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-teal-600 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-100 dark:border-teal-500 dark:bg-teal-950/50 dark:text-teal-200"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Nạp 7 tiêu chí gợi ý môn Mĩ thuật
              </button>
            )}
          </div>

          <form
            onSubmit={(e) => void handleSaveCustomCriterion(e)}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-3"
          >
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {editingCritId
                ? `Sửa tiêu chí cho môn ${modalSubject?.name ?? ''}`
                : `Thêm tiêu chí mới cho môn ${modalSubject?.name ?? ''}`}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLASS}>Tên tiêu chí *</label>
                <input
                  required
                  value={critName}
                  onChange={(e) => setCritName(e.target.value)}
                  placeholder="VD: Biết sử dụng đường nét / Giải toán có lời văn..."
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Mô tả biểu hiện (tùy chọn)</label>
                <input
                  value={critDesc}
                  onChange={(e) => setCritDesc(e.target.value)}
                  placeholder="Gợi ý quan sát trong tiết học..."
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              {editingCritId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCritId(null);
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
                {editingCritId ? 'Lưu tiêu chí' : 'Thêm tiêu chí môn'}
              </button>
            </div>
          </form>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {modalSubjectCriteria.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                Môn {modalSubject?.name ?? ''} chưa có tiêu chí riêng nào. Bạn có thể thêm mới phía trên.
              </div>
            ) : (
              modalSubjectCriteria.map((cr) => (
                <div
                  key={cr.id}
                  className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs ${
                    cr.isHidden ? 'opacity-55 bg-slate-50/70 dark:bg-slate-900' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {cr.name} {cr.isHidden && <span className="text-slate-500">(Đang ẩn)</span>}
                    </div>
                    {cr.description && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {cr.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCritId(cr.id);
                        setCritName(cr.name);
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
                        const res = await lessonAssessmentService.updateSubjectCriterion(cr.id, {
                          isHidden: !cr.isHidden,
                        });
                        if (res.ok) {
                          notify('success', cr.isHidden ? `Đã hiện lại "${cr.name}"` : `Đã ẩn "${cr.name}"`);
                          await loadAllBase();
                        } else {
                          notify('error', 'Không thể cập nhật tiêu chí', res.error);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                    >
                      {cr.isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      {cr.isHidden ? 'Hiện' : 'Ẩn'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
