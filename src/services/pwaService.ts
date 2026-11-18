import { registerSW } from 'virtual:pwa-register';

export interface PwaRuntimeStatus {
  supported: boolean;
  isControlled: boolean;
  isRegistered: boolean;
  offlineReady: boolean;
  needRefresh: boolean;
  cacheCount: number;
  cachedEntryCount: number;
  scope?: string;
}

type Listener = (status: PwaRuntimeStatus) => void;

const listeners = new Set<Listener>();
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
let initialized = false;

const currentStatus: PwaRuntimeStatus = {
  supported: typeof window !== 'undefined' && 'serviceWorker' in navigator,
  isControlled:
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    Boolean(navigator.serviceWorker.controller),
  isRegistered: false,
  offlineReady: false,
  needRefresh: false,
  cacheCount: 0,
  cachedEntryCount: 0,
};

function notifyListeners() {
  const snapshot = { ...currentStatus };
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export async function refreshPwaCacheMetrics(): Promise<PwaRuntimeStatus> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { ...currentStatus };
  }

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      swRegistration = reg;
      currentStatus.isRegistered = Boolean(reg.active || reg.waiting || reg.installing);
      currentStatus.scope = reg.scope;
      currentStatus.isControlled = Boolean(navigator.serviceWorker.controller);
    }

    if ('caches' in window) {
      const names = await caches.keys();
      currentStatus.cacheCount = names.length;
      let totalEntries = 0;
      for (const name of names) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        totalEntries += keys.length;
      }
      currentStatus.cachedEntryCount = totalEntries;
      if (totalEntries > 0 && currentStatus.isRegistered) {
        currentStatus.offlineReady = true;
      }
    }
  } catch {
    // Ignore CacheStorage access errors in restricted frames
  }

  notifyListeners();
  return { ...currentStatus };
}

export function initPwaRegistration(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  if (import.meta.env.DEV && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          if (registration.active?.scriptURL.includes('dev-sw')) {
            registration.unregister().catch(() => {});
          }
        }
      })
      .catch(() => {});
  }

  updateSWFn = registerSW({
    immediate: true,
    onOfflineReady() {
      currentStatus.offlineReady = true;
      void refreshPwaCacheMetrics();
    },
    onNeedRefresh() {
      currentStatus.needRefresh = true;
      notifyListeners();
    },
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        swRegistration = registration;
        currentStatus.isRegistered = true;
        currentStatus.scope = registration.scope;
      }
      void refreshPwaCacheMetrics();
    },
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      currentStatus.isControlled = Boolean(navigator.serviceWorker.controller);
      void refreshPwaCacheMetrics();
    });
  }

  void refreshPwaCacheMetrics();
}

export async function checkForPwaUpdate(): Promise<{ checked: boolean; message: string }> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { checked: false, message: 'Trình duyệt không hỗ trợ Service Worker.' };
  }
  try {
    const reg = swRegistration ?? (await navigator.serviceWorker.getRegistration());
    if (!reg) {
      await refreshPwaCacheMetrics();
      return {
        checked: false,
        message: import.meta.env.DEV
          ? 'Đang chạy chế độ phát triển (dev); Service Worker ngoại tuyến được kích hoạt đầy đủ khi build production.'
          : 'Chưa phát hiện Service Worker được đăng ký.',
      };
    }
    await reg.update();
    await refreshPwaCacheMetrics();
    if (reg.waiting || currentStatus.needRefresh) {
      currentStatus.needRefresh = true;
      notifyListeners();
      return { checked: true, message: 'Đã phát hiện phiên bản mới sẵn sàng cập nhật.' };
    }
    return { checked: true, message: 'Ứng dụng đang ở phiên bản mới nhất và đã đồng bộ bộ nhớ đệm.' };
  } catch {
    return { checked: false, message: 'Không thể kiểm tra cập nhật khi đang ngoại tuyến.' };
  }
}

export async function applyPwaUpdate(): Promise<void> {
  if (updateSWFn) {
    await updateSWFn(true);
  } else if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

export function subscribePwaStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...currentStatus });
  return () => {
    listeners.delete(listener);
  };
}
