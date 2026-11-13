import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import type { WorkspaceSettings } from '../lib/types';

interface LockScreenProps {
  settings: WorkspaceSettings;
  onUnlock: (password: string) => Promise<void>;
}

export const LockScreen: React.FC<LockScreenProps> = ({ settings, onUnlock }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onUnlock(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect passcode');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--notion-bg)] text-[var(--notion-text)]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-[var(--notion-border-strong)] bg-[var(--notion-surface)] p-6 space-y-5 shadow-[var(--notion-shadow)]"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--notion-surface-muted)] flex items-center justify-center text-xl">
            {settings.icon || '📐'}
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--notion-text)]">
              {settings.name || 'PLC Workspace'}
            </h1>
            <p className="text-xs text-[var(--notion-text-muted)] flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>Protected workspace</span>
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="workspace-passcode"
            className="block text-xs font-medium text-[var(--notion-text-secondary)]"
          >
            Enter workspace passcode
          </label>
          <input
            id="workspace-passcode"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passcode"
            autoFocus
            required
            className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--notion-bg)] border border-[var(--notion-border-strong)] text-[var(--notion-text)] focus:outline-none focus:border-[var(--notion-accent)]"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2 px-4 rounded-lg text-sm font-medium bg-[var(--notion-accent)] text-white hover:bg-[var(--notion-accent-hover)] disabled:opacity-60 transition-colors"
        >
          {submitting ? 'Unlocking...' : 'Unlock Workspace'}
        </button>
      </form>
    </div>
  );
};
