import type { User } from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDoc, onSnapshot, runTransaction, serverTimestamp,
  setDoc, type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { EDITOR_NAMES } from './accessTier';
import firebaseConfig from '../../firebase-applet-config.json';

export interface JoinRequest {
  uid: string;
  email: string;
  name: string;
  createdAt?: unknown;
}

export interface TeamMember {
  uid: string;
  email: string;
  name: string;
  role: 'editor';
}

export function validTeamUid(raw: string | null): string | null {
  if (raw && /^[A-Za-z0-9_-]{8,128}$/.test(raw)) return raw;
  return null;
}

export const PLC_SHARED_OWNER_UID = validTeamUid(firebaseConfig.sharedWorkspaceOwnerUid);

export function isGoogleIdentityAllowedForRole(role: 'admin' | 'editor', uid: string | null): boolean {
  if (!uid || !PLC_SHARED_OWNER_UID) return false;
  return role === 'admin' ? uid === PLC_SHARED_OWNER_UID : uid !== PLC_SHARED_OWNER_UID;
}


export function teamInviteLink(ownerUid: string, location: string): string {
  const url = new URL(location);
  // A single canonical link works for all editors. The owner ID is pinned
  // in app configuration; no invitation query parameter is needed.
  if (!ownerUid || ownerUid !== PLC_SHARED_OWNER_UID) throw new Error('Owner Workspace tidak sesuai.');
  url.searchParams.delete('team');
  url.hash = '';
  return url.toString();
}

export function getTeamOwnerUid(_editorUid: string): string | null {
  // Do not trust an arbitrary query string/localStorage owner selection. All
  // sessions MUST target one fixed, approved shared PLC Workspace.
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('team')) {
      url.searchParams.delete('team');
      window.history.replaceState(null, '', url.toString());
    }
  } catch {
    // Browser history may be unavailable in private mode.
  }
  return PLC_SHARED_OWNER_UID;
}

export function watchTeamMember(
  ownerUid: string,
  memberUid: string,
  onChange: (member: TeamMember | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', ownerUid, 'members', memberUid),
    (snap) => {
      const data = snap.data();
      if (data?.role === 'editor' && data.uid === memberUid) {
        onChange({ uid: memberUid, name: String(data.name ?? ''), email: String(data.email ?? ''), role: 'editor' });
      } else {
        onChange(null);
      }
    },
    (err) => onError(new Error(err.code === 'permission-denied' ? 'Akun belum mendapat izin membaca anggota tim.' : 'Gagal membaca izin tim.')),
  );
}

export async function requestTeamMembership(ownerUid: string, user: User, name: string): Promise<void> {
  if (!user.emailVerified || !user.email || !ownerUid || ownerUid === user.uid) {
    throw new Error('Login Google terverifikasi diperlukan untuk meminta akses editor.');
  }
  const ref = doc(db, 'users', ownerUid, 'joinRequests', user.uid);
  const previous = await getDoc(ref);
  if (previous.exists()) return;
  await setDoc(ref, {
    uid: user.uid,
    email: user.email,
    name: name.slice(0, 120),
    createdAt: serverTimestamp(),
  });
}

export function watchJoinRequests(
  ownerUid: string,
  onChange: (requests: JoinRequest[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'users', ownerUid, 'joinRequests'), (snap) => {
    onChange(snap.docs.map((entry) => ({
      uid: String(entry.data().uid ?? entry.id),
      email: String(entry.data().email ?? ''),
      name: String(entry.data().name ?? ''),
      createdAt: entry.data().createdAt,
    })));
  }, () => onError('Tidak dapat mengambil permintaan akses editor.'));
}

export async function approveTeamMember(ownerUid: string, request: JoinRequest): Promise<void> {
  const ref = doc(db, 'users', ownerUid, 'members', request.uid);
  await setDoc(ref, {
    uid: request.uid,
    email: request.email,
    name: request.name,
    role: 'editor',
    createdAt: serverTimestamp(),
  });
  // If cleanup fails, access is still granted. Admin can dismiss request later.
  await deleteDoc(doc(db, 'users', ownerUid, 'joinRequests', request.uid));
}

export async function rejectTeamRequest(ownerUid: string, requestUid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', ownerUid, 'joinRequests', requestUid));
}

export function watchTeamMembers(
  ownerUid: string,
  onChange: (members: TeamMember[]) => void,
  onError: (message: string) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'users', ownerUid, 'members'), (snap) => {
    onChange(snap.docs.map((entry) => ({
      uid: String(entry.data().uid ?? entry.id),
      email: String(entry.data().email ?? ''),
      name: String(entry.data().name ?? ''),
      role: 'editor' as const,
    })));
  }, () => onError('Tidak dapat mengambil daftar editor.'));
}

export async function revokeTeamMember(ownerUid: string, memberUid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', ownerUid, 'members', memberUid));
}

