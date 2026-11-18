import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
}

interface NotificationContextValue {
  notify: (type: NotificationType, title: string, message?: string) => void;
  dismiss: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<NotificationItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (type: NotificationType, title: string, message?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setItems((prev) => [...prev.slice(-3), { id, type, title, message }]);
      window.setTimeout(() => {
        dismiss(id);
      }, 4800);
    },
    [dismiss]
  );

  return (
    <NotificationContext.Provider value={{ notify, dismiss }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0 pointer-events-none"
      >
        {items.map((item) => {
          const styles =
            item.type === 'success'
              ? 'border-emerald-200 bg-white text-slate-900 dark:border-emerald-800 dark:bg-slate-900 dark:text-slate-100'
              : item.type === 'error'
                ? 'border-red-200 bg-white text-slate-900 dark:border-red-800 dark:bg-slate-900 dark:text-slate-100'
                : item.type === 'warning'
                  ? 'border-amber-200 bg-white text-slate-900 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100'
                  : 'border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

          const Icon =
            item.type === 'success'
              ? CheckCircle2
              : item.type === 'error' || item.type === 'warning'
                ? AlertCircle
                : Info;

          const iconColor =
            item.type === 'success'
              ? 'text-emerald-600 dark:text-emerald-400'
              : item.type === 'error'
                ? 'text-red-600 dark:text-red-400'
                : item.type === 'warning'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-teal-600 dark:text-teal-400';

          return (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-lg transition-all ${styles}`}
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                {item.message && (
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{item.message}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Đóng thông báo"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
};

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotification phải được sử dụng bên trong NotificationProvider.');
  }
  return ctx;
}
