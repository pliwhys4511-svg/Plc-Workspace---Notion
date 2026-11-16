import type { User } from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp,
  setDoc, type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

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

export function teamInviteLink(ownerUid: string, location: string): string {
  const url = new URL(location);
  url.searchParams.set('team', ownerUid);
  url.hash = '';
  return url.toString();
}

export function getTeamOwnerUid(editorUid: string): string | null {
  let ownerId: string | null = null;
  try {
    const url = new URL(window.location.href);
    ownerId = validTeamUid(url.searchParams.get('team'));
    if (ownerId) {
      localStorage.setItem(`plc.team.owner.${editorUid}`, ownerId);
      url.searchParams.delete('team');
      window.history.replaceState(null, '', url.toString());
      return ownerId;
    }
    return validTeamUid(localStorage.getItem(`plc.team.owner.${editorUid}`));
  } catch {
    return ownerId;
  }
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
