import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-200"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>
        Đang hoạt động ngoại tuyến — Toàn bộ dữ liệu học sinh và đánh giá được lưu trực tiếp trong IndexedDB trên thiết bị.
      </span>
    </div>
  );
};
