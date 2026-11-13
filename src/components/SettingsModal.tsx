import React, { useRef, useState } from 'react';
import {
  Check,
  Cloud,
  Database,
  Download,
  Lock,
  LogIn,
  LogOut,
  Moon,
  RefreshCw,
  Server,
  Shield,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ThemeMode, WorkspaceData, WorkspaceSettings } from '../lib/types';
import { ICON_CHOICES } from '../data/covers';
import { isStaticHostMode } from '../lib/offlineSync';
import { FIREBASE_PROJECT_INFO } from '../lib/firebase';

interface SettingsModalProps {
  isOpen: boolean;
  settings: WorkspaceSettings;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<{ name: string; icon: string; theme: ThemeMode }>) => void;
  onDownloadBackup: () => void;
  onImportBackup: (data: WorkspaceData) => Promise<void>;
  onSetPasscode: (newPassword: string, currentPassword?: string) => Promise<void>;
  onLockNow: () => void;
  cloudUser?: User | null;
  cloudSyncStatus?: 'local' | 'connecting' | 'synced' | 'error';
  onSignInCloud?: () => Promise<void>;
  onSignOutCloud?: () => Promise<void>;
  onPushLocalToCloud?: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onClose,
  onUpdateSettings,
  onDownloadBackup,
  onImportBackup,
  onSetPasscode,
  onLockNow,
  cloudUser,
  cloudSyncStatus = 'local',
  onSignInCloud,
  onSignOutCloud,
  onPushLocalToCloud,
}) => {
  const [name, setName] = useState(settings.name);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passMsg, setPassMsg] = useState<string | null>(null);
  const [passErr, setPassErr] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onUpdateSettings({ name: name.trim() });
    }
  };

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassErr(null);
    setPassMsg(null);
    try {
      await onSetPasscode(newPass, currentPass || undefined);
      setPassMsg(newPass.trim() ? 'Workspace passcode enabled.' : 'Workspace passcode removed.');
      setCurrentPass('');
      setNewPass('');
    } catch (err) {
      setPassErr(err instanceof Error ? err.message : 'Failed to update passcode.');
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as WorkspaceData;
      await onImportBackup(parsed);
      setImportStatus('Backup restored successfully.');
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : 'Invalid backup file.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Settings and Self-Hosting"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl bg-[var(--notion-popover)] border border-[var(--notion-border-strong)] shadow-[var(--notion-shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[var(--notion-popover)] border-b border-[var(--notion-border)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--notion-text)]">
              Settings & Self-Hosting
            </h2>
            <p className="text-xs text-[var(--notion-text-muted)]">
              Customize workspace appearance, backups, and self-hosted access protection.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--notion-hover)] text-[var(--notion-text-muted)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-7">
          {/* Workspace Identity */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-[var(--notion-text-muted)]">
              Workspace Identity
            </h3>
            <form onSubmit={handleSaveName} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Workspace name"
                className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded-lg bg-[var(--notion-bg)] border border-[var(--notion-border-strong)] text-[var(--notion-text)] focus:outline-none focus:border-[var(--notion-accent)]"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[var(--notion-accent)] text-white hover:bg-[var(--notion-accent-hover)]"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Name</span>
              </button>
            </form>

            <div>
              <div className="text-xs text-[var(--notion-text-muted)] mb-1.5">Workspace Icon</div>
              <div className="flex flex-wrap gap-1">
                {ICON_CHOICES.slice(0, 12).map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => onUpdateSettings({ icon: ic })}
                    className={`w-8 h-8 rounded-md flex items-center justify-center text-base hover:bg-[var(--notion-hover)] ${
                      settings.icon === ic ? 'bg-[var(--notion-active)] ring-1 ring-[var(--notion-accent)]' : ''
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section className="pt-5 border-t border-[var(--notion-border)] space-y-3">
            <h3 className="text-xs font-semibold text-[var(--notion-text-muted)]">Appearance</h3>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'light' })}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  settings.theme === 'light'
                    ? 'border-[var(--notion-accent)] bg-[var(--notion-accent)]/10 text-[var(--notion-text)]'
                    : 'border-[var(--notion-border)] text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)]'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>Notion Light</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ theme: 'dark' })}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                  settings.theme === 'dark'
                    ? 'border-[var(--notion-accent)] bg-[var(--notion-accent)]/10 text-[var(--notion-text)]'
                    : 'border-[var(--notion-border)] text-[var(--notion-text-secondary)] hover:bg-[var(--notion-hover)]'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>Notion Dark</span>
              </button>
            </div>
          </section>

          {/* Backup & Restore */}
          <section className="pt-5 border-t border-[var(--notion-border)] space-y-3">
            <h3 className="text-xs font-semibold text-[var(--notion-text-muted)]">
              Backup & Portability
            </h3>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onDownloadBackup}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[var(--notion-border-strong)] bg-[var(--notion-bg)] text-xs font-medium text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Full Backup (.json)</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileImport}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[var(--notion-border-strong)] bg-[var(--notion-bg)] text-xs font-medium text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Restore from JSON</span>
              </button>
            </div>
            {importStatus && (
              <p className="text-xs text-[var(--notion-text-secondary)]">{importStatus}</p>
            )}
          </section>

          {/* Optional Self-Hosted Access Lock */}
          <section className="pt-5 border-t border-[var(--notion-border)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[var(--notion-text-muted)]" />
                <h3 className="text-xs font-semibold text-[var(--notion-text-muted)]">
                  Self-Hosted Access Passcode
                </h3>
              </div>
              {settings.passwordProtected && (
                <button
                  type="button"
                  onClick={onLockNow}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-[var(--notion-border-strong)] hover:bg-[var(--notion-hover)] text-[var(--notion-text)]"
                >
                  <Lock className="w-3 h-3" />
                  <span>Lock Now</span>
                </button>
              )}
            </div>

            <form onSubmit={handlePasscodeSubmit} className="space-y-2 max-w-md">
              {settings.passwordProtected && (
                <input
                  type="password"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  placeholder="Current passcode"
                  aria-label="Current passcode"
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-[var(--notion-bg)] border border-[var(--notion-border-strong)] text-[var(--notion-text)] focus:outline-none focus:border-[var(--notion-accent)]"
                />
              )}
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder={
                    settings.passwordProtected
                      ? 'New passcode (leave blank to disable)'
                      : 'Set optional access passcode'
                  }
                  aria-label="New workspace passcode"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--notion-bg)] border border-[var(--notion-border-strong)] text-[var(--notion-text)] focus:outline-none focus:border-[var(--notion-accent)]"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--notion-surface-muted)] border border-[var(--notion-border-strong)] hover:bg-[var(--notion-hover)] text-[var(--notion-text)] shrink-0"
                >
                  {settings.passwordProtected ? 'Update' : 'Enable'}
                </button>
              </div>
              {passErr && <p className="text-xs text-red-500">{passErr}</p>}
              {passMsg && <p className="text-xs text-emerald-600 dark:text-emerald-400">{passMsg}</p>}
            </form>
          </section>

          {/* Cloud Database (Firebase Firestore) */}
          <section className="pt-5 border-t border-[var(--notion-border)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-emerald-500" />
                <h3 className="text-xs font-semibold text-[var(--notion-text-muted)]">
                  Cloud Database (Firebase Firestore)
                </h3>
              </div>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                  cloudUser
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-[var(--notion-surface-muted)] text-[var(--notion-text-muted)]'
                }`}
              >
                {cloudUser
                  ? cloudSyncStatus === 'connecting'
                    ? 'Connecting...'
                    : 'Connected & Synced'
                  : 'Local / Offline Mode'}
              </span>
            </div>

            <div className="rounded-lg bg-[var(--notion-surface-muted)] border border-[var(--notion-border)] p-3.5 space-y-3">
              <div className="text-xs text-[var(--notion-text-secondary)] space-y-1">
                <div>
                  Project ID:{' '}
                  <code className="font-notion-mono text-[var(--notion-text)]">
                    {FIREBASE_PROJECT_INFO.projectId}
                  </code>
                </div>
                <div>
                  Database ID:{' '}
                  <code className="font-notion-mono text-[var(--notion-text)]">
                    {FIREBASE_PROJECT_INFO.databaseId}
                  </code>
                </div>
              </div>

              {cloudUser ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[var(--notion-text)] truncate">
                        {cloudUser.displayName || 'Google Workspace Account'}
                      </div>
                      <div className="text-[11px] text-[var(--notion-text-muted)] truncate">
                        {cloudUser.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {onPushLocalToCloud && (
                      <button
                        type="button"
                        onClick={onPushLocalToCloud}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--notion-bg)] border border-[var(--notion-border-strong)] text-[var(--notion-text)] hover:bg-[var(--notion-hover)]"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Push Current Snapshot to Cloud</span>
                      </button>
                    )}
                    {onSignOutCloud && (
                      <button
                        type="button"
                        onClick={onSignOutCloud}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--notion-border-strong)] text-red-600 dark:text-red-400 hover:bg-red-500/10"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs text-[var(--notion-text-muted)]">
                    Sign in with Google to persist pages, blocks, databases, and comments in live Firebase Firestore across browsers & GitHub Pages.
                  </p>
                  {onSignInCloud && (
                    <button
                      type="button"
                      onClick={onSignInCloud}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-[var(--notion-accent)] text-white hover:bg-[var(--notion-accent-hover)]"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Sign in with Google (Cloud DB)</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Self-Hosting & Database Storage Guide */}
          <section className="pt-5 border-t border-[var(--notion-border)] space-y-2">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-[var(--notion-text-muted)]" />
              <h3 className="text-xs font-semibold text-[var(--notion-text-muted)]">
                Database Storage & Self-Hosting
              </h3>
            </div>
            <div className="rounded-lg bg-[var(--notion-code-bg)] border border-[var(--notion-border)] p-3.5 text-xs font-notion-mono text-[var(--notion-text-secondary)] space-y-1.5">
              <div className="flex items-center gap-2 text-[var(--notion-text)] font-medium">
                <Database className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {cloudUser
                    ? 'Active Storage: Firebase Firestore Cloud DB + Browser Offline Cache'
                    : isStaticHostMode()
                    ? 'Active Storage: Browser LocalStorage + PWA Offline Cache (Static / GitHub Pages Mode)'
                    : 'Active Storage: Built-in SQLite (node:sqlite) at ./data/workspace.db + Browser Offline Cache'}
                </span>
              </div>
              <div>Cloud DB: Firebase Firestore ({FIREBASE_PROJECT_INFO.projectId})</div>
              <div>Server DB Path Env: PLC_DATA_DIR=./data (creates ./data/workspace.db)</div>
              <div>Build &amp; Run: npm install &amp;&amp; npm run build &amp;&amp; npm start</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
