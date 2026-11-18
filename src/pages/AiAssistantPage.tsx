import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  AI_ADVISORY_DISCLAIMER,
  AI_SCENARIO_LABELS,
  buildAnonymizedAiPayload,
  type AiAnalysisScope,
} from '../services/aiAnalysisService';
import {
  aiService,
  type AiStudentStructuredAnalysis,
} from '../services/aiService';
import { assessmentService } from '../services/assessmentService';
import { classStudentService } from '../services/classStudentService';
import { curriculumService } from '../services/curriculumService';
import { dailyAssessmentService } from '../services/dailyAssessmentService';
import { systemService } from '../services/systemService';
import type {
  AssessmentEvidence,
  AssessmentPeriod,
  AssessmentResult,
  AssessmentRule,
  Criterion,
  DailyAssessment,
  DailyBehaviorCriterion,
  LessonAssessment,
  Student,
  Subject,
} from '../types/models';
import {
  INPUT_CLASS,
  LABEL_CLASS,
  RATING_LEVEL_LABELS,
} from '../utils/labels';

const QUICK_QUESTION_PRESETS = [
  {
    id: 'periodic',
    label: 'Chuẩn bị nhận xét định kỳ',
    question:
      'Dựa trên bằng chứng quá trình đã ẩn danh, hãy gợi ý 2–3 câu nhận xét định kỳ ngắn gọn, mang tính khích lệ, phù hợp lứa tuổi tiểu học.',
  },
  {
    id: 'support',
    label: 'Gợi ý biện pháp hỗ trợ tiếp theo',
    question:
      'Phân tích những nội dung học sinh cần hỗ trợ thêm và đề xuất 2–3 bước đồng hành cụ thể trên lớp hoặc cùng phụ huynh.',
  },
  {
    id: 'audit',
    label: 'Rà soát dữ liệu thiếu / mâu thuẫn',
    question:
      'Kiểm tra xem hồ sơ bằng chứng hiện tại có điểm nào thiếu dữ liệu hoặc mâu thuẫn cần giáo viên xem xét lại trước khi đánh giá định kỳ không?',
  },
];