export interface DirectEditorEmail {
  email: string;
  name: string;
  role: 'editor';
}

export function normalizeEditorEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)) {
    throw new Error('Masukkan alamat email Google yang valid.');
  }
  return email;
}

export async function registerDirectEditor(ownerUid: string, email: string, name: string): Promise<void> {
  const id = normalizeEditorEmail(email);
  await setDoc(doc(db, 'users', ownerUid, 'editorEmails', id), { email: id, name, role: 'editor' });
}

/** Validates the entire proposed list before any writes are attempted. */
export function prepareBulkEditors(rows: {name: string; email: string}[]): DirectEditorEmail[] {
  const emails = new Set<string>();
  const names = new Set<string>();
  const result: DirectEditorEmail[] = [];
  for (const row of rows) {
    if (!row.email.trim()) continue;
    if (!EDITOR_NAMES.some(name => name === row.name)) throw new Error('Nama editor tidak dikenal.');
    const email = normalizeEditorEmail(row.email);
    if (emails.has(email) || names.has(row.name)) throw new Error('Nama dan email editor tidak boleh duplikat.');
    emails.add(email); names.add(row.name);
    result.push({ name: row.name, email, role: 'editor' });
  }
  if (!result.length) throw new Error('Isi minimal satu email editor.');
  return result;
}

/** Only prefill names with one unambiguous old request; admin reviews before saving. */
export function suggestBulkEditorEmails(requests: JoinRequest[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of EDITOR_NAMES) {
    const matches = new Set<string>();
    for (const request of requests.filter(row => row.name === name)) {
      try { matches.add(normalizeEditorEmail(request.email)); } catch { /* skip invalid address */ }
    }
    if (matches.size === 1) result[name] = [...matches][0];
  }
  return result;
}

/** Atomic enrollment; never silently change another editor's existing grant. */
export async function registerDirectEditorsBulk(ownerUid: string, rows: {name: string; email: string}[]): Promise<number> {
  const editors = prepareBulkEditors(rows);
  await runTransaction(db, async tx => {
    const refs = editors.map(entry => doc(db, 'users', ownerUid, 'editorEmails', entry.email));
    const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
    snapshots.forEach((snapshot, index) => {
      if (snapshot.exists() && snapshot.data().name !== editors[index].name) {
        throw new Error('Email tersebut sudah terdaftar dengan nama editor lain.');
      }
    });
    editors.forEach((entry, index) => tx.set(refs[index], entry));
  });
  return editors.length;
}

export async function revokeDirectEditor(ownerUid: string, email: string): Promise<void> {
  await deleteDoc(doc(db, 'users', ownerUid, 'editorEmails', normalizeEditorEmail(email)));
}

export function watchDirectEditors(ownerUid: string, onChange: (members: DirectEditorEmail[]) => void, onError: (message: string) => void): Unsubscribe {
  return onSnapshot(collection(db, 'users', ownerUid, 'editorEmails'),
    (snap) => onChange(snap.docs.map((entry) => ({ email: entry.id, name: String(entry.data().name ?? ''), role: 'editor' as const }))),
    () => onError('Aturan Firebase untuk daftar email editor belum aktif.'));
}

// Keep existing approved UID-based memberships working, while registered
// email accounts enter directly. Neither source can be created by an editor.
export function watchEditorAccess(ownerUid: string, user: User, onChange: (member: TeamMember | null) => void, onError: (error: Error) => void): Unsubscribe {
  if (!user.emailVerified || !user.email) {
    onError(new Error('Akun Google harus memiliki email terverifikasi.'));
    return () => {};
  }
  let direct: TeamMember | null = null;
  let legacy: TeamMember | null = null;
  let directReady = false;
  let legacyReady = false;
  let directError: Error | null = null;
  let legacyError: Error | null = null;
  const emit = () => {
    if (!directReady || !legacyReady) return;
    if (direct || legacy) onChange(direct ?? legacy);
    else if (directError || legacyError) onError(directError ?? legacyError!);
    else onChange(null);
  };
  const stopLegacy = watchTeamMember(ownerUid, user.uid, (member) => {
    legacy = member; legacyReady = true; legacyError = null; emit();
  }, (error) => {
    legacy = null; legacyReady = true; legacyError = error; emit();
  });
  const stopDirect = onSnapshot(doc(db, 'users', ownerUid, 'editorEmails', normalizeEditorEmail(user.email)), (snap) => {
    const data = snap.data();
    direct = data?.role === 'editor' ? { uid: user.uid, email: String(data.email), name: String(data.name), role: 'editor' } : null;
    directReady = true; directError = null; emit();
  }, () => {
    direct = null; directReady = true; directError = new Error('Aturan akses langsung Firebase belum aktif.'); emit();
  });
  return () => { stopLegacy(); stopDirect(); };
}
