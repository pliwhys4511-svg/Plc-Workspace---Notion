import { useEffect, useState } from 'react';
import type { WorkspaceData } from './types';

const CACHE_KEY = 'plc.notion.offline.cache.v4';
const OUTBOX_KEY = 'plc.notion.offline.outbox.v4';

let staticHostMode = false;

export function isStaticHostMode(): boolean {
  return staticHostMode;
}

export function setStaticHostMode(enabled: boolean): void {
  staticHostMode = enabled;
}

export interface OfflineMutation {
  id: string;
  url: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  createdAt: string;
}

export function saveCachedWorkspace(data: WorkspaceData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors gracefully
  }
}

export function loadCachedWorkspace(): WorkspaceData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceData;
    return parsed && Array.isArray(parsed.pages) ? parsed : null;
  } catch {
    return null;
  }
}

// Keep signed-in Firebase data isolated from local/anonymous workspace storage.
export function saveCachedCloudWorkspace(uid: string, data: WorkspaceData): void {
  try {
    localStorage.setItem(`${CACHE_KEY}.cloud.${encodeURIComponent(uid)}`, JSON.stringify(data));
  } catch {
    // Server/cloud persistence is authoritative for signed-in users.
  }
}

export function loadOutbox(): OfflineMutation[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as OfflineMutation[]) : [];
  } catch {
    return [];
  }
}

export function saveOutbox(items: OfflineMutation[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    // Never report an edit as queued if it could not be persisted.
    throw new Error('Offline sync queue could not be saved. Export a workspace backup.');
  }
}

export function enqueueMutation(item: Omit<OfflineMutation, 'id' | 'createdAt'>): void {
  const queue = loadOutbox();
  const next: OfflineMutation = {
    ...item,
    id: `mut_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
  };
  // PATCH payloads can contain independent fields: preserve their order.
  // Only adjacent PUT snapshots to the same resource can be compacted.
  const last = queue[queue.length - 1];
  saveOutbox(item.method === 'PUT' && last?.method === 'PUT' && last.url === item.url
    ? [...queue.slice(0, -1), next]
    : [...queue, next]);
}

let flushPromise: Promise<number> | null = null;

export function flushOutbox(): Promise<number> {
  if (staticHostMode) return Promise.resolve(0);
  if (flushPromise) return flushPromise;

  flushPromise = (async () => {
    let synced = 0;
    while (!staticHostMode) {
      // Fetch latest queue each iteration to avoid discarding changes added mid-request.
      const next = loadOutbox()[0];
      if (!next) break;
      try {
        const res = await fetch(next.url, {
          method: next.method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: next.body !== undefined ? JSON.stringify(next.body) : undefined,
        });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || (res.status !== 204 && !type.includes('application/json'))) break;
        saveOutbox(loadOutbox().filter((entry) => entry.id !== next.id));
        synced++;
      } catch {
        break;
      }
    }
    return synced;
  })().finally(() => { flushPromise = null; });
  return flushPromise;
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}
