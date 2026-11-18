import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  ClipboardCheck,
  GraduationCap,
  School,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '../components/common/PageHeader';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { systemService, type OverviewStats } from '../services/systemService';
import { formatDateTimeVi } from '../utils/labels';

export const OverviewPage: React.FC = () => {
  const { activeYear, settings } = useWorkspace();
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const res = await systemService.getOverviewStats(activeYear?.id);
      if (active && res.ok) {
        setStats(res.data);
      }
      if (active) setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, [activeYear?.id]);

  const kpis = [
    {
      label: 'Lớp học',
      value: stats?.classesCount ?? 0,
      sub: activeYear ? `Năm học ${activeYear.name}` : 'Chưa chọn năm học',
      icon: School,
      to: '/lop-hoc',
    },
    {
      label: 'Học sinh',
      value: stats?.studentsCount ?? 0,
      sub: 'Hồ sơ lưu cục bộ',
      icon: GraduationCap,
      to: '/hoc-sinh',
    },
    {
      label: 'Giáo viên',
      value: stats?.teachersCount ?? 0,
      sub: 'Đội ngũ giảng dạy',
      icon: Users,
      to: '/giao-vien',
    },
    {
      label: 'Lượt đánh giá',
      value:
        (stats?.dailyAssessmentsCount ?? 0) +
        (stats?.lessonAssessmentsCount ?? 0) +
        (stats?.periodicResultsCount ?? 0),
      sub: 'Hằng ngày · Tiết học · Định kỳ',
      icon: ClipboardCheck,
      to: '/danh-gia-hang-ngay',
    },
  ];

  const setupSteps = [
    {
      title: '1. Thiết lập năm học',
      desc: 'Tạo năm học hiện tại và mốc học kỳ.',
      done: (stats?.academicYearsCount ?? 0) > 0,
      to: '/nam-hoc',
      icon: Calendar,
    },
    {
      title: '2. Khai báo giáo viên & lớp học',
      desc: 'Thêm giáo viên, phân công và tạo danh sách lớp.',
      done: (stats?.teachersCount ?? 0) > 0 && (stats?.classesCount ?? 0) > 0,
      to: '/lop-hoc',
      icon: School,
    },
    {
      title: '3. Nhập danh sách học sinh & môn học',
      desc: 'Thêm thủ công hoặc nhập từ tệp Excel.',
      done: (stats?.studentsCount ?? 0) > 0 && (stats?.subjectsCount ?? 0) > 0,
      to: '/nhap-xuat',
      icon: BookOpen,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan hệ thống"
        description={`${settings?.schoolName || 'Trường tiểu học'} · Chuẩn ${settings?.circularStandard || 'Thông tư 27/2020/TT-BGDĐT'} · Dữ liệu lưu cục bộ trên thiết bị`}
        actions={
          <Link
            to="/danh-gia-hang-ngay"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap"
          >
            Đánh giá hằng ngày
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {/* KPI Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link
              key={kpi.label}
              to={kpi.to}
              className="group rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-teal-600/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-500/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  {kpi.label}
                </span>
                <Icon className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              </div>
              <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
                {loading ? '—' : kpi.value}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{kpi.sub}</div>
            </Link>
          );
        })}
      </section>

      {/* Setup Checklist & Charts */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Phân bổ mức đánh giá đã ghi nhận
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tổng hợp trực tiếp từ dữ liệu đánh giá hằng ngày, tiết học và định kỳ
              </p>
            </div>
          </div>

          <div className="mt-4 h-64">
            {stats && stats.ratingBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.ratingBreakdown} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.4} />
                  <XAxis dataKey="rating" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(val) => [`${val} lượt`, 'Số lượng']}
                    labelFormatter={(label) => `Mức đánh giá: ${label}`}
                  />
                  <Bar dataKey="count" fill="#0F766E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
                <p>Chưa có dữ liệu đánh giá nào được ghi nhận.</p>
                <p className="mt-1 text-xs">
                  Biểu đồ sẽ tự động hiển thị khi giáo viên nhập đánh giá hằng ngày hoặc định kỳ.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Lộ trình khởi tạo dữ liệu ban đầu
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Hệ thống không tự chèn dữ liệu học sinh giả. Hoàn thành 3 bước sau để bắt đầu.
          </p>

          <div className="mt-4 space-y-3">
            {setupSteps.map((step) => {
              const Icon = step.icon;
              return (
                <Link
                  key={step.title}
                  to={step.to}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 p-3.5 transition-colors hover:border-teal-600/50 dark:border-slate-800 dark:hover:border-teal-500/50"
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      step.done
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {step.title}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          step.done
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {step.done ? 'Đã thiết lập' : 'Chưa có dữ liệu'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{step.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Recent Audit Logs */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Hoạt động gần đây
          </h2>
          <Link to="/cai-dat" className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400">
            Xem toàn bộ nhật ký
          </Link>
        </div>

        {stats && stats.recentLogs.length > 0 ? (
          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {stats.recentLogs.map((log) => (
              <div key={log.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-800 dark:text-slate-200">
                  <span className="font-mono text-xs text-teal-700 dark:text-teal-400 mr-2">
                    {log.action}
                  </span>
                  {log.summary}
                </div>
                <div className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                  {formatDateTimeVi(log.createdAt)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Chưa có nhật ký thao tác nào.
          </p>
        )}
      </section>
    </div>
  );
};
