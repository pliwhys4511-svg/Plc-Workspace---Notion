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
    if (!parsed || !Array.isArray(parsed.pages)) return null;
    return parsed;
  } catch {
    return null;
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
    // ignore storage errors
  }
}

export function enqueueMutation(item: Omit<OfflineMutation, 'id' | 'createdAt'>): void {
  const queue = loadOutbox();
  const next: OfflineMutation = {
    ...item,
    id: `mut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  // Coalesce repeated PUT/PATCH to the same URL so offline edits stay compact
  const filtered =
    item.method === 'PUT' || item.method === 'PATCH'
      ? queue.filter((q) => !(q.url === item.url && q.method === item.method))
      : queue;
  saveOutbox([...filtered, next]);
}

export async function flushOutbox(): Promise<number> {
  if (staticHostMode) return 0;
  const queue = loadOutbox();
  if (queue.length === 0) return 0;

  let synced = 0;
  const remaining: OfflineMutation[] = [];

  for (let i = 0; i < queue.length; i++) {
    const m = queue[i];
    try {
      const res = await fetch(m.url, {
        method: m.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: m.body !== undefined ? JSON.stringify(m.body) : undefined,
      });
      if (!res.ok && res.status >= 500) {
        remaining.push(...queue.slice(i));
        break;
      }
      synced += 1;
    } catch {
      remaining.push(...queue.slice(i));
      break;
    }
  }

  saveOutbox(remaining);
  return synced;
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
