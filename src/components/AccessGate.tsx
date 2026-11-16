import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { signInWithGoogle } from '../lib/firestoreStore';
import { isGoogleIdentityAllowedForRole } from '../lib/teamWorkspace';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import {
  checkWorkspacePin,
  EDITOR_NAMES,
  type AccessRole,
  type WorkspaceAccess,
} from '../lib/accessTier';

interface AccessGateProps {
  onSuccess: (access: WorkspaceAccess) => void;
}

export function AccessGate({ onSuccess }: AccessGateProps) {
  const [role, setRole] = useState<AccessRole>('editor');
  const [editorName, setEditorName] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [signingIn, setSigningIn] = useState(false);

  const selectRole = (next: AccessRole) => {
    setRole(next);
    setPin('');
    setError('');
  };

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const access = checkWorkspacePin(role, pin.trim(), editorName);
    if (!access) {
      setAttempts((n) => n + 1);
      setPin('');
      setError(
        role === 'editor' && !editorName
          ? 'Silakan pilih nama editor.'
          : 'PIN tidak sesuai. Silakan coba lagi.',
      );
      return;
    }
    setError('');
    setSigningIn(true);
    try {
      // First visit: Google login once, from this user gesture. Future visits
      // reuse Firebase Auth's persisted session automatically.
      const currentUid = auth.currentUser?.uid ?? null;
      if (!auth.currentUser?.emailVerified ||
          !isGoogleIdentityAllowedForRole(access.role, currentUid)) {
        // Switching from the Admin's Google account to Rafly (or vice versa)
        // must open Google's account picker, not reuse the wrong identity.
        await signInWithGoogle();
      }
      if (!auth.currentUser?.emailVerified) {
        throw new Error('Gunakan akun Google dengan email yang sudah terverifikasi.');
      }
      if (!isGoogleIdentityAllowedForRole(access.role, auth.currentUser.uid)) {
        throw new Error('Akun Google ini tidak sesuai dengan pilihan Admin atau Editor. Pilih akun yang benar.');
      }
      onSuccess(access);
    } catch (err) {
      setError(err instanceof Error && /terverifikasi|tidak sesuai/.test(err.message)
        ? err.message
        : 'Google login diperlukan sekali untuk menggunakan workspace bersama. Silakan coba lagi.');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-[#f4f7fb] dark:bg-[#101923] px-4 py-10 text-[#102a4c]">
      <div className="w-full max-w-[430px] overflow-hidden rounded-2xl border border-[#dbe6f5] dark:border-slate-700 bg-white dark:bg-[#172333] shadow-[0_25px_65px_-30px_rgba(0,47,99,0.25)]">
        <div className="h-2 bg-[#0064ff]" />
        <div className="px-7 pt-8 pb-7 sm:px-9">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#eaf2ff] text-[#0064ff] dark:bg-[#1f3b60]">
            <LockKeyhole className="w-6 h-6" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight dark:text-white">PLC Workspace</h1>
          <p className="mt-1.5 text-sm text-[#60758f] dark:text-slate-300">
            Pilih akses dan masuk dengan Google sekali. Setelah itu workspace tim akan tersambung otomatis.
          </p>

          <form onSubmit={login} className="mt-7 space-y-5">
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-[#57708e] dark:text-slate-300 mb-2.5">Access tier</legend>
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => selectRole('admin')}
                  aria-pressed={role === 'admin'}
                  className={`flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-colors ${role === 'admin' ? 'border-[#0064ff] bg-[#eef5ff] dark:bg-[#1f3b60]' : 'border-[#dfe6ef] hover:border-[#86b5ff] dark:border-slate-600'}`}>
                  <ShieldCheck className="w-5 h-5 text-[#0064ff]" />
                  <span className="text-sm font-semibold dark:text-white">Admin</span>
                  <span className="text-[11px] text-[#60758f] dark:text-slate-300">Akses penuh</span>
                </button>
                <button type="button" onClick={() => selectRole('editor')}
                  aria-pressed={role === 'editor'}
                  className={`flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-colors ${role === 'editor' ? 'border-[#0064ff] bg-[#eef5ff] dark:bg-[#1f3b60]' : 'border-[#dfe6ef] hover:border-[#86b5ff] dark:border-slate-600'}`}>
                  <Users className="w-5 h-5 text-[#0064ff]" />
                  <span className="text-sm font-semibold dark:text-white">Editor</span>
                  <span className="text-[11px] text-[#60758f] dark:text-slate-300">Kelola konten</span>
                </button>
              </div>
            </fieldset>

            {role === 'editor' && (
              <div>
                <label htmlFor="editor-name" className="block mb-2 text-xs font-semibold text-[#405b77] dark:text-slate-300">Nama editor</label>
                <select id="editor-name" value={editorName} onChange={(e) => { setEditorName(e.target.value); setError(''); }}
                  required className="w-full h-11 rounded-lg border border-[#d8e3ef] dark:border-slate-600 bg-white dark:bg-[#213147] px-3 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0064ff]">
                  <option value="">Pilih nama</option>
                  {EDITOR_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="access-pin" className="block mb-2 text-xs font-semibold text-[#405b77] dark:text-slate-300">PIN akses</label>
              <div className="relative">
                <input id="access-pin" autoComplete="off" type={showPin ? 'text' : 'password'}
                  inputMode="numeric" maxLength={12} required
                  value={pin} onChange={(e) => { setPin(e.target.value); setError(''); }}
                  placeholder="Masukkan PIN"
                  className="w-full h-11 rounded-lg border border-[#d8e3ef] dark:border-slate-600 bg-white dark:bg-[#213147] px-3 pr-11 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0064ff]" />
                <button type="button" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? 'Sembunyikan PIN' : 'Lihat PIN'}
                  className="absolute inset-y-0 right-0 px-3 text-[#60758f] dark:text-slate-300">
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
              {attempts > 4 && <p className="mt-2 text-xs text-[#60758f]">PIN tersimpan pada aplikasi statis; hubungi admin jika membutuhkan akses baru.</p>}
            </div>
            <button type="submit" disabled={signingIn}
              className="w-full h-11 rounded-lg bg-[#0064ff] hover:bg-[#0055dd] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
              {signingIn ? 'Menghubungkan akun Google...' : 'Masuk dengan Google & Buka Workspace'} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
        <div className="border-t border-[#e8eef6] dark:border-slate-700 bg-[#f8faff] dark:bg-[#192b40] px-7 py-3 text-[11px] text-[#6b809a] dark:text-slate-400 sm:px-9">
          PLC Workspace · People & Culture Learning & Development
        </div>
      </div>
    </main>
  );
}