export const AiAssistantPage: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { activeYear, classes, settings, permissions, refreshWorkspace } = useWorkspace();
  const isOnline = useOnlineStatus();
  const aiEnabled = settings?.aiEnabled !== false;

  const [mode, setMode] = useState<'student_analysis' | 'general_qa'>('student_analysis');

  // Core data for student evidence analysis
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [periods, setPeriods] = useState<AssessmentPeriod[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [dailyCriteria, setDailyCriteria] = useState<DailyBehaviorCriterion[]>([]);
  const [rules, setRules] = useState<AssessmentRule[]>([]);
  const [lessonAssessments, setLessonAssessments] = useState<LessonAssessment[]>([]);
  const [dailyAssessments, setDailyAssessments] = useState<DailyAssessment[]>([]);
  const [evidenceList, setEvidenceList] = useState<AssessmentEvidence[]>([]);
  const [officialResults, setOfficialResults] = useState<AssessmentResult[]>([]);

  // Filter selections
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [scope, setScope] = useState<AiAnalysisScope>('SUBJECT');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [teacherQuestion, setTeacherQuestion] = useState(QUICK_QUESTION_PRESETS[0].question);
  const [showAnonymizedPreview, setShowAnonymizedPreview] = useState(false);

  // AI Responses
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [aiStructured, setAiStructured] = useState<AiStudentStructuredAnalysis | null>(null);
  const [generalPrompt, setGeneralPrompt] = useState('');
  const [generalReply, setGeneralReply] = useState('');
  const [submittingGeneral, setSubmittingGeneral] = useState(false);

  const availableClasses = useMemo(() => {
    const yearClasses = classes.filter(
      (c) => !c.isArchived && (!activeYear || c.academicYearId === activeYear.id)
    );
    if (!permissions.isScopedTeacher) return yearClasses;
    return yearClasses.filter((c) => permissions.allAllowedClassIds.has(c.id));
  }, [classes, activeYear, permissions]);

  useEffect(() => {
    if (availableClasses.length === 0) {
      setSelectedClassId('');
    } else if (!selectedClassId || !availableClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(availableClasses[0].id);
    }
  }, [availableClasses, selectedClassId]);

  useEffect(() => {
    const loadBase = async () => {
      const [subRes, perRes, critRes, dailyCritRes, rulesRes] = await Promise.all([
        curriculumService.listSubjects(),
        assessmentService.listPeriods(activeYear?.id),
        curriculumService.listCriteria(),
        dailyAssessmentService.listCriteria(true),
        curriculumService.listRules(),
      ]);
      if (subRes.ok) {
        const activeSubjs = subRes.data.filter((s) => s.isActive);
        setSubjects(activeSubjs);
        setSelectedSubjectId((prev) =>
          prev && activeSubjs.some((s) => s.id === prev) ? prev : activeSubjs[0]?.id ?? ''
        );
      }
      if (perRes.ok) setPeriods(perRes.data);
      if (critRes.ok) setCriteria(critRes.data);
      if (dailyCritRes.ok) setDailyCriteria(dailyCritRes.data);
      if (rulesRes.ok) setRules(rulesRes.data);
    };
    void loadBase();
  }, [activeYear?.id]);

  useEffect(() => {
    const loadClassData = async () => {
      if (!selectedClassId) {
        setStudents([]);
        setSelectedStudentId('');
        return;
      }
      const [stuRes, lessonRes, dailyRes, resRes] = await Promise.all([
        classStudentService.listStudents({ classId: selectedClassId }),
        assessmentService.listLessonAssessments({ classId: selectedClassId }),
        assessmentService.listDailyAssessments({ classId: selectedClassId }),
        assessmentService.listResults({ classId: selectedClassId }),
      ]);
      if (stuRes.ok) {
        setStudents(stuRes.data);
        setSelectedStudentId((prev) =>
          prev && stuRes.data.some((s) => s.id === prev) ? prev : stuRes.data[0]?.id ?? ''
        );
      }
      if (lessonRes.ok) setLessonAssessments(lessonRes.data);
      if (dailyRes.ok) setDailyAssessments(dailyRes.data);
      if (resRes.ok) setOfficialResults(resRes.data);
    };
    void loadClassData();
  }, [selectedClassId]);

  useEffect(() => {
    if (!selectedStudentId) {
      setEvidenceList([]);
      setAiStructured(null);
      return;
    }
    setAiStructured(null);
    void assessmentService.listEvidence(selectedStudentId).then((res) => {
      if (res.ok) setEvidenceList(res.data);
    });
  }, [selectedStudentId, scope, selectedSubjectId, selectedPeriodId]);

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const selectedClass = availableClasses.find((c) => c.id === selectedClassId);
  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  const anonymizedPayload = useMemo(() => {
    if (!selectedStudent) return null;
    return buildAnonymizedAiPayload({
      student: selectedStudent,
      schoolClass: selectedClass,
      scope,
      subject: scope === 'SUBJECT' ? selectedSubject : undefined,
      period: selectedPeriod,
      lessonAssessments,
      dailyAssessments,
      evidenceList,
      officialResults,
      criteria,
      dailyCriteria,
      rules,
    });
  }, [
    selectedStudent,
    selectedClass,
    scope,
    selectedSubject,
    selectedPeriod,
    lessonAssessments,
    dailyAssessments,
    evidenceList,
    officialResults,
    criteria,
    dailyCriteria,
    rules,
  ]);

  const handleAnalyzeWithAi = async () => {
    if (!anonymizedPayload) return;
    setAnalyzingAi(true);
    const res = await aiService.analyzeStudentEvidence({
      anonymizedContext: anonymizedPayload.contextText,
      teacherQuestion,
      scope: anonymizedPayload.scopeLabel,
    });
    setAnalyzingAi(false);

    if (res.ok) {
      setAiStructured(res.data.analysis);
    } else {
      notify('error', 'Không thể gọi Trợ lý AI', res.error);
    }
  };

  const handleSubmitGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!generalPrompt.trim()) return;
    setSubmittingGeneral(true);
    const res = await aiService.askAssistant({
      prompt: generalPrompt,
      context: activeYear ? `Năm học hiện hành: ${activeYear.name} (Ngữ cảnh ẩn danh, không kèm PII học sinh).` : '',
      taskType: 'Tư vấn sư phạm tiểu học (chỉ gợi ý tham khảo)',
    });
    setSubmittingGeneral(false);
    if (res.ok) {
      setGeneralReply(res.data.reply);
    } else {
      notify('error', 'Không thể gọi Trợ lý AI', res.error);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('success', 'Đã sao chép nội dung gợi ý để giáo viên xem và chỉnh sửa');
    } catch {
      notify('info', 'Hãy bôi đen đoạn văn bản để sao chép thủ công.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trợ lý AI sư phạm & Phân tích bằng chứng"
        description="Phân tích lịch sử đánh giá, phát hiện dữ liệu thiếu hoặc mâu thuẫn và gợi ý nhận xét khích lệ — chỉ mang tính tham khảo, dữ liệu học sinh được ẩn danh hóa trước khi gửi."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const res = await systemService.updateSettings({ aiEnabled: !aiEnabled });
                if (res.ok) {
                  notify(
                    'success',
                    !aiEnabled ? 'Đã bật Trợ lý AI trực tuyến' : 'Đã tắt Trợ lý AI — chỉ chạy phân tích cục bộ'
                  );
                  await refreshWorkspace();
                }
              }}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              {aiEnabled ? 'Đang bật AI (Nhấn để tắt)' : 'Đang tắt AI (Nhấn để bật)'}
            </button>
          </div>
        }
      />

      {/* Bắt buộc nhắc nguyên tắc giới hạn của AI */}
      <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50/70 p-4 text-xs text-teal-950 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-100">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
        <div className="space-y-1 leading-relaxed">
          <div className="font-semibold">{AI_ADVISORY_DISCLAIMER}</div>
          <div className="text-teal-900/80 dark:text-teal-200/90">
            Bảo vệ dữ liệu học sinh: Hệ thống chỉ gửi dữ liệu đánh giá cần thiết đã ẩn danh (không gửi họ tên, ngày sinh, mã học sinh, số điện thoại phụ huynh) qua máy chủ trung gian. Mọi gợi ý đều cần giáo viên xem, chỉnh sửa và xác nhận trước khi lưu kết quả chính thức.
          </div>
        </div>
      </div>

      {!aiEnabled && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-50 p-4 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
          <div>
            <p className="font-semibold">Trợ lý AI trực tuyến đang được tắt theo cài đặt bảo mật</p>
            <p className="mt-0.5">
              Không có dữ liệu nào được gửi ra ngoài. Phần <strong>Tổng hợp &amp; Rà soát bằng chứng cục bộ</strong> bên dưới và toàn bộ nghiệp vụ đánh giá vẫn hoạt động bình thường.
            </p>
          </div>
        </div>
      )}

      {!isOnline && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Thiết bị đang ngoại tuyến</p>
            <p className="mt-0.5">
              Các chức năng cốt lõi và phân tích bằng chứng cục bộ trên trình duyệt vẫn hoạt động bình thường. Kết nối Internet để sử dụng tính năng tổng hợp ngôn ngữ từ Trợ lý AI trực tuyến.
            </p>
          </div>
        </div>
      )}

      {/* Chế độ làm việc */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setMode('student_analysis')}
          className={`rounded-md px-3.5 py-1.5 text-xs font-medium whitespace-nowrap ${
            mode === 'student_analysis'
              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          Phân tích bằng chứng học sinh &amp; Gợi ý nhận xét
        </button>
        <button
          type="button"
          onClick={() => setMode('general_qa')}
          className={`rounded-md px-3.5 py-1.5 text-xs font-medium whitespace-nowrap ${
            mode === 'general_qa'
              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          Hỏi đáp sư phạm nhanh
        </button>
      </div>

      {mode === 'student_analysis' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* CỘT TRÁI: CHỌN PHẠM VI & KIỂM TRA ẨN DANH */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                1. Chọn phạm vi dữ liệu phân tích
              </h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLASS}>Lớp học</label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {availableClasses.length === 0 && <option value="">Chưa có lớp</option>}
                    {availableClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS}>Học sinh (chỉ hiển thị cục bộ)</label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {students.length === 0 && <option value="">Chưa có học sinh</option>}
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} ({s.studentCode})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>Lĩnh vực đánh giá cần phân tích</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as AiAnalysisScope)}
                  className={INPUT_CLASS}
                >
                  <option value="SUBJECT">Theo môn học cụ thể (Tách biệt hành vi GVCN)</option>
                  <option value="QUALITY_COMPETENCY">Phẩm chất &amp; Năng lực chung (Kênh GVCN)</option>
                  <option value="PERIODIC_PREP">Chuẩn bị nhận xét định kỳ tổng hợp</option>
                </select>
              </div>

              {scope === 'SUBJECT' && (
                <div>
                  <label className={LABEL_CLASS}>Môn học *</label>
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className={LABEL_CLASS}>Đợt đánh giá định kỳ (tùy chọn đối chiếu)</label>
                <select
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Không gắn kỳ cụ thể</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className={LABEL_CLASS}>Yêu cầu cụ thể cho Trợ lý AI</label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_QUESTION_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setTeacherQuestion(p.question)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-teal-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  value={teacherQuestion}
                  onChange={(e) => setTeacherQuestion(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              {anonymizedPayload && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Kiểm tra ẩn danh hóa dữ liệu
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAnonymizedPreview((v) => !v)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      {showAnonymizedPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {showAnonymizedPreview ? 'Thu gọn' : 'Xem gói tin gửi AI'}
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    Đã loại bỏ: {anonymizedPayload.redactedFields.join(' · ')}
                  </div>
                  {showAnonymizedPreview && (
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {anonymizedPayload.contextText}
                    </pre>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={!anonymizedPayload || analyzingAi || !aiEnabled || !isOnline}
                onClick={() => void handleAnalyzeWithAi()}
                className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {analyzingAi ? 'Đang tạo gợi ý tham khảo...' : 'Phân tích & Gợi ý bằng Trợ lý AI'}
              </button>
            </div>
          </div>

          {/* CỘT PHẢI: KẾT QUẢ PHÂN TÍCH CỤC BỘ (OFFLINE) + GỢI Ý AI */}
          <div className="lg:col-span-7 space-y-5">
            {!anonymizedPayload ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                Chọn lớp học và học sinh để xem tổng hợp bằng chứng và gợi ý từ Trợ lý AI.
              </div>
            ) : (
              <>
                {/* Khối 1: Tổng hợp & Rà soát bằng chứng cục bộ (luôn sẵn sàng kể cả ngoại tuyến) */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Tổng hợp &amp; Rà soát dữ liệu cục bộ (Hoạt động cả ngoại tuyến)
                      </h2>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {anonymizedPayload.scopeLabel} · {anonymizedPayload.localAnalysis.evidenceCount} bằng chứng ghi nhận ·{' '}
                        <span className="font-medium text-teal-800 dark:text-teal-300">
                          {AI_SCENARIO_LABELS[anonymizedPayload.localAnalysis.scenario]}
                        </span>
                      </div>
                    </div>
                  </div>

                  {anonymizedPayload.localAnalysis.dataIssues.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                        Cảnh báo dữ liệu thiếu / mâu thuẫn / lưu ý nghiệp vụ
                      </div>
                      <ul className="list-disc pl-5 space-y-1">
                        {anonymizedPayload.localAnalysis.dataIssues.map((issue, idx) => (
                          <li key={idx}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                        Điểm mạnh tổng hợp từ bằng chứng
                      </div>
                      {anonymizedPayload.localAnalysis.strengths.length === 0 ? (
                        <p className="text-xs text-slate-500">Chưa có đủ dữ liệu điểm mạnh cụ thể.</p>
                      ) : (
                        <ul className="list-disc pl-4 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                          {anonymizedPayload.localAnalysis.strengths.map((st, i) => (
                            <li key={i}>{st}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-amber-800 dark:text-amber-400">
                        Nội dung cần hỗ trợ thêm
                      </div>
                      {anonymizedPayload.localAnalysis.supportNeeds.length === 0 ? (
                        <p className="text-xs text-slate-500">Chưa ghi nhận khó khăn lặp lại cần hỗ trợ.</p>
                      ) : (
                        <ul className="list-disc pl-4 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                          {anonymizedPayload.localAnalysis.supportNeeds.map((sp, i) => (
                            <li key={i}>{sp}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Kết quả chính thức đã lưu (chỉ đọc) */}
                  <div className="border-t border-slate-100 pt-3 text-xs dark:border-slate-800 space-y-1.5">
                    <div className="font-semibold text-slate-700 dark:text-slate-300">
                      Kết quả chính thức hiện đã xác nhận (AI không được phép tự sửa):
                    </div>
                    {anonymizedPayload.localAnalysis.confirmedOfficialResults.length === 0 ? (
                      <p className="text-slate-500">Chưa có kết quả định kỳ chính thức được lưu cho phạm vi này.</p>
                    ) : (
                      <div className="space-y-1">
                        {anonymizedPayload.localAnalysis.confirmedOfficialResults.map((r) => (
                          <div key={r.id} className="text-slate-700 dark:text-slate-300 tabular-nums">
                            {RATING_LEVEL_LABELS[r.ratingLevel]}
                            {r.numericScore !== undefined ? ` · Điểm KTĐK: ${r.numericScore}` : ''}
                            {r.summaryComment ? ` · "${r.summaryComment}"` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Mẫu gợi ý cục bộ */}
                  <div className="border-t border-slate-100 pt-3 space-y-2 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Gợi ý cục bộ tham khảo (chưa lưu chính thức)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/danh-gia-dinh-ky?classId=${selectedClassId}${
                              selectedSubjectId && scope === 'SUBJECT' ? `&subjectId=${selectedSubjectId}` : ''
                            }${selectedPeriodId ? `&periodId=${selectedPeriodId}` : ''}`
                          )
                        }
                        className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                      >
                        Mở Đánh giá định kỳ để giáo viên xác nhận →
                      </button>
                    </div>
                    {anonymizedPayload.localAnalysis.suggestedDraftComments.map((tpl, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-2.5 text-xs dark:border-slate-800"
                      >
                        <span className="text-slate-800 dark:text-slate-200">{tpl}</span>
                        <button
                          type="button"
                          onClick={() => void copyToClipboard(tpl)}
                          className="shrink-0 font-medium text-teal-700 hover:underline dark:text-teal-400"
                        >
                          Sao chép
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Khối 2: Phản hồi có cấu trúc từ Trợ lý AI trực tuyến */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Phân tích &amp; Gợi ý từ Trợ lý AI (Chỉ tham khảo)
                      </h2>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      Không phải kết luận chính thức
                    </span>
                  </div>

                  {!aiStructured ? (
                    <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      Nhấn <strong>Phân tích &amp; Gợi ý bằng Trợ lý AI</strong> ở khung bên trái để nhận phân tích sâu và gợi ý nhận xét phù hợp lứa tuổi (đã ẩn danh hoàn toàn thông tin học sinh).
                    </div>
                  ) : (
                    <div className="space-y-4 text-xs">
                      <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3 text-teal-950 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-100">
                        <div className="font-semibold mb-1">{aiStructured.disclaimer}</div>
                        <p className="leading-relaxed">{aiStructured.summary}</p>
                      </div>

                      {aiStructured.dataGapsOrConflicts.length > 0 && (
                        <div className="space-y-1">
                          <div className="font-semibold text-amber-800 dark:text-amber-400">
                            Dữ liệu thiếu hoặc điểm chưa thống nhất cần kiểm tra:
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                            {aiStructured.dataGapsOrConflicts.map((g, i) => (
                              <li key={i}>{g}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <div className="font-semibold text-emerald-800 dark:text-emerald-400">
                            Điểm mạnh (Gợi ý AI)
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                            {aiStructured.strengths.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-1">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            Cần hỗ trợ &amp; Bước tiếp theo
                          </div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                            {[...aiStructured.supportNeeds, ...aiStructured.nextSupportActions].map((n, i) => (
                              <li key={i}>{n}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {aiStructured.suggestedComments.length > 0 && (
                        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            Mẫu nhận xét ngắn gọn gợi ý (Giáo viên xem, sửa trước khi dùng):
                          </div>
                          {aiStructured.suggestedComments.map((comment, idx) => (
                            <div
                              key={idx}
                              className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800"
                            >
                              <div className="flex items-start gap-2 text-slate-800 dark:text-slate-200">
                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" />
                                <span>{comment}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => void copyToClipboard(comment)}
                                className="shrink-0 font-medium text-teal-700 hover:underline dark:text-teal-400"
                              >
                                Sao chép
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* TAB 2: HỎI ĐÁP SƯ PHẠM NHANH */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={(e) => void handleSubmitGeneral(e)}
            className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Đặt câu hỏi sư phạm chung (Không gửi thông tin định danh học sinh)
            </h2>
            <div>
              <label className={LABEL_CLASS}>Nội dung yêu cầu *</label>
              <textarea
                required
                rows={5}
                value={generalPrompt}
                onChange={(e) => setGeneralPrompt(e.target.value)}
                placeholder="VD: Gợi ý các hoạt động hỗ trợ học sinh lớp 2 rèn kỹ năng đọc lưu loát..."
                className={INPUT_CLASS}
              />
            </div>
            <button
              type="submit"
              disabled={submittingGeneral || !isOnline || !aiEnabled}
              className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {submittingGeneral ? 'Đang xử lý...' : 'Gửi câu hỏi gợi ý'}
            </button>
          </form>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Gợi ý từ Trợ lý AI (Không phải kết luận chính thức)
                </h2>
              </div>
            </div>
            {generalReply ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                {generalReply}
              </div>
            ) : (
              <div className="flex min-h-[220px] items-center justify-center text-sm text-slate-500">
                Nhập câu hỏi sư phạm ở khung bên trái để nhận gợi ý tham khảo.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
