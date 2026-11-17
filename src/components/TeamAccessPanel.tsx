import React, { useEffect, useState } from 'react';
import { Check, Copy, ShieldCheck, UserMinus, Users, X } from 'lucide-react';
import { EDITOR_NAMES } from '../lib/accessTier';
import {
  rejectTeamRequest, revokeTeamMember,
  teamInviteLink, watchJoinRequests, watchTeamMembers,
  registerDirectEditor, revokeDirectEditor, watchDirectEditors,
  registerDirectEditorsBulk, suggestBulkEditorEmails,
  type JoinRequest, type TeamMember, type DirectEditorEmail,
} from '../lib/teamWorkspace';

export function TeamAccessPanel({ ownerUid }: { ownerUid: string }) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [direct, setDirect] = useState<DirectEditorEmail[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState<string>('Rafly');
  const [bulkEmails, setBulkEmails] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const unsubRequests = watchJoinRequests(ownerUid, setRequests, setError);
    const unsubMembers = watchTeamMembers(ownerUid, setMembers, setError);
    const unsubDirect = watchDirectEditors(ownerUid, setDirect, setError);
    return () => { unsubRequests(); unsubMembers(); unsubDirect(); };
  }, [ownerUid]);

  const approve = async (request: JoinRequest) => {
    setBusy(request.uid); setError('');
    try {
      await registerDirectEditor(ownerUid, request.email, request.name);
      await rejectTeamRequest(ownerUid, request.uid);
      setNotice(`Email ${request.name} terdaftar; akses otomatis aktif.`);
    } catch {
      setError('Gagal menyetujui editor. Periksa Security Rules Firebase.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3 border-t border-[var(--notion-border)] pt-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-[#0064ff]"/>
        <h3 className="text-sm font-semibold text-[var(--notion-text)]">Akses Tim & Workspace Bersama</h3>
      </div>
      <p className="text-xs text-[var(--notion-text-secondary)]">
        Daftarkan email Google lima editor satu kali. Editor langsung masuk dan tersinkron ke workspace yang sama tanpa permintaan persetujuan saat login.
      </p>
      <button type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(teamInviteLink(ownerUid, window.location.href));
            setNotice('Link undangan tersalin. Bagikan secara pribadi kepada editor.');
          } catch {
            setError('Gagal menyalin link, periksa izin clipboard browser.');
          }
        }}
        className="flex items-center gap-2 rounded-lg border border-[var(--notion-border-strong)] px-3 py-2 text-xs font-semibold text-[var(--notion-text)] hover:bg-[var(--notion-hover)]">
        <Copy className="w-4 h-4"/> Salin link workspace untuk editor
      </button>
      <div className="rounded-xl border border-[var(--notion-border)] p-3 space-y-3">
        <div className="text-xs font-semibold text-[var(--notion-text)]">Akses langsung berdasarkan email Google</div>
        <div className="rounded-lg border border-[var(--notion-border)] bg-[var(--notion-bg)] p-3 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <strong className="text-xs">Daftarkan Editor Sekaligus</strong>
            <button type="button" disabled={busy !== null}
              onClick={() => {
                const suggestions = suggestBulkEditorEmails(requests);
                setBulkEmails(prev => {
                  const next = {...prev};
                  for (const editor of EDITOR_NAMES) {
                    if (!next[editor]?.trim() && suggestions[editor] && !direct.some(entry => entry.name === editor)) next[editor] = suggestions[editor];
                  }
                  return next;
                });
                setNotice('Email dari permintaan lama yang tidak ambigu diisikan otomatis. Periksa alamat sebelum menyimpan.');
              }}
              className="border border-[var(--notion-border-strong)] rounded-md px-2 py-1.5 text-xs">Isi dari permintaan lama</button>
          </div>
          <p className="text-xs text-[var(--notion-text-muted)]">Masukkan email Google yang benar untuk anggota tim. Kosongkan anggota yang sudah terdaftar atau belum diketahui. Seluruh email yang diisi disimpan dalam satu klik.</p>
          {EDITOR_NAMES.map(editor => (
            <label key={editor} className="flex items-center gap-2 text-xs">
              <span className="w-16 shrink-0 font-medium">{editor}</span>
              <input type="email" autoComplete="off" value={bulkEmails[editor] ?? ''}
                onChange={e => setBulkEmails(prev => ({...prev, [editor]: e.target.value}))}
                placeholder={direct.some(entry => entry.name === editor) ? 'Sudah terdaftar (opsional)' : 'Email Google'}
                className="flex-1 min-w-0 rounded-md border border-[var(--notion-border)] bg-[var(--notion-bg)] p-2 text-xs"/>
            </label>
          ))}
          <button type="button" disabled={busy !== null || !Object.values(bulkEmails).some(value => value.trim())}
            onClick={async () => {
              setBusy('bulk'); setError(''); setNotice('');
              try {
                const count = await registerDirectEditorsBulk(ownerUid, EDITOR_NAMES.map(name => ({name, email: bulkEmails[name] ?? ''})));
                setNotice(`${count} editor berhasil didaftarkan. Mereka dapat login langsung tanpa persetujuan.`);
                setBulkEmails({});
              } catch (err) { setError(err instanceof Error ? err.message : 'Gagal mendaftarkan editor sekaligus.'); }
              finally { setBusy(null); }
            }}
            className="rounded-md bg-[#0064ff] text-white px-3 py-2 text-xs font-medium disabled:opacity-50">
            {busy === 'bulk' ? 'Menyimpan...' : 'Aktifkan Semua Email yang Diisi'}
          </button>
        </div>
        <div className="text-[11px] text-[var(--notion-text-muted)]">Atau daftarkan satu editor:</div>
        <div className="flex flex-wrap gap-2">
          <select value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-[var(--notion-border)] bg-[var(--notion-bg)] p-2 text-xs">
            {EDITOR_NAMES.map((editor) => <option key={editor} value={editor}>{editor}</option>)}
          </select>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Google anggota tim" className="flex-1 min-w-[180px] rounded-md border border-[var(--notion-border)] bg-[var(--notion-bg)] p-2 text-xs"/>
          <button type="button" disabled={!email.trim() || busy === 'register'}
            onClick={async () => {
              setBusy('register'); setError('');
              try { await registerDirectEditor(ownerUid, email, name); setEmail(''); setNotice('Akses langsung berhasil didaftarkan.'); }
              catch (err) { setError(err instanceof Error ? err.message : 'Gagal mendaftarkan email.'); }
              finally { setBusy(null); }
            }}
            className="rounded-md bg-[#0064ff] text-white px-3 py-2 text-xs font-medium disabled:opacity-50">Daftarkan email</button>
        </div>
        {direct.length === 0 && <p className="text-xs text-[var(--notion-text-muted)]">Belum ada email terdaftar untuk akses langsung.</p>}
        {direct.map((entry) => (
          <div key={entry.email} className="flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0"><strong>{entry.name}</strong><div className="break-all text-[var(--notion-text-muted)]">{entry.email}</div></div>
            <button type="button" aria-label={`Cabut email ${entry.name}`}
              onClick={async () => { try { await revokeDirectEditor(ownerUid, entry.email); setNotice('Akses email dicabut.'); } catch { setError('Gagal mencabut akses email.'); } }}
              className="p-2 text-red-500"><UserMinus className="w-4 h-4"/></button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--notion-text-muted)]">Akses lama berdasarkan UID tetap berlaku. Untuk mencabut sepenuhnya, hapus email dan akses UID lama jika keduanya tersedia.</p>
      <div className="rounded-xl border border-[var(--notion-border)] p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--notion-text)]">
          <Users className="w-4 h-4"/> Permintaan lama ({requests.length})
        </div>
        {requests.length === 0 && <p className="text-xs text-[var(--notion-text-muted)]">Tidak ada permintaan lama.</p>}
        {requests.map((request) => (
          <div key={request.uid} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--notion-hover)] px-3 py-2">
            <div className="min-w-0 text-xs">
              <div className="font-semibold text-[var(--notion-text)]">{request.name}</div>
              <div className="text-[var(--notion-text-muted)] break-all">{request.email}</div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" disabled={busy === request.uid}
                onClick={() => { void approve(request); }}
                className="rounded-md bg-[#0064ff] px-2 py-1.5 text-xs font-medium text-white flex items-center gap-1">
                <Check className="w-3.5 h-3.5"/> Daftarkan email
              </button>
              <button type="button" title="Tolak permintaan"
                onClick={async () => { try { await rejectTeamRequest(ownerUid, request.uid); } catch { setError('Gagal menolak permintaan.'); } }}
                className="rounded-md border border-[var(--notion-border)] px-2 py-1.5">
                <X className="w-3.5 h-3.5"/>
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-[var(--notion-border)] p-3 space-y-2">
        <div className="text-xs font-semibold text-[var(--notion-text)]">Akses UID lama ({members.length})</div>
        {members.length === 0 && <p className="text-xs text-[var(--notion-text-muted)]">Belum ada editor yang disetujui.</p>}
        {members.map((member) => (
          <div key={member.uid} className="flex items-center justify-between gap-2 py-1">
            <div className="min-w-0 text-xs text-[var(--notion-text)]">
              <strong>{member.name}</strong>
              <div className="break-all text-[var(--notion-text-muted)]">{member.email}</div>
            </div>
            <button type="button" aria-label={`Cabut akses ${member.name}`}
              onClick={async () => { try { await revokeTeamMember(ownerUid, member.uid); } catch { setError('Gagal mencabut akses editor.'); } }}
              className="p-2 text-red-500 hover:bg-red-500/10 rounded-md">
              <UserMinus className="w-4 h-4"/>
            </button>
          </div>
        ))}
      </div>
      {notice && <p className="text-xs text-emerald-600">{notice}</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
