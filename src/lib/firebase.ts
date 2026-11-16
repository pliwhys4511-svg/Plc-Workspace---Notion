import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: Always pass firebaseConfig.firestoreDatabaseId so the Enterprise Firestore instance is targeted.
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const FIREBASE_PROJECT_INFO = {
  projectId: firebaseConfig.projectId,
  databaseId: firebaseConfig.firestoreDatabaseId,
  authDomain: firebaseConfig.authDomain,
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const source = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  // Do not surface serialized Firebase user details (emails, UID, provider data)
  // in a visible dialog, and don't mistake denied permissions for an offline edit.
  console.error('Firestore operation failed:', { operationType, path, code });
  if (/permission.denied|insufficient permissions/i.test(code + ' ' + source)) {
    throw new Error('Akses Firebase ditolak. Periksa Firestore Security Rules dan izin akun Google. Pilih Mode Lokal untuk menggunakan tracker di browser ini.');
  }
  if (/unauthenticated|authentication|not authenticated/i.test(code + ' ' + source)) {
    throw new Error('Sesi Google tidak valid. Silakan login ulang atau gunakan Mode Lokal.');
  }
  throw new Error('Operasi Firebase gagal. Silakan periksa koneksi dan konfigurasi Cloud DB.');
}

