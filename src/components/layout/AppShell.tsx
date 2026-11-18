import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Menu, Moon, RefreshCw, Sun, X } from 'lucide-react';
import { NAV_GROUPS, NAV_ITEMS } from '../../config/navigation';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { applyPwaUpdate, subscribePwaStatus } from '../../services/pwaService';
import { OfflineBanner } from '../common/OfflineBanner';
import { PWAInstallButton } from '../common/PWAInstallButton';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pwaNeedRefresh, setPwaNeedRefresh] = useState(false);

  useEffect(() => {
    return subscribePwaStatus((status) => setPwaNeedRefresh(status.needRefresh));
  }, []);
  const {
    settings,
    academicYears,
    activeYear,
    teachers,
    operatorMode,
    activeTeacher,
    theme,
    setTheme,
    setActiveYearId,
    setLocalOperator,
  } = useWorkspace();
  const location = useLocation();

  const activeNav = NAV_ITEMS.find((item) => item.path === location.pathname) ?? NAV_ITEMS[0];

  const renderNavContent = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Điều hướng chính">
      {NAV_GROUPS.map((group) => {
        const items = NAV_ITEMS.filter((item) => item.group === group.key);
        return (
          <div key={group.key}>
            <div className="px-3 pb-1.5 text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
              {group.title}
            </div>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        `flex min-h-[40px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
                        }`
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-[264px] lg:shrink-0 lg:flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5 dark:border-slate-800">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white font-bold text-sm">
            HT
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
              HOATAM Assessment
            </div>
            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
              {settings?.schoolName || 'Tiểu học'}
            </div>
          </div>
        </div>
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white font-bold text-xs">
                  HT
                </div>
                <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                  HOATAM Assessment
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Đóng menu"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderNavContent(() => setMobileMenuOpen(false))}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu điều hướng"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 lg:hidden dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span className="hidden sm:inline truncate">HOATAM</span>
                <span className="hidden sm:inline" aria-hidden="true">/</span>
                <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                  {activeNav.label}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Hồ sơ người dùng cục bộ"
              title="Hồ sơ người dùng cục bộ để thử nghiệm nghiệp vụ trên thiết bị này"
              value={operatorMode === 'TEACHER' && activeTeacher ? `TEACHER:${activeTeacher.id}` : 'ADMIN'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'ADMIN') {
                  void setLocalOperator('ADMIN');
                } else if (val.startsWith('TEACHER:')) {
                  void setLocalOperator('TEACHER', val.slice('TEACHER:'.length));
                }
              }}
              className="h-9 max-w-[115px] sm:max-w-[180px] rounded-lg border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="ADMIN">Quản trị viên (Cục bộ)</option>
              {teachers.map((t) => (
                <option key={t.id} value={`TEACHER:${t.id}`}>
                  GV: {t.fullName} ({t.code})
                </option>
              ))}
            </select>

            {academicYears.length > 0 && (
              <select
                aria-label="Chọn năm học đang làm việc"
                value={activeYear?.id ?? ''}
                onChange={(e) => void setActiveYearId(e.target.value)}
                className="h-9 max-w-[95px] sm:max-w-[160px] rounded-lg border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {academicYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            )}

            {pwaNeedRefresh && (
              <button
                type="button"
                onClick={() => void applyPwaUpdate()}
                title="Có phiên bản ứng dụng mới — nhấn để cập nhật"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-700 px-2.5 text-xs font-medium text-white hover:bg-teal-800 shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cập nhật mới</span>
              </button>
            )}

            <PWAInstallButton />

            <button
              type="button"
              onClick={() => void setTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label={theme === 'light' ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shrink-0"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <OfflineBanner />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
};
