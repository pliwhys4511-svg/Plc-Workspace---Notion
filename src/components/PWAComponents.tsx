import React, { useEffect, useState } from 'react';
import { CloudOff, Download, RefreshCw, Share, Smartphone, WifiOff } from 'lucide-react';
import { isStaticHostMode, loadOutbox, useOnlineStatus, usePWAInstall } from '../lib/offlineSync';

export const OfflineIndicator: React.FC<{ pendingCount: number }> = ({ pendingCount }) => {
  const isOnline = useOnlineStatus();
  const staticMode = isStaticHostMode();
  const effectivePending = staticMode ? 0 : pendingCount;

  if (isOnline && effectivePending === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
      className="hidden sm:flex fixed bottom-4 left-4 z-50 items-center gap-2 px-3 py-2 rounded-md bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] text-xs text-[var(--notion-text)]"
    >
      {!isOnline ? (
        <>
          <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="font-medium">Offline mode</span>
          <span className="text-[var(--notion-text-muted)]">
            {effectivePending > 0
              ? `· ${effectivePending} pending sync`
              : '· Changes saved locally'}
          </span>
        </>
      ) : (
        <>
          <RefreshCw className="w-3.5 h-3.5 text-[var(--notion-accent)] animate-spin shrink-0" />
          <span>Syncing {effectivePending} offline changes...</span>
        </>
      )}
    </div>
  );
};

export const TopbarOfflineBadge: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    setQueued(isStaticHostMode() ? 0 : loadOutbox().length);
    const id = setInterval(() => {
      setQueued(isStaticHostMode() ? 0 : loadOutbox().length);
    }, 2000);
    return () => clearInterval(id);
  }, [isOnline]);

  if (isOnline && queued === 0) return null;

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-amber-500/12 text-amber-700 dark:text-amber-300 text-[11px] font-medium whitespace-nowrap"
      title="Working offline — edits are cached locally and will sync automatically"
    >
      <CloudOff className="w-3 h-3" />
      <span>Offline</span>
    </span>
  );
};

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [iosTipOpen, setIosTipOpen] = useState(false);

  if (isInstalled || (!isInstallable && !isIOS)) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (isInstallable) {
            void install();
          } else if (isIOS) {
            setIosTipOpen((v) => !v);
          }
        }}
        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)] hover:text-[var(--notion-text)] transition-colors"
      >
        {isIOS ? (
          <Smartphone className="w-4 h-4 text-[var(--notion-text-muted)] shrink-0" />
        ) : (
          <Download className="w-4 h-4 text-[var(--notion-text-muted)] shrink-0" />
        )}
        <span className="truncate">Install Offline App</span>
      </button>

      {iosTipOpen && (
        <div className="mt-1 p-2.5 rounded-lg bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)] text-[11.5px] text-[var(--notion-text-secondary)] space-y-1">
          <div className="font-semibold text-[var(--notion-text)] flex items-center gap-1">
            <Share className="w-3 h-3" />
            <span>Install on iOS</span>
          </div>
          <p>Tap the Safari Share button, then choose “Add to Home Screen” for full offline access.</p>
        </div>
      )}
    </div>
  );
};
