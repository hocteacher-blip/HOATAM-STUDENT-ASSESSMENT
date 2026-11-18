import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { NotificationProvider } from './contexts/NotificationContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';

const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage }))
);
const MyWorkPage = lazy(() =>
  import('./pages/MyWorkPage').then((m) => ({ default: m.MyWorkPage }))
);
const AcademicYearsPage = lazy(() =>
  import('./pages/AcademicYearsPage').then((m) => ({ default: m.AcademicYearsPage }))
);
const TeachersPage = lazy(() =>
  import('./pages/TeachersPage').then((m) => ({ default: m.TeachersPage }))
);
const TeacherAssignmentsPage = lazy(() =>
  import('./pages/TeacherAssignmentsPage').then((m) => ({ default: m.TeacherAssignmentsPage }))
);
const ClassesPage = lazy(() =>
  import('./pages/ClassesPage').then((m) => ({ default: m.ClassesPage }))
);
const StudentsPage = lazy(() =>
  import('./pages/StudentsPage').then((m) => ({ default: m.StudentsPage }))
);
const SubjectsPage = lazy(() =>
  import('./pages/SubjectsPage').then((m) => ({ default: m.SubjectsPage }))
);
const CriteriaPage = lazy(() =>
  import('./pages/CriteriaPage').then((m) => ({ default: m.CriteriaPage }))
);
const TimetablePage = lazy(() =>
  import('./pages/TimetablePage').then((m) => ({ default: m.TimetablePage }))
);
const DailyAssessmentPage = lazy(() =>
  import('./pages/DailyAssessmentPage').then((m) => ({ default: m.DailyAssessmentPage }))
);
const LessonAssessmentPage = lazy(() =>
  import('./pages/LessonAssessmentPage').then((m) => ({ default: m.LessonAssessmentPage }))
);
const PeriodicAssessmentPage = lazy(() =>
  import('./pages/PeriodicAssessmentPage').then((m) => ({ default: m.PeriodicAssessmentPage }))
);
const AiAssistantPage = lazy(() =>
  import('./pages/AiAssistantPage').then((m) => ({ default: m.AiAssistantPage }))
);
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage }))
);
const ImportExportPage = lazy(() =>
  import('./pages/ImportExportPage').then((m) => ({ default: m.ImportExportPage }))
);
const BackupRestorePage = lazy(() =>
  import('./pages/BackupRestorePage').then((m) => ({ default: m.BackupRestorePage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

const RouteLoadingFallback = () => (
  <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
    Đang tải phân hệ...
  </div>
);

export default function App() {
  return (
    <NotificationProvider>
      <WorkspaceProvider>
        <BrowserRouter>
          <AppShell>
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/cong-viec-cua-toi" element={<MyWorkPage />} />
                <Route path="/nam-hoc" element={<AcademicYearsPage />} />
                <Route path="/giao-vien" element={<TeachersPage />} />
                <Route path="/phan-cong" element={<TeacherAssignmentsPage />} />
                <Route path="/lop-hoc" element={<ClassesPage />} />
                <Route path="/hoc-sinh" element={<StudentsPage />} />
                <Route path="/mon-hoc" element={<SubjectsPage />} />
                <Route path="/tieu-chi" element={<CriteriaPage />} />
                <Route path="/thoi-khoa-bieu" element={<TimetablePage />} />
                <Route path="/danh-gia-hang-ngay" element={<DailyAssessmentPage />} />
                <Route path="/danh-gia-tiet-hoc" element={<LessonAssessmentPage />} />
                <Route path="/danh-gia-dinh-ky" element={<PeriodicAssessmentPage />} />
                <Route path="/tro-ly-ai" element={<AiAssistantPage />} />
                <Route path="/bao-cao" element={<ReportsPage />} />
                <Route path="/nhap-xuat" element={<ImportExportPage />} />
                <Route path="/sao-luu" element={<BackupRestorePage />} />
                <Route path="/cai-dat" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AppShell>
        </BrowserRouter>
      </WorkspaceProvider>
    </NotificationProvider>
  );
}
