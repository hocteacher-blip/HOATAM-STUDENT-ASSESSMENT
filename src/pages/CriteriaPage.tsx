import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Edit2,
  ListChecks,
  Plus,
  Power,
  Scale,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { PageHeader } from '../components/common/PageHeader';
import { useNotification } from '../contexts/NotificationContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  assessmentRuleService,
  getDefaultLevelCriteriaForGroup,
  getValidRatingsForRuleGroup,
} from '../services/assessmentRuleService';
import {
  curriculumService,
  type AssessmentRuleInput,
  type CriterionInput,
} from '../services/curriculumService';
import {
  AssessmentPeriodType,
  AssessmentRatingLevel,
  CriteriaCategory,
  type AssessmentRule,
  type AssessmentRuleCommentTemplate,
  type AssessmentRuleEvidenceType,
  type AssessmentRuleGroup,
  type AssessmentRuleLevelCriterion,
  type Criterion,
  type Subject,
} from '../types/models';
import {
  CRITERIA_CATEGORY_LABELS,
  INPUT_CLASS,
  LABEL_CLASS,
  PERIOD_TYPE_LABELS,
  RATING_LEVEL_LABELS,
  RULE_EVIDENCE_TYPE_LABELS,
  RULE_GROUP_LABELS,
} from '../utils/labels';

const ALL_EVIDENCE_TYPES: AssessmentRuleEvidenceType[] = [
  'LESSON_OBSERVATION',
  'LEARNING_PRODUCT',
  'PERIODIC_TEST',
  'DAILY_HABIT',
  'PORTFOLIO',
];

function createEmptyRuleForm(activeYearId?: string): AssessmentRuleInput {
  return {
    code: '',
    name: '',
    academicYearId: activeYearId || '',
    ruleGroup: 'SUBJECT',
    gradeLevels: [1, 2, 3, 4, 5],
    subjectId: '',
    periodType: undefined,
    circularReference: 'Thông tư 27/2020/TT-BGDĐT (có thể cập nhật theo văn bản mới)',
    versionLabel: 'Phiên bản 1.0',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    minScoreForHTT: 9,
    minScoreForHT: 5,
    evidenceRequirements:
      'Kết hợp đánh giá thường xuyên theo tiết học, sản phẩm thực hành và kiểm tra định kỳ (nếu có); không đánh giá chỉ bằng đếm số lượt tích cực/tiêu cực.',
    requiredEvidenceTypes: ['LESSON_OBSERVATION', 'LEARNING_PRODUCT'],
    levelCriteria: getDefaultLevelCriteriaForGroup('SUBJECT'),
    commentTemplates: [],
    description: '',
    isActive: true,
  };
}

