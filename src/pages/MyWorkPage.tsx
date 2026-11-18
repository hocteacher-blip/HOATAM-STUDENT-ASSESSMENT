import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  History,
  School,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { assessmentService } from '../services/assessmentService';
import { classStudentService } from '../services/classStudentService';
import { curriculumService } from '../services/curriculumService';
import { computeTimetableLessonStatus } from '../services/lessonAssessmentService';
import { teacherService, type TeacherWorkSummary } from '../services/teacherService';
import type { LessonAssessment, Student, Subject } from '../types/models';
import {
  DAILY_EVALUATION_STATUS_LABELS,
  DAY_OF_WEEK_LABELS,
  LESSON_PARTICIPATION_LABELS,
  LESSON_WORKFLOW_STATUS_LABELS,
  RATING_LEVEL_LABELS,
  TEACHER_ASSIGNMENT_STATUS_LABELS,
} from '../utils/labels';

export const MyWorkPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    activeYear,
    classes,
    teachers,
    teacherRoles,
    operatorMode,
    activeTeacher,
    setLocalOperator,
  } = useWorkspace();

  const [viewedTeacherId, setViewedTeacherId] = useState<string>(activeTeacher?.id ?? '');
  const [summary, setSummary] = useState<TeacherWorkSummary | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allLessonAssessments, setAllLessonAssessments] = useState<LessonAssessment[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<
    'homeroom' | 'teaching' | 'schedule' | 'unfinished' | 'history'
  >('homeroom');

  useEffect(() => {
    if (operatorMode === 'TEACHER' && activeTeacher) {
      setViewedTeacherId(activeTeacher.id);
    } else if (!viewedTeacherId && teachers.length > 0) {
      setViewedTeacherId(teachers[0].id);
    }
  }, [operatorMode, activeTeacher, teachers, viewedTeacherId]);

  useEffect(() => {
    const loadBase = async () => {
      const [stuRes, subRes, lessonAssessRes] = await Promise.all([
        classStudentService.listStudents({ academicYearId: activeYear?.id }),
        curriculumService.listSubjects(),
        assessmentService.listLessonAssessments(
          activeYear ? { academicYearId: activeYear.id } : undefined
        ),
      ]);
      if (stuRes.ok) setStudents(stuRes.data);
      if (subRes.ok) setSubjects(subRes.data);
      if (lessonAssessRes.ok) {
        setAllLessonAssessments(lessonAssessRes.data);
      }
    };
    void loadBase();
  }, [activeYear?.id]);

  useEffect(() => {
    if (!viewedTeacherId) {
      setSummary(null);
      return;
    }
    const loadSummary = async () => {
      setLoading(true);
      const res = await teacherService.getTeacherWorkSummary(viewedTeacherId, activeYear?.id);
      if (res.ok) {
        setSummary(res.data);
        setSelectedAssignmentId('ALL');
      } else {
        setSummary(null);
      }
      setLoading(false);
    };
    void loadSummary();
  }, [viewedTeacherId, activeYear?.id]);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const roleMap = useMemo(() => new Map(teacherRoles.map((r) => [r.id, r])), [teacherRoles]);
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const assessmentsByTimetableLesson = useMemo(() => {
    const map = new Map<string, LessonAssessment[]>();
    for (const a of allLessonAssessments) {
      if (!a.timetableLessonId) continue;
      const list = map.get(a.timetableLessonId) ?? [];
      list.push(a);
      map.set(a.timetableLessonId, list);
    }
    return map;
  }, [allLessonAssessments]);
  const todayIso = new Date().toISOString().slice(0, 10);

  const studentCountByClass = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of students) {
      counts[s.classId] = (counts[s.classId] ?? 0) + 1;
    }
    return counts;
  }, [students]);

  const selectedAssignment = useMemo(() => {
    if (!summary || selectedAssignmentId === 'ALL') return null;
    return summary.activeAssignments.find((a) => a.id === selectedAssignmentId) ?? null;
  }, [summary, selectedAssignmentId]);

  const subjectAssignments = useMemo(() => {
    if (!summary) return [];
    return summary.activeAssignments.filter((a) => {
      if (selectedAssignment && a.id !== selectedAssignment.id) return false;
      return Boolean(a.subjectId) || (!a.isHomeroom && a.role?.toUpperCase() === 'GVBM');
    });
  }, [summary, selectedAssignment]);

  const filteredHomeroomClasses = useMemo(() => {
    if (!summary) return [];
    if (selectedAssignment && (selectedAssignment.isHomeroom || selectedAssignment.role === 'GVCN')) {
      return summary.homeroomClasses.filter((c) => c.id === selectedAssignment.classId);
    }
    return summary.homeroomClasses;
  }, [summary, selectedAssignment]);

  const filteredLessons = useMemo(() => {
    if (!summary) return [];
    if (!selectedAssignment) return summary.timetableLessons;
    return summary.timetableLessons.filter((l) => {
      if (selectedAssignment.classId && l.classId !== selectedAssignment.classId) return false;
      if (selectedAssignment.subjectId && l.subjectId !== selectedAssignment.subjectId) return false;
      return true;
    });
  }, [summary, selectedAssignment]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Công việc của tôi"
        description="Theo dõi tất cả nhiệm vụ chủ nhiệm, giảng dạy bộ môn, lịch dạy, đầu việc chưa hoàn thành và lịch sử đánh giá trên cùng một hồ sơ giáo viên."
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Hồ sơ giáo viên đang xem:
            </label>
            <select
              aria-label="Chọn giáo viên để xem công việc"
              value={viewedTeacherId}
              onChange={(e) => {
                const nextId = e.target.value;
                setViewedTeacherId(nextId);
                if (operatorMode === 'TEACHER' && nextId) {
                  void setLocalOperator('TEACHER', nextId);
                }
              }}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {teachers.length === 0 && <option value="">Chưa có giáo viên nào</option>}
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName} ({t.code})
                </option>
              ))}
            </select>
          </div>

          {operatorMode === 'ADMIN' && viewedTeacherId && (
            <button
              type="button"
              onClick={() => void setLocalOperator('TEACHER', viewedTeacherId)}
              className="inline-flex min-h-[36px] items-center rounded-lg border border-teal-600 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/60"
            >
              Chuyển sang chế độ thao tác của giáo viên này
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Chế độ hồ sơ cục bộ trên trình duyệt dùng để chuyển đổi giữa các nhiệm vụ và thử nghiệm phân quyền nghiệp vụ (không phải hệ thống xác thực bảo mật nhiều thiết bị).
        </p>
      </div>

      {teachers.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Chưa có hồ sơ giáo viên"
          description="Hãy tạo hồ sơ giáo viên và phân công nhiệm vụ trước khi theo dõi công việc cá nhân."
          actionLabel="Đi tới Quản lý Giáo viên"
          onAction={() => navigate('/giao-vien')}
        />
      ) : loading || !summary ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Đang tổng hợp công việc giáo viên...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Thanh chuyển đổi nhanh giữa các nhiệm vụ mà không cần đổi tài khoản */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {summary.teacher.fullName} · Vai trò:{' '}
                  {summary.grantedRoles.length > 0
                    ? summary.grantedRoles.map((r) => r.name).join(', ')
                    : 'Chưa cấp vai trò'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Chuyển nhanh giữa các nhiệm vụ đang đảm nhiệm trong {activeYear?.name ?? 'tất cả năm học'} mà không cần đổi tài khoản:
                </div>
              </div>
              <div className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
                {summary.homeroomClasses.length} lớp chủ nhiệm · {subjectAssignments.length} phân công bộ môn ·{' '}
                {summary.unfinishedTasks.length} đầu việc cần hoàn thành
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedAssignmentId('ALL')}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium ${
                  selectedAssignmentId === 'ALL'
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                Tất cả nhiệm vụ ({summary.activeAssignments.length})
              </button>
              {summary.activeAssignments.map((a) => {
                const isHr = a.isHomeroom || a.role === 'GVCN';
                const labelParts = [
                  roleMap.get(a.roleId)?.code ?? a.role,
                  a.classId ? classMap.get(a.classId)?.name : null,
                  a.subjectId ? subjectMap.get(a.subjectId)?.name : null,
                ].filter(Boolean);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setSelectedAssignmentId(a.id);
                      setActiveTab(isHr && !a.subjectId ? 'homeroom' : 'teaching');
                    }}
                    className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium ${
                      selectedAssignmentId === a.id
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {labelParts.join(' · ')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tabs 5 mảng công việc */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                {
                  id: 'homeroom',
                  label: `Công tác chủ nhiệm (${filteredHomeroomClasses.length})`,
                  icon: School,
                },
                {
                  id: 'teaching',
                  label: `Giảng dạy bộ môn (${subjectAssignments.length})`,
                  icon: BookOpen,
                },
                {
                  id: 'schedule',
                  label: `Lịch dạy (${filteredLessons.length} tiết)`,
                  icon: CalendarDays,
                },
                {
                  id: 'unfinished',
                  label: `Nhiệm vụ chưa hoàn thành (${summary.unfinishedTasks.length})`,
                  icon: ClipboardCheck,
                },
                {
                  id: 'history',
                  label: `Lịch sử đánh giá (${summary.assessments.daily.length + summary.assessments.lesson.length + summary.assessments.results.length})`,
                  icon: History,
                },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium whitespace-nowrap ${
                    activeTab === t.id
                      ? 'border-teal-700 bg-teal-50 text-teal-800 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* 1. Công tác chủ nhiệm */}
          {activeTab === 'homeroom' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Công tác chủ nhiệm lớp
              </h2>
              {filteredHomeroomClasses.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Giáo viên hiện không được phân công làm giáo viên chủ nhiệm lớp nào trong năm học này.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {filteredHomeroomClasses.map((cls) => (
                    <div
                      key={cls.id}
                      className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {cls.name}
                          </div>
                          <div className="text-xs text-slate-500 tabular-nums">
                            Khối {cls.gradeLevel} · Sĩ số hiện tại: {studentCountByClass[cls.id] ?? 0} học sinh
                          </div>
                        </div>
                        <span className="text-xs font-medium text-teal-700 dark:text-teal-400">
                          Chủ nhiệm
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/danh-gia-hang-ngay?classId=${cls.id}`)}
                          className="min-h-[36px] rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
                        >
                          Đánh giá hằng ngày
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/danh-gia-dinh-ky?classId=${cls.id}`)}
                          className="min-h-[36px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                        >
                          Tổng hợp định kỳ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. Công tác giảng dạy bộ môn */}
          {activeTab === 'teaching' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Công tác giảng dạy bộ môn theo lớp
              </h2>
              {subjectAssignments.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Chưa có phân công giảng dạy bộ môn nào trong năm học này.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <tr>
                        <th className="px-4 py-3">Lớp</th>
                        <th className="px-4 py-3">Môn học</th>
                        <th className="px-4 py-3">Số tiết/tuần</th>
                        <th className="px-4 py-3">Trạng thái</th>
                        <th className="px-4 py-3 text-right">Thao tác nhanh</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {subjectAssignments.map((a) => (
                        <tr key={a.id}>
                          <td className="px-4 py-3 font-medium">
                            {a.classId ? (classMap.get(a.classId)?.name ?? '—') : 'Nhiều lớp'}
                          </td>
                          <td className="px-4 py-3">
                            {a.subjectId ? (subjectMap.get(a.subjectId)?.name ?? '—') : 'Tất cả môn'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs tabular-nums">
                            {a.weeklyPeriods ?? 0}
                          </td>
                          <td className="px-4 py-3 text-xs text-teal-700 dark:text-teal-400">
                            {TEACHER_ASSIGNMENT_STATUS_LABELS[a.status]}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/danh-gia-tiet-hoc?classId=${a.classId ?? ''}&subjectId=${a.subjectId ?? ''}`
                                  )
                                }
                                className="min-h-[34px] rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800"
                              >
                                Đánh giá tiết học
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/danh-gia-dinh-ky?classId=${a.classId ?? ''}&subjectId=${a.subjectId ?? ''}`
                                  )
                                }
                                className="min-h-[34px] rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                              >
                                Đánh giá định kỳ
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 3. Lịch dạy */}
          {activeTab === 'schedule' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Lịch dạy & Thời khóa biểu liên quan
                </h2>
                <button
                  type="button"
                  onClick={() => navigate('/thoi-khoa-bieu')}
                  className="min-h-[34px] rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  Mở trang Thời khóa biểu
                </button>
              </div>
              {filteredLessons.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Chưa có tiết dạy nào trong thời khóa biểu khớp giáo viên/phân công hiện tại.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <tr>
                        <th className="px-4 py-3">Thứ / Ngày</th>
                        <th className="px-4 py-3">Tiết</th>
                        <th className="px-4 py-3">Lớp</th>
                        <th className="px-4 py-3">Môn học</th>
                        <th className="px-4 py-3">Nội dung / Phòng</th>
                        <th className="px-4 py-3">Trạng thái đánh giá</th>
                        <th className="px-4 py-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredLessons.map((l) => {
                        const lessonRecs = assessmentsByTimetableLesson.get(l.id) ?? [];
                        const lessonStatus = computeTimetableLessonStatus({
                          lesson: l,
                          assessmentsForLesson: lessonRecs,
                          today: todayIso,
                        });
                        return (
                          <tr key={l.id}>
                            <td className="px-4 py-3">
                              <div className="font-medium">{DAY_OF_WEEK_LABELS[l.dayOfWeek]}</div>
                              {l.lessonDate && (
                                <div className="font-mono text-xs text-slate-500 tabular-nums">
                                  {l.lessonDate}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs tabular-nums">Tiết {l.periodNumber}</td>
                            <td className="px-4 py-3">{classMap.get(l.classId)?.name ?? '—'}</td>
                            <td className="px-4 py-3">{subjectMap.get(l.subjectId)?.name ?? '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                              {[l.lessonTitle, l.roomName].filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <span
                                className={`font-semibold ${
                                  lessonStatus === 'COMPLETED'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : lessonStatus === 'SAVED'
                                      ? 'text-teal-700 dark:text-teal-400'
                                      : lessonStatus === 'IN_PROGRESS'
                                        ? 'text-amber-700 dark:text-amber-400'
                                        : 'text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {LESSON_WORKFLOW_STATUS_LABELS[lessonStatus]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(`/danh-gia-tiet-hoc?timetableLessonId=${l.id}`)
                                }
                                className="min-h-[32px] rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap"
                              >
                                {lessonStatus === 'SAVED' ||
                                lessonStatus === 'COMPLETED' ||
                                lessonStatus === 'IN_PROGRESS'
                                  ? 'Mở lại tiết'
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

          {/* 4. Nhiệm vụ chưa hoàn thành */}
          {activeTab === 'unfinished' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Nhiệm vụ đánh giá chưa hoàn thành
              </h2>
              {summary.unfinishedTasks.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Không còn đầu việc đánh giá tồn đọng trong các kỳ đang mở.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {summary.unfinishedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {task.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {task.description}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(task.targetPath)}
                        className="min-h-[36px] rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap"
                      >
                        Thực hiện ngay
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. Lịch sử đánh giá */}
          {activeTab === 'history' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Lịch sử đánh giá đã thực hiện (được bảo toàn vĩnh viễn)
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Hằng ngày</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {summary.assessments.daily.length}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Theo tiết học</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {summary.assessments.lesson.length}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Định kỳ</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {summary.assessments.results.length}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="text-xs text-slate-500">Nhận xét</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {summary.assessments.comments.length}
                  </div>
                </div>
              </div>

              {summary.assessments.daily.length === 0 &&
              summary.assessments.lesson.length === 0 &&
              summary.assessments.results.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Giáo viên này chưa ghi nhận đánh giá nào trong năm học đang chọn.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto">
                  {summary.assessments.results.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                    >
                      <div className="flex flex-wrap justify-between gap-2 font-medium">
                        <span>
                          Định kỳ · {studentMap.get(r.studentId)?.fullName ?? 'Học sinh'} (
                          {classMap.get(r.classId)?.name ?? ''}) ·{' '}
                          {r.subjectId ? (subjectMap.get(r.subjectId)?.name ?? 'Môn học') : 'Tổng hợp'}
                        </span>
                        <span className="text-teal-700 dark:text-teal-400">
                          {RATING_LEVEL_LABELS[r.ratingLevel]}
                        </span>
                      </div>
                      {r.summaryComment && (
                        <p className="mt-1 text-slate-600 dark:text-slate-400">{r.summaryComment}</p>
                      )}
                    </div>
                  ))}
                  {summary.assessments.lesson.slice(0, 30).map((l) => (
                    <div
                      key={l.id}
                      className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                    >
                      <div className="flex flex-wrap justify-between gap-2 font-medium">
                        <span>
                          Tiết học ({l.lessonDate}) · {studentMap.get(l.studentId)?.fullName ?? 'Học sinh'} ·{' '}
                          {subjectMap.get(l.subjectId)?.name ?? ''} ({classMap.get(l.classId)?.name ?? ''})
                        </span>
                        <span>
                          {RATING_LEVEL_LABELS[l.ratingLevel]}
                          {l.participationLevel ? ` · ${LESSON_PARTICIPATION_LABELS[l.participationLevel]}` : ''}
                        </span>
                      </div>
                      {l.criterionLabelsSnapshot && l.criterionLabelsSnapshot.length > 0 && (
                        <p className="mt-1 text-slate-600 dark:text-slate-400">
                          Tiêu chí: {l.criterionLabelsSnapshot.join(', ')}
                        </p>
                      )}
                      {l.learningProduct && (
                        <p className="mt-1 text-slate-600 dark:text-slate-400">
                          Sản phẩm: {l.learningProduct}
                        </p>
                      )}
                      {l.comment && <p className="mt-1 text-slate-600 dark:text-slate-400">{l.comment}</p>}
                    </div>
                  ))}
                  {summary.assessments.daily.slice(0, 30).map((d) => (
                    <div
                      key={d.id}
                      className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                    >
                      <div className="flex flex-wrap justify-between gap-2 font-medium">
                        <span>
                          Hằng ngày ({d.assessmentDate}) ·{' '}
                          {studentMap.get(d.studentId)?.fullName ?? 'Học sinh'} (
                          {classMap.get(d.classId)?.name ?? ''})
                        </span>
                        <span>
                          {d.evaluationStatus
                            ? DAILY_EVALUATION_STATUS_LABELS[d.evaluationStatus]
                            : d.ratingLevel
                              ? RATING_LEVEL_LABELS[d.ratingLevel]
                              : '—'}
                        </span>
                      </div>
                      {d.criterionLabelsSnapshot && d.criterionLabelsSnapshot.length > 0 && (
                        <p className="mt-1 text-slate-600 dark:text-slate-400">
                          Tiêu chí: {d.criterionLabelsSnapshot.join(', ')}
                        </p>
                      )}
                      {d.comment && <p className="mt-1 text-slate-600 dark:text-slate-400">{d.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
