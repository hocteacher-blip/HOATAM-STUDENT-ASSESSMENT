import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  CheckSquare,
  Copy,
  Download,
  Edit2,
  Grid,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { curriculumService } from '../services/curriculumService';
import {
  buildTimetableImportPreview,
  exportTimetableExcel,
  exportTimetableTemplateExcel,
  readExcelWorkbook,
  type TimetableImportPreviewRow,
} from '../services/importExportService';
import {
  addDaysIso,
  computeLessonDateForWeekday,
  DEFAULT_PERIOD_TIMES,
  detectLessonConflicts,
  getTeacherLessonScopeOptions,
  timetableService,
} from '../services/timetableService';
import {
  DayOfWeek,
  type PeriodTimeSlot,
  type Subject,
  type Timetable,
  type TimetableLesson,
} from '../types/models';
import { DAY_OF_WEEK_LABELS, INPUT_CLASS, LABEL_CLASS } from '../utils/labels';

const ALL_WEEKDAYS: DayOfWeek[] = [
  DayOfWeek.MON,
  DayOfWeek.TUE,
  DayOfWeek.WED,
  DayOfWeek.THU,
  DayOfWeek.FRI,
  DayOfWeek.SAT,
];

function createDefaultSlotTimes(periodsPerDay: number): PeriodTimeSlot[] {
  return Array.from({ length: periodsPerDay }, (_, idx) => {
    const p = idx + 1;
    const preset = DEFAULT_PERIOD_TIMES.find((d) => d.periodNumber === p);
    return (
      preset ?? {
        periodNumber: p,
        startTime: p <= 4 ? '10:30' : '16:15',
        endTime: p <= 4 ? '11:05' : '16:50',
        session: p <= 4 ? 'MORNING' : 'AFTERNOON',
      }
    );
  });
}