export const CriteriaPage: React.FC = () => {
  const { notify } = useNotification();
  const { activeYear, academicYears, permissions } = useWorkspace();
  const [tab, setTab] = useState<'criteria' | 'rules'>('criteria');
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [rules, setRules] = useState<AssessmentRule[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [criterionModal, setCriterionModal] = useState(false);
  const [ruleModal, setRuleModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleFilterGroup, setRuleFilterGroup] = useState<string>('ALL');

  const [cForm, setCForm] = useState<CriterionInput>({
    code: '',
    name: '',
    category: CriteriaCategory.SUBJECT_COMPETENCY,
    subjectId: '',
    gradeLevel: undefined,
    description: '',
    indicators: '',
  });

  const [rForm, setRForm] = useState<AssessmentRuleInput>(createEmptyRuleForm());
  const [newTplRating, setNewTplRating] = useState<AssessmentRatingLevel>(AssessmentRatingLevel.HTT);
  const [newTplTitle, setNewTplTitle] = useState('');
  const [newTplText, setNewTplText] = useState('');

  const loadAll = async () => {
    const [cRes, rRes, sRes] = await Promise.all([
      curriculumService.listCriteria(),
      curriculumService.listRules(),
      curriculumService.listSubjects(),
    ]);
    if (cRes.ok) setCriteria(cRes.data);
    if (rRes.ok) setRules(rRes.data);
    if (sRes.ok) setSubjects(sRes.data);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const yearMap = new Map(academicYears.map((y) => [y.id, y]));

  const handleSaveCriterion = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await curriculumService.createCriterion({
      ...cForm,
      subjectId: cForm.subjectId || undefined,
    });
    if (res.ok) {
      notify('success', 'Đã thêm tiêu chí đánh giá');
      setCriterionModal(false);
      await loadAll();
    } else {
      notify('error', 'Không thể lưu tiêu chí', res.error);
    }
  };

  const openCreateRuleModal = () => {
    setEditingRuleId(null);
    const initial = createEmptyRuleForm(activeYear?.id);
    setRForm(initial);
    setNewTplRating(AssessmentRatingLevel.HTT);
    setNewTplTitle('');
    setNewTplText('');
    setRuleModal(true);
  };

  const openEditRuleModal = (rule: AssessmentRule) => {
    const group: AssessmentRuleGroup = rule.ruleGroup ?? 'SUBJECT';
    setEditingRuleId(rule.id);
    setRForm({
      code: rule.code,
      name: rule.name,
      academicYearId: rule.academicYearId ?? '',
      ruleGroup: group,
      gradeLevels: rule.gradeLevels && rule.gradeLevels.length > 0 ? rule.gradeLevels : [1, 2, 3, 4, 5],
      subjectId: rule.subjectId ?? '',
      periodType: rule.periodType,
      circularReference: rule.circularReference,
      versionLabel: rule.versionLabel ?? '',
      effectiveFrom: rule.effectiveFrom ?? '',
      minScoreForHTT: rule.minScoreForHTT,
      minScoreForHT: rule.minScoreForHT,
      evidenceRequirements: rule.evidenceRequirements ?? '',
      requiredEvidenceTypes: rule.requiredEvidenceTypes ?? ['LESSON_OBSERVATION'],
      levelCriteria:
        rule.levelCriteria && rule.levelCriteria.length > 0
          ? rule.levelCriteria
          : getDefaultLevelCriteriaForGroup(group),
      commentTemplates: rule.commentTemplates ?? [],
      description: rule.description,
      isActive: rule.isActive,
    });
    const validOpts = getValidRatingsForRuleGroup(group);
    setNewTplRating(validOpts[0].value);
    setNewTplTitle('');
    setNewTplText('');
    setRuleModal(true);
  };

  const handleRuleGroupChange = (nextGroup: AssessmentRuleGroup) => {
    const validOpts = getValidRatingsForRuleGroup(nextGroup);
    setRForm((prev) => ({
      ...prev,
      ruleGroup: nextGroup,
      subjectId: nextGroup === 'QUALITY_COMPETENCY' ? '' : prev.subjectId,
      requiredEvidenceTypes:
        nextGroup === 'QUALITY_COMPETENCY'
          ? ['DAILY_HABIT', 'PORTFOLIO']
          : ['LESSON_OBSERVATION', 'LEARNING_PRODUCT'],
      levelCriteria: getDefaultLevelCriteriaForGroup(nextGroup),
      commentTemplates: (prev.commentTemplates ?? []).filter((tpl) =>
        validOpts.some((o) => o.value === tpl.ratingLevel)
      ),
    }));
    setNewTplRating(validOpts[0].value);
  };

  const toggleRuleGrade = (grade: number) => {
    setRForm((prev) => {
      const current = prev.gradeLevels ?? [];
      const exists = current.includes(grade);
      const next = exists ? current.filter((g) => g !== grade) : [...current, grade].sort((a, b) => a - b);
      return { ...prev, gradeLevels: next };
    });
  };

  const toggleRuleEvidenceType = (evType: AssessmentRuleEvidenceType) => {
    setRForm((prev) => {
      const current = prev.requiredEvidenceTypes ?? [];
      const exists = current.includes(evType);
      const next = exists ? current.filter((x) => x !== evType) : [...current, evType];
      return { ...prev, requiredEvidenceTypes: next };
    });
  };

  const updateLevelCriterion = (
    ratingLevel: AssessmentRatingLevel,
    patch: Partial<AssessmentRuleLevelCriterion>
  ) => {
    setRForm((prev) => ({
      ...prev,
      levelCriteria: (prev.levelCriteria ?? []).map((lc) =>
        lc.ratingLevel === ratingLevel ? { ...lc, ...patch } : lc
      ),
    }));
  };

  const handleAddCommentTemplate = () => {
    if (!newTplText.trim()) return;
    const item: AssessmentRuleCommentTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ratingLevel: newTplRating,
      title: newTplTitle.trim() || RATING_LEVEL_LABELS[newTplRating],
      templateText: newTplText.trim(),
    };
    setRForm((prev) => ({
      ...prev,
      commentTemplates: [...(prev.commentTemplates ?? []), item],
    }));
    setNewTplTitle('');
    setNewTplText('');
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: AssessmentRuleInput = {
      ...rForm,
      academicYearId: rForm.academicYearId || undefined,
      subjectId: rForm.ruleGroup === 'QUALITY_COMPETENCY' ? undefined : rForm.subjectId || undefined,
      periodType: rForm.periodType || undefined,
      gradeLevels: rForm.gradeLevels && rForm.gradeLevels.length > 0 ? rForm.gradeLevels : [1, 2, 3, 4, 5],
    };

    const res = editingRuleId
      ? await curriculumService.updateRule(editingRuleId, payload)
      : await curriculumService.createRule(payload);

    if (res.ok) {
      notify('success', editingRuleId ? 'Đã cập nhật quy tắc đánh giá' : 'Đã thêm quy tắc đánh giá');
      setRuleModal(false);
      await loadAll();
    } else {
      notify('error', 'Không thể lưu quy tắc', res.error);
    }
  };

  const filteredRules = rules.filter((r) => {
    if (ruleFilterGroup === 'ALL') return true;
    return (r.ruleGroup ?? 'SUBJECT') === ruleFilterGroup;
  });

  const currentRuleGroup: AssessmentRuleGroup = rForm.ruleGroup ?? 'SUBJECT';
  const currentValidRatings = getValidRatingsForRuleGroup(currentRuleGroup);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tiêu chí & Bộ quy tắc đánh giá"
        description="Thiết lập bộ tiêu chí năng lực, phẩm chất và bộ quy tắc đánh giá cấu hình linh hoạt theo môn học, khối lớp, năm học, đợt đánh giá và văn bản hiện hành."
        actions={
          tab === 'criteria' ? (
            <button
              type="button"
              onClick={() => {
                setCForm({
                  code: '',
                  name: '',
                  category: CriteriaCategory.SUBJECT_COMPETENCY,
                  subjectId: '',
                  description: '',
                  indicators: '',
                });
                setCriterionModal(true);
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Thêm tiêu chí
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  const res = await assessmentRuleService.installReferenceRules(activeYear?.id);
                  if (res.ok) {
                    notify(
                      'success',
                      res.data.length > 0
                        ? `Đã nạp ${res.data.length} bộ quy tắc tham khảo`
                        : 'Các bộ quy tắc tham khảo đã có sẵn trong danh sách'
                    );
                    await loadAll();
                  } else {
                    notify('error', 'Không thể nạp bộ quy tắc tham khảo', res.error);
                  }
                }}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-teal-600 bg-teal-50 px-3.5 py-2 text-xs font-medium text-teal-800 hover:bg-teal-100 dark:border-teal-500 dark:bg-teal-950/40 dark:text-teal-200 whitespace-nowrap"
              >
                <Sparkles className="h-4 w-4" />
                Nạp bộ quy tắc tham khảo
              </button>
              <button
                type="button"
                onClick={openCreateRuleModal}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Thêm quy tắc
              </button>
            </div>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setTab('criteria')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              tab === 'criteria'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Tiêu chí đánh giá ({criteria.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('rules')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              tab === 'rules'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Bộ quy tắc đánh giá ({rules.length})
          </button>
        </div>

        {tab === 'rules' && (
          <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
            {[
              { id: 'ALL', label: 'Tất cả nhóm' },
              { id: 'SUBJECT', label: 'Môn học (T / H / C)' },
              { id: 'QUALITY_COMPETENCY', label: 'Phẩm chất & Năng lực (T / Đ / C)' },
              { id: 'OVERALL', label: 'Tổng hợp định kỳ' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRuleFilterGroup(item.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                  ruleFilterGroup === item.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'criteria' ? (
        criteria.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Chưa có tiêu chí đánh giá"
            description="Tạo các tiêu chí theo phẩm chất, năng lực chung, năng lực đặc thù môn học hoặc nề nếp hằng ngày."
            actionLabel="Thêm tiêu chí đầu tiên"
            onAction={() => setCriterionModal(true)}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Mã tiêu chí</th>
                  <th className="px-4 py-3">Tên tiêu chí</th>
                  <th className="px-4 py-3">Nhóm</th>
                  <th className="px-4 py-3">Môn học</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {criteria.map((c) => (
                  <tr key={c.id} className={c.isHidden ? 'opacity-60' : ''}>
                    <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {c.name} {c.isHidden && <span className="text-xs text-slate-500">(Đang ẩn)</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">{CRITERIA_CATEGORY_LABELS[c.category]}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {c.subjectId ? (subjectMap.get(c.subjectId)?.name ?? '—') : 'Chung'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await curriculumService.removeCriterion(c.id);
                          if (res.ok) {
                            notify('success', 'Đã xóa tiêu chí');
                            await loadAll();
                          } else {
                            notify('error', 'Không thể xóa tiêu chí', res.error);
                          }
                        }}
                        className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <strong>Nguyên tắc cấu hình bộ quy tắc:</strong> Phân tách rõ thang đánh giá{' '}
            <strong>Môn học &amp; HĐGD (T: Hoàn thành tốt / H: Hoàn thành / C: Chưa hoàn thành)</strong> và thang đánh giá{' '}
            <strong>Phẩm chất &amp; Năng lực (T: Tốt / Đ: Đạt / C: Cần cố gắng)</strong>. Quy tắc được lưu động để trường và giáo viên chỉnh sửa theo văn bản hiện hành, dựa trên bằng chứng đa chiều (không đếm đơn thuần số lần tích cực/tiêu cực).
          </div>

          {filteredRules.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="Chưa có quy tắc đánh giá trong nhóm này"
              description="Thiết lập bộ quy tắc theo môn học, khối lớp, năm học và đợt đánh giá, hoặc nạp bộ quy tắc tham khảo để tùy chỉnh."
              actionLabel="Thêm quy tắc mới"
              onAction={openCreateRuleModal}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filteredRules.map((r) => {
                const group = r.ruleGroup ?? 'SUBJECT';
                return (
                  <div
                    key={r.id}
                    className={`rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-3 ${
                      !r.isActive ? 'opacity-65' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono font-semibold text-teal-700 dark:text-teal-400">
                            {r.code}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{RULE_GROUP_LABELS[group]}</span>
                          <span aria-hidden="true">·</span>
                          <span className={r.isActive ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-500'}>
                            {r.isActive ? 'Đang áp dụng' : 'Tạm ngưng'}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {r.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title="Chỉnh sửa quy tắc"
                          onClick={() => openEditRuleModal(r)}
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title={r.isActive ? 'Tạm ngưng quy tắc' : 'Kích hoạt quy tắc'}
                          onClick={async () => {
                            const res = await curriculumService.updateRule(r.id, { isActive: !r.isActive });
                            if (res.ok) {
                              notify('success', r.isActive ? 'Đã tạm ngưng quy tắc' : 'Đã kích hoạt quy tắc');
                              await loadAll();
                            } else {
                              notify('error', 'Không thể cập nhật quy tắc', res.error);
                            }
                          }}
                          className="rounded-lg p-1.5 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/50"
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        {permissions.canManageAssignments && (
                          <button
                            type="button"
                            title="Xóa quy tắc"
                            onClick={async () => {
                              const res = await curriculumService.removeRule(r.id);
                              if (res.ok) {
                                notify('success', 'Đã xóa quy tắc');
                                await loadAll();
                              } else {
                                notify('error', 'Không thể xóa quy tắc', res.error);
                              }
                            }}
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>Căn cứ: {r.circularReference}</span>
                      {r.versionLabel && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{r.versionLabel}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>
                        Năm: {r.academicYearId ? yearMap.get(r.academicYearId)?.name ?? 'Theo năm' : 'Tất cả năm'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Khối: {r.gradeLevels && r.gradeLevels.length > 0 ? r.gradeLevels.join(', ') : '1–5'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Môn: {r.subjectId ? subjectMap.get(r.subjectId)?.name ?? '—' : 'Tất cả trong nhóm'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Đợt: {r.periodType ? PERIOD_TYPE_LABELS[r.periodType] : 'Mọi đợt đánh giá'}
                      </span>
                    </div>

                    {r.evidenceRequirements && (
                      <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        <strong>Điều kiện &amp; Bằng chứng:</strong> {r.evidenceRequirements}
                      </p>
                    )}

                    {r.requiredEvidenceTypes && r.requiredEvidenceTypes.length > 0 && (
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Nguồn bằng chứng: </span>
                        {r.requiredEvidenceTypes.map((t) => RULE_EVIDENCE_TYPE_LABELS[t]).join(' · ')}
                      </div>
                    )}

                    {r.levelCriteria && r.levelCriteria.length > 0 && (
                      <div className="space-y-1 border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800">
                        {r.levelCriteria.map((lc) => (
                          <div key={lc.ratingLevel} className="text-slate-700 dark:text-slate-300">
                            <span className="font-semibold text-teal-800 dark:text-teal-300">
                              {RATING_LEVEL_LABELS[lc.ratingLevel]}:
                            </span>{' '}
                            {lc.conditionSummary}
                            {lc.minScore !== undefined && (
                              <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                                {' '}(Điểm ≥ {lc.minScore})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {r.commentTemplates && r.commentTemplates.length > 0 && (
                      <div className="border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          Mẫu nhận xét ({r.commentTemplates.length}):{' '}
                        </span>
                        {r.commentTemplates.map((t) => t.title).join(' · ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: THÊM TIÊU CHÍ */}
      <Modal isOpen={criterionModal} title="Thêm tiêu chí đánh giá" onClose={() => setCriterionModal(false)}>
        <form onSubmit={(e) => void handleSaveCriterion(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Mã tiêu chí *</label>
              <input
                required
                value={cForm.code}
                onChange={(e) => setCForm({ ...cForm, code: e.target.value })}
                placeholder="VD: TC-TOAN-01"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Nhóm tiêu chí *</label>
              <select
                value={cForm.category}
                onChange={(e) => setCForm({ ...cForm, category: e.target.value as CriteriaCategory })}
                className={INPUT_CLASS}
              >
                {Object.entries(CRITERIA_CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Tên tiêu chí *</label>
            <input
              required
              value={cForm.name}
              onChange={(e) => setCForm({ ...cForm, name: e.target.value })}
              placeholder="VD: Thực hiện thành thạo phép cộng trừ trong phạm vi 100"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Gắn với môn học (tùy chọn)</label>
            <select
              value={cForm.subjectId ?? ''}
              onChange={(e) => setCForm({ ...cForm, subjectId: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="">Tiêu chí chung (không gắn môn riêng)</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Biểu hiện cụ thể / Ghi chú</label>
            <textarea
              rows={2}
              value={cForm.description ?? ''}
              onChange={(e) => setCForm({ ...cForm, description: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCriterionModal(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              Lưu tiêu chí
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: CẤU HÌNH QUY TẮC ĐÁNH GIÁ */}
      <Modal
        isOpen={ruleModal}
        title={editingRuleId ? 'Chỉnh sửa quy tắc đánh giá' : 'Thiết lập quy tắc đánh giá mới'}
        onClose={() => setRuleModal(false)}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={(e) => void handleSaveRule(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS}>Mã quy tắc *</label>
              <input
                required
                value={rForm.code}
                onChange={(e) => setRForm({ ...rForm, code: e.target.value })}
                placeholder="VD: QT-MYTHUAT-K3"
                className={INPUT_CLASS}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL_CLASS}>Nhóm &amp; Hệ mức đánh giá *</label>
              <select
                value={currentRuleGroup}
                onChange={(e) => handleRuleGroupChange(e.target.value as AssessmentRuleGroup)}
                className={INPUT_CLASS}
              >
                {Object.entries(RULE_GROUP_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Tên quy tắc *</label>
            <input
              required
              value={rForm.name}
              onChange={(e) => setRForm({ ...rForm, name: e.target.value })}
              placeholder="VD: Quy tắc đánh giá môn Mĩ thuật khối 3 cuối học kỳ"
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL_CLASS}>Năm học áp dụng</label>
              <select
                value={rForm.academicYearId ?? ''}
                onChange={(e) => setRForm({ ...rForm, academicYearId: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">Tất cả năm học</option>
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Môn học (nếu áp dụng riêng)</label>
              <select
                disabled={currentRuleGroup === 'QUALITY_COMPETENCY'}
                value={currentRuleGroup === 'QUALITY_COMPETENCY' ? '' : rForm.subjectId ?? ''}
                onChange={(e) => setRForm({ ...rForm, subjectId: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">Tất cả môn trong nhóm</option>
                {subjects
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Đợt đánh giá</label>
              <select
                value={rForm.periodType ?? ''}
                onChange={(e) =>
                  setRForm({
                    ...rForm,
                    periodType: (e.target.value || undefined) as AssessmentPeriodType | undefined,
                  })
                }
                className={INPUT_CLASS}
              >
                <option value="">Tất cả các đợt</option>
                {Object.entries(PERIOD_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className={LABEL_CLASS}>Căn cứ văn bản (có thể cập nhật theo văn bản mới)</label>
              <input
                value={rForm.circularReference}
                onChange={(e) => setRForm({ ...rForm, circularReference: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Phiên bản / Hiệu lực</label>
              <input
                value={rForm.versionLabel ?? ''}
                onChange={(e) => setRForm({ ...rForm, versionLabel: e.target.value })}
                placeholder="VD: v2.0 - 2026"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Khối lớp áp dụng</label>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((grade) => {
                const selected = (rForm.gradeLevels ?? []).includes(grade);
                return (
                  <button
                    key={grade}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleRuleGrade(grade)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      selected
                        ? 'border-teal-600 bg-teal-50 text-teal-900 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-200'
                        : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Khối {grade}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Bằng chứng cần xem xét (đa nguồn, không chỉ đếm lượt)</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ALL_EVIDENCE_TYPES.map((evType) => {
                const checked = (rForm.requiredEvidenceTypes ?? []).includes(evType);
                return (
                  <label
                    key={evType}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                      checked
                        ? 'border-teal-600 bg-teal-50/70 text-teal-950 dark:border-teal-500 dark:bg-teal-950/40 dark:text-teal-100'
                        : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRuleEvidenceType(evType)}
                    />
                    <span>{RULE_EVIDENCE_TYPE_LABELS[evType]}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Mô tả điều kiện xét &amp; yêu cầu bằng chứng</label>
            <textarea
              rows={2}
              value={rForm.evidenceRequirements ?? ''}
              onChange={(e) => setRForm({ ...rForm, evidenceRequirements: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>

          {currentRuleGroup !== 'QUALITY_COMPETENCY' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLASS}>Ngưỡng điểm tham khảo mức T: Hoàn thành tốt (nếu môn có điểm)</label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={10}
                  value={rForm.minScoreForHTT ?? ''}
                  onChange={(e) =>
                    setRForm({
                      ...rForm,
                      minScoreForHTT: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Ngưỡng điểm tham khảo mức H: Hoàn thành (nếu môn có điểm)</label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={10}
                  value={rForm.minScoreForHT ?? ''}
                  onChange={(e) =>
                    setRForm({
                      ...rForm,
                      minScoreForHT: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          )}

          {/* Điều kiện chi tiết theo từng mức */}
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Điều kiện cụ thể theo từng mức ({currentRuleGroup === 'QUALITY_COMPETENCY' ? 'T / Đ / C' : 'T / H / C'})
            </div>
            {(rForm.levelCriteria ?? []).map((lc) => (
              <div key={lc.ratingLevel} className="space-y-1">
                <label className="block text-[11px] font-semibold text-teal-800 dark:text-teal-300">
                  {RATING_LEVEL_LABELS[lc.ratingLevel]}
                </label>
                <input
                  value={lc.conditionSummary}
                  onChange={(e) =>
                    updateLevelCriterion(lc.ratingLevel, { conditionSummary: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
              </div>
            ))}
          </div>

          {/* Mẫu nhận xét */}
          <div className="space-y-2.5 rounded-lg border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Mẫu nhận xét đi kèm quy tắc ({(rForm.commentTemplates ?? []).length})
            </div>
            {(rForm.commentTemplates ?? []).map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {RATING_LEVEL_LABELS[tpl.ratingLevel]} · {tpl.title}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">{tpl.templateText}</div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRForm((prev) => ({
                      ...prev,
                      commentTemplates: (prev.commentTemplates ?? []).filter((x) => x.id !== tpl.id),
                    }))
                  }
                  className="text-red-600 hover:underline dark:text-red-400 shrink-0"
                >
                  Xóa
                </button>
              </div>
            ))}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select
                value={newTplRating}
                onChange={(e) => setNewTplRating(e.target.value as AssessmentRatingLevel)}
                className={INPUT_CLASS}
              >
                {currentValidRatings.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                value={newTplTitle}
                onChange={(e) => setNewTplTitle(e.target.value)}
                placeholder="Tiêu đề mẫu (VD: Nổi bật)"
                className={INPUT_CLASS}
              />
              <button
                type="button"
                onClick={handleAddCommentTemplate}
                className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-teal-600 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/40"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Thêm mẫu nhận xét
              </button>
            </div>
            <input
              value={newTplText}
              onChange={(e) => setNewTplText(e.target.value)}
              placeholder="Nội dung mẫu nhận xét gợi ý cho giáo viên..."
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setRuleModal(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              {editingRuleId ? 'Cập nhật quy tắc' : 'Lưu quy tắc'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
