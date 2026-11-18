import React from 'react';
import { Modal } from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy bỏ',
  isDanger = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal isOpen={isOpen} title={title} onClose={onCancel} maxWidthClass="max-w-md">
      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{message}</p>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`min-h-[40px] rounded-lg px-4 py-2 text-sm font-medium text-white whitespace-nowrap ${
            isDanger
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-teal-700 hover:bg-teal-800'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
};