export const TimetablePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { notify } = useNotification();
  const {
    activeYear,
    classes,
    teachers,
    teacherAssignments,
    activeTeacher,
    permissions,
  } = useWorkspace();

  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [allYearLessons, setAllYearLessons] = useState<TimetableLesson[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeTimetableId, setActiveTimetableId] = useState('');

  // Filters & view state
  const [viewMode, setViewMode] = useState<'week' | 'calendar'>('week');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTeacherId, setFilterTeacherId] = useState('');
  const [filterClassId, setFilterClassId] = useState('');
  const [filterSubjectId, setFilterSubjectId] = useState('');

  // Create / Edit Timetable modal
  const [ttModal, setTtModal] = useState(false);
  const [editingTtId, setEditingTtId] = useState<string | null>(null);
  const [ttName, setTtName] = useState('');
  const [ttTeacherId, setTtTeacherId] = useState('');
  const [ttClassId, setTtClassId] = useState('');
  const [ttWeekNumber, setTtWeekNumber] = useState('1');
  const [ttFrom, setTtFrom] = useState(new Date().toISOString().slice(0, 10));
  const [ttTo, setTtTo] = useState(addDaysIso(new Date().toISOString().slice(0, 10), 4));
  const [ttDays, setTtDays] = useState<DayOfWeek[]>([
    DayOfWeek.MON,
    DayOfWeek.TUE,
    DayOfWeek.WED,
    DayOfWeek.THU,
    DayOfWeek.FRI,
  ]);
  const [ttPeriodsPerDay, setTtPeriodsPerDay] = useState(7);
  const [ttUseTimes, setTtUseTimes] = useState(true);
  const [ttPeriodTimes, setTtPeriodTimes] = useState<PeriodTimeSlot[]>(createDefaultSlotTimes(7));

  // Add / Edit Lesson modal
  const [lessonModal, setLessonModal] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [slotDay, setSlotDay] = useState<DayOfWeek>(DayOfWeek.MON);
  const [slotPeriod, setSlotPeriod] = useState(1);
  const [slotDate, setSlotDate] = useState('');
  const [slotTeacherId, setSlotTeacherId] = useState('');
  const [slotClassId, setSlotClassId] = useState('');
  const [slotSubjectId, setSlotSubjectId] = useState('');
  const [slotRoom, setSlotRoom] = useState('');
  const [slotTitle, setSlotTitle] = useState('');
  const [confirmOverwriteConflict, setConfirmOverwriteConflict] = useState(false);

  // Copy Timetable / Copy Last Week modal
  const [copyModal, setCopyModal] = useState(false);
  const [copySourceId, setCopySourceId] = useState('');
  const [copyName, setCopyName] = useState('');
  const [copyWeek, setCopyWeek] = useState('2');
  const [copyFrom, setCopyFrom] = useState('');
  const [copyTo, setCopyTo] = useState('');
  const [copyTeacherId, setCopyTeacherId] = useState('');

  // Assign teacher to existing timetable modal (Admin)
  const [assignModal, setAssignModal] = useState(false);
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [assignApplyLessons, setAssignApplyLessons] = useState(true);

  // Import Excel modal
  const [importModal, setImportModal] = useState(false);
  const [importRows, setImportRows] = useState<TimetableImportPreviewRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  // Delete confirm
  const [deleteTtTarget, setDeleteTtTarget] = useState<Timetable | null>(null);

  const loadData = async () => {
    const [subRes, ttRes, lessonRes] = await Promise.all([
      curriculumService.listSubjects(),
      timetableService.listTimetables(activeYear ? { academicYearId: activeYear.id } : undefined),
      timetableService.listLessons(activeYear ? { academicYearId: activeYear.id } : undefined),
    ]);
    if (subRes.ok) setSubjects(subRes.data);
    if (ttRes.ok) setTimetables(ttRes.data);
    if (lessonRes.ok) setAllYearLessons(lessonRes.data);
  };

  useEffect(() => {
    void loadData();
  }, [activeYear?.id]);

  // Pre-filter if scoped teacher
  useEffect(() => {
    if (permissions.isScopedTeacher && activeTeacher) {
      setFilterTeacherId(activeTeacher.id);
    }
  }, [permissions.isScopedTeacher, activeTeacher]);

  const activeClasses = useMemo(
    () =>
      classes.filter((c) => !c.isArchived && (!activeYear || c.academicYearId === activeYear.id)),
    [classes, activeYear]
  );
  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const timetablesById = useMemo(() => new Map(timetables.map((t) => [t.id, t])), [timetables]);

  // Visible timetables based on role & search/filter
  const visibleTimetables = useMemo(() => {
    const lessonsByTt = new Map<string, TimetableLesson[]>();
    for (const l of allYearLessons) {
      const arr = lessonsByTt.get(l.timetableId) ?? [];
      arr.push(l);
      lessonsByTt.set(l.timetableId, arr);
    }

    return timetables.filter((tt) => {
      const ttLessons = lessonsByTt.get(tt.id) ?? [];

      if (permissions.isScopedTeacher && activeTeacher) {
        const isMyTt =
          tt.teacherId === activeTeacher.id ||
          (tt.classId && permissions.allAllowedClassIds.has(tt.classId)) ||
          ttLessons.some(
            (l) =>
              l.teacherId === activeTeacher.id || permissions.allAllowedClassIds.has(l.classId)
          );
        if (!isMyTt) return false;
      }

      if (filterTeacherId) {
        if (filterTeacherId === '__UNASSIGNED__') {
          if (tt.teacherId) return false;
        } else if (
          tt.teacherId !== filterTeacherId &&
          !ttLessons.some((l) => l.teacherId === filterTeacherId)
        ) {
          return false;
        }
      }

      if (filterClassId) {
        if (tt.classId !== filterClassId && !ttLessons.some((l) => l.classId === filterClassId)) {
          return false;
        }
      }

      if (filterSubjectId) {
        if (!ttLessons.some((l) => l.subjectId === filterSubjectId)) {
          return false;
        }
      }

      return true;
    });
  }, [
    timetables,
    allYearLessons,
    permissions,
    activeTeacher,
    filterTeacherId,
    filterClassId,
    filterSubjectId,
  ]);

  const appliedQueryParamRef = useRef<string | null>(null);

  // Sync URL param timetableId / classId or pick first visible
  useEffect(() => {
    const paramTtId = searchParams.get('timetableId');
    const paramClassId = searchParams.get('classId');
    const queryKey = paramTtId ? `tt:${paramTtId}` : paramClassId ? `cls:${paramClassId}` : '';

    if (queryKey && queryKey !== appliedQueryParamRef.current) {
      if (paramTtId && visibleTimetables.some((t) => t.id === paramTtId)) {
        appliedQueryParamRef.current = queryKey;
        setActiveTimetableId(paramTtId);
        return;
      }
      if (paramClassId) {
        const matchingTt = visibleTimetables.find((t) => t.classId === paramClassId);
        if (matchingTt) {
          appliedQueryParamRef.current = queryKey;
          setActiveTimetableId(matchingTt.id);
          return;
        }
      }
    }
    if (visibleTimetables.length === 0) {
      setActiveTimetableId('');
    } else if (!activeTimetableId || !visibleTimetables.some((t) => t.id === activeTimetableId)) {
      setActiveTimetableId(visibleTimetables[0].id);
    }
  }, [visibleTimetables, activeTimetableId, searchParams]);

  const activeTimetable = useMemo(
    () => timetables.find((t) => t.id === activeTimetableId) ?? null,
    [timetables, activeTimetableId]
  );

  // Filter lessons inside activeTimetable by search/class/subject/teacher
  const activeTimetableLessons = useMemo(() => {
    if (!activeTimetable) return [];
    const q = searchQuery.trim().toLowerCase();

    return allYearLessons.filter((l) => {
      if (l.timetableId !== activeTimetable.id) return false;
      if (filterClassId && l.classId !== filterClassId) return false;
      if (filterSubjectId && l.subjectId !== filterSubjectId) return false;
      if (filterTeacherId && filterTeacherId !== '__UNASSIGNED__' && l.teacherId !== filterTeacherId) {
        return false;
      }
      if (q) {
        const clsName = classMap.get(l.classId)?.name.toLowerCase() ?? '';
        const subjName = subjectMap.get(l.subjectId)?.name.toLowerCase() ?? '';
        const tName = l.teacherId ? teacherMap.get(l.teacherId)?.fullName.toLowerCase() ?? '' : '';
        const room = (l.roomName ?? '').toLowerCase();
        const title = (l.lessonTitle ?? '').toLowerCase();
        if (
          !clsName.includes(q) &&
          !subjName.includes(q) &&
          !tName.includes(q) &&
          !room.includes(q) &&
          !title.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    activeTimetable,
    allYearLessons,
    filterClassId,
    filterSubjectId,
    filterTeacherId,
    searchQuery,
    classMap,
    subjectMap,
    teacherMap,
  ]);

  // Compute conflict report for every lesson in activeTimetable
  const conflictMapByLessonId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const l of activeTimetableLessons) {
      const report = detectLessonConflicts({
        candidate: {
          id: l.id,
          timetableId: l.timetableId,
          academicYearId: l.academicYearId,
          classId: l.classId,
          dayOfWeek: l.dayOfWeek,
          periodNumber: l.periodNumber,
          lessonDate: l.lessonDate,
          teacherId: l.teacherId,
          roomName: l.roomName,
        },
        allLessons: allYearLessons,
        timetablesById,
        classesById: classMap,
      });
      const messages = [
        ...report.teacherConflicts.map((c) => c.message),
        ...report.roomConflicts.map((c) => c.message),
      ];
      if (messages.length > 0) map.set(l.id, messages);
    }
    return map;
  }, [activeTimetableLessons, allYearLessons, timetablesById, classMap]);

  const canManageActiveTimetable = Boolean(
    activeTimetable &&
      (permissions.canManageAssignments ||
        (activeTeacher && activeTimetable.teacherId === activeTeacher.id) ||
        (activeTimetable.classId && permissions.allowedHomeroomClassIds.has(activeTimetable.classId)))
  );

  // Assignment-scoped options for Lesson modal
  const lessonScope = useMemo(
    () =>
      getTeacherLessonScopeOptions({
        teacherId: slotTeacherId || undefined,
        academicYearId: activeYear?.id,
        assignments: teacherAssignments,
        classes,
        subjects,
        allowUnassignedAdmin: permissions.canManageAssignments,
      }),
    [slotTeacherId, activeYear?.id, teacherAssignments, classes, subjects, permissions.canManageAssignments]
  );

  const allowedLessonSubjects = useMemo(() => {
    if (!slotClassId) return [];
    return lessonScope.getAllowedSubjectsForClass(slotClassId);
  }, [lessonScope, slotClassId]);

  useEffect(() => {
    if (!lessonModal) return;
    if (lessonScope.allowedClasses.length === 0) {
      setSlotClassId('');
    } else if (!slotClassId || !lessonScope.allowedClasses.some((c) => c.id === slotClassId)) {
      setSlotClassId(lessonScope.allowedClasses[0].id);
    }
  }, [lessonModal, lessonScope.allowedClasses, slotClassId]);

  useEffect(() => {
    if (!lessonModal) return;
    if (allowedLessonSubjects.length === 0) {
      setSlotSubjectId('');
    } else if (!slotSubjectId || !allowedLessonSubjects.some((s) => s.id === slotSubjectId)) {
      setSlotSubjectId(allowedLessonSubjects[0].id);
    }
  }, [lessonModal, allowedLessonSubjects, slotSubjectId]);

  // Live conflict check in Add/Edit Lesson Modal
  const liveModalConflicts = useMemo(() => {
    if (!lessonModal || !activeTimetable || !activeYear) return null;
    return detectLessonConflicts({
      candidate: {
        id: editingLessonId ?? undefined,
        timetableId: activeTimetable.id,
        academicYearId: activeYear.id,
        classId: slotClassId || activeTimetable.classId || '',
        dayOfWeek: slotDay,
        periodNumber: slotPeriod,
        lessonDate: slotDate || undefined,
        teacherId: slotTeacherId || undefined,
        roomName: slotRoom || undefined,
      },
      allLessons: allYearLessons,
      timetablesById,
      classesById: classMap,
    });
  }, [
    lessonModal,
    editingLessonId,
    activeTimetable,
    activeYear,
    slotClassId,
    slotDay,
    slotPeriod,
    slotDate,
    slotTeacherId,
    slotRoom,
    allYearLessons,
    timetablesById,
    classMap,
  ]);

  const openCreateTimetable = () => {
    const today = new Date().toISOString().slice(0, 10);
    setEditingTtId(null);
    setTtName('');
    setTtTeacherId(permissions.isScopedTeacher && activeTeacher ? activeTeacher.id : '');
    setTtClassId('');
    setTtWeekNumber(String(timetables.length + 1));
    setTtFrom(today);
    setTtTo(addDaysIso(today, 4));
    setTtDays([DayOfWeek.MON, DayOfWeek.TUE, DayOfWeek.WED, DayOfWeek.THU, DayOfWeek.FRI]);
    setTtPeriodsPerDay(7);
    setTtUseTimes(true);
    setTtPeriodTimes(createDefaultSlotTimes(7));
    setTtModal(true);
  };

  const openEditTimetable = (tt: Timetable) => {
    const pCount = tt.periodsPerDay ?? 7;
    setEditingTtId(tt.id);
    setTtName(tt.name);
    setTtTeacherId(tt.teacherId ?? '');
    setTtClassId(tt.classId ?? '');
    setTtWeekNumber(tt.weekNumber ? String(tt.weekNumber) : '');
    setTtFrom(tt.effectiveFrom);
    setTtTo(tt.effectiveTo ?? addDaysIso(tt.effectiveFrom, 4));
    setTtDays(
      tt.schoolDays && tt.schoolDays.length > 0
        ? tt.schoolDays
        : [DayOfWeek.MON, DayOfWeek.TUE, DayOfWeek.WED, DayOfWeek.THU, DayOfWeek.FRI]
    );
    setTtPeriodsPerDay(pCount);
    setTtUseTimes(Boolean(tt.periodTimes && tt.periodTimes.length > 0));
    setTtPeriodTimes(
      tt.periodTimes && tt.periodTimes.length > 0
        ? tt.periodTimes
        : createDefaultSlotTimes(pCount)
    );
    setTtModal(true);
  };

  const handleSaveTimetable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeYear) {
      notify('warning', 'Chưa có năm học hiện hành');
      return;
    }
    if (ttDays.length === 0) {
      notify('warning', 'Vui lòng chọn ít nhất 1 ngày học trong tuần');
      return;
    }

    const payload = {
      academicYearId: activeYear.id,
      teacherId: ttTeacherId || undefined,
      classId: ttClassId || undefined,
      name: ttName.trim(),
      weekNumber: ttWeekNumber ? Number(ttWeekNumber) : undefined,
      effectiveFrom: ttFrom,
      effectiveTo: ttTo || undefined,
      schoolDays: [...ttDays].sort((a, b) => a - b),
      periodsPerDay: ttPeriodsPerDay,
      periodTimes: ttUseTimes ? ttPeriodTimes.slice(0, ttPeriodsPerDay) : undefined,
      isActive: true,
    };

    const res = editingTtId
      ? await timetableService.updateTimetable(editingTtId, payload)
      : await timetableService.createTimetable(payload);

    if (res.ok) {
      notify('success', editingTtId ? 'Đã cập nhật thời khóa biểu' : 'Đã tạo thời khóa biểu mới');
      setTtModal(false);
      await loadData();
      setActiveTimetableId(res.data.id);
    } else {
      notify('error', 'Không thể lưu thời khóa biểu', res.error);
    }
  };

  const openLessonModal = (day: DayOfWeek, period: number, existing?: TimetableLesson) => {
    if (!activeTimetable || !canManageActiveTimetable) return;
    setConfirmOverwriteConflict(false);
    if (existing) {
      setEditingLessonId(existing.id);
      setSlotDay(existing.dayOfWeek);
      setSlotPeriod(existing.periodNumber);
      setSlotDate(
        existing.lessonDate ||
          computeLessonDateForWeekday(activeTimetable.effectiveFrom, existing.dayOfWeek)
      );
      setSlotTeacherId(existing.teacherId ?? activeTimetable.teacherId ?? '');
      setSlotClassId(existing.classId);
      setSlotSubjectId(existing.subjectId);
      setSlotRoom(existing.roomName ?? '');
      setSlotTitle(existing.lessonTitle ?? '');
    } else {
      setEditingLessonId(null);
      setSlotDay(day);
      setSlotPeriod(period);
      setSlotDate(computeLessonDateForWeekday(activeTimetable.effectiveFrom, day));
      setSlotTeacherId(
        activeTimetable.teacherId ??
          (permissions.isScopedTeacher && activeTeacher ? activeTeacher.id : '')
      );
      setSlotClassId(activeTimetable.classId ?? '');
      setSlotSubjectId('');
      setSlotRoom('');
      setSlotTitle('');
    }
    setLessonModal(true);
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeYear || !activeTimetable) return;
    const hasTeacherOrRoomConflict =
      liveModalConflicts &&
      (liveModalConflicts.teacherConflicts.length > 0 ||
        liveModalConflicts.roomConflicts.length > 0);
    if (hasTeacherOrRoomConflict && !confirmOverwriteConflict) {
      notify(
        'warning',
        'Phát hiện trùng tiết hoặc trùng phòng',
        'Vui lòng đổi tiết/phòng hoặc đánh dấu xác nhận lưu đè nếu nhà trường cho phép.'
      );
      return;
    }

    const res = await timetableService.upsertLesson({
      id: editingLessonId ?? undefined,
      timetableId: activeTimetable.id,
      classId: slotClassId,
      academicYearId: activeYear.id,
      dayOfWeek: slotDay,
      periodNumber: slotPeriod,
      lessonDate: slotDate || undefined,
      session: slotPeriod <= 4 ? 'MORNING' : 'AFTERNOON',
      subjectId: slotSubjectId,
      teacherId: slotTeacherId || undefined,
      roomName: slotRoom || undefined,
      lessonTitle: slotTitle || undefined,
      ignoreSoftConflicts: confirmOverwriteConflict,
    });

    if (res.ok) {
      notify('success', editingLessonId ? 'Đã cập nhật tiết học' : 'Đã xếp tiết học');
      setLessonModal(false);
      await loadData();
    } else {
      notify('error', 'Không thể lưu tiết học', res.error);
    }
  };

  const openCopyModal = (sourceTt?: Timetable) => {
    const src = sourceTt ?? activeTimetable;
    if (!src) {
      notify('warning', 'Chưa có thời khóa biểu nguồn để sao chép');
      return;
    }
    const nextWeek = (src.weekNumber ?? 1) + 1;
    const nextFrom = addDaysIso(src.effectiveFrom, 7);
    const daysCount = src.schoolDays?.includes(DayOfWeek.SAT) ? 5 : 4;
    setCopySourceId(src.id);
    setCopyWeek(String(nextWeek));
    setCopyName(`${src.name.replace(/Tuần\s*\d+/i, '').trim()} · Tuần ${nextWeek}`.replace(/^\s*·\s*/, ''));
    setCopyFrom(nextFrom);
    setCopyTo(addDaysIso(nextFrom, daysCount));
    setCopyTeacherId(src.teacherId ?? '');
    setCopyModal(true);
  };

  const handleCopyTimetable = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await timetableService.copyTimetable({
      sourceTimetableId: copySourceId,
      newName: copyName,
      targetWeekNumber: copyWeek ? Number(copyWeek) : undefined,
      targetEffectiveFrom: copyFrom,
      targetEffectiveTo: copyTo || undefined,
      targetTeacherId: copyTeacherId,
      recalculateDates: true,
    });
    if (res.ok) {
      if (res.data.conflicts.length > 0) {
        notify(
          'warning',
          `Đã sao chép ${res.data.lessons.length} tiết (có ${res.data.conflicts.length} cảnh báo trùng)`,
          res.data.conflicts[0]
        );
      } else {
        notify('success', `Đã sao chép sang "${res.data.timetable.name}" (${res.data.lessons.length} tiết)`);
      }
      setCopyModal(false);
      await loadData();
      setActiveTimetableId(res.data.timetable.id);
    } else {
      notify('error', 'Không thể sao chép thời khóa biểu', res.error);
    }
  };

  const handleAssignTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTimetable) return;
    const res = await timetableService.assignTeacherToTimetable(
      activeTimetable.id,
      assignTeacherId || undefined,
      assignApplyLessons
    );
    if (res.ok) {
      notify('success', 'Đã cập nhật giáo viên phụ trách thời khóa biểu');
      setAssignModal(false);
      await loadData();
    } else {
      notify('error', 'Không thể gán giáo viên', res.error);
    }
  };

  const handleExportActive = async () => {
    if (!activeTimetable) return;
    const timesMap = new Map(
      (activeTimetable.periodTimes ?? []).map((pt) => [
        pt.periodNumber,
        `${pt.startTime} - ${pt.endTime}`,
      ])
    );
    await exportTimetableExcel({
      timetableName: activeTimetable.name,
      weekLabel: activeTimetable.weekNumber ? `Tuần ${activeTimetable.weekNumber}` : undefined,
      lessons: activeTimetableLessons.map((l) => ({
        dayOfWeek: l.dayOfWeek,
        periodNumber: l.periodNumber,
        lessonDate: l.lessonDate,
        className: classMap.get(l.classId)?.name ?? '',
        subjectName: subjectMap.get(l.subjectId)?.name ?? '',
        teacherName: l.teacherId ? teacherMap.get(l.teacherId)?.fullName ?? '' : 'Chưa gán GV',
        roomName: l.roomName,
        lessonTitle: l.lessonTitle,
        timeRange: timesMap.get(l.periodNumber) ?? '',
      })),
    });
    notify('success', 'Đã xuất Excel thời khóa biểu');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTimetable) return;
    setImportLoading(true);
    try {
      const sheet = await readExcelWorkbook(file);
      const preview = buildTimetableImportPreview({
        rows: sheet.rows,
        classes: activeClasses,
        subjects: subjects.filter((s) => s.isActive),
        teachers,
        defaultTeacherId: activeTimetable.teacherId,
        defaultClassId: activeTimetable.classId,
        maxPeriods: activeTimetable.periodsPerDay ?? 7,
        allowedSchoolDays: activeTimetable.schoolDays ?? [2, 3, 4, 5, 6],
        effectiveFrom: activeTimetable.effectiveFrom,
      });
      setImportRows(preview);
    } catch (err) {
      notify('error', 'Không thể đọc tệp Excel', err instanceof Error ? err.message : undefined);
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  const handleCommitImport = async () => {
    if (!activeTimetable || !activeYear) return;
    let imported = 0;
    let failed = 0;
    for (const row of importRows) {
      if (row.error || !row.resolvedClassId || !row.resolvedSubjectId) {
        failed += 1;
        continue;
      }
      const res = await timetableService.upsertLesson({
        timetableId: activeTimetable.id,
        classId: row.resolvedClassId,
        academicYearId: activeYear.id,
        dayOfWeek: row.dayOfWeek as DayOfWeek,
        periodNumber: row.periodNumber,
        lessonDate: row.lessonDate || undefined,
        session: row.periodNumber <= 4 ? 'MORNING' : 'AFTERNOON',
        subjectId: row.resolvedSubjectId,
        teacherId: row.resolvedTeacherId ?? activeTimetable.teacherId,
        roomName: row.roomName || undefined,
        lessonTitle: row.lessonTitle || undefined,
      });
      if (res.ok) imported += 1;
      else failed += 1;
    }
    notify('success', `Nhập thời khóa biểu hoàn tất: ${imported} tiết thành công, ${failed} bỏ qua/lỗi`);
    setImportModal(false);
    setImportRows([]);
    await loadData();
  };

  const activeDays: DayOfWeek[] = useMemo(() => {
    if (!activeTimetable?.schoolDays || activeTimetable.schoolDays.length === 0) {
      return [DayOfWeek.MON, DayOfWeek.TUE, DayOfWeek.WED, DayOfWeek.THU, DayOfWeek.FRI];
    }
    return activeTimetable.schoolDays;
  }, [activeTimetable]);

  const activePeriods: number[] = useMemo(() => {
    const count = activeTimetable?.periodsPerDay ?? 7;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [activeTimetable]);

  const periodTimeMap = useMemo(() => {
    return new Map((activeTimetable?.periodTimes ?? []).map((pt) => [pt.periodNumber, pt]));
  }, [activeTimetable]);

  const totalConflictsCount = conflictMapByLessonId.size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thời khóa biểu giáo viên"
        description="Thiết lập lịch dạy theo tuần/giáo viên, kiểm tra trùng tiết & phòng học, nhập/xuất Excel và liên kết đánh giá tiết học."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {activeTimetable && (
              <>
                <button
                  type="button"
                  onClick={() => openCopyModal(activeTimetable)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Sao chép tuần / TKB
                </button>
                {canManageActiveTimetable && (
                  <button
                    type="button"
                    onClick={() => {
                      setImportRows([]);
                      setImportModal(true);
                    }}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Nhập Excel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleExportActive()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  Xuất Excel
                </button>
              </>
            )}
            <button
              type="button"
              onClick={openCreateTimetable}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Tạo thời khóa biểu
            </button>
          </div>
        }
      />

      {/* Bộ lọc & tìm kiếm */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="relative md:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tiết học theo lớp, môn, giáo viên, phòng..."
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <select
            aria-label="Lọc theo giáo viên"
            value={filterTeacherId}
            disabled={permissions.isScopedTeacher}
            onChange={(e) => setFilterTeacherId(e.target.value)}
            className="md:col-span-3 h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800 disabled:opacity-70"
          >
            <option value="">Tất cả giáo viên</option>
            <option value="__UNASSIGNED__">Chưa gán giáo viên</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} ({t.code})
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc theo lớp"
            value={filterClassId}
            onChange={(e) => setFilterClassId(e.target.value)}
            className="md:col-span-2 h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">Tất cả lớp</option>
            {activeClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc theo môn học"
            value={filterSubjectId}
            onChange={(e) => setFilterSubjectId(e.target.value)}
            className="md:col-span-3 h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">Tất cả môn học</option>
            {subjects
              .filter((s) => s.isActive)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            <select
              aria-label="Chọn thời khóa biểu đang xem"
              value={activeTimetableId}
              onChange={(e) => setActiveTimetableId(e.target.value)}
              className="h-10 min-w-[260px] max-w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium dark:border-slate-700 dark:bg-slate-800"
            >
              {visibleTimetables.length === 0 && <option value="">Chưa có thời khóa biểu phù hợp</option>}
              {visibleTimetables.map((tt) => {
                const tName = tt.teacherId ? teacherMap.get(tt.teacherId)?.fullName : 'Chưa gán GV';
                const weekTxt = tt.weekNumber ? `Tuần ${tt.weekNumber} · ` : '';
                return (
                  <option key={tt.id} value={tt.id}>
                    {tt.name} ({weekTxt}
                    {tName} · {tt.effectiveFrom})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                viewMode === 'week'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
              Bảng tuần
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                viewMode === 'calendar'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Dạng lịch
            </button>
          </div>
        </div>
      </div>

      {/* Thanh thông tin TKB hiện hành */}
      {activeTimetable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {activeTimetable.name}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>
                Giáo viên:{' '}
                <strong className="font-medium text-slate-700 dark:text-slate-200">
                  {activeTimetable.teacherId
                    ? teacherMap.get(activeTimetable.teacherId)?.fullName ?? '—'
                    : 'Chưa gán giáo viên'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {activeTimetable.weekNumber ? `Tuần ${activeTimetable.weekNumber}` : 'Theo lịch'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {activeTimetable.effectiveFrom}
                {activeTimetable.effectiveTo ? ` → ${activeTimetable.effectiveTo}` : ''}
              </span>
              <span aria-hidden="true">·</span>
              <span>{activeTimetable.periodsPerDay ?? 7} tiết/ngày</span>
              <span aria-hidden="true">·</span>
              <span>{activeTimetableLessons.length} tiết đã xếp</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {permissions.canManageAssignments && (
              <button
                type="button"
                onClick={() => {
                  setAssignTeacherId(activeTimetable.teacherId ?? '');
                  setAssignApplyLessons(true);
                  setAssignModal(true);
                }}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Gán giáo viên
              </button>
            )}
            {canManageActiveTimetable && (
              <>
                <button
                  type="button"
                  onClick={() => openEditTimetable(activeTimetable)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Cấu hình TKB
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTtTarget(activeTimetable)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xóa TKB
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Cảnh báo trùng tiết / trùng phòng */}
      {totalConflictsCount > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Phát hiện {totalConflictsCount} tiết có xung đột lịch giáo viên hoặc phòng học trong cùng khung giờ:
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {Array.from(conflictMapByLessonId.entries())
              .slice(0, 5)
              .map(([lid, msgs]) => (
                <li key={lid}>{msgs[0]}</li>
              ))}
          </ul>
        </div>
      )}

      {visibleTimetables.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Chưa có thời khóa biểu"
          description="Nhấn Tạo thời khóa biểu để thiết lập lịch giảng dạy theo tuần cho giáo viên hoặc lớp học."
          actionLabel="Tạo thời khóa biểu đầu tiên"
          onAction={openCreateTimetable}
        />
      ) : !activeTimetable ? null : viewMode === 'week' ? (
        /* VIEW 1: BẢNG TUẦN */
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
              <tr>
                <th className="w-28 border-r border-slate-200 px-3 py-3 dark:border-slate-800">
                  Tiết / Giờ
                </th>
                {activeDays.map((d) => {
                  const dateStr = computeLessonDateForWeekday(activeTimetable.effectiveFrom, d);
                  return (
                    <th
                      key={d}
                      className="border-r border-slate-200 px-3 py-3 last:border-r-0 dark:border-slate-800"
                    >
                      <div>{DAY_OF_WEEK_LABELS[d]}</div>
                      {dateStr && (
                        <div className="font-mono text-[11px] font-normal text-slate-500 tabular-nums">
                          {dateStr.split('-').reverse().join('/')}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {activePeriods.map((period) => {
                const slotTime = periodTimeMap.get(period);
                return (
                  <tr key={period}>
                    <td className="border-r border-slate-200 px-3 py-3 font-mono text-xs font-medium text-slate-700 tabular-nums dark:border-slate-800 dark:text-slate-300">
                      <div>Tiết {period}</div>
                      <div className="text-[11px] font-normal text-slate-500">
                        {slotTime
                          ? `${slotTime.startTime}–${slotTime.endTime}`
                          : period <= 4
                            ? 'Buổi sáng'
                            : 'Buổi chiều'}
                      </div>
                    </td>
                    {activeDays.map((day) => {
                      const lesson = activeTimetableLessons.find(
                        (l) => l.dayOfWeek === day && l.periodNumber === period
                      );
                      const subject = lesson ? subjectMap.get(lesson.subjectId) : undefined;
                      const cls = lesson ? classMap.get(lesson.classId) : undefined;
                      const teacher = lesson?.teacherId ? teacherMap.get(lesson.teacherId) : undefined;
                      const conflicts = lesson ? conflictMapByLessonId.get(lesson.id) : undefined;

                      return (
                        <td
                          key={day}
                          className="border-r border-slate-200 p-2 align-top last:border-r-0 dark:border-slate-800"
                        >
                          {lesson ? (
                            <div
                              className={`rounded-lg border p-2.5 space-y-1.5 ${
                                conflicts
                                  ? 'border-amber-400 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-950/30'
                                  : 'border-teal-200 bg-teal-50/60 dark:border-teal-900/60 dark:bg-teal-950/30'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-semibold text-teal-900 dark:text-teal-200">
                                    {subject?.name ?? 'Môn học'}
                                  </div>
                                  <div className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">
                                    {cls?.name ?? 'Lớp'}
                                    {lesson.roomName ? ` · P.${lesson.roomName}` : ''}
                                  </div>
                                  {teacher && (
                                    <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                      {teacher.fullName}
                                    </div>
                                  )}
                                </div>
                                {conflicts && (
                                  <span title={conflicts.join('\n')}>
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                                  </span>
                                )}
                              </div>

                              {lesson.lessonTitle && (
                                <div className="truncate text-[11px] text-slate-600 dark:text-slate-400">
                                  {lesson.lessonTitle}
                                </div>
                              )}

                              <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(`/danh-gia-tiet-hoc?timetableLessonId=${lesson.id}`)
                                  }
                                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-teal-800 hover:bg-teal-100 dark:text-teal-300 dark:hover:bg-teal-900/50"
                                >
                                  <CheckSquare className="h-3 w-3" />
                                  Đánh giá
                                </button>
                                {canManageActiveTimetable && (
                                  <div className="flex items-center">
                                    <button
                                      type="button"
                                      onClick={() => openLessonModal(day, period, lesson)}
                                      aria-label="Sửa tiết học"
                                      className="rounded p-1 text-slate-600 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const res = await timetableService.removeLesson(lesson.id);
                                        if (res.ok) {
                                          notify('success', 'Đã xóa tiết học');
                                          await loadData();
                                        } else {
                                          notify('error', 'Không thể xóa tiết học', res.error);
                                        }
                                      }}
                                      aria-label="Xóa tiết học"
                                      className="rounded p-1 text-red-600 hover:bg-red-100/70 dark:text-red-400"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : canManageActiveTimetable ? (
                            <button
                              type="button"
                              onClick={() => openLessonModal(day, period)}
                              className="flex h-16 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-400 hover:border-teal-500 hover:text-teal-700 dark:border-slate-800 dark:hover:text-teal-400"
                            >
                              + Xếp tiết
                            </button>
                          ) : (
                            <div className="flex h-16 items-center justify-center text-xs text-slate-300 dark:text-slate-700">
                              —
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* VIEW 2: DẠNG LỊCH (Tối ưu cho cả desktop & điện thoại) */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeDays.map((day) => {
            const dateStr = computeLessonDateForWeekday(activeTimetable.effectiveFrom, day);
            const dayLessons = activeTimetableLessons
              .filter((l) => l.dayOfWeek === day)
              .sort((a, b) => a.periodNumber - b.periodNumber);

            return (
              <div
                key={day}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {DAY_OF_WEEK_LABELS[day]}
                    </div>
                    {dateStr && (
                      <div className="font-mono text-xs text-slate-500 tabular-nums">
                        {dateStr.split('-').reverse().join('/')}
                      </div>
                    )}
                  </div>
                  {canManageActiveTimetable && (
                    <button
                      type="button"
                      onClick={() => {
                        const firstFree =
                          activePeriods.find(
                            (p) => !dayLessons.some((l) => l.periodNumber === p)
                          ) ?? 1;
                        openLessonModal(day, firstFree);
                      }}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:border-slate-700 dark:text-teal-400"
                    >
                      + Thêm tiết
                    </button>
                  )}
                </div>

                {dayLessons.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">Không có tiết dạy</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {dayLessons.map((lesson) => {
                      const slotTime = periodTimeMap.get(lesson.periodNumber);
                      const conflicts = conflictMapByLessonId.get(lesson.id);
                      return (
                        <div key={lesson.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 tabular-nums">
                                <span>Tiết {lesson.periodNumber}</span>
                                {slotTime && (
                                  <span>
                                    ({slotTime.startTime}–{slotTime.endTime})
                                  </span>
                                )}
                                {conflicts && (
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                )}
                              </div>
                              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {subjectMap.get(lesson.subjectId)?.name ?? 'Môn học'} ·{' '}
                                {classMap.get(lesson.classId)?.name ?? 'Lớp'}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {[
                                  lesson.teacherId
                                    ? teacherMap.get(lesson.teacherId)?.fullName
                                    : 'Chưa gán GV',
                                  lesson.roomName ? `Phòng ${lesson.roomName}` : '',
                                  lesson.lessonTitle ?? '',
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(`/danh-gia-tiet-hoc?timetableLessonId=${lesson.id}`)
                              }
                              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800"
                            >
                              <CheckSquare className="h-3 w-3" />
                              Đánh giá tiết
                            </button>
                            {canManageActiveTimetable && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openLessonModal(day, lesson.periodNumber, lesson)}
                                  className="inline-flex min-h-[32px] items-center rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                                >
                                  Sửa
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const res = await timetableService.removeLesson(lesson.id);
                                    if (res.ok) {
                                      notify('success', 'Đã xóa tiết học');
                                      await loadData();
                                    } else {
                                      notify('error', 'Không thể xóa tiết học', res.error);
                                    }
                                  }}
                                  className="inline-flex min-h-[32px] items-center rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
                                >
                                  Xóa
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: TẠO / SỬA THỜI KHÓA BIỂU */}
      <Modal
        isOpen={ttModal}
        title={editingTtId ? 'Cập nhật cấu hình thời khóa biểu' : 'Thiết lập thời khóa biểu mới'}
        onClose={() => setTtModal(false)}
      >
        <form onSubmit={(e) => void handleSaveTimetable(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Tên thời khóa biểu *</label>
              <input
                required
                value={ttName}
                onChange={(e) => setTtName(e.target.value)}
                placeholder="VD: Lịch dạy Cô Lan - Tuần 1"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Tuần áp dụng</label>
              <input
                type="number"
                min={1}
                max={52}
                value={ttWeekNumber}
                onChange={(e) => setTtWeekNumber(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Giáo viên phụ trách</label>
              <select
                disabled={permissions.isScopedTeacher}
                value={ttTeacherId}
                onChange={(e) => setTtTeacherId(e.target.value)}
                className={INPUT_CLASS}
              >
                {(permissions.canManageAssignments || !ttTeacherId) && (
                  <option value="">Chưa gán giáo viên (QTV gán sau)</option>
                )}
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName} ({t.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Lớp mặc định (tùy chọn)</label>
              <select
                value={ttClassId}
                onChange={(e) => setTtClassId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Nhiều lớp (theo tiết dạy)</option>
                {activeClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS}>Từ ngày *</label>
              <input
                type="date"
                required
                value={ttFrom}
                onChange={(e) => {
                  const next = e.target.value;
                  setTtFrom(next);
                  setTtTo(addDaysIso(next, ttDays.includes(DayOfWeek.SAT) ? 5 : 4));
                }}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Đến ngày</label>
              <input
                type="date"
                value={ttTo}
                onChange={(e) => setTtTo(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Số tiết mỗi ngày</label>
              <input
                type="number"
                min={4}
                max={10}
                value={ttPeriodsPerDay}
                onChange={(e) => {
                  const val = Math.min(10, Math.max(4, Number(e.target.value) || 7));
                  setTtPeriodsPerDay(val);
                  setTtPeriodTimes(createDefaultSlotTimes(val));
                }}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Các ngày học trong tuần</label>
            <div className="flex flex-wrap gap-2">
              {ALL_WEEKDAYS.map((d) => {
                const checked = ttDays.includes(d);
                return (
                  <label
                    key={d}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      checked
                        ? 'border-teal-600 bg-teal-50 text-teal-800 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-300'
                        : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setTtDays((prev) =>
                          e.target.checked
                            ? [...prev, d].sort((a, b) => a - b)
                            : prev.filter((item) => item !== d)
                        );
                      }}
                    />
                    {DAY_OF_WEEK_LABELS[d]}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={ttUseTimes}
                onChange={(e) => setTtUseTimes(e.target.checked)}
              />
              Cấu hình thời gian bắt đầu – kết thúc mỗi tiết
            </label>
            {ttUseTimes && (
              <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto sm:grid-cols-2">
                {ttPeriodTimes.slice(0, ttPeriodsPerDay).map((slot, idx) => (
                  <div key={slot.periodNumber} className="flex items-center gap-2 text-xs">
                    <span className="w-12 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      Tiết {slot.periodNumber}
                    </span>
                    <input
                      type="time"
                      value={slot.startTime}
                      onChange={(e) => {
                        const copy = [...ttPeriodTimes];
                        copy[idx] = { ...slot, startTime: e.target.value };
                        setTtPeriodTimes(copy);
                      }}
                      className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                    <span>–</span>
                    <input
                      type="time"
                      value={slot.endTime}
                      onChange={(e) => {
                        const copy = [...ttPeriodTimes];
                        copy[idx] = { ...slot, endTime: e.target.value };
                        setTtPeriodTimes(copy);
                      }}
                      className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setTtModal(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              {editingTtId ? 'Lưu cấu hình' : 'Tạo thời khóa biểu'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: XẾP / SỬA TIẾT HỌC (LIÊN KẾT PHÂN CÔNG + KIỂM TRA TRÙNG) */}
      <Modal
        isOpen={lessonModal}
        title={
          editingLessonId
            ? `Sửa tiết ${slotPeriod} — ${DAY_OF_WEEK_LABELS[slotDay]}`
            : `Xếp tiết ${slotPeriod} — ${DAY_OF_WEEK_LABELS[slotDay]}`
        }
        onClose={() => setLessonModal(false)}
      >
        <form onSubmit={(e) => void handleSaveLesson(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS}>Thứ</label>
              <select
                value={slotDay}
                onChange={(e) => {
                  const d = Number(e.target.value) as DayOfWeek;
                  setSlotDay(d);
                  if (activeTimetable?.effectiveFrom) {
                    setSlotDate(computeLessonDateForWeekday(activeTimetable.effectiveFrom, d));
                  }
                }}
                className={INPUT_CLASS}
              >
                {activeDays.map((d) => (
                  <option key={d} value={d}>
                    {DAY_OF_WEEK_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Tiết</label>
              <select
                value={slotPeriod}
                onChange={(e) => setSlotPeriod(Number(e.target.value))}
                className={INPUT_CLASS}
              >
                {activePeriods.map((p) => (
                  <option key={p} value={p}>
                    Tiết {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Ngày học</label>
              <input
                type="date"
                value={slotDate}
                onChange={(e) => setSlotDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Giáo viên giảng dạy</label>
            <select
              disabled={permissions.isScopedTeacher}
              value={slotTeacherId}
              onChange={(e) => setSlotTeacherId(e.target.value)}
              className={INPUT_CLASS}
            >
              {permissions.canManageAssignments && <option value="">Chưa gán giáo viên</option>}
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName} ({t.code})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              {slotTeacherId
                ? 'Danh sách lớp và môn bên dưới chỉ hiển thị theo nhiệm vụ đã phân công cho giáo viên này.'
                : 'Đang tạo tiết chưa gán giáo viên — Quản trị viên có thể gán giáo viên sau.'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Lớp học *</label>
              <select
                required
                value={slotClassId}
                onChange={(e) => setSlotClassId(e.target.value)}
                className={INPUT_CLASS}
              >
                {lessonScope.allowedClasses.length === 0 && (
                  <option value="">Giáo viên chưa được phân công lớp nào</option>
                )}
                {lessonScope.allowedClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Môn học *</label>
              <select
                required
                value={slotSubjectId}
                onChange={(e) => setSlotSubjectId(e.target.value)}
                className={INPUT_CLASS}
              >
                {allowedLessonSubjects.length === 0 && (
                  <option value="">Không có môn được phân công ở lớp này</option>
                )}
                {allowedLessonSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Phòng học (nếu cần)</label>
              <input
                value={slotRoom}
                onChange={(e) => setSlotRoom(e.target.value)}
                placeholder="VD: P.201 hoặc Phòng Mĩ thuật"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Tên bài học / Chủ đề</label>
              <input
                value={slotTitle}
                onChange={(e) => setSlotTitle(e.target.value)}
                placeholder="VD: Vẽ theo mẫu quả dạng cầu"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {liveModalConflicts?.hasConflicts && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Cảnh báo xung đột lịch:
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                {liveModalConflicts.slotConflict && <li>{liveModalConflicts.slotConflict.message}</li>}
                {liveModalConflicts.teacherConflicts.map((c, idx) => (
                  <li key={`t-${idx}`}>{c.message}</li>
                ))}
                {liveModalConflicts.roomConflicts.map((c, idx) => (
                  <li key={`r-${idx}`}>{c.message}</li>
                ))}
              </ul>
              {!liveModalConflicts.slotConflict && (
                <label className="inline-flex items-center gap-2 font-medium pt-1">
                  <input
                    type="checkbox"
                    checked={confirmOverwriteConflict}
                    onChange={(e) => setConfirmOverwriteConflict(e.target.checked)}
                  />
                  Xác nhận vẫn lưu tiết này dù có cảnh báo trùng
                </label>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setLessonModal(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!slotClassId || !slotSubjectId || Boolean(liveModalConflicts?.slotConflict)}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
            >
              Lưu tiết học
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: SAO CHÉP TUẦN TRƯỚC / SAO CHÉP TKB */}
      <Modal
        isOpen={copyModal}
        title="Sao chép tuần trước / Sao chép thời khóa biểu"
        onClose={() => setCopyModal(false)}
      >
        <form onSubmit={(e) => void handleCopyTimetable(e)} className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Thời khóa biểu nguồn *</label>
            <select
              required
              value={copySourceId}
              onChange={(e) => setCopySourceId(e.target.value)}
              className={INPUT_CLASS}
            >
              {timetables.map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.name} ({tt.effectiveFrom})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Tên thời khóa biểu mới *</label>
              <input
                required
                value={copyName}
                onChange={(e) => setCopyName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Tuần áp dụng mới</label>
              <input
                type="number"
                min={1}
                max={52}
                value={copyWeek}
                onChange={(e) => setCopyWeek(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Từ ngày *</label>
              <input
                type="date"
                required
                value={copyFrom}
                onChange={(e) => {
                  const val = e.target.value;
                  const src = timetablesById.get(copySourceId);
                  const daysOffset = src?.schoolDays?.includes(DayOfWeek.SAT) ? 5 : 4;
                  setCopyFrom(val);
                  setCopyTo(addDaysIso(val, daysOffset));
                }}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Đến ngày</label>
              <input
                type="date"
                value={copyTo}
                onChange={(e) => setCopyTo(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Áp dụng cho giáo viên</label>
            <select
              disabled={permissions.isScopedTeacher}
              value={copyTeacherId}
              onChange={(e) => setCopyTeacherId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Giữ nguyên hoặc chưa gán giáo viên</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName} ({t.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCopyModal(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              Sao chép sang tuần mới
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: GÁN GIÁO VIÊN CHO THỜI KHÓA BIỂU (ADMIN) */}
      <Modal
        isOpen={assignModal}
        title="Gán giáo viên phụ trách thời khóa biểu"
        onClose={() => setAssignModal(false)}
      >
        <form onSubmit={(e) => void handleAssignTeacher(e)} className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Chọn giáo viên</label>
            <select
              value={assignTeacherId}
              onChange={(e) => setAssignTeacherId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Chưa gán giáo viên</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName} ({t.code})
                </option>
              ))}
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={assignApplyLessons}
              onChange={(e) => setAssignApplyLessons(e.target.checked)}
            />
            Đồng bộ giáo viên này cho tất cả tiết học hiện có trong thời khóa biểu
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setAssignModal(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              Xác nhận gán giáo viên
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: NHẬP EXCEL THỜI KHÓA BIỂU */}
      <Modal
        isOpen={importModal}
        title="Nhập thời khóa biểu từ Excel"
        onClose={() => setImportModal(false)}
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
              <Upload className="h-4 w-4" />
              {importLoading ? 'Đang đọc tệp...' : 'Chọn tệp Excel (.xlsx)'}
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => void handleImportFile(e)}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={() => void exportTimetableTemplateExcel()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              <Download className="h-3.5 w-3.5" />
              Tải mẫu Excel thời khóa biểu
            </button>
          </div>

          {importRows.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Tổng {importRows.length} dòng · Hợp lệ:{' '}
                <strong className="text-emerald-700 dark:text-emerald-400">
                  {importRows.filter((r) => !r.error).length}
                </strong>{' '}
                · Lỗi:{' '}
                <strong className="text-red-600 dark:text-red-400">
                  {importRows.filter((r) => Boolean(r.error)).length}
                </strong>
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2">Dòng</th>
                      <th className="px-3 py-2">Thứ / Tiết</th>
                      <th className="px-3 py-2">Ngày</th>
                      <th className="px-3 py-2">Lớp</th>
                      <th className="px-3 py-2">Môn học</th>
                      <th className="px-3 py-2">Phòng</th>
                      <th className="px-3 py-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {importRows.map((row) => (
                      <tr key={row.rowIndex}>
                        <td className="px-3 py-2 font-mono">{row.rowIndex}</td>
                        <td className="px-3 py-2">
                          Thứ {row.dayOfWeek} · Tiết {row.periodNumber}
                        </td>
                        <td className="px-3 py-2 font-mono">{row.lessonDate || '—'}</td>
                        <td className="px-3 py-2">{row.classLabel}</td>
                        <td className="px-3 py-2">{row.subjectLabel}</td>
                        <td className="px-3 py-2">{row.roomName || '—'}</td>
                        <td className="px-3 py-2">
                          {row.error ? (
                            <span className="text-red-600 dark:text-red-400">{row.error}</span>
                          ) : row.warning ? (
                            <span className="text-amber-700 dark:text-amber-400">{row.warning}</span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400">Hợp lệ</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleCommitImport()}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                >
                  Xác nhận nhập các dòng hợp lệ
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={Boolean(deleteTtTarget)}
        title="Xóa thời khóa biểu"
        message={`Xóa "${deleteTtTarget?.name ?? ''}" cùng toàn bộ tiết học bên trong? Các đánh giá theo tiết học đã lưu trước đó vẫn được bảo toàn.`}
        confirmLabel="Xóa thời khóa biểu"
        onCancel={() => setDeleteTtTarget(null)}
        onConfirm={async () => {
          if (!deleteTtTarget) return;
          const res = await timetableService.removeTimetable(deleteTtTarget.id, true);
          if (res.ok) {
            notify('success', 'Đã xóa thời khóa biểu');
            setDeleteTtTarget(null);
            await loadData();
          } else {
            notify('error', 'Không thể xóa thời khóa biểu', res.error);
          }
        }}
      />
    </div>
  );
};
