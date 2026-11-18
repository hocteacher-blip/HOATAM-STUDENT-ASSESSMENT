import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Modal } from './Modal';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-teal-700 bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" />
        Cài đặt ứng dụng
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          Cài trên iOS
        </button>

        <Modal
          isOpen={showIOSGuide}
          title="Cài đặt HOATAM trên iPhone / iPad"
          onClose={() => setShowIOSGuide(false)}
          maxWidthClass="max-w-sm"
        >
          <ol className="space-y-2 text-sm text-slate-700 dark:text-slate-300 list-decimal pl-5">
            <li>Nhấn vào biểu tượng <strong>Chia sẻ</strong> trên thanh công cụ trình duyệt Safari.</li>
            <li>Cuộn xuống và chọn <strong>Thêm vào Màn hình chính (Add to Home Screen)</strong>.</li>
            <li>Nhấn <strong>Thêm</strong> để sử dụng ngoại tuyến như ứng dụng độc lập.</li>
          </ol>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            >
              Đã hiểu
            </button>
          </div>
        </Modal>
      </>
    );
  }

  return null;
};
