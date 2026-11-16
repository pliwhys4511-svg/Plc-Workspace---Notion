import React, { useEffect, useState } from 'react';
import { Check, Copy, ShieldCheck, UserMinus, Users, X } from 'lucide-react';
import {
  approveTeamMember, rejectTeamRequest, revokeTeamMember,
  teamInviteLink, watchJoinRequests, watchTeamMembers,
  type JoinRequest, type TeamMember,
} from '../lib/teamWorkspace';

export function TeamAccessPanel({ ownerUid }: { ownerUid: string }) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const unsubRequests = watchJoinRequests(ownerUid, setRequests, setError);
    const unsubMembers = watchTeamMembers(ownerUid, setMembers, setError);
    return () => { unsubRequests(); unsubMembers(); };
  }, [ownerUid]);

  const approve = async (request: JoinRequest) => {
    setBusy(request.uid); setError('');
    try {
      await approveTeamMember(ownerUid, request);
      setNotice(`Akses editor ${request.name} telah disetujui.`);
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
        Kirim link undangan kepada editor. Mereka login Google satu kali,
        kemudian pilih nama Editor. Setujui permintaan di bawah; setelah itu
        semua perubahan akan tersinkron otomatis ke satu workspace.
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
      <div className="rounded-xl border border-[var(--notion-border)] p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--notion-text)]">
          <Users className="w-4 h-4"/> Menunggu persetujuan ({requests.length})
        </div>
        {requests.length === 0 && <p className="text-xs text-[var(--notion-text-muted)]">Belum ada permintaan akses.</p>}
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
                <Check className="w-3.5 h-3.5"/> Setujui
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
        <div className="text-xs font-semibold text-[var(--notion-text)]">Editor yang aktif ({members.length})</div>
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
