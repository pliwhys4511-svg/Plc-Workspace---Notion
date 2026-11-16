import type { AccessRole } from './accessTier';

/**
 * A valid persisted Firebase Authentication session can resume Cloud DB for
 * the existing owner. Editor PINs are client-side UX only and must NEVER be
 * converted into access to the owner's Firestore documents.
 */
export const CLOUD_PAUSED_KEY = 'plc.workspace.cloud.paused.v1';

export function shouldAutoResumeCloud(
  role: AccessRole,
  verifiedFirebaseSession: boolean,
  explicitlyPaused: boolean,
): boolean {
  return role === 'admin' && verifiedFirebaseSession && !explicitlyPaused;
}
